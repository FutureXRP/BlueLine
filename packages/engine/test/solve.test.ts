import { describe, expect, it } from 'vitest';
import type { ProgramSpec } from '../src/model/programSpec.js';
import { ProgramSpecSchema, defaultAreaTolerance } from '../src/model/programSpec.js';
import { generateCandidates, generateModel, mulberry32 } from '../src/solve/index.js';
import { conditionedArea, stableStringify } from '../src/model/index.js';
import { validate } from '../src/validate/index.js';

function spec(overrides: Partial<ProgramSpec> = {}): ProgramSpec {
  const target = 1500 * 144;
  return ProgramSpecSchema.parse({
    specVersion: 1,
    stories: 1,
    footprintFamily: 'rect',
    targetConditionedArea: target,
    areaTolerance: defaultAreaTolerance(target),
    bedrooms: 3,
    fullBaths: 2,
    halfBaths: 0,
    primarySuite: { separated: true, walkInCloset: true, doubleVanity: true },
    kitchen: { openToLiving: true, island: false, pantry: 'none' },
    garage: { bays: 2, entry: 'front', attached: true },
    extraRooms: ['laundryRoom'],
    ceilingHeight: 108,
    roof: { style: 'gable', pitch: 6 },
    foundation: 'slab',
    exteriorWall: '2x6',
    climateNote: null,
    seedChain: [],
    ...overrides,
  });
}

describe('mulberry32', () => {
  it('reproduces the identical sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('determinism (Law #3 / §16): same (spec, seed) → byte-identical model', () => {
  it('generateModel is byte-identical across calls', () => {
    const s = spec();
    expect(stableStringify(generateModel(s, 7))).toBe(stableStringify(generateModel(s, 7)));
  });
  it('candidates are reproducible from the seed chain', () => {
    const s = spec();
    const cands = generateCandidates(s, 100);
    for (const c of cands) {
      expect(stableStringify(generateModel(s, c.seed))).toBe(stableStringify(c.model));
    }
  });
});

describe('candidate generation (§7.5)', () => {
  it('ships 4 hard-rule-passing candidates for a typical 3-bed spec', () => {
    const cands = generateCandidates(spec(), 1);
    expect(cands).toHaveLength(4);
    for (const c of cands) {
      const hard = validate(c.model).filter((f) => f.severity === 'hard');
      expect(hard).toEqual([]);
    }
  });
  it('handles 2 and 4 bedroom programs', () => {
    for (const bedrooms of [2, 4] as const) {
      const cands = generateCandidates(spec({ bedrooms }), 1, 2);
      expect(cands.length).toBeGreaterThanOrEqual(1);
      const beds = cands[0]!.model.rooms.filter((r) => r.type === 'bedroom');
      expect(beds).toHaveLength(bedrooms);
    }
  });
  it('handles 0-bay (no garage) programs', () => {
    const cands = generateCandidates(spec({ garage: { bays: 0, entry: 'front', attached: true } }), 1, 2);
    expect(cands.length).toBeGreaterThanOrEqual(1);
    expect(cands[0]!.model.rooms.some((r) => r.type === 'garage')).toBe(false);
  });
  it('lands near the target conditioned area', () => {
    const s = spec();
    const cands = generateCandidates(s, 1, 4);
    for (const c of cands) {
      const area = conditionedArea(c.model);
      // §7 v0.1: coarse tolerance — annealer will tighten this
      expect(Math.abs(area - s.targetConditionedArea) / s.targetConditionedArea).toBeLessThan(0.2);
    }
  });
  it('stores the seed chain on the model (Law #3)', () => {
    const cands = generateCandidates(spec(), 5, 1);
    expect(cands[0]!.model.seedChain).toEqual([cands[0]!.seed]);
  });
});
