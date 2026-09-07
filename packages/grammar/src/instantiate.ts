/**
 * instantiate(program) → HouseModel + findings (bible §4.5). Deterministic:
 * same DesignProgram + seed + engine version → byte-identical model.
 */
import { buildHouse } from '@blueline/engine/house';
import type { Finding, HouseModel } from '@blueline/engine/house';
import { DesignProgramSchema, type DesignProgram } from './program.js';
import { layoutProgram } from './plans.js';

export interface InstantiateResult {
  program: DesignProgram;
  model: HouseModel;
  findings: Finding[];
}

export function instantiate(programRaw: unknown): InstantiateResult {
  const program = DesignProgramSchema.parse(programRaw);
  const { input, grammarFindings } = layoutProgram(program);
  const { model, findings } = buildHouse(input);
  return { program, model, findings: [...grammarFindings, ...findings] };
}

export function errorsOf(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === 'error');
}
