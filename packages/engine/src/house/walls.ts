/**
 * Wall derivation by edge union (BLUELINE_V2.md §6).
 *
 * Rooms tile each level to wall centerlines. Every elementary edge segment is
 * classified by who touches it:
 *   - two rooms       → one interior wall (shared edges become ONE wall)
 *   - one room + the footprint boundary → exterior wall
 *   - one room, not on the boundary     → GEOM-UNENCLOSED finding
 *   - two rooms overlapping             → caught by the tiling check, not here
 *
 * Deterministic: walls are emitted sorted by (axis, line coordinate, start),
 * ids derived from geometry.
 */
import type { BearingLine, Finding, Rect, Room, Wall } from './types.js';

interface EdgeRef {
  roomId: string;
  /** side of the line the room lies on: -1 = lesser coordinate side, +1 = greater */
  side: -1 | 1;
  a: number;
  b: number; // interval along the line (a < b)
}

interface Derived {
  walls: Wall[];
  findings: Finding[];
}

function insideUnion(rects: Rect[], x: number, y: number): boolean {
  // strict interior test at half-integer probe points (callers pass ±1 probes
  // from integer lines, so boundary ambiguity cannot occur)
  return rects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
}

export function deriveWalls(
  level: number,
  footprint: Rect[],
  rooms: Room[],
  bearingLines: BearingLine[],
  exteriorThickness: number,
  interiorThickness: number,
): Derived {
  const findings: Finding[] = [];
  const walls: Wall[] = [];

  for (const axis of ['v', 'h'] as const) {
    // group room edges by their line coordinate
    const lines = new Map<number, EdgeRef[]>();
    const push = (c: number, ref: EdgeRef) => {
      const arr = lines.get(c) ?? [];
      arr.push(ref);
      lines.set(c, arr);
    };
    for (const room of rooms) {
      const r = room.rect;
      if (axis === 'v') {
        push(r.x, { roomId: room.id, side: 1, a: r.y, b: r.y + r.h });
        push(r.x + r.w, { roomId: room.id, side: -1, a: r.y, b: r.y + r.h });
      } else {
        push(r.y, { roomId: room.id, side: 1, a: r.x, b: r.x + r.w });
        push(r.y + r.h, { roomId: room.id, side: -1, a: r.x, b: r.x + r.w });
      }
    }

    for (const [line, refs] of [...lines.entries()].sort((p, q) => p[0] - q[0])) {
      // elementary intervals between all endpoints on this line
      const cuts = [...new Set(refs.flatMap((r) => [r.a, r.b]))].sort((p, q) => p - q);
      type Seg = { a: number; b: number; exterior: boolean; roomIds: string[] };
      const segs: Seg[] = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i]!;
        const b = cuts[i + 1]!;
        const mid = a + (b - a) / 2;
        const covering = refs.filter((r) => r.a <= a && r.b >= b);
        if (!covering.length) continue; // gap along the line — no wall here
        const lo = covering.filter((r) => r.side === -1); // room on lesser side
        const hi = covering.filter((r) => r.side === 1);
        const probeLo = axis === 'v' ? insideUnion(footprint, line - 1, mid) : insideUnion(footprint, mid, line - 1);
        const probeHi = axis === 'v' ? insideUnion(footprint, line + 1, mid) : insideUnion(footprint, mid, line + 1);
        if (lo.length && hi.length) {
          segs.push({ a, b, exterior: false, roomIds: [lo[0]!.roomId, hi[0]!.roomId].sort() });
        } else {
          const one = (lo[0] ?? hi[0])!;
          const outwardInside = one.side === 1 ? probeLo : probeHi;
          if (outwardInside) {
            findings.push({
              severity: 'error',
              code: 'GEOM-UNENCLOSED',
              message: `Level ${level}: room edge at ${axis}=${line} [${a}..${b}] faces unassigned interior space.`,
              refs: { level, roomIds: [one.roomId] },
            });
          }
          segs.push({ a, b, exterior: true, roomIds: [one.roomId] });
        }
      }
      // merge adjacent elementary segments with identical classification
      const merged: Seg[] = [];
      for (const s of segs) {
        const last = merged[merged.length - 1];
        if (
          last &&
          last.b === s.a &&
          last.exterior === s.exterior &&
          last.roomIds.join(',') === s.roomIds.join(',')
        ) {
          last.b = s.b;
        } else {
          merged.push({ ...s });
        }
      }
      for (const s of merged) {
        const exterior = s.exterior;
        const bearing =
          exterior ||
          bearingLines.some((bl) => {
            if (bl.level !== level) return false;
            if (axis === 'v') {
              return bl.x1 === line && bl.x2 === line && s.a >= Math.min(bl.y1, bl.y2) && s.b <= Math.max(bl.y1, bl.y2);
            }
            return bl.y1 === line && bl.y2 === line && s.a >= Math.min(bl.x1, bl.x2) && s.b <= Math.max(bl.x1, bl.x2);
          });
        walls.push({
          id: `w${level}-${axis}${line}-${s.a}`,
          level,
          x1: axis === 'v' ? line : s.a,
          y1: axis === 'v' ? s.a : line,
          x2: axis === 'v' ? line : s.b,
          y2: axis === 'v' ? s.b : line,
          thickness: exterior ? exteriorThickness : interiorThickness,
          exterior,
          bearing,
          roomIds: s.roomIds,
        });
      }
    }
  }
  return { walls, findings };
}

/** Tiling invariant (§11): rooms tile the footprint exactly, no overlaps. */
export function checkTiling(level: number, footprint: Rect[], rooms: Room[]): Finding[] {
  const findings: Finding[] = [];
  const footArea = footprint.reduce((s, r) => s + r.w * r.h, 0);
  const roomArea = rooms.reduce((s, r) => s + r.rect.w * r.rect.h, 0);
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!.rect;
      const b = rooms[j]!.rect;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        findings.push({
          severity: 'error',
          code: 'GEOM-OVERLAP',
          message: `Level ${level}: ${rooms[i]!.name} and ${rooms[j]!.name} overlap.`,
          refs: { level, roomIds: [rooms[i]!.id, rooms[j]!.id] },
        });
      }
    }
  }
  if (roomArea !== footArea) {
    findings.push({
      severity: 'error',
      code: 'GEOM-TILING',
      message: `Level ${level}: rooms cover ${roomArea} sq in but the footprint is ${footArea} sq in — tiling must be exact.`,
      refs: { level },
    });
  }
  return findings;
}
