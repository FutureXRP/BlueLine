import { describe, expect, it } from 'vitest';
import { renderSheetSet } from '../src/render-sheet/index.js';
import { fabricationScan } from '../src/validate/fabricationScan.js';
import { exteriorDimStrings, pruneDimStrings } from '../src/dims/index.js';
import { rect3bed } from '../src/fixtures/index.js';

const OPTS = { projectTitle: 'Rect 3-Bed Fixture', issueDate: '2026-07-12' };

describe('dimension strings', () => {
  const strings = pruneDimStrings(exteriorDimStrings(rect3bed()));
  it('produces all four sides', () => {
    expect(new Set(strings.map((s) => s.side))).toEqual(new Set(['N', 'S', 'E', 'W']));
  });
  it('overall tier spans the footprint', () => {
    const north = strings.filter((s) => s.side === 'N');
    const overall = north.find((s) => s.tier === 3)!;
    expect(overall.ticks).toEqual([0, 720]);
  });
  it('opening tier ticks are sorted and within the overall span', () => {
    for (const s of strings) {
      const sorted = [...s.ticks].sort((a, b) => a - b);
      expect(s.ticks).toEqual(sorted);
    }
  });
  it('segment deltas sum to the overall dimension', () => {
    for (const s of strings) {
      const sum = s.ticks[s.ticks.length - 1]! - s.ticks[0]!;
      const deltas = s.ticks.slice(1).map((t, i) => t - s.ticks[i]!);
      expect(deltas.reduce((a, b) => a + b, 0)).toBe(sum);
    }
  });
});

describe('sheet set rendering', () => {
  it('renders A-000 + A-101 + A-401 deterministically (byte-identical)', async () => {
    const a = await renderSheetSet(rect3bed(), OPTS);
    const b = await renderSheetSet(rect3bed(), OPTS);
    expect(a.pdf.length).toBeGreaterThan(10000);
    expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(true);
    expect(a.geometryHash).toBe(b.geometryHash);
    expect(a.sheetIndex.map((s) => s.id)).toEqual(['A-000', 'A-101', 'A-401']);
  });

  it('carries the NOT-SEALED notice on every sheet', async () => {
    const { textLog, sheetIndex } = await renderSheetSet(rect3bed(), OPTS);
    const notices = textLog.filter((t) => t.includes("NOT AN ARCHITECT'S OR ENGINEER'S SEALED"));
    expect(notices.length).toBe(sheetIndex.length);
  });

  it('prints VERIFY language while rule tables are unverified', async () => {
    const { textLog } = await renderSheetSet(rect3bed(), OPTS);
    expect(textLog.some((t) => t.includes('VERIFY WITH LOCAL CODE OFFICIAL'))).toBe(true);
  });

  it('passes the fabrication scan — no untraceable code citations', async () => {
    const { textLog } = await renderSheetSet(rect3bed(), OPTS);
    expect(fabricationScan(textLog)).toEqual([]);
  });

  it('fabrication scan catches an invented citation', () => {
    expect(fabricationScan(['COMPLIES WITH R999 AS DESIGNED'])).toHaveLength(1);
  });
});
