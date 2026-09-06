/**
 * buildHouse: level plans (from the grammar, or a hand-authored fixture until
 * the grammar lands in Sessions 2–3) → HouseModel + findings.
 *
 * Derives walls by edge union, computes the stair from floor-to-floor,
 * computes areas and the schedule FROM GEOMETRY (no typed areas anywhere,
 * §11), and enforces the integer-inch and tiling invariants.
 */
import {
  CONDITIONED,
  rectArea,
  type Areas,
  type BearingLine,
  type Finding,
  type HouseModel,
  type HouseSpec,
  type LevelModel,
  type Opening,
  type Rect,
  type Room,
  type RoofSpec,
  type ScheduleRow,
} from './types.js';
import { checkTiling, deriveWalls } from './walls.js';
import { computeStair, type StairInput } from './stairs.js';
import { stairRules } from './rules.js';

export interface LevelPlan {
  index: number;
  name: string;
  footprint: Rect[];
  floorToCeilingIn: number;
  rooms: Room[];
  openings?: Opening[];
}

export interface HousePlanInput {
  spec: HouseSpec;
  levels: LevelPlan[];
  roof: RoofSpec;
  bearingLines: BearingLine[];
  stair?: Omit<StairInput, 'floorToFloorIn'>;
}

export function buildHouse(input: HousePlanInput): { model: HouseModel; findings: Finding[] } {
  const findings: Finding[] = [];

  findings.push(...checkIntegers(input));

  const levels: LevelModel[] = [];
  for (const plan of input.levels) {
    findings.push(...checkTiling(plan.index, plan.footprint, plan.rooms));
    const derived = deriveWalls(
      plan.index,
      plan.footprint,
      plan.rooms,
      input.bearingLines,
      input.spec.exteriorWallThicknessIn,
      input.spec.interiorWallThicknessIn,
    );
    findings.push(...derived.findings);
    levels.push({
      index: plan.index,
      name: plan.name,
      footprint: plan.footprint,
      floorToCeilingIn: plan.floorToCeilingIn,
      rooms: plan.rooms,
      walls: derived.walls,
      openings: plan.openings ?? [],
    });
  }

  let stair: HouseModel['stair'] = null;
  if (input.stair) {
    const res = computeStair({ ...input.stair, floorToFloorIn: input.spec.floorToFloorIn }, stairRules());
    stair = res.stair;
    findings.push(...res.findings);
    // upper levels must reserve the stair opening as a stairwell room
    const upper = levels.find((l) => l.index === res.stair.levelTo);
    if (upper) {
      const o = res.stair.opening;
      const covered = upper.rooms.some(
        (r) =>
          r.type === 'stairwell' &&
          r.rect.x === o.x && r.rect.y === o.y && r.rect.w === o.w && r.rect.h === o.h,
      );
      if (!covered) {
        findings.push({
          severity: 'error',
          code: 'GEOM-STAIR-OPENING',
          message: `Level ${upper.index} must carry the stair opening as a stairwell room at (${o.x},${o.y}) ${o.w}×${o.h}.`,
          refs: { level: upper.index },
        });
      }
    }
  }

  const areas = computeAreas(levels);
  const schedule = computeSchedule(levels);

  const model: HouseModel = {
    modelVersion: 2,
    spec: input.spec,
    levels,
    stair,
    roof: input.roof,
    bearing: input.bearingLines,
    areas,
    schedule,
  };

  // §11 area invariant: schedule totals equal geometry totals
  const schedTotal = schedule
    .filter((r) => CONDITIONED.has(r.type))
    .reduce((s, r) => s + r.areaSqIn, 0);
  if (schedTotal !== areas.conditionedTotalSqIn) {
    findings.push({
      severity: 'error',
      code: 'GEOM-AREA-INVARIANT',
      message: `Schedule conditioned total ${schedTotal} disagrees with geometry total ${areas.conditionedTotalSqIn}.`,
      refs: {},
    });
  }

  return { model, findings };
}

function computeAreas(levels: LevelModel[]): Areas {
  const conditionedByLevelSqIn = levels.map((l) =>
    l.rooms.filter((r) => CONDITIONED.has(r.type)).reduce((s, r) => s + rectArea(r.rect), 0),
  );
  const all = levels.flatMap((l) => l.rooms);
  return {
    conditionedByLevelSqIn,
    conditionedTotalSqIn: conditionedByLevelSqIn.reduce((a, b) => a + b, 0),
    garageSqIn: all.filter((r) => r.type === 'garage').reduce((s, r) => s + rectArea(r.rect), 0),
    porchSqIn: all.filter((r) => r.type === 'porch').reduce((s, r) => s + rectArea(r.rect), 0),
    footprintSqIn: (levels[0]?.footprint ?? []).reduce((s, r) => s + r.w * r.h, 0),
  };
}

function computeSchedule(levels: LevelModel[]): ScheduleRow[] {
  return levels.flatMap((l) =>
    l.rooms.map((r) => ({
      level: l.index,
      roomId: r.id,
      name: r.name,
      type: r.type,
      areaSqIn: rectArea(r.rect), // computed, never typed (§11 lint intent)
    })),
  );
}

/** Law 2 walker: every number reachable from the input must be an integer. */
function checkIntegers(input: HousePlanInput): Finding[] {
  const bad: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) bad.push(path);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(input, 'input');
  return bad.length
    ? [{
        severity: 'error',
        code: 'GEOM-INTEGER',
        message: `Non-integer values in model input: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`,
        refs: {},
      }]
    : [];
}
