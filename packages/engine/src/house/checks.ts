/**
 * Model-level checks (bible §7.2 subset + reference-adopted checks).
 * Every numeric limit resolves from a rule row (Law 6); geometry-integrity
 * checks use GEOM-* codes. Reference-adopted (reference/chatgpt-farmhouse):
 * circulation reachability — here DERIVED from doors, not hand-authored —
 * upper-floor support, and no-window-into-garage.
 */
import type { Finding, HouseModel, LevelModel, Room } from './types.js';
import { HABITABLE } from './types.js';
import { loadRuleRows, requireRow, type RuleRow } from './rules.js';

const SQIN_PER_SQFT = 144;

export function runChecks(model: HouseModel, rows = loadRuleRows()): Finding[] {
  return [
    ...checkRooms(model, rows),
    ...checkHalls(model, rows),
    ...checkCeilings(model, rows),
    ...checkEgressWindows(model, rows),
    ...checkCirculation(model),
    ...checkUpperSupport(model),
    ...checkGarage(model),
  ];
}

function ruleFinding(row: RuleRow, message: string, refs: Finding['refs']): Finding {
  return { severity: row.severity === 'error' ? 'error' : 'warn', code: row.id, message, refs };
}

function checkRooms(model: HouseModel, rows: Map<string, RuleRow>): Finding[] {
  const area = requireRow(rows, 'R304.1-area');
  const dim = requireRow(rows, 'R304.2-dim');
  const out: Finding[] = [];
  for (const level of model.levels) {
    for (const r of level.rooms) {
      if (!HABITABLE.has(r.type)) continue;
      const a = r.rect.w * r.rect.h;
      if (a < area.value * SQIN_PER_SQFT) {
        out.push(ruleFinding(area, `${r.name} is ${Math.round(a / SQIN_PER_SQFT)} sf — below the ${area.value} sf habitable minimum (${area.code_ref}).`, { level: level.index, roomIds: [r.id] }));
      }
      if (Math.min(r.rect.w, r.rect.h) < dim.value) {
        out.push(ruleFinding(dim, `${r.name} is ${Math.min(r.rect.w, r.rect.h)}" across — below the ${dim.value}" habitable minimum dimension (${dim.code_ref}).`, { level: level.index, roomIds: [r.id] }));
      }
    }
  }
  return out;
}

function checkHalls(model: HouseModel, rows: Map<string, RuleRow>): Finding[] {
  const hall = requireRow(rows, 'R311.6-hall');
  const out: Finding[] = [];
  for (const level of model.levels) {
    for (const r of level.rooms) {
      if (r.type !== 'hall') continue;
      if (Math.min(r.rect.w, r.rect.h) < hall.value) {
        out.push(ruleFinding(hall, `${r.name} is ${Math.min(r.rect.w, r.rect.h)}" wide — halls must be at least ${hall.value}" clear (${hall.code_ref}).`, { level: level.index, roomIds: [r.id] }));
      }
    }
  }
  return out;
}

function checkCeilings(model: HouseModel, rows: Map<string, RuleRow>): Finding[] {
  const ceil = requireRow(rows, 'R305.1-ceiling');
  const out: Finding[] = model.levels
    .filter((l) => l.floorToCeilingIn < ceil.value)
    .map((l) => ruleFinding(ceil, `${l.name} ceiling ${l.floorToCeilingIn}" is below the ${ceil.value}" habitable minimum (${ceil.code_ref}).`, { level: l.index }));
  // per-room as-built overrides checked individually (habitable rooms only)
  for (const level of model.levels) {
    for (const r of level.rooms) {
      if (r.ceilingIn === undefined || !HABITABLE.has(r.type)) continue;
      if (r.ceilingIn < ceil.value) {
        out.push(ruleFinding(ceil, `${r.name} ceiling ${r.ceilingIn}" is below the ${ceil.value}" habitable minimum (${ceil.code_ref}).`, { level: level.index, roomIds: [r.id] }));
      }
    }
  }
  return out;
}

/** Net clear egress proxy, same derating as v1 (sash consumes rough opening). */
function netClearSqIn(width: number, height: number): number {
  return Math.max(0, width - 5) * Math.max(0, Math.floor(height / 2) - 2);
}

function checkEgressWindows(model: HouseModel, rows: Map<string, RuleRow>): Finding[] {
  const row = requireRow(rows, 'R310.2.1-egress-area');
  const out: Finding[] = [];
  for (const level of model.levels) {
    for (const r of level.rooms) {
      if (r.type !== 'bedroom') continue;
      const windows = level.openings.filter((o) => {
        if (o.type !== 'window') return false;
        const wall = level.walls.find((w) => w.id === o.wallId);
        return !!wall && wall.exterior && wall.roomIds.includes(r.id);
      });
      const ok = windows.some((o) => netClearSqIn(o.width, o.height) >= row.value * SQIN_PER_SQFT);
      if (!ok) {
        out.push(ruleFinding(row, `${r.name} has no window meeting the ${row.value} sf net-clear emergency escape minimum (${row.code_ref}).`, { level: level.index, roomIds: [r.id] }));
      }
    }
  }
  return out;
}

/** Circulation reachability, derived from openings + the stair (reference-
 *  adopted idea; theirs was hand-authored, ours is computed from geometry). */
