/**
 * Roof geometry for v2: footprint-union outline, eave polygon, roof height
 * field, and elevation profiles.
 *
 * Height model: with a uniform-pitch wavefront roof, the roof height at plan
 * point p equals pitch/12 × (grassfire offset distance), and that distance is
 * the minimum distance from p to the non-gable eave segments. This matches
 * the straight-skeleton construction the roof plan uses, without needing
 * skeleton faces. Sampled profiles feed elevations and the 3D roof mesh.
 */
import type { Rect, RoofSpec } from './types.js';

export interface Pt {
  x: number;
  y: number;
}

export interface OutlineEdge {
  a: Pt;
  b: Pt;
  /** outward normal direction */
  out: 'front' | 'rear' | 'left' | 'right';
}

/** Boundary edges of a union of axis-aligned rects (elementary-edge method:
 *  an edge segment is boundary iff exactly one side is inside the union). */
export function unionOutline(rects: Rect[]): OutlineEdge[] {
  const inside = (x: number, y: number) =>
    rects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  const edges: OutlineEdge[] = [];
  for (const axis of ['v', 'h'] as const) {
    const lines = new Map<number, Array<[number, number]>>();
    for (const r of rects) {
      if (axis === 'v') {
        (lines.get(r.x) ?? lines.set(r.x, []).get(r.x)!).push([r.y, r.y + r.h]);
        (lines.get(r.x + r.w) ?? lines.set(r.x + r.w, []).get(r.x + r.w)!).push([r.y, r.y + r.h]);
      } else {
        (lines.get(r.y) ?? lines.set(r.y, []).get(r.y)!).push([r.x, r.x + r.w]);
        (lines.get(r.y + r.h) ?? lines.set(r.y + r.h, []).get(r.y + r.h)!).push([r.x, r.x + r.w]);
      }
    }
    for (const [line, ivs] of [...lines.entries()].sort((p, q) => p[0] - q[0])) {
      const cuts = [...new Set(ivs.flat())].sort((p, q) => p - q);
      let run: { a: number; b: number; out: OutlineEdge['out'] } | null = null;
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i]!;
        const b = cuts[i + 1]!;
        if (!ivs.some(([s, e]) => s <= a && e >= b)) {
          if (run) { edges.push(mk(axis, line, run)); run = null; }
          continue;
        }
        const mid = a + (b - a) / 2;
        const lo = axis === 'v' ? inside(line - 1, mid) : inside(mid, line - 1);
        const hi = axis === 'v' ? inside(line + 1, mid) : inside(mid, line + 1);
        if (lo === hi) {
          if (run) { edges.push(mk(axis, line, run)); run = null; }
          continue; // interior or exterior on both sides — not boundary
        }
        const out: OutlineEdge['out'] =
          axis === 'v' ? (lo ? 'right' : 'left') : lo ? 'rear' : 'front';
        if (run && run.b === a && run.out === out) run.b = b;
        else {
          if (run) edges.push(mk(axis, line, run));
          run = { a, b, out };
        }
      }
      if (run) edges.push(mk(axis, line, run));
    }
  }
  return edges;

  function mk(axis: 'v' | 'h', line: number, run: { a: number; b: number; out: OutlineEdge['out'] }): OutlineEdge {
    return axis === 'v'
      ? { a: { x: line, y: run.a }, b: { x: line, y: run.b }, out: run.out }
      : { a: { x: run.a, y: line }, b: { x: run.b, y: line }, out: run.out };
  }
}

/** Offset outline outward by `overhang` — the eave edges. */
export function eaveEdges(outline: OutlineEdge[], overhang: number): OutlineEdge[] {
  return outline.map((e) => {
    const d = overhang;
    const shift =
      e.out === 'front' ? { x: 0, y: -d }
      : e.out === 'rear' ? { x: 0, y: d }
      : e.out === 'left' ? { x: -d, y: 0 }
      : { x: d, y: 0 };
    // extend along the edge so adjacent offset edges meet at corners
    const ext = { x: e.a.x === e.b.x ? 0 : d, y: e.a.y === e.b.y ? 0 : d };
    const lo = { x: Math.min(e.a.x, e.b.x), y: Math.min(e.a.y, e.b.y) };
    const hi = { x: Math.max(e.a.x, e.b.x), y: Math.max(e.a.y, e.b.y) };
    return {
      a: { x: lo.x + shift.x - ext.x, y: lo.y + shift.y - ext.y },
      b: { x: hi.x + shift.x + ext.x, y: hi.y + shift.y + ext.y },
      out: e.out,
    };
  });
}

function distToSegment(p: Pt, e: OutlineEdge): number {
  const ax = e.a.x, ay = e.a.y, bx = e.b.x, by = e.b.y;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2)) : 0;
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

export interface RoofField {
  /** height above plate (inches) at a plan point; 0 outside the eave */
  heightAt: (x: number, y: number) => number;
  eaves: OutlineEdge[];
  /** eave-bounds bbox for sampling */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Build the roof height field for a level footprint + roof spec.
 *  Gable ends (per style: left/right for gable roofs) don't attract the
 *  wavefront, so they're excluded from the distance set. */
export function roofField(footprint: Rect[], roof: RoofSpec, gableSides: Array<'front' | 'rear' | 'left' | 'right'>): RoofField {
  const outline = unionOutline(footprint);
  const eaves = eaveEdges(outline, roof.overhangIn);
  const active = roof.style === 'gable' ? eaves.filter((e) => !gableSides.includes(e.out)) : eaves;
  const bounds = {
    minX: Math.min(...eaves.map((e) => Math.min(e.a.x, e.b.x))),
    minY: Math.min(...eaves.map((e) => Math.min(e.a.y, e.b.y))),
    maxX: Math.max(...eaves.map((e) => Math.max(e.a.x, e.b.x))),
    maxY: Math.max(...eaves.map((e) => Math.max(e.a.y, e.b.y))),
  };
  const insideEave = (x: number, y: number) => {
    // ray cast against eave rect union: approximate with footprint expanded by overhang
    return footprint.some(
      (r) =>
        x >= r.x - roof.overhangIn && x <= r.x + r.w + roof.overhangIn &&
        y >= r.y - roof.overhangIn && y <= r.y + r.h + roof.overhangIn,
    );
  };
  const heightAt = (x: number, y: number): number => {
    if (!insideEave(x, y)) return 0;
    const d = Math.min(...active.map((e) => distToSegment({ x, y }, e)));
    return Math.max(0, Math.round((d * roof.pitch) / 12));
  };
  return { heightAt, eaves, bounds };
}

export interface ProfilePoint {
  along: number; // x for front/rear views, y for left/right
  height: number; // roof height above plate
}

/** Silhouette of the roof seen from a side: max height across the depth axis,
 *  sampled every `step` inches. */
export function elevationRoofProfile(
  field: RoofField,
  view: 'front' | 'rear' | 'left' | 'right',
  step = 6,
): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  const b = field.bounds;
  const horizontal = view === 'front' || view === 'rear';
  const a0 = horizontal ? b.minX : b.minY;
  const a1 = horizontal ? b.maxX : b.maxY;
  const p0 = horizontal ? b.minY : b.minX;
  const p1 = horizontal ? b.maxY : b.maxX;
  for (let a = a0; a <= a1; a += step) {
    let h = 0;
    for (let p = p0; p <= p1; p += step) {
      h = Math.max(h, horizontal ? field.heightAt(a, p) : field.heightAt(p, a));
    }
    pts.push({ along: a, height: h });
  }
  return pts;
}
