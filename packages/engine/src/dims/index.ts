/**
 * Deterministic dimension-string generator (Build Bible §9).
 *
 * Exterior hierarchy per side: overall → wall-segment → opening-centerline.
 * Never hand-placed: everything derives from the integer-inch model. The
 * renderer decides paper offsets; this module only computes the tick
 * coordinates along each building face.
 */
import type { Model, Wall } from '../model/types.js';
import { bbox, pointOnWall, wallLength } from '../model/geometry.js';

export type Side = 'N' | 'S' | 'E' | 'W';

export interface DimString {
  side: Side;
  /** 1 = opening centerlines (closest to plan), 2 = wall segments, 3 = overall. */
  tier: 1 | 2 | 3;
  /** Sorted tick positions along the facade axis (x for N/S, y for E/W), model inches. */
  ticks: number[];
}

/** Which side an exterior wall faces (outward normal direction). */
export function wallSide(model: Model, w: Wall): Side | null {
  if (w.kind !== 'exterior') return null;
  const box = bbox(model.footprint);
  if (w.y1 === w.y2) {
    // horizontal: faces N if nothing above it (closer to minY), else S
    const midY = w.y1;
    return midY - box.minY <= box.maxY - midY ? 'N' : 'S';
  }
  const midX = w.x1;
  return midX - box.minX <= box.maxX - midX ? 'W' : 'E';
}

function axisOf(side: Side): 'x' | 'y' {
  return side === 'N' || side === 'S' ? 'x' : 'y';
}

/** Generate the three-tier exterior dimension strings for every side. */
export function exteriorDimStrings(model: Model): DimString[] {
  const box = bbox(model.footprint);
  const out: DimString[] = [];

  for (const side of ['N', 'S', 'E', 'W'] as Side[]) {
    const axis = axisOf(side);
    const walls = model.walls.filter((w) => wallSide(model, w) === side);
    if (!walls.length) continue;

    // tier 3 — overall
    const overall =
      axis === 'x' ? [box.minX, box.maxX] : [box.minY, box.maxY];

    // tier 2 — wall segment breaks: endpoints of each exterior wall on this side
    const seg = new Set<number>();
    for (const w of walls) {
      seg.add(axis === 'x' ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2));
      seg.add(axis === 'x' ? Math.max(w.x1, w.x2) : Math.max(w.y1, w.y2));
    }
    // interior wall intersections with this facade (partition faces tier)
    for (const iw of model.walls) {
      if (iw.kind === 'exterior') continue;
      for (const w of walls) {
        if (w.y1 === w.y2 && iw.x1 === iw.x2) {
          // horizontal facade, vertical partition touching it
          if (Math.min(iw.y1, iw.y2) <= w.y1 && w.y1 <= Math.max(iw.y1, iw.y2)) {
            if (iw.x1 > Math.min(w.x1, w.x2) && iw.x1 < Math.max(w.x1, w.x2)) seg.add(iw.x1);
          }
        } else if (w.x1 === w.x2 && iw.y1 === iw.y2) {
          if (Math.min(iw.x1, iw.x2) <= w.x1 && w.x1 <= Math.max(iw.x1, iw.x2)) {
            if (iw.y1 > Math.min(w.y1, w.y2) && iw.y1 < Math.max(w.y1, w.y2)) seg.add(iw.y1);
          }
        }
      }
    }

    // tier 1 — opening centerlines on this side's walls, plus segment bounds
    const open = new Set<number>(seg);
    for (const w of walls) {
      for (const o of model.openings) {
        if (o.wallId !== w.id) continue;
        const p = pointOnWall(w, o.offset);
        open.add(axis === 'x' ? p.x : p.y);
      }
    }

    out.push({ side, tier: 3, ticks: overall });
    out.push({ side, tier: 2, ticks: [...seg].sort((a, b) => a - b) });
    out.push({ side, tier: 1, ticks: [...open].sort((a, b) => a - b) });
  }
  return out;
}

/** Drop tiers that duplicate the tier above them (e.g., no openings on a side). */
export function pruneDimStrings(strings: DimString[]): DimString[] {
  const key = (t: number[]) => t.join(',');
  const out: DimString[] = [];
  for (const side of ['N', 'S', 'E', 'W'] as Side[]) {
    const tiers = strings
      .filter((s) => s.side === side)
      .sort((a, b) => a.tier - b.tier);
    let prev: string | null = null;
    for (const t of tiers) {
      if (t.ticks.length < 2) continue;
      const k = key(t.ticks);
      if (k !== prev) out.push(t);
      prev = k;
    }
  }
  return out;
}

export function wallSegmentsOnSide(model: Model, side: Side): Wall[] {
  return model.walls.filter((w) => wallSide(model, w) === side && wallLength(w) > 0);
}
