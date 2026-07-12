import { describe, expect, it } from 'vitest';
import { buildExtractionSystemPrompt } from '../src/intake/prompt.js';
import { deterministicExtract } from '../src/intake/extract.js';
import { describeToDocuments, specToDocuments, scoreCandidate } from '../src/pipeline/index.js';
import { ProgramSpecSchema } from '../src/model/programSpec.js';
import { conditionedArea } from '../src/model/geometry.js';
import { fabricationScan } from '../src/validate/fabricationScan.js';

const DESC =
  '1800 square feet, 3 bedrooms, 2.5 baths, 2 car garage, hip roof, open kitchen with an island and walk-in pantry, home office, 9 foot ceilings, slab foundation';

describe('extraction prompt (§13)', () => {
  const prompt = buildExtractionSystemPrompt();
  it('derives every ProgramSpec field from the Zod schema — no drift', () => {
    for (const key of Object.keys(ProgramSpecSchema.shape)) {
      expect(prompt).toContain(`- ${key} (`);
    }
  });
  it('forbids advising, computing, and compliance claims (Law #1)', () => {
    expect(prompt).toContain('EXTRACT, do not advise');
    expect(prompt).toContain('Never compute dimensions');
    expect(prompt).toContain('Never claim or deny code compliance');
  });
});

describe('deterministic fallback extractor', () => {
  const { spec, assumed, extractor } = deterministicExtract(DESC);
  it('reads the obvious fields', () => {
    expect(extractor).toBe('deterministic');
    expect(spec.bedrooms).toBe(3);
    expect(spec.fullBaths).toBe(2);
    expect(spec.halfBaths).toBe(1);
    expect(spec.targetConditionedArea).toBe(1800 * 144);
    expect(spec.garage.bays).toBe(2);
    expect(spec.roof.style).toBe('hip');
    expect(spec.ceilingHeight).toBe(108);
    expect(spec.foundation).toBe('slab');
    expect(spec.kitchen.island).toBe(true);
    expect(spec.kitchen.pantry).toBe('walk-in');
    expect(spec.extraRooms).toContain('office');
  });
  it('discloses what it assumed', () => {
    expect(assumed).toContain('roof.pitch');
  });
  it('is deterministic', () => {
    expect(deterministicExtract(DESC).spec).toEqual(spec);
  });
});

describe('describe → documents pipeline', () => {
  it('produces the full bundle offline, within area tolerance', async () => {
    const bundle = await describeToDocuments(DESC, { issueDate: '2026-07-12' });
    expect(bundle.extractor).toBe('deterministic');
    expect(bundle.sheets.sheetIndex.map((s) => s.id)).toEqual(['A-000', 'A-101', 'A-401', 'A-901']);
    expect(bundle.sheets.pdf.length).toBeGreaterThan(10000);
    expect(bundle.dxf).toContain('ENTITIES');
    expect(bundle.takeoffCsv).toContain('QUANTITY ESTIMATE');
    const err = Math.abs(conditionedArea(bundle.model) - bundle.spec.targetConditionedArea);
    expect(err).toBeLessThanOrEqual(bundle.spec.areaTolerance);
    expect(bundle.findings.filter((f) => f.severity === 'hard')).toEqual([]);
    expect(fabricationScan(bundle.sheets.textLog)).toEqual([]);
  });

  it('is reproducible: same description + seed → same geometry hash', async () => {
    const a = await describeToDocuments(DESC, { issueDate: '2026-07-12' });
    const b = await describeToDocuments(DESC, { issueDate: '2026-07-12' });
    expect(a.sheets.geometryHash).toBe(b.sheets.geometryHash);
    expect(a.seed).toBe(b.seed);
  });

  it('scoring prefers lower area error and penalizes findings', async () => {
    const { spec } = deterministicExtract(DESC);
    const bundle = await specToDocuments(spec, { issueDate: '2026-07-12' });
    const bestScore = scoreCandidate(spec, bundle.model, bundle.findings);
    expect(bestScore).toBeLessThan(spec.areaTolerance + 25000);
  });
});
