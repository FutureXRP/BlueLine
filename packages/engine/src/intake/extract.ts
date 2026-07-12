/**
 * Description → ProgramSpec extraction.
 *
 * Primary path: Claude API (language only, Law #1), Zod-validated with one
 * retry carrying the validation error. Fallback path: a deterministic
 * keyword parser so the pipeline runs offline and in CI — clearly marked in
 * the result so the UI can disclose which extractor ran.
 */
import { ProgramSpecSchema, defaultAreaTolerance, type ProgramSpec } from '../model/programSpec.js';
import { buildExtractionSystemPrompt } from './prompt.js';

export interface ExtractionResult {
  spec: ProgramSpec;
  /** Field names the extractor defaulted rather than heard from the client. */
  assumed: string[];
  extractor: 'claude' | 'deterministic';
}

export interface ExtractOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export async function extractProgramSpec(
  description: string,
  opts: ExtractOptions = {},
): Promise<ExtractionResult> {
  const apiKey = opts.apiKey ?? (typeof process !== 'undefined' ? process.env['ANTHROPIC_API_KEY'] : undefined);
  if (apiKey) {
    try {
      return await extractWithClaude(description, { ...opts, apiKey });
    } catch {
      // fall through to deterministic parse rather than failing the pipeline
    }
  }
  return deterministicExtract(description);
}

async function extractWithClaude(
  description: string,
  opts: ExtractOptions & { apiKey: string },
): Promise<ExtractionResult> {
  const call = async (extra: string): Promise<string> => {
    const res = await fetch(`${opts.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model ?? 'claude-sonnet-5',
        max_tokens: 2000,
        temperature: 0,
        system: buildExtractionSystemPrompt(),
        messages: [{ role: 'user', content: `${description}${extra}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
  };

  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await call(feedback);
    try {
      const parsed = JSON.parse(text) as { spec: unknown; assumed?: string[] };
      const spec = ProgramSpecSchema.parse(parsed.spec);
      return { spec, assumed: parsed.assumed ?? [], extractor: 'claude' };
    } catch (e) {
      feedback = `\n\nYour previous output failed validation: ${String(e).slice(0, 500)}\nOutput ONLY the corrected JSON object.`;
    }
  }
  throw new Error('extraction failed validation twice');
}

// ---------------------------------------------------------------------------
// Deterministic fallback parser
// ---------------------------------------------------------------------------

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, single: 1, double: 2, triple: 3,
};

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return WORD_NUM[s.toLowerCase()] ?? null;
}

export function deterministicExtract(description: string): ExtractionResult {
  const d = description.toLowerCase();
  const assumed: string[] = [];
  const pick = <T>(found: T | null, fallback: T, field: string): T => {
    if (found === null) {
      assumed.push(field);
      return fallback;
    }
    return found;
  };

  const bedM = d.match(/(\d+|one|two|three|four)\s*[- ]?\s*(?:bed(?:room)?s?)\b/);
  const bedrooms = pick(clampChoice(num(bedM?.[1]), [2, 3, 4]), 3, 'bedrooms') as 2 | 3 | 4;

  const bathM = d.match(/(\d+(?:\.5)?|one|two|three)\s*[- ]?\s*(?:full\s+)?bath(?:room)?s?\b/);
  const bathRaw = bathM?.[1] ? Number(num(bathM[1].replace('.5', '')) ?? 2) : null;
  const halfBaths: 0 | 1 = bathM?.[1]?.includes('.5') || /half\s*bath|powder/.test(d) ? 1 : 0;
  const fullBaths = pick(clampChoice(bathRaw, [1, 2, 3]), 2, 'fullBaths') as 1 | 2 | 3;

  const sfM = d.match(/(\d{3,4})\s*(?:sq\.?\s*(?:ft|feet)?|sf|square\s*(?:feet|foot))/);
  const sqft = pick(sfM ? Number(sfM[1]) : null, 1600, 'targetConditionedArea');

  const garM = d.match(/(\d|one|two|three)\s*[- ]?\s*(?:car|bay)\s*garage/);
  const noGarage = /no\s+garage|without\s+a?\s*garage/.test(d);
  const bays = noGarage ? 0 : (pick(clampChoice(num(garM?.[1]), [0, 1, 2, 3]), 2, 'garage.bays') as 0 | 1 | 2 | 3);

  const roofStyle = /hip/.test(d) ? 'hip' : /gable/.test(d) ? 'gable' : (assumed.push('roof.style'), 'gable');
  const pitchM = d.match(/(\d+)\s*(?::|\/|in)\s*12/);
  const pitch = pick(clampChoice(pitchM ? Number(pitchM[1]) : null, [4, 5, 6, 8]), 6, 'roof.pitch') as 4 | 5 | 6 | 8;

  const foundation = /crawl\s*space|crawlspace/.test(d) ? 'crawlspace' : /slab/.test(d) ? 'slab' : (assumed.push('foundation'), 'slab');
  const ceilM = d.match(/(8|9|10)\s*(?:'|ft|foot|feet)?\s*ceiling/);
  const ceilingHeight = pick(
    ceilM ? ({ 8: 96, 9: 108, 10: 120 } as Record<string, 96 | 108 | 120>)[ceilM[1]!]! : null,
    108,
    'ceilingHeight',
  ) as 96 | 108 | 120;

  const footprintFamily = /\bl[- ]?shape/.test(d) ? 'L' : /\bt[- ]?shape/.test(d) ? 'T' : (assumed.push('footprintFamily'), 'rect');
  const exteriorWall = /2\s*x\s*4/.test(d) ? '2x4' : /2\s*x\s*6/.test(d) ? '2x6' : (assumed.push('exteriorWall'), '2x6');

  const extraRooms: ProgramSpec['extraRooms'] = ['laundryRoom'];
  if (/office|study/.test(d)) extraRooms.push('office');
  if (/mud\s*room|mudroom/.test(d)) extraRooms.push('mudroom');
  if (/flex/.test(d)) extraRooms.push('flex');
  if (/formal\s+dining/.test(d)) extraRooms.push('diningFormal');

  const target = sqft * 144;
  const spec = ProgramSpecSchema.parse({
    specVersion: 1,
    stories: 1,
    footprintFamily,
    targetConditionedArea: target,
    areaTolerance: defaultAreaTolerance(target),
    bedrooms,
    fullBaths,
    halfBaths,
    primarySuite: {
      separated: /separate|split\s+(?:bed|plan)|primary\s+away/.test(d),
      walkInCloset: /walk[- ]?in\s+closet/.test(d) || true,
      doubleVanity: /double\s+(?:vanity|sink)/.test(d),
    },
    kitchen: {
      openToLiving: !/closed\s+kitchen|separate\s+kitchen/.test(d),
      island: /island/.test(d),
      pantry: /walk[- ]?in\s+pantry/.test(d) ? 'walk-in' : /pantry/.test(d) ? 'reach-in' : 'none',
    },
    garage: { bays, entry: /side\s*(?:entry|load)/.test(d) ? 'side' : 'front', attached: true },
    extraRooms,
    ceilingHeight,
    roof: { style: roofStyle, pitch },
    foundation,
    exteriorWall,
    climateNote: null,
    seedChain: [],
  });
  return { spec, assumed, extractor: 'deterministic' };
}

function clampChoice(n: number | null, choices: number[]): number | null {
  if (n === null) return null;
  return choices.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), choices[0]!);
}
