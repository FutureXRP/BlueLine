/**
 * Session 1 (Phase 1 Grammar) tests: HouseModel core — integer invariants,
 * wall derivation by edge union, stair math from rule tables, tiling and
 * determinism goldens for the farmhouse fixture (BLUELINE_V2.md §6, §11, §13).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildHouse,
  checkTiling,
  computeStair,
  formatFraction,
  hashHouse,
  loadRuleRows,
  stairRules,
  verificationGate,
} from '../src/house/index.js';
import { stableStringify } from '../src/model/geometry.js';
import { farmhouseV2 } from '../src/fixtures/farmhouseV2.js';

const GOLDEN = JSON.parse(
  readFileSync(new URL('../../../fixtures/farmhouse.hash.json', import.meta.url), 'utf8'),
) as { modelHash: string };

describe('farmhouse fixture — Session 1 target', () => {
  const { model, findings } = buildHouse(farmhouseV2());

  it('builds with zero findings', () => {
    expect(findings).toEqual([]);
  });

  it('tiling invariant: rooms tile each level footprint exactly (§11)', () => {
    for (const level of model.levels) {
      const foot = level.footprint.reduce((s, r) => s + r.w * r.h, 0);
      const rooms = level.rooms.reduce((s, r) => s + r.rect.w * r.rect.h, 0);
      expect(rooms).toBe(foot);
    }
    expect(model.levels[0]!.footprint[0]).toEqual({ x: 0, y: 0, w: 768, h: 408 });
  });

  it('integer inches everywhere (Law 2)', () => {
    const walk = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isInteger(v)).toBe(true);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(JSON.parse(JSON.stringify(model)));
  });

  it('derives shared edges as ONE interior wall with both room ids', () => {
    const l1 = model.levels[0]!;
    // hall (y 144..192) and kitchen (y 192..408) share y=192 across x 288..576
    const shared = l1.walls.filter((w) => w.y1 === 192 && w.y2 === 192 && w.x1 === 288 && w.x2 === 576);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.exterior).toBe(false);
    expect(shared[0]!.roomIds.sort()).toEqual(['l1-hall', 'l1-kit']);
  });

  it('classifies footprint-boundary edges as exterior, bearing lines as bearing', () => {
    const l1 = model.levels[0]!;
    const west = l1.walls.filter((w) => w.x1 === 0 && w.x2 === 0);
    expect(west.length).toBeGreaterThan(0);
    expect(west.every((w) => w.exterior && w.bearing)).toBe(true);
    // declared bearing at x=576
    const bearing576 = l1.walls.filter((w) => w.x1 === 576 && w.x2 === 576 && !w.exterior);
    expect(bearing576.length).toBeGreaterThan(0);
    expect(bearing576.every((w) => w.bearing)).toBe(true);
  });

  it('stair: 15 risers at 7 11/15", 140" run, opening carried on level 2', () => {
    expect(model.stair).not.toBeNull();
    const s = model.stair!;
    expect(s.riserCount).toBe(15);
    expect(s.riserHeight).toEqual({ whole: 7, num: 11, den: 15 });
    expect(formatFraction(s.riserHeight)).toBe('7 11/15"');
    expect(s.runIn).toBe(140);
    const upper = model.levels[1]!;
    const well = upper.rooms.find((r) => r.type === 'stairwell')!;
    expect(well.rect).toEqual(s.opening);
  });

  it('areas and schedule computed from geometry and in agreement (§11)', () => {
    // conditioned L1 = footprint − garage
    expect(model.areas.conditionedByLevelSqIn[0]).toBe(768 * 408 - 288 * 264);
    expect(model.areas.conditionedByLevelSqIn[1]).toBe(480 * 408);
    expect(model.areas.garageSqIn).toBe(288 * 264);
    const schedTotal = model.schedule.reduce((s, r) => s + r.areaSqIn, 0);
    expect(schedTotal).toBe(768 * 408 + 480 * 408); // all rooms incl. garage
  });

  it('determinism golden (Law 3): byte-identical model, hash matches /fixtures', () => {
    const again = buildHouse(farmhouseV2()).model;
    expect(stableStringify(again)).toBe(stableStringify(model));
    expect(hashHouse(model)).toBe(GOLDEN.modelHash);
  });
});

describe('invariant violations are findings, never approximations', () => {
  it('tiling gap → GEOM-TILING error', () => {
    const input = farmhouseV2();
    input.levels[0]!.rooms = input.levels[0]!.rooms.filter((r) => r.id !== 'l1-off');
    const { findings } = buildHouse(input);
    expect(findings.some((f) => f.code === 'GEOM-TILING')).toBe(true);
    expect(findings.some((f) => f.code === 'GEOM-UNENCLOSED')).toBe(true);
  });

  it('overlap → GEOM-OVERLAP error', () => {
    const input = farmhouseV2();
    input.levels[0]!.rooms.find((r) => r.id === 'l1-foy')!.rect.w = 120;
    const f = checkTiling(0, input.levels[0]!.footprint, input.levels[0]!.rooms);
    expect(f.some((x) => x.code === 'GEOM-OVERLAP')).toBe(true);
  });

  it('non-integer input → GEOM-INTEGER error', () => {
    const input = farmhouseV2();
    (input.levels[0]!.rooms[0]!.rect as { x: number }).x = 0.5;
    const { findings } = buildHouse(input);
    expect(findings.some((f) => f.code === 'GEOM-INTEGER')).toBe(true);
  });

  it('missing stair opening upstairs → GEOM-STAIR-OPENING error', () => {
    const input = farmhouseV2();
    const upper = input.levels[1]!;
    upper.rooms = upper.rooms.map((r) =>
      r.id === 'l2-stair' ? { ...r, rect: { ...r.rect, x: 388 } } : r,
    );
    // keep tiling broken separately; we only assert the stair finding exists
    const { findings } = buildHouse(input);
    expect(findings.some((f) => f.code === 'GEOM-STAIR-OPENING')).toBe(true);
  });
});

describe('stair math from rule tables (Law 6)', () => {
  const rules = stairRules();
  it('limits come from the table, not literals', () => {
    expect(rules.maxRiserHundredths).toBe(775);
    expect(rules.maxRiserRuleId).toBe('R311.7.5.1-rise');
  });
  it('narrow stair → finding citing the width rule row', () => {
    const { findings } = computeStair(
      {
        levelFrom: 0, levelTo: 1, roomId: 'x',
        stairwell: { x: 0, y: 0, w: 34, h: 160 },
        widthIn: 30, treadDepthIn: 10, direction: 'rear', floorToFloorIn: 116,
      },
      rules,
    );
    expect(findings.some((f) => f.code === 'R311.7.1-width')).toBe(true);
  });
  it('run overflow → GEOM-STAIR-RUN', () => {
    const { findings } = computeStair(
      {
        levelFrom: 0, levelTo: 1, roomId: 'x',
        stairwell: { x: 0, y: 0, w: 42, h: 120 },
        widthIn: 42, treadDepthIn: 10, direction: 'rear', floorToFloorIn: 116,
      },
      rules,
    );
    expect(findings.some((f) => f.code === 'GEOM-STAIR-RUN')).toBe(true);
  });
});

describe('rule verification gate (§7.1, §11)', () => {
  it('reports unverified rows for enabled checks (blocks launch, not dev)', () => {
    const gate = verificationGate(['R311.7.5.1-rise', 'R311.7.5.2-tread', 'R311.7.1-width']);
    expect(gate).toEqual(['R311.7.5.1-rise', 'R311.7.5.2-tread', 'R311.7.1-width']);
  });
  it('loads rows uniquely', () => {
    expect(loadRuleRows().size).toBe(9);
  });
});
