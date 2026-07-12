import { describe, expect, it } from 'vitest';
import { materialsTakeoff, takeoffToCsv, TAKEOFF_NOTICE } from '../src/takeoff/index.js';
import { renderSheetSet } from '../src/render-sheet/index.js';
import { fabricationScan } from '../src/validate/fabricationScan.js';
import { rect3bed } from '../src/fixtures/index.js';

describe('materials takeoff', () => {
  const items = materialsTakeoff(rect3bed());

  it('is deterministic', () => {
    expect(materialsTakeoff(rect3bed())).toEqual(items);
  });

  it('covers every category', () => {
    const cats = new Set(items.map((i) => i.category));
    for (const c of ['foundation', 'framing', 'sheathing', 'roofing', 'openings', 'interior']) {
      expect(cats.has(c as never)).toBe(true);
    }
  });

  it('produces plausible quantities for the 60×32 fixture', () => {
    const find = (d: string) => items.find((i) => i.description.includes(d))!;
    // slab: 1920 SF at 4" ≈ 24 cu yd
    expect(find('slab on grade').qty).toBeGreaterThanOrEqual(20);
    expect(find('slab on grade').qty).toBeLessThanOrEqual(30);
    // exterior studs: 184 LF wall at 16" o.c. + openings ≈ 150–260
    const ext = find('exterior walls');
    expect(ext.qty).toBeGreaterThan(140);
    expect(ext.qty).toBeLessThan(300);
    // shingles: ~2300 SF surface ≈ 23–30 squares with waste
    const sq = find('Asphalt shingles');
    expect(sq.qty).toBeGreaterThan(15);
    expect(sq.qty).toBeLessThan(40);
    // anchor bolts: 184' perimeter / 6' + 4 corners ≈ 35
    const ab = find('Anchor bolts');
    expect(ab.qty).toBeGreaterThan(25);
    expect(ab.qty).toBeLessThan(50);
  });

  it('counts openings by size, marking the rated garage door', () => {
    const rated = items.find((i) => i.description.includes('rated'));
    expect(rated).toBeTruthy();
    expect(rated!.qty).toBe(1);
    const garage = items.find((i) => i.description.startsWith('Garage door'));
    expect(garage!.qty).toBe(1);
  });

  it('pulls header members from HDR-TBL, never inventing sizes', () => {
    const headers = items.filter((i) => i.description.startsWith('Header'));
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect(h.basis).toContain('HDR-TBL');
      expect(h.description).toMatch(/2-2x\d+/);
    }
  });

  it('every item carries a basis line', () => {
    for (const i of items) {
      expect(i.basis.length).toBeGreaterThan(8);
      expect(Number.isInteger(i.qty)).toBe(true);
      expect(i.qty).toBeGreaterThan(0);
    }
  });

  it('CSV export carries the estimate notice', () => {
    const csv = takeoffToCsv(items);
    expect(csv.startsWith(`# ${TAKEOFF_NOTICE}`)).toBe(true);
    expect(csv.split('\n').length).toBe(items.length + 2);
  });
});

describe('A-901 sheet', () => {
  it('renders in the set and passes the fabrication scan', async () => {
    const { sheetIndex, textLog } = await renderSheetSet(rect3bed(), {
      projectTitle: 'Rect 3-Bed Fixture',
      issueDate: '2026-07-12',
    });
    expect(sheetIndex.map((s) => s.id)).toContain('A-901');
    expect(textLog.some((t) => t.includes('MATERIALS TAKEOFF'))).toBe(true);
    expect(textLog.some((t) => t.includes('QUANTITY ESTIMATE FOR BUDGETING ONLY'))).toBe(true);
    expect(fabricationScan(textLog)).toEqual([]);
  });
});
