/**
 * Pure model operations (Build Bible §10 `ops/`).
 *
 * Every op returns `{ model, findings }` — a NEW model (input never mutated)
 * plus the full validation result for the new state. The editor's commit
 * policy (invalid moves never commit, §12) is: reject if the op introduces
 * new `hard` findings.
 */
import type { DoorSwing, Finding, Model, Opening, OpeningType, Wall } from '../model/types.js';
import { openingFitsWall, wallById, wallLength } from '../model/geometry.js';
import { loadRuleSet, validate, type RuleSet } from '../validate/index.js';

export interface OpResult {
  model: Model;
  findings: Finding[];
}

export const SNAP_GRID = 2; // inches — editor snap (Build Bible §5 Stage 2)
export const PLANNING_MODULE = 24; // inches — footprint module

export function snap(v: number, grid: number = SNAP_GRID): number {
  return Math.round(v / grid) * grid;
}

function clone(model: Model): Model {
  return structuredClone(model);
}

function result(model: Model, ruleSet?: RuleSet): OpResult {
  return { model, findings: validate(model, ruleSet ?? loadRuleSet()) };
}

/** True if `next` introduces hard findings not present in `prev`. */
export function introducesHardFindings(prev: Finding[], next: Finding[]): boolean {
  const key = (f: Finding) =>
    `${f.ruleId}|${f.message}|${(f.refs.roomIds ?? []).join(',')}|${(f.refs.openingIds ?? []).join(',')}`;
  const prevHard = new Set(prev.filter((f) => f.severity === 'hard').map(key));
  return next.some((f) => f.severity === 'hard' && !prevHard.has(key(f)));
}

/**
 * Move an interior wall perpendicular to its axis by `delta` inches (snapped).
 * Adjacent rooms grow/shrink; abutting wall endpoints follow.
 */
export function moveWall(model: Model, wallId: string, delta: number, ruleSet?: RuleSet): OpResult {
  const d = snap(delta);
  const next = clone(model);
  const wall = next.walls.find((w) => w.id === wallId);
  if (!wall || d === 0) return result(next, ruleSet);
  if (wall.kind === 'exterior') return result(next, ruleSet); // exterior moves via footprint ops (Phase 2)

  if (wall.x1 === wall.x2) {
    const X = wall.x1;
    const yLo = Math.min(wall.y1, wall.y2);
    const yHi = Math.max(wall.y1, wall.y2);
    for (const r of next.rooms) {
      const overlaps = r.y < yHi && yLo < r.y + r.h;
      if (!overlaps) continue;
      if (r.x + r.w === X) r.w += d; // room on west side
      else if (r.x === X) { r.x += d; r.w -= d; } // room on east side
    }
    for (const w of next.walls) {
      if (w.id === wall.id) continue;
      if (w.x1 === X && w.y1 >= yLo && w.y1 <= yHi && w.y1 === w.y2) w.x1 += d;
      if (w.x2 === X && w.y2 >= yLo && w.y2 <= yHi && w.y1 === w.y2) w.x2 += d;
    }
    wall.x1 += d;
    wall.x2 += d;
  } else {
    const Y = wall.y1;
    const xLo = Math.min(wall.x1, wall.x2);
    const xHi = Math.max(wall.x1, wall.x2);
    for (const r of next.rooms) {
      const overlaps = r.x < xHi && xLo < r.x + r.w;
      if (!overlaps) continue;
      if (r.y + r.h === Y) r.h += d;
      else if (r.y === Y) { r.y += d; r.h -= d; }
    }
    for (const w of next.walls) {
      if (w.id === wall.id) continue;
      if (w.y1 === Y && w.x1 >= xLo && w.x1 <= xHi && w.x1 === w.x2) w.y1 += d;
      if (w.y2 === Y && w.x2 >= xLo && w.x2 <= xHi && w.x1 === w.x2) w.y2 += d;
    }
    wall.y1 += d;
    wall.y2 += d;
  }
  return result(next, ruleSet);
}

/** Place a new opening on a wall. Offset is to the opening centerline. */
export function placeOpening(
  model: Model,
  opening: {
    id: string;
    wallId: string;
    type: OpeningType;
    offset: number;
    width: number;
    height: number;
    sill?: number;
    swing?: DoorSwing;
    fireRatingMin?: number;
    selfClosing?: boolean;
    operable?: boolean;
    egressDoor?: boolean;
  },
  ruleSet?: RuleSet,
): OpResult {
  const next = clone(model);
  const wall = next.walls.find((w) => w.id === opening.wallId);
  if (wall && openingFitsWall(wall, snap(opening.offset), opening.width)) {
    next.openings.push({
      swing: 'none',
      sill: 0,
      ...opening,
      offset: snap(opening.offset),
    });
  }
  return result(next, ruleSet);
}

