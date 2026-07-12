import type { Inches, Model, Opening, Point, Polygon, Room, Wall } from './types.js';
import { CONDITIONED_TYPES } from './types.js';

/** Signed area ×2 (shoelace). Positive for CCW in a y-down coordinate system
 *  means the polygon winds clockwise on screen; we standardize on CCW meaning
 *  positive doubled area with the shoelace as written here. */
export function signedArea2(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** Absolute polygon area in square inches (integer-safe: doubled area is always integer). */
export function polygonArea(poly: Polygon): number {
  return Math.abs(signedArea2(poly)) / 2;
}

export function roomArea(room: Room): number {
  return room.w * room.h;
}

/** Least horizontal dimension of a (rectangular) room. */
export function roomMinDim(room: Room): Inches {
  return Math.min(room.w, room.h);
}

export function wallLength(w: Wall): Inches {
  return Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1); // axis-aligned
}

export function isHorizontal(w: Wall): boolean {
  return w.y1 === w.y2;
}

/** Point along a wall at distance d from its start. */
export function pointOnWall(w: Wall, d: Inches): Point {
  const len = wallLength(w);
  if (len === 0) return { x: w.x1, y: w.y1 };
  const t = d / len;
  return {
    x: Math.round(w.x1 + (w.x2 - w.x1) * t),
    y: Math.round(w.y1 + (w.y2 - w.y1) * t),
  };
}

/** Does opening (centerline offset, width) fit within wall length with margin? */
export function openingFitsWall(w: Wall, offset: Inches, width: Inches, margin: Inches = 2): boolean {
  const len = wallLength(w);
  return offset - width / 2 >= margin && offset + width / 2 <= len - margin;
}

export function bbox(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function rectsOverlap(a: Room, b: Room): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Shared edge length between two rooms (0 if not adjacent). */
export function sharedEdge(a: Room, b: Room): Inches {
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (xOverlap > 0 && (a.y + a.h === b.y || b.y + b.h === a.y)) return xOverlap;
  if (yOverlap > 0 && (a.x + a.w === b.x || b.x + b.w === a.x)) return yOverlap;
  return 0;
}

/** Point-in-polygon (rectilinear-safe ray cast). Boundary counts as inside. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  // boundary check for rectilinear polygons
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true;
    if (a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Total conditioned area in square inches. */
export function conditionedArea(model: Model): number {
  return model.rooms
    .filter((r) => CONDITIONED_TYPES.has(r.type))
    .reduce((s, r) => s + roomArea(r), 0);
}

export function garageArea(model: Model): number {
  return model.rooms.filter((r) => r.type === 'garage').reduce((s, r) => s + roomArea(r), 0);
}

export function porchArea(model: Model): number {
  return model.rooms.filter((r) => r.type === 'porch').reduce((s, r) => s + roomArea(r), 0);
}

export function wallById(model: Model, id: string): Wall | undefined {
  return model.walls.find((w) => w.id === id);
}

export function roomById(model: Model, id: string): Room | undefined {
  return model.rooms.find((r) => r.id === id);
}

export function openingById(model: Model, id: string): Opening | undefined {
  return model.openings.find((o) => o.id === id);
}

/**
 * Rooms whose boundary contains the wall segment (i.e., the wall lies on the
 * room rectangle's perimeter). Used to attribute openings to rooms.
 */
export function roomsTouchingWall(model: Model, wall: Wall): Room[] {
  const out: Room[] = [];
  const wMinX = Math.min(wall.x1, wall.x2);
  const wMaxX = Math.max(wall.x1, wall.x2);
  const wMinY = Math.min(wall.y1, wall.y2);
  const wMaxY = Math.max(wall.y1, wall.y2);
  for (const r of model.rooms) {
    const t = wall.thickness; // room clear face sits half-thickness off centerline
    const half = Math.ceil(t / 2);
    const onVert =
      wall.x1 === wall.x2 &&
      (Math.abs(r.x - wall.x1) <= half || Math.abs(r.x + r.w - wall.x1) <= half) &&
      wMinY < r.y + r.h &&
      r.y < wMaxY;
    const onHorz =
      wall.y1 === wall.y2 &&
      (Math.abs(r.y - wall.y1) <= half || Math.abs(r.y + r.h - wall.y1) <= half) &&
      wMinX < r.x + r.w &&
      r.x < wMaxX;
    if (onVert || onHorz) out.push(r);
  }
  return out;
}

/**
 * Rooms an opening serves: rooms touching its wall whose span contains the
 * opening's position along that wall.
 */
export function roomsAtOpening(model: Model, opening: Opening): Room[] {
  const wall = wallById(model, opening.wallId);
  if (!wall) return [];
  const p = pointOnWall(wall, opening.offset);
  return roomsTouchingWall(model, wall).filter((r) => {
    if (wall.x1 === wall.x2) return p.y >= r.y && p.y <= r.y + r.h;
    return p.x >= r.x && p.x <= r.x + r.w;
  });
}

/** All openings on walls bounding a given room. */
export function openingsOfRoom(model: Model, roomId: string): Opening[] {
  return model.openings.filter((o) => roomsAtOpening(model, o).some((r) => r.id === roomId));
}

/** Glazing (glass) area of a window opening in sq inches — full opening as proxy. */
export function windowGlazingArea(o: Opening): number {
  return o.width * o.height;
}

/**
 * Net clear egress opening area for a window, per common clear-opening
 * derating (sash consumes part of the rough opening). Deterministic proxy:
 * clear width = width − 5", clear height = height/2 − 2" for single-hung
 * style openings. Values clamp at 0.
 */
export function windowNetClearOpening(o: Opening): { area: number; w: Inches; h: Inches } {
  const w = Math.max(0, o.width - 5);
  const h = Math.max(0, Math.floor(o.height / 2) - 2);
  return { area: w * h, w, h };
}

/** Stable stringify with sorted keys — used for geometry hashing + determinism tests. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** FNV-1a 32-bit hash of the stable model JSON — the geometry hash frozen at lock. */
export function geometryHash(model: Model): string {
  const s = stableStringify(model);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
