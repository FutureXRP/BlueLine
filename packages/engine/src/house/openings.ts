/**
 * Opening placement on DERIVED walls. Modules never know wall ids — they ask
 * for "a door between room A and room B" or "a window on room R's south
 * face", and the resolver finds the derived wall, computes a collision-free
 * offset on the 2" grid, and emits the Opening. Unsatisfiable requests are
 * findings, never approximations (Law 1 discipline applied to geometry).
 *
 * Fit/overlap validation adopted from the ChatGPT reference generator
 * (reference/chatgpt-farmhouse) and made grammar-native.
 */
import type { Finding, LevelModel, Opening, OpeningType, Room, Swing, Wall } from './types.js';

export type Side = 'front' | 'rear' | 'left' | 'right'; // front = y min (§6)

export interface DoorBetween {
  kind: 'between';
  level: number;
  roomA: string;
  roomB: string;
  type?: OpeningType; // door (default) | cased
  width: number;
  height: number;
  swing?: Swing;
  fireRatingMin?: number;
  selfClosing?: boolean;
  /** preferred distance from wall start; centered when omitted */
  at?: number;
}

export interface OpeningOnExterior {
  kind: 'exterior';
  level: number;
  roomId: string;
  side: Side;
  type: OpeningType;
  width: number;
  height: number;
  sill?: number;
  swing?: Swing;
  egress?: boolean;
  operable?: boolean;
  at?: number;
}

export type OpeningRequest = DoorBetween | OpeningOnExterior;

const GRID = 2;
const MARGIN = 4;
const GAP = 6;

function wallLen(w: Wall): number {
  return Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
}

function sideOfWall(w: Wall, room: Room): Side | null {
  const r = room.rect;
  if (w.y1 === w.y2) {
    if (w.y1 === r.y) return 'front';
    if (w.y1 === r.y + r.h) return 'rear';
  } else {
    if (w.x1 === r.x) return 'left';
    if (w.x1 === r.x + r.w) return 'right';
  }
  return null;
}

function fits(existing: Opening[], wall: Wall, off: number, width: number): boolean {
  const len = wallLen(wall);
  if (off - width / 2 < MARGIN || off + width / 2 > len - MARGIN) return false;
  return existing
    .filter((o) => o.wallId === wall.id)
    .every((o) => Math.abs(o.offset - off) >= (o.width + width) / 2 + GAP);
}

function place(existing: Opening[], wall: Wall, desired: number, width: number): number | null {
  const base = Math.round(desired / GRID) * GRID;
  for (let step = 0; step <= 120; step += GRID) {
    if (fits(existing, wall, base + step, width)) return base + step;
    if (step > 0 && fits(existing, wall, base - step, width)) return base - step;
  }
  return null;
}

let seq = 0;
function oid(prefix: string): string {
  return `${prefix}${++seq}`;
}
export function resetOpeningIds(): void {
  seq = 0;
}

/** Resolve one request against a level's derived walls. Mutates level.openings. */
export function resolveOpening(level: LevelModel, req: OpeningRequest): Finding | null {
  if (req.kind === 'between') {
    const pair = [req.roomA, req.roomB].sort().join(',');
    const walls = level.walls
      .filter((w) => !w.exterior && w.roomIds.join(',') === pair)
      .sort((a, b) => wallLen(b) - wallLen(a));
    for (const wall of walls) {
      const desired = req.at ?? wallLen(wall) / 2;
      const off = place(level.openings, wall, desired, req.width);
      if (off === null) continue;
      level.openings.push({
        id: oid(req.type === 'cased' ? 'C' : 'D'),
        level: level.index,
        wallId: wall.id,
        type: req.type ?? 'door',
        offset: off,
        width: req.width,
        height: req.height,
        sill: 0,
        swing: req.swing ?? 'inLeft',
        ...(req.fireRatingMin ? { fireRatingMin: req.fireRatingMin } : {}),
        ...(req.selfClosing ? { selfClosing: true } : {}),
      });
      return null;
    }
    return {
      severity: 'error',
      code: 'GEOM-NO-SHARED-WALL',
      message: `Level ${level.index}: no shared wall can host a ${req.width}" ${req.type ?? 'door'} between ${req.roomA} and ${req.roomB}.`,
      refs: { level: level.index, roomIds: [req.roomA, req.roomB] },
    };
  }

  const room = level.rooms.find((r) => r.id === req.roomId);
  if (!room) {
    return { severity: 'error', code: 'GEOM-NO-ROOM', message: `Unknown room ${req.roomId}.`, refs: { level: level.index } };
  }
  const walls = level.walls
    .filter((w) => w.exterior && w.roomIds.includes(req.roomId) && sideOfWall(w, room) === req.side)
    .sort((a, b) => wallLen(b) - wallLen(a));
  for (const wall of walls) {
    const desired = req.at ?? wallLen(wall) / 2;
    const off = place(level.openings, wall, desired, req.width);
    if (off === null) continue;
    level.openings.push({
      id: oid(req.type === 'window' ? 'W' : req.type === 'garageDoor' ? 'G' : req.type === 'slider' ? 'S' : 'D'),
      level: level.index,
      wallId: wall.id,
      type: req.type,
      offset: off,
      width: req.width,
      height: req.height,
      sill: req.sill ?? 0,
      swing: req.swing ?? (req.type === 'door' ? 'inLeft' : 'none'),
      ...(req.egress ? { egress: true } : {}),
      ...(req.operable !== undefined ? { operable: req.operable } : {}),
    });
    return null;
  }
  return {
    severity: req.type === 'window' ? 'warn' : 'error',
    code: 'GEOM-NO-EXTERIOR-FACE',
    message: `Level ${level.index}: ${room.name} has no ${req.side} exterior face free for a ${req.width}" ${req.type}.`,
    refs: { level: level.index, roomIds: [req.roomId] },
  };
}

/** Post-hoc fit + overlap validation (reference-adopted). */
export function checkOpenings(level: LevelModel, floorToCeilingIn: number): Finding[] {
  const findings: Finding[] = [];
  const byWall = new Map<string, Opening[]>();
  for (const o of level.openings) {
    const wall = level.walls.find((w) => w.id === o.wallId);
    if (!wall) {
      findings.push({ severity: 'error', code: 'GEOM-OPENING-HOST', message: `Opening ${o.id} references missing wall ${o.wallId}.`, refs: { level: level.index } });
      continue;
    }
    if (o.offset - o.width / 2 < 0 || o.offset + o.width / 2 > wallLen(wall)) {
      findings.push({ severity: 'error', code: 'GEOM-OPENING-FIT', message: `Opening ${o.id} extends past its host wall.`, refs: { level: level.index, wallIds: [wall.id] } });
    }
    if (o.sill < 0 || o.height <= 0 || o.sill + o.height > floorToCeilingIn) {
      findings.push({ severity: 'error', code: 'GEOM-OPENING-HEIGHT', message: `Opening ${o.id} exceeds the ${floorToCeilingIn}" wall height.`, refs: { level: level.index, wallIds: [wall.id] } });
    }
    const arr = byWall.get(o.wallId) ?? [];
    arr.push(o);
    byWall.set(o.wallId, arr);
  }
  for (const [wallId, ops] of byWall) {
    const sorted = [...ops].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (a.offset + a.width / 2 > b.offset - b.width / 2) {
        findings.push({ severity: 'error', code: 'GEOM-OPENING-OVERLAP', message: `Openings ${a.id} and ${b.id} overlap on wall ${wallId}.`, refs: { level: level.index, wallIds: [wallId] } });
      }
    }
  }
  return findings;
}
