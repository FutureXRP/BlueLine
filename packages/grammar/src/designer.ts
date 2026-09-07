/**
 * Designer loop (bible §5). Claude speaks ONLY DesignProgram against the
 * grammar; the system prompt is generated FROM the schema. Without an API
 * key, a deterministic brief parser stands in (disclosed in the result) so
 * the product runs offline and in CI. Revise loop: on errors, try bounded
 * deterministic program repairs, max 3 cycles (§5.3).
 */
import { z } from 'zod';
import { DesignProgramSchema, ModuleParamsSchemas, type DesignProgram } from './program.js';
import { STYLE_PACKS } from './styles.js';
import { instantiate, errorsOf, type InstantiateResult } from './instantiate.js';

export function buildDesignerSystemPrompt(): string {
  const modules = Object.entries(ModuleParamsSchemas)
    .map(([name, schema]) => {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const params = Object.entries(shape)
        .map(([k, v]) => `${k}${(v as z.ZodTypeAny).description ? ` — ${(v as z.ZodTypeAny).description}` : ''}`)
        .join('; ');
      return `- ${name}: { ${params} }`;
    })
    .join('\n');
  return [
    'You are the Blueline designer. You compose a house from a fixed module grammar. You NEVER emit geometry, dimensions, or code claims — only a DesignProgram JSON choosing plan type, style, modules, and parameters.',
    '',
    'Plan types: split_ranch (one story, primary + secondary wing), farmhouse_two_story (living rear, primary down, beds up), compact_two_story (narrow lot, beds up, no garage).',
    `Styles: ${Object.values(STYLE_PACKS).map((s) => s.id).join(', ')}.`,
    'Modules and parameters:',
    modules,
    '',
    'Rules: choose the closest legal design when the brief conflicts with the grammar and note the conflict in `intent`; never invent module types or parameters; seed is a positive integer; output ONLY the JSON object.',
  ].join('\n');
}

export interface DesignOptions {
  apiKey?: string;
  model?: string;
  seed?: number;
}

