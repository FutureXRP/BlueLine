/**
 * Extraction prompt builder (Build Bible §13, adapted to one-shot).
 *
 * The prompt is generated FROM the ProgramSpec Zod schema descriptions so
 * prompt and validator cannot drift (§6). Law #1: the LLM extracts language
 * into the spec — it never computes a dimension, never advises, never
 * asserts code compliance.
 */
import { z } from 'zod';
import { ProgramSpecSchema } from '../model/programSpec.js';

function describeType(schema: z.ZodTypeAny): string {
  const def = (schema as { _def: { typeName: string } })._def;
  switch (def.typeName) {
    case 'ZodLiteral':
      return JSON.stringify((schema as z.ZodLiteral<unknown>).value);
    case 'ZodEnum':
      return (schema as z.ZodEnum<[string, ...string[]]>).options.map((o) => JSON.stringify(o)).join(' | ');
    case 'ZodUnion':
      return (def as unknown as { options: z.ZodTypeAny[] }).options.map(describeType).join(' | ');
    case 'ZodNumber':
      return 'integer';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodNullable':
      return `${describeType((def as unknown as { innerType: z.ZodTypeAny }).innerType)} | null`;
    case 'ZodArray':
      return `array of ${describeType((def as unknown as { type: z.ZodTypeAny }).type)}`;
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const inner = Object.entries(shape)
        .map(([k, v]) => `${k}: ${describeType(v as z.ZodTypeAny)}`)
        .join('; ');
      return `object { ${inner} }`;
    }
    default:
      return 'value';
  }
}

export function buildSpecFieldDocs(): string {
  const shape = ProgramSpecSchema.shape;
  const lines: string[] = [];
  for (const [key, field] of Object.entries(shape)) {
    const f = field as z.ZodTypeAny;
    const desc = f.description ?? '';
    lines.push(`- ${key} (${describeType(f)})${desc ? ` — ${desc}` : ''}`);
  }
  return lines.join('\n');
}

export function buildExtractionSystemPrompt(): string {
  return [
    'You extract a home-design ProgramSpec from a client description. You are a language-understanding component only.',
    '',
    'Rules (non-negotiable):',
    '- EXTRACT, do not advise. Never recommend structural or dimensional decisions.',
    '- Never compute dimensions, spans, or areas beyond unit conversion (square feet × 144 = square inches).',
    '- Never claim or deny code compliance. A deterministic engine handles all validation.',
    '- If a field is not mentioned, choose the most conservative common default and list that field name in "assumed".',
    '- Output ONLY a JSON object: {"spec": <ProgramSpec>, "assumed": [<field names>]}. No prose, no markdown fences.',
    '',
    'ProgramSpec fields:',
    buildSpecFieldDocs(),
    '',
    'Fixed values for this product phase: specVersion=1, stories=1, garage.attached=true, seedChain=[].',
    'Set areaTolerance to 5% of targetConditionedArea (integer). climateNote: copy any climate/site remark verbatim, else null.',
  ].join('\n');
}