export function circulationGraph(model: HouseModel): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    (g.get(a) ?? g.set(a, new Set()).get(a)!).add(b);
    (g.get(b) ?? g.set(b, new Set()).get(b)!).add(a);
  };
  for (const level of model.levels) {
    for (const o of level.openings) {
      if (o.type === 'window') continue;
      const wall = level.walls.find((w) => w.id === o.wallId);
      if (!wall) continue;
      if (wall.exterior) {
        if (o.type === 'door' || o.type === 'slider' || o.type === 'garageDoor') {
          link('EXTERIOR', `${level.index}:${wall.roomIds[0]!}`);
        }
      } else if (wall.roomIds.length === 2) {
        link(`${level.index}:${wall.roomIds[0]!}`, `${level.index}:${wall.roomIds[1]!}`);
      }
    }
  }
  if (model.stair) {
    link(`${model.stair.levelFrom}:${model.stair.roomId}`, stairwellNode(model, model.stair.levelTo) ?? 'STAIR-MISSING');
    // stairwell rooms connect openly to adjacent halls even without a door
    for (const level of model.levels) {
      for (const r of level.rooms) {
        if (r.type !== 'stairwell') continue;
        for (const wall of level.walls) {
          if (!wall.exterior && wall.roomIds.includes(r.id) && wall.roomIds.length === 2) {
            const other = wall.roomIds.find((id) => id !== r.id)!;
            const room = level.rooms.find((x) => x.id === other);
            if (room && (room.type === 'hall' || room.type === 'foyer' || room.type === 'loft')) {
              link(`${level.index}:${r.id}`, `${level.index}:${other}`);
            }
          }
        }
      }
    }
  }
  return g;
}

function stairwellNode(model: HouseModel, levelIndex: number): string | null {
  const level = model.levels.find((l) => l.index === levelIndex);
  const well = level?.rooms.find((r) => r.type === 'stairwell');
  return well ? `${levelIndex}:${well.id}` : null;
}

function reachable(g: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === to) return true;
    for (const q of g.get(n) ?? []) if (!seen.has(q)) { seen.add(q); stack.push(q); }
  }
  return false;
}

function checkCirculation(model: HouseModel): Finding[] {
  const g = circulationGraph(model);
  const out: Finding[] = [];
  for (const level of model.levels) {
    for (const r of level.rooms) {
      const principal = HABITABLE.has(r.type) || r.type === 'bathroom' || r.type === 'laundry' || r.type === 'mudroom' || r.type === 'garage';
      if (!principal) continue;
      if (!reachable(g, 'EXTERIOR', `${level.index}:${r.id}`)) {
        out.push({
          severity: 'error',
          code: 'GEOM-UNREACHABLE',
          message: `${r.name} (level ${level.index}) is not reachable from the entry through doors — circulation is broken.`,
          refs: { level: level.index, roomIds: [r.id] },
        });
      }
    }
  }
  return out;
}

/** Upper footprint must sit inside the level below (reference-adopted). */
function checkUpperSupport(model: HouseModel): Finding[] {
  const out: Finding[] = [];
  for (let i = 1; i < model.levels.length; i++) {
    const below = model.levels[i - 1]!;
    const above = model.levels[i]!;
    for (const rect of above.footprint) {
      const supported = coveredByUnion(rect, below.footprint);
      if (!supported) {
        out.push({
          severity: 'error',
          code: 'GEOM-UNSUPPORTED',
          message: `${above.name} footprint extends beyond ${below.name} — upper levels must be fully supported.`,
          refs: { level: above.index },
        });
      }
    }
  }
  return out;
}

function coveredByUnion(rect: { x: number; y: number; w: number; h: number }, union: typeof rect[]): boolean {
  // sample the rect on a 12" grid of interior probe points
  for (let x = rect.x + 6; x < rect.x + rect.w; x += 12) {
    for (let y = rect.y + 6; y < rect.y + rect.h; y += 12) {
      if (!union.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h)) return false;
    }
  }
  return true;
}

/** Garage separation basics: no window between garage and dwelling; the door
 *  between them must be rated + self-closing (row pending verification is a
 *  Phase-5 add — geometry side enforced now). */
function checkGarage(model: HouseModel): Finding[] {
  const out: Finding[] = [];
  for (const level of model.levels) {
    const garageIds = new Set(level.rooms.filter((r) => r.type === 'garage').map((r) => r.id));
    if (!garageIds.size) continue;
    for (const o of level.openings) {
      const wall = level.walls.find((w) => w.id === o.wallId);
      if (!wall || wall.exterior) continue;
      const touchesGarage = wall.roomIds.some((id) => garageIds.has(id));
      const touchesDwelling = wall.roomIds.some((id) => !garageIds.has(id));
      if (!touchesGarage || !touchesDwelling) continue;
      if (o.type === 'window' || o.type === 'cased' || o.type === 'slider') {
        out.push({ severity: 'error', code: 'GEOM-GARAGE-OPENING', message: `Unprotected ${o.type} between garage and dwelling is not permitted.`, refs: { level: level.index, wallIds: [wall.id] } });
      } else if (o.type === 'door' && (!o.fireRatingMin || !o.selfClosing)) {
        out.push({ severity: 'error', code: 'GEOM-GARAGE-DOOR', message: `Garage-to-dwelling door must be fire-rated and self-closing.`, refs: { level: level.index, wallIds: [wall.id] } });
      }
      const bedroomSide = wall.roomIds
        .map((id) => level.rooms.find((r) => r.id === id))
        .find((r) => r?.type === 'bedroom');
      if (o.type !== 'window' && bedroomSide) {
        out.push({ severity: 'error', code: 'GEOM-GARAGE-BEDROOM', message: `Garage may not open directly into ${bedroomSide.name}.`, refs: { level: level.index, roomIds: [bedroomSide.id] } });
      }
    }
  }
  return out;
}
