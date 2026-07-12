/**
 * The product's front door: description → complete finished construction
 * documents with takeoff. One call, no editing required (the guided editor
 * remains available to refine the generated model afterward).
 *
 *   describeToDocuments(text) =
 *     extract ProgramSpec (LLM language-only, or deterministic fallback)
 *     → solver candidates (seeded)
 *     → deterministic best-candidate selection
 *     → full sheet set PDF + DXF + materials takeoff CSV
 */
import type { Finding, Model } from '../model/types.js';
import type { ProgramSpec } from '../model/programSpec.js';
import { conditionedArea } from '../model/geometry.js';
import { generateCandidates } from '../solve/index.js';
import { validate, loadRuleSet } from '../validate/index.js';
import { renderSheetSet, type SheetSetResult } from '../render-sheet/index.js';
import { generateDxf } from '../render-dxf/index.js';
import { materialsTakeoff, takeoffToCsv, type TakeoffItem } from '../takeoff/index.js';
import { extractProgramSpec, type ExtractionResult, type ExtractOptions } from '../intake/extract.js';

export interface DocumentBundle {
  spec: ProgramSpec;
  extractor: 'claude' | 'deterministic';
  assumed: string[];
  seed: number;
  model: Model;
  findings: Finding[];
  sheets: SheetSetResult;
  dxf: string;
  takeoff: TakeoffItem[];
  takeoffCsv: string;
  candidateSeeds: number[];
}

export interface PipelineOptions {
  projectTitle?: string;
  issueDate: string; // caller-supplied — pipeline stays deterministic
  startSeed?: number;
  watermark?: boolean;
  extract?: ExtractOptions;
}

/**
 * Deterministic candidate scoring: closest to target area wins; warnings and
 * engineer flags penalize; ties resolve to the lowest seed. No taste, no
 * randomness — same inputs, same choice.
 */
export function scoreCandidate(spec: ProgramSpec, model: Model, findings: Finding[]): number {
  const areaErr = Math.abs(conditionedArea(model) - spec.targetConditionedArea);
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const engineer = findings.filter((f) => f.severity === 'engineer').length;
  return areaErr + warns * 5000 + engineer * 20000;
}

export async function specToDocuments(
  spec: ProgramSpec,
  opts: PipelineOptions,
  extraction?: Pick<ExtractionResult, 'assumed' | 'extractor'>,
): Promise<DocumentBundle> {
  const ruleSet = loadRuleSet();
  const startSeed = opts.startSeed ?? 1;
  const candidates = generateCandidates(spec, startSeed, 4);
  if (!candidates.length) {
    throw new Error('solver produced no hard-rule-passing candidate for this program');
  }
  const scored = candidates
    .map((c) => {
      const findings = validate(c.model, ruleSet);
      return { ...c, findings, score: scoreCandidate(spec, c.model, findings) };
    })
    .sort((a, b) => a.score - b.score || a.seed - b.seed);
  const best = scored[0]!;

  const sheets = await renderSheetSet(
    best.model,
    {
      projectTitle: opts.projectTitle ?? 'Custom Home',
      issueDate: opts.issueDate,
      watermark: opts.watermark,
    },
    ruleSet,
  );
  const takeoff = materialsTakeoff(best.model, ruleSet);
  return {
    spec,
    extractor: extraction?.extractor ?? 'deterministic',
    assumed: extraction?.assumed ?? [],
    seed: best.seed,
    model: best.model,
    findings: best.findings,
    sheets,
    dxf: generateDxf(best.model),
    takeoff,
    takeoffCsv: takeoffToCsv(takeoff),
    candidateSeeds: candidates.map((c) => c.seed),
  };
}

export async function describeToDocuments(
  description: string,
  opts: PipelineOptions,
): Promise<DocumentBundle> {
  const extraction = await extractProgramSpec(description, opts.extract);
  return specToDocuments(extraction.spec, opts, extraction);
}

export { extractProgramSpec, deterministicExtract } from '../intake/extract.js';
export { buildExtractionSystemPrompt } from '../intake/prompt.js';
