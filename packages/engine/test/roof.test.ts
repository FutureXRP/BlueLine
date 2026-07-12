import { describe, expect, it } from 'vitest';
import { nodeHeight, straightSkeleton, type SkeletonArc } from '../src/roof/index.js';
import type { Polygon } from '../src/model/types.js';

const RECT: Polygon = [
  { x: 0, y: 0 },
  { x: 0, y: 384 },
  { x: 720, y: 384 },
  { x: 720, y: 0 },
];

// L: 720×384 outer with a 288×216 notch at the NE corner
const L_SHAPE: Polygon = [
  { x: 0, y: 0 },
  { x: 0, y: 384 },
  { x: 720, y: 384 },
  { x: 720, y: 168 },
  { x: 432, y: 168 },
  { x: 432, y: 0 },
];

// T: 720×168 bar across the top + 240-wide, 216-deep stem centered below
const T_SHAPE: Polygon = [
  { x: 0, y: 0 },
  { x: 0, y: 168 },
  { x: 240, y: 168 },
  { x: 240, y: 384 },
  { x: 480, y: 384 },
  { x: 480, y: 168 },
  { x: 720, y: 168 },
  { x: 720, y: 0 },
];

function ridges(arcs: SkeletonArc[]) {
  return arcs.filter((a) => a.kind === 'ridge');
}

function sortedKeys(arcs: SkeletonArc[]) {
  return arcs
    .map((a) =>
      [a.a, a.b]
        .map((n) => `${n.x},${n.y},${n.t}`)
        .sort()
        .join('|') + `|${a.kind}`,
    )
    .sort();
}

describe('straight skeleton — rect hip', () => {
  const sk = straightSkeleton(RECT);
  it('produces one ridge and four hips', () => {
    expect(ridges(sk.arcs)).toHaveLength(1);
    expect(sk.arcs.filter((a) => a.kind === 'hip')).toHaveLength(4);
  });
  it('ridge runs the long axis at half depth', () => {
    const r = ridges(sk.arcs)[0]!;
    const xs = [r.a.x, r.b.x].sort((a, b) => a - b);
    expect(xs).toEqual([192, 528]);
    expect(r.a.y).toBe(192);
    expect(r.b.y).toBe(192);
    expect(r.a.t).toBe(192);
  });
  it('is deterministic', () => {
    expect(sortedKeys(straightSkeleton(RECT).arcs)).toEqual(sortedKeys(sk.arcs));
  });
});

describe('straight skeleton — rect gable', () => {
  // gable ends on edges 0 and 2 (west x=0 edge, east x=720 edge)
  const sk = straightSkeleton(RECT, [0, 2]);
  it('ridge spans wall to wall', () => {
    const r = ridges(sk.arcs)[0]!;
    const xs = [r.a.x, r.b.x].sort((a, b) => a - b);
    expect(xs).toEqual([0, 720]);
    expect(r.a.y).toBe(192);
  });
  it('gable-end traces run up the end walls', () => {
    const gables = sk.arcs.filter((a) => a.kind === 'gable');
    expect(gables).toHaveLength(4);
    for (const g of gables) {
      expect([0, 720]).toContain(g.a.x);
      expect(g.a.x).toBe(g.b.x); // vertical trace in plan
    }
  });
  it('ridge height follows pitch', () => {
    const r = ridges(sk.arcs)[0]!;
    expect(nodeHeight(r.a, 6)).toBe(96); // 192 run at 6:12 = 96" rise
  });
});

describe('straight skeleton — L hip', () => {
  const sk = straightSkeleton(L_SHAPE);
  it('every node lies inside or on the footprint bbox', () => {
    for (const a of sk.arcs) {
      for (const p of [a.a, a.b]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(720);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(384);
      }
    }
  });
  it('has a valley arc from the reflex corner', () => {
    const valleys = sk.arcs.filter((a) => a.kind === 'valley');
    expect(valleys.length).toBeGreaterThanOrEqual(1);
    const fromReflex = valleys.find(
      (v) => (v.a.x === 432 && v.a.y === 168) || (v.b.x === 432 && v.b.y === 168),
    );
    expect(fromReflex).toBeTruthy();
  });
  it('has two ridges (one per arm)', () => {
    expect(ridges(sk.arcs).length).toBe(2);
  });
  it('is deterministic (golden)', () => {
    expect(sortedKeys(sk.arcs)).toEqual(sortedKeys(straightSkeleton(L_SHAPE).arcs));
  });
});

describe('straight skeleton — T hip', () => {
  const sk = straightSkeleton(T_SHAPE);
  it('has two valley arcs from the two reflex corners', () => {
    const valleys = sk.arcs.filter((a) => a.kind === 'valley');
    expect(valleys.length).toBeGreaterThanOrEqual(2);
  });
  it('has ridges for bar and stem', () => {
    expect(ridges(sk.arcs).length).toBeGreaterThanOrEqual(2);
  });
  it('all arcs have positive-length or are dropped', () => {
    for (const a of sk.arcs) {
      const len = Math.hypot(a.a.x - a.b.x, a.a.y - a.b.y);
      expect(len).toBeGreaterThan(0);
    }
  });
});