export interface DesignOutcome extends InstantiateResult {
  designer: 'claude' | 'deterministic';
  reviseCycles: number;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (s?: string) => (s ? Number(s) || WORD_NUM[s.toLowerCase()] || null : null);

/** Deterministic fallback designer: brief keywords → DesignProgram. */
export function fallbackDesigner(brief: string, seed = 1): DesignProgram {
  const b = brief.toLowerCase();
  const bedM = b.match(/(\d|one|two|three|four|five)\s*[- ]?\s*bed/);
  const beds = Math.max(2, Math.min(5, num(bedM?.[1]) ?? 4));
  const garM = b.match(/(\d|one|two|three)\s*[- ]?\s*(?:car|bay)/);
  const bays = (Math.max(1, Math.min(3, num(garM?.[1]) ?? 2)) as 1 | 2 | 3);
  const noGarage = /no\s+garage|narrow\s+lot/.test(b);
  const oneStory = /ranch|one[- ]stor|single[- ]stor|no\s+stairs?/.test(b);
  const narrow = /narrow|compact|small\s+lot|infill/.test(b);
  const plan_type = oneStory ? 'split_ranch' : narrow ? 'compact_two_story' : 'farmhouse_two_story';
  const style = /craftsman|bungalow/.test(b) ? 'craftsman' : /modern(?!\s*farm)|contemporary|flat/.test(b) && !/farmhouse/.test(b) ? 'modern' : 'modern_farmhouse';
  const size = /big|large|spacious|grand|4000|3500|3000/.test(b) ? 'L' : /small|tight|cozy|modest|1200|1400/.test(b) ? 'S' : 'M';
  const theater = /theater|cinema|media\s+room/.test(b);
  const use = theater ? 'theater' : /playroom|kids/.test(b) ? 'playroom' : /guest/.test(b) ? 'guest' : 'office';
  const ceiling = /10'|10\s*foot|ten[- ]foot|tall\s+ceiling/.test(b) ? 10 : /8'|8\s*foot/.test(b) ? 8 : 9;

  const modules: DesignProgram['modules'] = [
    { type: 'living_block', params: { size, island: !/no\s+island/.test(b), rearDoor: true } },
    { type: 'primary_suite', params: { size, doubleVanity: /double\s+vanity|dual\s+sink/.test(b) || size !== 'S' } },
    { type: 'service_core', params: { pantry: /pantry/.test(b) || size !== 'S' ? 'walk-in' : 'none' } },
    { type: 'flex_room', params: { use } },
  ];
  if (plan_type === 'farmhouse_two_story') {
    modules.push({ type: 'stair_core', params: { widthIn: 42 } });
    modules.push({ type: 'upper_bed_wing', params: { beds: Math.max(2, Math.min(4, beds - 1)) as 2 | 3 | 4, loft: !/no\s+loft/.test(b), bonus: /bonus/.test(b) || beds >= 4 } });
    if (!noGarage) modules.push({ type: 'garage', params: { bays } });
    if (!/no\s+porch/.test(b)) {
      modules.push({ type: 'porch_front', params: { depthIn: 96 } });
      modules.push({ type: 'porch_rear', params: { depthIn: /big\s+(?:rear\s+)?porch|large\s+porch/.test(b) ? 120 : 96 } });
    }
  } else if (plan_type === 'split_ranch') {
    modules.push({ type: 'bed_bath_pair', params: { beds: Math.max(2, Math.min(3, beds - 1)) as 2 | 3 } });
    if (!noGarage) modules.push({ type: 'garage', params: { bays } });
    if (!/no\s+porch/.test(b)) modules.push({ type: 'porch_front', params: { depthIn: 72 } });
  } else {
    modules.push({ type: 'stair_core', params: { widthIn: 42 } });
    modules.push({ type: 'upper_bed_wing', params: { beds: 2, loft: true, bonus: false } });
    modules.push({ type: 'porch_front', params: { depthIn: 72 } });
  }

  const name =
    (style === 'modern_farmhouse' ? 'Farmhouse' : style === 'craftsman' ? 'Craftsman' : 'Modern') +
    ' ' + (plan_type === 'split_ranch' ? 'Ranch' : plan_type === 'compact_two_story' ? 'Compact' : 'Two-Story') +
    ` ${String(beds)}BR`;

  return DesignProgramSchema.parse({
    name,
    style,
    plan_type,
    seed,
    modules,
    finishes: { foundation: /crawl/.test(b) ? 'crawlspace' : 'slab', studs: '2x6', ceiling_ft: ceiling },
    intent: brief.slice(0, 280) || 'A comfortable family home.',
  });
}

async function claudeDesigner(brief: string, opts: DesignOptions): Promise<DesignProgram> {
  const call = async (extra: string): Promise<string> => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: opts.model ?? 'claude-sonnet-5',
        max_tokens: 1500,
        temperature: 0,
        system: buildDesignerSystemPrompt(),
        messages: [{ role: 'user', content: brief + extra }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
  };
  let feedback = '';
  for (let i = 0; i < 2; i++) {
    try {
      return DesignProgramSchema.parse(JSON.parse(await call(feedback)));
    } catch (e) {
      feedback = `\n\nYour previous DesignProgram failed validation: ${String(e).slice(0, 400)}. Output only the corrected JSON.`;
    }
  }
  throw new Error('designer output failed validation twice');
}

/** Bounded deterministic repairs for the revise loop. */
function repair(program: DesignProgram, cycle: number): DesignProgram {
  const next: DesignProgram = JSON.parse(JSON.stringify(program));
  if (cycle === 0) {
    // most failures trace to over-stuffed modules: step sizes down
    for (const m of next.modules) {
      if ((m.type === 'living_block' || m.type === 'primary_suite') && m.params.size === 'S') m.params.size = 'M';
    }
  } else if (cycle === 1) {
    next.modules = next.modules.filter((m) => m.type !== 'porch_rear');
  } else {
    next.finishes.ceiling_ft = 9;
  }
  return next;
}

export async function design(brief: string, opts: DesignOptions = {}): Promise<DesignOutcome> {
  const apiKey = opts.apiKey ?? (typeof process !== 'undefined' ? process.env['ANTHROPIC_API_KEY'] : undefined);
  let program: DesignProgram;
  let designer: DesignOutcome['designer'] = 'deterministic';
  if (apiKey) {
    try {
      program = await claudeDesigner(brief, { ...opts, apiKey });
      designer = 'claude';
    } catch {
      program = fallbackDesigner(brief, opts.seed ?? 1);
    }
  } else {
    program = fallbackDesigner(brief, opts.seed ?? 1);
  }

  let result = instantiate(program);
  let cycles = 0;
  while (errorsOf(result.findings).length > 0 && cycles < 3) {
    program = repair(result.program, cycles);
    result = instantiate(program);
    cycles++;
  }
  return { ...result, designer, reviseCycles: cycles };
}
