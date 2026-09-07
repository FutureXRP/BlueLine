/**
 * Blair residence as-built fixture: first customer-shaped input — two wings,
 * per-room ceiling overrides, an upper-level deck extra, and annotations.
 * Same discipline as every fixture (§11): zero findings, exact tiling,
 * integer inches, determinism golden.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHouse, hashHouse } from '../src/house/index.js';
import { stableStringify } from '../src/model/geometry.js';
import { blairResidence } from '../src/fixtures/blair.js';
import { renderSheetSet2 } from '../src/render-sheet2/index.js';

const GOLDEN = JSON.parse(
  readFileSync(new URL('../../../fixtures/blair.hash.json', import.meta.url), 'utf8'),
) as { modelHash: string };

describe('Blair residence as-built fixture', () => {
  const { model, findings } = buildHouse(blairResidence());

  it('builds with zero findings', () => {
    expect(findings).toEqual([]);
  });

  it('rooms tile both wings exactly, integers everywhere', () => {
    for (const level of model.levels) {
      const foot = level.footprint.reduce((s, r) => s + r.w * r.h, 0);
      const rooms = level.rooms.reduce((s, r) => s + r.rect.w * r.rect.h, 0);
      expect(rooms).toBe(foot);
    }
    const walk = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isInteger(v)).toBe(true);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(JSON.parse(JSON.stringify(model)));
  });

  it('owner as-builts are in the model: ceiling overrides, deck, notes', () => {
    const l0 = model.levels[0]!;
    expect(l0.floorToCeilingIn).toBe(120); // 10' main floor
    expect(model.levels[1]!.floorToCeilingIn).toBe(96); // 8' upstairs
    expect(l0.rooms.find((r) => r.id === 'b-mbed')!.ceilingIn).toBe(144); // vault, drawn flat
    const deck = model.extras.find((e) => e.kind === 'deck')!;
    expect(deck.level).toBe(1);
    // deck sits exactly above the covered rear porch
    expect(deck.rect).toEqual(model.extras.find((e) => e.id === 'x-lanai')!.rect);
    expect(model.annotations!.length).toBeGreaterThan(0);
  });

  it('wing connector: MIL living and family share one interior wall with a cased opening', () => {
    const l0 = model.levels[0]!;
    const shared = l0.walls.find((w) => w.x1 === 312 && w.x2 === 312 && w.roomIds.includes('b-mil-liv') && w.roomIds.includes('b-fam'))!;
    expect(shared.exterior).toBe(false);
    expect(l0.openings.some((o) => o.wallId === shared.id && o.type === 'cased')).toBe(true);
  });

  it('both garages are side-load with rated self-closing doors into the dwelling', () => {
    const l0 = model.levels[0]!;
    const garageDoors = l0.openings.filter((o) => o.type === 'garageDoor');
    expect(garageDoors).toHaveLength(2);
    for (const gd of garageDoors) {
      const wall = l0.walls.find((w) => w.id === gd.wallId)!;
      expect(wall.x1).toBe(wall.x2); // side elevation, not front/rear
    }
    const rated = l0.openings.filter((o) => o.fireRatingMin && o.selfClosing);
    expect(rated).toHaveLength(2);
  });

  it('determinism golden (Law 3): hash matches /fixtures', () => {
    const again = buildHouse(blairResidence()).model;
    expect(stableStringify(again)).toBe(stableStringify(model));
    expect(hashHouse(model)).toBe(GOLDEN.modelHash);
  });

  it('renders the full sheet set with the deck on the upper plan', async () => {
    const set = await renderSheetSet2(model, findings, { issueDate: '2026-01-01' });
    expect(set.sheetIndex.map((s) => s.id)).toContain('A-102');
    expect(set.pdf.length).toBeGreaterThan(10000);
  });
});
