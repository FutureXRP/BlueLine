import { describe, expect, it } from 'vitest';
import {
  introducesHardFindings,
  mirrorPlan,
  moveOpening,
  moveWall,
  placeOpening,
  revalidate,
  snap,
  swapSwing,
} from '../src/ops/index.js';
import { stableStringify } from '../src/model/index.js';
import { rect3bed } from '../src/fixtures/index.js';

describe('ops are pure', () => {
  it('never mutates the input model', () => {
    const m = rect3bed();
    const before = stableStringify(m);
    moveWall(m, 'w-bed2-bath2', 4);
    mirrorPlan(m);
    swapSwing(m, 'o-front');
    placeOpening(m, { id: 'x', wallId: 'w-ext-e', type: 'window', offset: 300, width: 36, height: 60 });
    expect(stableStringify(m)).toBe(before);
  });
});

describe('moveWall', () => {
  it('moves an interior wall and resizes both adjacent rooms', () => {
    const m = rect3bed();
    const { model } = moveWall(m, 'w-bed2-bath2', 4);
    const bed2 = model.rooms.find((r) => r.id === 'r-bed2')!;
    const bath2 = model.rooms.find((r) => r.id === 'r-bath2')!;
    expect(bed2.w).toBe(124);
    expect(bath2.x).toBe(580);
    expect(bath2.w).toBe(56);
    const wall = model.walls.find((w) => w.id === 'w-bed2-bath2')!;
    expect(wall.x1).toBe(580);
  });
  it('snaps deltas to the 2-inch grid', () => {
    expect(snap(3)).toBe(4);
    expect(snap(1)).toBe(2);
    expect(snap(-3)).toBe(-2); // Math.round(-1.5) → -1
  });
  it('rejects nothing itself but reports hard findings for invalid geometry', () => {
    const m = rect3bed();
    const base = revalidate(m).findings;
    // shrink Bedroom 2 below the R304 minimum dimension
    const { findings } = moveWall(m, 'w-bed2-bath2', -40);
    expect(introducesHardFindings(base, findings)).toBe(true);
    // a small nudge is fine
    const ok = moveWall(m, 'w-bed2-bath2', 4);
    expect(introducesHardFindings(base, ok.findings)).toBe(false);
  });
  it('does not move exterior walls', () => {
    const m = rect3bed();
    const { model } = moveWall(m, 'w-ext-n', 24);
    expect(stableStringify(model)).toBe(stableStringify(m));
  });
});

describe('openings', () => {
  it('slides an opening along its wall', () => {
    const m = rect3bed();
    const { model } = moveOpening(m, 'o-w-bed3', 680);
    expect(model.openings.find((o) => o.id === 'o-w-bed3')!.offset).toBe(680);
  });
  it('refuses an opening that does not fit the wall', () => {
    const m = rect3bed();
    const { model } = placeOpening(m, {
      id: 'o-nope',
      wallId: 'w-mud-lau', // 120" long
      type: 'door',
      offset: 110,
      width: 36,
      height: 80,
    });
    expect(model.openings.find((o) => o.id === 'o-nope')).toBeUndefined();
  });
  it('cycles door swing', () => {
    const m = rect3bed();
    const { model } = swapSwing(m, 'o-front');
    expect(model.openings.find((o) => o.id === 'o-front')!.swing).toBe('inRight');
  });
});

describe('mirrorPlan', () => {
  it('is an involution on rooms (mirror twice restores geometry)', () => {
    const m = rect3bed();
    const once = mirrorPlan(m).model;
    const twice = mirrorPlan(once).model;
    expect(twice.rooms).toEqual(m.rooms);
    expect(twice.fixtures.map((f) => f.x)).toEqual(m.fixtures.map((f) => f.x));
  });
  it('keeps the plan valid', () => {
    const m = rect3bed();
    const { findings } = mirrorPlan(m);
    expect(findings.filter((f) => f.severity === 'hard')).toEqual([]);
  });
});