/** Slide an opening along its wall (§12: click opening → slide along wall). */
export function moveOpening(model: Model, openingId: string, newOffset: number, ruleSet?: RuleSet): OpResult {
  const next = clone(model);
  const o = next.openings.find((x) => x.id === openingId);
  if (o) {
    const wall = next.walls.find((w) => w.id === o.wallId);
    const off = snap(newOffset);
    if (wall && openingFitsWall(wall, off, o.width)) o.offset = off;
  }
  return result(next, ruleSet);
}

/** Resize an opening from the catalog (width/height/sill swap). */
export function resizeOpening(
  model: Model,
  openingId: string,
  size: { width: number; height: number; sill?: number },
  ruleSet?: RuleSet,
): OpResult {
  const next = clone(model);
  const o = next.openings.find((x) => x.id === openingId);
  if (o) {
    const wall = next.walls.find((w) => w.id === o.wallId);
    if (wall && openingFitsWall(wall, o.offset, size.width)) {
      o.width = size.width;
      o.height = size.height;
      if (size.sill !== undefined) o.sill = size.sill;
    }
  }
  return result(next, ruleSet);
}

export function removeOpening(model: Model, openingId: string, ruleSet?: RuleSet): OpResult {
  const next = clone(model);
  next.openings = next.openings.filter((o) => o.id !== openingId);
  return result(next, ruleSet);
}

const SWING_CYCLE: DoorSwing[] = ['inLeft', 'inRight', 'outLeft', 'outRight'];

export function swapSwing(model: Model, openingId: string, ruleSet?: RuleSet): OpResult {
  const next = clone(model);
  const o = next.openings.find((x) => x.id === openingId);
  if (o && o.type === 'door' && o.swing !== 'slider' && o.swing !== 'none') {
    const i = SWING_CYCLE.indexOf(o.swing);
    o.swing = SWING_CYCLE[(i + 1) % SWING_CYCLE.length]!;
  }
  return result(next, ruleSet);
}

export function renameRoom(model: Model, roomId: string, name: string, ruleSet?: RuleSet): OpResult {
  const next = clone(model);
  const r = next.rooms.find((x) => x.id === roomId);
  if (r) r.name = name;
  return result(next, ruleSet);
}

/** Mirror the whole plan across its vertical centerline (`M` key, §12). */
export function mirrorPlan(model: Model, ruleSet?: RuleSet): OpResult {
  const next = clone(model);
  const xs = next.footprint.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const mx = (x: number) => minX + maxX - x;
  next.footprint = next.footprint.map((p) => ({ x: mx(p.x), y: p.y })).reverse();
  for (const r of next.rooms) r.x = mx(r.x + r.w);
  for (const w of next.walls) {
    const nx1 = mx(w.x1);
    const nx2 = mx(w.x2);
    w.x1 = nx1;
    w.x2 = nx2;
  }
  // Opening offsets are unchanged: horizontal walls had their endpoints
  // mirrored AND start/end swapped, so the same offset lands at the mirrored
  // position; vertical walls keep their y-run.
  for (const o of next.openings) {
    if (o.swing === 'inLeft') o.swing = 'inRight';
    else if (o.swing === 'inRight') o.swing = 'inLeft';
    else if (o.swing === 'outLeft') o.swing = 'outRight';
    else if (o.swing === 'outRight') o.swing = 'outLeft';
  }
  for (const f of next.fixtures) {
    f.x = mx(f.x);
    if (f.rot === 1) f.rot = 3;
    else if (f.rot === 3) f.rot = 1;
  }
  return result(next, ruleSet);
}

/** Add a fixture (used by alarm auto-placement and the editor). */
export function placeFixture(
  model: Model,
  fixture: Model['fixtures'][number],
  ruleSet?: RuleSet,
): OpResult {
  const next = clone(model);
  next.fixtures.push({ ...fixture });
  return result(next, ruleSet);
}

/** Convenience: run validate on a model without mutating (initial editor load). */
export function revalidate(model: Model, ruleSet?: RuleSet): OpResult {
  return result(clone(model), ruleSet);
}
