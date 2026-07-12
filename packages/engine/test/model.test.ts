import { describe, expect, it } from 'vitest';
import {
  conditionedArea,
  formatFeetInches,
  formatSquareFeet,
  garageArea,
  geometryHash,
  polygonArea,
  roomsAtOpening,
  stableStringify,
  windowNetClearOpening,
} from '../src/model/index.js';
import { rect3bed } from '../src/fixtures/index.js';

describe('format (render boundary)', () => {
  it('formats integer inches as feet-and-inches', () => {
    expect(formatFeetInches(174)).toBe(`14'-6"`);
    expect(formatFeetInches(168)).toBe(`14'-0"`);
    expect(formatFeetInches(7)).toBe(`0'-7"`);
    expect(formatFeetInches(0)).toBe(`0'-0"`);
  });
  it('formats square inches as rounded square feet', () => {
    expect(formatSquareFeet(144)).toBe('1 SF');
    expect(formatSquareFeet(200448)).toBe('1392 SF');
  });
});

describe('rect3bed fixture geometry', () => {
  const m = rect3bed();
  it('has integer-inch coordinates everywhere', () => {
    const flat = JSON.stringify(m);
    // every numeric field in the model must be an integer (Law #2)
    const walk = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isInteger(v)).toBe(true);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(JSON.parse(flat));
  });
  it('rooms tile the footprint exactly: conditioned + garage = footprint area', () => {
    expect(conditionedArea(m) + garageArea(m)).toBe(polygonArea(m.footprint));
    expect(conditionedArea(m)).toBe(200448); // 1392 SF
    expect(garageArea(m)).toBe(76032); // 528 SF
  });
  it('attributes openings to the correct rooms', () => {
    const front = m.openings.find((o) => o.id === 'o-front')!;
    expect(roomsAtOpening(m, front).map((r) => r.id)).toContain('r-liv');
    const bed3win = m.openings.find((o) => o.id === 'o-w-bed3')!;
    expect(roomsAtOpening(m, bed3win).map((r) => r.id)).toContain('r-bed3');
  });
  it('computes net clear egress opening deterministically', () => {
    const win = m.openings.find((o) => o.id === 'o-w-bed3')!;
    const clear = windowNetClearOpening(win);
    expect(clear).toEqual({ w: 31, h: 28, area: 868 });
  });
});

describe('geometry hash', () => {
  it('is stable across key order and identical for identical models', () => {
    const a = rect3bed();
    const b = rect3bed();
    expect(geometryHash(a)).toBe(geometryHash(b));
    expect(stableStringify(a)).toBe(stableStringify(b));
  });
  it('changes when geometry changes', () => {
    const a = rect3bed();
    const b = rect3bed();
    b.rooms[0]!.w += 2;
    expect(geometryHash(a)).not.toBe(geometryHash(b));
  });
});
