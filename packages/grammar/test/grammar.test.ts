/**
 * Phase 1–2 tests: grammar instantiation for all three plan types, designer
 * loop, determinism goldens, and the reference-plan contrast test.
 */
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stableHash, checkTiling } from '@blueline/engine/house';
import {
  buildDesignerSystemPrompt,
  design,
  errorsOf,
  fallbackDesigner,
  instantiate,
  ModuleParamsSchemas,
} from '../src/index.js';

const BRIEFS = {
  farmhouse: 'modern farmhouse, four bed, primary down, theater, big rear porch, 3-car garage',
  ranch: 'single story craftsman ranch, 3 bedrooms, 2 car garage, walk-in pantry',
  compact: 'compact modern two story for a narrow lot, 3 bed, office',
};

describe('designer prompt (§5.2)', () => {
  const prompt = buildDesignerSystemPrompt();
  it('is generated from the grammar — every module type present', () => {
    for (const name of Object.keys(ModuleParamsSchemas)) expect(prompt).toContain(`- ${name}:`);
  });
  it('forbids geometry and code claims', () => {
    expect(prompt).toContain('NEVER emit geometry');
  });
});

describe('grammar instantiation', () => {
  for (const [key, brief] of Object.entries(BRIEFS)) {
    it(`${key}: designs with zero errors`, async () => {
      const r = await design(brief);
      expect(r.designer).toBe('deterministic');
      expect(errorsOf(r.findings)).toEqual([]);
      // tiling invariant holds on every level
      for (const level of r.model.levels) {
        expect(checkTiling(level.index, level.footprint, level.rooms)).toEqual([]);
      }
    });
  }

  it('farmhouse: surfaces the intended non-error findings, never softened (§7.3)', async () => {
    const r = await design(BRIEFS.farmhouse);
    const codes = r.findings.map((f) => `${f.severity}:${f.code}`);
    expect(codes).toContain('warn:GRAMMAR-THEATER-EXTERIOR');
    expect(codes).toContain('engineer:GRAMMAR-GARAGE-3BAY');
  });

  it('two-story plans stack the stair and carry the opening (§4.1 stair_core)', async () => {
    const r = await design(BRIEFS.farmhouse);
    expect(r.model.stair).not.toBeNull();
    const upper = r.model.levels[1]!;
    const well = upper.rooms.find((x) => x.type === 'stairwell')!;
    expect(well.rect).toEqual(r.model.stair!.opening);
  });

  it('is deterministic: same brief → identical model hash (Law 3)', async () => {
    const a = await design(BRIEFS.ranch);
    const b = await design(BRIEFS.ranch);
    expect(stableHash(a.model)).toBe(stableHash(b.model));
    expect(a.program).toEqual(b.program);
  });

  it('unsupported slot → named finding, not a special case (§4.6)', () => {
    const program = fallbackDesigner(BRIEFS.ranch);
    program.modules.push({ type: 'flex_room', params: { use: 'office' } });
    const r = instantiate(program);
    expect(r.findings.some((f) => f.code === 'GRAMMAR-RANCH-FLEX')).toBe(true);
  });
});

describe('golden program fixtures (§11)', () => {
  const goldenPath = new URL('../../../fixtures/programs.hash.json', import.meta.url);
  it('all three plan-type fixtures hash to their goldens', async () => {
    const hashes: Record<string, string> = {};
    for (const [key, brief] of Object.entries(BRIEFS)) {
      const r = await design(brief);
      hashes[key] = stableHash(r.model);
    }
    if (!existsSync(goldenPath)) {
      throw new Error(`golden file missing; expected ${JSON.stringify(hashes)}`);
    }
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as { hashes: Record<string, string> };
    expect(hashes).toEqual(golden.hashes);
  });
});

describe('reference plan contrast (reference/chatgpt-farmhouse)', () => {
  const refPath = new URL('../../../reference/chatgpt-farmhouse/output/normalized_model.json', import.meta.url);
  it('the hand-authored reference violates the tiling invariant our engine enforces', () => {
    const ref = JSON.parse(readFileSync(refPath, 'utf8')) as {
      rooms: Array<{ id: string; name: string; type: string; story: string; x1: number; y1: number; x2: number; y2: number }>;
      footprints: { first_floor_main: { x1: number; y1: number; x2: number; y2: number } };
    };
    // ticks (1/8") → integer inches
    const rooms = ref.rooms
      .filter((r) => r.story === 'F1')
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: 'flex' as const,
        rect: { x: r.x1 / 8, y: r.y1 / 8, w: (r.x2 - r.x1) / 8, h: (r.y2 - r.y1) / 8 },
      }));
    const fp = ref.footprints.first_floor_main;
    const footprint = [{ x: fp.x1 / 8, y: fp.y1 / 8, w: (fp.x2 - fp.x1) / 8, h: (fp.y2 - fp.y1) / 8 }];
    const findings = checkTiling(0, footprint, rooms);
    const tiling = findings.find((f) => f.code === 'GEOM-TILING');
    expect(tiling).toBeTruthy();
    // the gap the reference's containment-only validation allowed: 52 sf
    expect(tiling!.message).toContain('338112'); // rooms: 2,348 sf in sq in
    expect(tiling!.message).toContain('345600'); // footprint: 2,400 sf in sq in
  });
});
