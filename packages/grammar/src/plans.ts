/**
 * Plan types (bible §4.3): templates of module slots resolved into exact,
 * tiled, integer-inch level plans. The grammar never searches — a request the
 * template cannot satisfy is a named finding, not an approximation (§4.6).
 *
 * Sizing note: stairwell depth is derived from the stair run (floor-to-floor
 * at the chosen ceiling, treads from rule tables) so the run always fits;
 * 10' ceilings deepen the front row instead of failing.
 */
import type { Extra, Finding, Room } from '@blueline/engine/house';
import type { HousePlanInput, LevelPlan } from '@blueline/engine/house';
import type { OpeningRequest } from '@blueline/engine/house';
import type { DesignProgram } from './program.js';
import { moduleParam } from './program.js';
import { STYLE_PACKS, type StylePack } from './styles.js';

const FLOOR_SYSTEM_IN = 16; // construction default carried in the spec, not code
const UPPER_CEILING_IN = 96;

interface Ctx {
  program: DesignProgram;
  style: StylePack;
  findings: Finding[];
  reqs: OpeningRequest[];
  extras: Extra[];
}

function warn(ctx: Ctx, code: string, message: string): void {
  ctx.findings.push({ severity: 'warn', code, message, refs: {} });
}

function room(id: string, name: string, type: Room['type'], x: number, y: number, w: number, h: number): Room {
  return { id, name, type, rect: { x, y, w, h } };
}

function ceilingIn(program: DesignProgram): number {
  return program.finishes.ceiling_ft * 12;
}

/** Front-row depth that fits the straight stair run. */
function frontRowDepth(program: DesignProgram): number {
  return program.finishes.ceiling_ft === 10 ? 192 : 168;
}

const SIZE = {
  living: { S: 240, M: 288, L: 336 },
  suite: { S: 168, M: 192, L: 216 },
  wic: { S: 72, M: 80, L: 96 },
} as const;

const GARAGE_W = { 1: 192, 2: 288, 3: 408 } as const;
const GARAGE_D = 264;

export interface PlanResult {
  input: HousePlanInput;
  grammarFindings: Finding[];
}

export function layoutProgram(program: DesignProgram): PlanResult {
  const style = STYLE_PACKS[program.style];
  const ctx: Ctx = { program, style, findings: [], reqs: [], extras: [] };
  switch (program.plan_type) {
    case 'farmhouse_two_story':
      return farmhouse(ctx);
    case 'split_ranch':
      return splitRanch(ctx);
    case 'compact_two_story':
      return compact(ctx);
  }
}

function baseSpec(ctx: Ctx) {
  const p = ctx.program;
  return {
    seed: p.seed,
    engineVersion: '2.0.0-s3',
    style: p.style,
    planType: p.plan_type,
    foundation: p.finishes.foundation,
    studs: p.finishes.studs,
    exteriorWallThicknessIn: p.finishes.studs === '2x6' ? 6 : 5,
    interiorWallThicknessIn: 5,
    floorToFloorIn: ceilingIn(p) + FLOOR_SYSTEM_IN,
    roofPitch: ctx.style.roofPitch,
  };
}

function roofSpec(ctx: Ctx) {
  return {
    style: ctx.style.roofStyle,
    pitch: ctx.style.roofPitch,
    overhangIn: ctx.style.overhangIn,
    gableEdges: [] as number[],
  };
}

function garageDoors(ctx: Ctx, roomId: string, garW: number): void {
  const bays = moduleParam(ctx.program, 'garage')?.bays ?? 2;
  if (bays === 3) {
    ctx.findings.push({
      severity: 'engineer',
      code: 'GRAMMAR-GARAGE-3BAY',
      message: '3-bay garage header exceeds the loaded prescriptive table set — engineer required for the garage wall.',
      refs: {},
    });
  }
  const doors: Array<{ at: number; w: number }> =
    bays === 1 ? [{ at: garW / 2, w: 108 }]
    : bays === 2 ? [{ at: 72, w: 108 }, { at: garW - 72, w: 108 }]
    : [{ at: 72, w: 108 }, { at: garW - 106, w: 192 }];
  for (const d of doors) {
    ctx.reqs.push({ kind: 'exterior', level: 0, roomId, side: 'front', type: 'garageDoor', width: d.w, height: 84, at: d.at });
  }
}

function windowReq(ctx: Ctx, level: number, roomId: string, side: 'front' | 'rear' | 'left' | 'right', opts: { small?: boolean; egress?: boolean; at?: number } = {}): OpeningRequest {
  const w = opts.small ? ctx.style.windowSmall : ctx.style.window;
  return {
    kind: 'exterior', level, roomId, side, type: 'window',
    width: w.w, height: w.h, sill: w.sill, operable: true,
    ...(opts.egress ? { egress: true } : {}),
    ...(opts.at !== undefined ? { at: opts.at } : {}),
  };
}

function door(level: number, a: string, b: string, width = 32, extra: Partial<Extract<OpeningRequest, { kind: 'between' }>> = {}): OpeningRequest {
  return { kind: 'between', level, roomA: a, roomB: b, width, height: 80, ...extra };
}

function cased(level: number, a: string, b: string, width = 96): OpeningRequest {
  return { kind: 'between', level, roomA: a, roomB: b, type: 'cased', width, height: 96 };
}

// ---------------------------------------------------------------------------
// farmhouse_two_story
// ---------------------------------------------------------------------------

function farmhouse(ctx: Ctx): PlanResult {
  const p = ctx.program;
  const living = moduleParam(p, 'living_block') ?? { size: 'M' as const, island: true, rearDoor: true };
  const suite = moduleParam(p, 'primary_suite') ?? { size: 'M' as const, doubleVanity: true };
  const garage = moduleParam(p, 'garage');
  const service = moduleParam(p, 'service_core') ?? { pantry: 'walk-in' as const };
  const flex = moduleParam(p, 'flex_room') ?? { use: 'office' as const };
  const upper = moduleParam(p, 'upper_bed_wing') ?? { beds: 3 as const, loft: true, bonus: true };
  const stairP = moduleParam(p, 'stair_core') ?? { widthIn: 42 as const };

  const front = frontRowDepth(p);
  const D = front + 48 + 216;
  const garW = garage ? GARAGE_W[garage.bays] : 0;
  if (!garage) warn(ctx, 'GRAMMAR-NO-GARAGE', 'farmhouse_two_story without a garage places the service core against the west wall.');
  const westW = garage ? garW : 144;
  const centerW = SIZE.living[living.size];
  const suiteW = SIZE.suite[suite.size];
  const W = westW + centerW + suiteW;
  const serviceY = GARAGE_D;
  const serviceH = D - GARAGE_D;
  const clg = ceilingIn(p);

  const l1: Room[] = [];
  if (garage) {
    l1.push(room('l1-gar', 'Garage', 'garage', 0, 0, garW, GARAGE_D));
    const mudW = garW >= 288 ? 144 : 96;
    const pantryW = service.pantry === 'walk-in' ? 60 : 0;
    l1.push(room('l1-mud', 'Mudroom', 'mudroom', 0, serviceY, mudW, serviceH));
    l1.push(room('l1-lau', 'Laundry', 'laundry', mudW, serviceY, garW - mudW - pantryW, serviceH));
    if (pantryW) l1.push(room('l1-pan', 'Pantry', 'pantry', garW - pantryW, serviceY, pantryW, serviceH));
  } else {
    l1.push(room('l1-mud', 'Mudroom', 'mudroom', 0, 0, westW, GARAGE_D / 2));
    l1.push(room('l1-lau', 'Laundry', 'laundry', 0, GARAGE_D / 2, westW, GARAGE_D / 2));
    l1.push(room('l1-flex2', 'Storage', 'closet', 0, serviceY, westW, serviceH));
  }
  const flexUse = flex.use;
  const flexType = flexUse === 'office' ? 'office' : flexUse === 'theater' ? 'theater' : 'flex';
  const flexName = flexUse === 'office' ? 'Office' : flexUse === 'theater' ? 'Theater' : flexUse === 'guest' ? 'Guest' : 'Playroom';
  l1.push(
    room('l1-foy', 'Foyer', 'foyer', westW, 0, 96, front),
    room('l1-stair', 'Stair', 'stairwell', westW + 96, 0, 48, front),
    room('l1-flex', flexName, flexType, westW + 144, 0, centerW - 144, front),
    room('l1-hall', 'Hall', 'hall', westW, front, centerW + suiteW, 48),
    room('l1-kit', 'Kitchen / Dining', 'kitchen', westW, front + 48, centerW, D - front - 48),
    room('l1-pbed', 'Primary Bedroom', 'bedroom', W - suiteW, 0, suiteW, front),
    room('l1-wic', 'W.I.C.', 'closet', W - suiteW, front + 48, SIZE.wic[suite.size], 72),
    room('l1-pbath', 'Primary Bath', 'bathroom', W - suiteW + SIZE.wic[suite.size], front + 48, suiteW - SIZE.wic[suite.size], 72),
    room('l1-liv', 'Living', 'living', W - suiteW, front + 120, suiteW, D - front - 120),
  );

  // module self-checks (§4.1)
  if (living.island && centerW < 288) {
    warn(ctx, 'GRAMMAR-ISLAND', 'Kitchen island needs an M or L living block for 42" clearances — island omitted.');
  }
  if (flexUse === 'theater') {
    warn(ctx, 'GRAMMAR-THEATER-EXTERIOR', 'Theater sits on an exterior wall in this plan type; window omitted, acoustic wall note added.');
  }

  // level 2 over center + suite
  const upW = centerW + suiteW;
  const upX = westW;
  const loftW = suiteW;
  const bathW = upW - 96 - 48 - loftW;
  const l2: Room[] = [
    room('l2-bonus', upper.bonus ? 'Bonus' : 'Linen', upper.bonus ? 'flex' : 'closet', upX, 0, 96, front),
    room('l2-stair', 'Stair', 'stairwell', upX + 96, 0, 48, front),
    room('l2-bath', 'Bath 2', 'bathroom', upX + 144, 0, bathW, front),
    room('l2-loft', upper.loft ? 'Loft' : 'Media', upper.loft ? 'loft' : 'flex', upX + 144 + bathW, 0, loftW, front),
    room('l2-hall', 'Hall', 'hall', upX, front, upW, 48),
  ];
  const bedsY = front + 48;
  const bedsH = D - bedsY;
  const n = upper.beds;
  const bedW = Math.floor(upW / n / 2) * 2;
  let bx = upX;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? upX + upW - bx : bedW;
    l2.push(room(`l2-bed${i + 2}`, `Bedroom ${i + 2}`, 'bedroom', bx, bedsY, w, bedsH));
    bx += w;
  }

  // openings
  const r = ctx.reqs;
  r.push({ kind: 'exterior', level: 0, roomId: 'l1-foy', side: 'front', type: 'door', width: ctx.style.entryDoorIn, height: 80, egress: true });
  r.push(cased(0, 'l1-foy', 'l1-hall', 60));
  r.push(cased(0, 'l1-hall', 'l1-kit', Math.min(96, centerW - 48)));
  r.push(door(0, 'l1-hall', 'l1-flex'));
  r.push(door(0, 'l1-hall', 'l1-pbed'));
  r.push(door(0, 'l1-hall', 'l1-pbath', 30));
  r.push(door(0, 'l1-pbath', 'l1-wic', 28));
  r.push(cased(0, 'l1-kit', 'l1-liv', 96));
  if (garage) {
    if (service.pantry === 'walk-in') {
      // pantry sits between laundry and kitchen — pass-through pantry
      r.push(door(0, 'l1-kit', 'l1-pan', 28));
      r.push(door(0, 'l1-pan', 'l1-lau', 28));
    } else {
      r.push(door(0, 'l1-kit', 'l1-lau'));
    }
    r.push(door(0, 'l1-lau', 'l1-mud'));
    r.push(door(0, 'l1-gar', 'l1-mud', 32, { fireRatingMin: 20, selfClosing: true }));
    garageDoors(ctx, 'l1-gar', garW);
  } else {
    r.push(door(0, 'l1-kit', 'l1-lau'));
    r.push(door(0, 'l1-lau', 'l1-mud'));
    r.push({ kind: 'exterior', level: 0, roomId: 'l1-mud', side: 'left', type: 'door', width: 36, height: 80 });
  }
  if (living.rearDoor) r.push({ kind: 'exterior', level: 0, roomId: 'l1-liv', side: 'rear', type: 'slider', width: 72, height: 80 });
  r.push(windowReq(ctx, 0, 'l1-pbed', 'front', { egress: true, at: Math.min(60, suiteW / 3) }));
  r.push(windowReq(ctx, 0, 'l1-pbed', 'right', { at: 72 }));
  r.push(windowReq(ctx, 0, 'l1-kit', 'rear', { at: Math.round(centerW / 3 / 2) * 2 }));
  r.push(windowReq(ctx, 0, 'l1-kit', 'rear', { at: Math.round((centerW * 2) / 3 / 2) * 2 }));
  if (flexUse !== 'theater') r.push(windowReq(ctx, 0, 'l1-flex', 'front'));
  r.push(windowReq(ctx, 0, 'l1-stair', 'front', { small: true }));
  r.push(windowReq(ctx, 0, 'l1-liv', 'rear', { at: Math.max(48, suiteW / 2 - 60) }));
  if (garage) {
    r.push(windowReq(ctx, 0, 'l1-lau', 'rear', { small: true }));
  }
  // level 2
  for (let i = 0; i < n; i++) {
    r.push(door(1, 'l2-hall', `l2-bed${i + 2}`));
    r.push(windowReq(ctx, 1, `l2-bed${i + 2}`, 'rear', { egress: true }));
  }
  r.push(door(1, 'l2-hall', 'l2-bath', 30));
  r.push(windowReq(ctx, 1, 'l2-bath', 'front', { small: true }));
  if (upper.bonus) {
    r.push(door(1, 'l2-hall', 'l2-bonus'));
    r.push(windowReq(ctx, 1, 'l2-bonus', 'front'));
  } else {
    r.push(door(1, 'l2-hall', 'l2-bonus', 28));
  }
  r.push(cased(1, 'l2-hall', 'l2-loft', 72));
  r.push(windowReq(ctx, 1, 'l2-loft', 'front'));

  // porches
  const pf = moduleParam(p, 'porch_front');
  const pr = moduleParam(p, 'porch_rear');
  if (pf) ctx.extras.push({ id: 'x-pf', name: 'Front Porch', kind: 'porchFront', rect: { x: westW, y: -pf.depthIn, w: centerW, h: pf.depthIn } });
  if (pr) ctx.extras.push({ id: 'x-pr', name: 'Rear Porch', kind: 'porchRear', rect: { x: W - suiteW - 96, y: D, w: suiteW + 96, h: pr.depthIn } });

  const levels: LevelPlan[] = [
    { index: 0, name: 'Main Floor', floorToCeilingIn: clg, footprint: [{ x: 0, y: 0, w: W, h: D }], rooms: l1 },
    { index: 1, name: 'Upper Floor', floorToCeilingIn: UPPER_CEILING_IN, footprint: [{ x: upX, y: 0, w: upW, h: D }], rooms: l2 },
  ];

  return {
    input: {
      spec: baseSpec(ctx),
      roof: roofSpec(ctx),
      bearingLines: [
        { level: 0, x1: westW, y1: 0, x2: westW, y2: D },
        { level: 0, x1: westW + centerW, y1: 0, x2: westW + centerW, y2: D },
      ],
      extras: ctx.extras,
      stair: {
        levelFrom: 0, levelTo: 1, roomId: 'l1-stair',
        stairwell: { x: westW + 96, y: 0, w: 48, h: front },
        widthIn: stairP.widthIn, treadDepthIn: 10, direction: 'rear',
      },
      levels,
      openingRequests: ctx.reqs,
    },
    grammarFindings: ctx.findings,
  };
}

// ---------------------------------------------------------------------------
// split_ranch
// ---------------------------------------------------------------------------

function splitRanch(ctx: Ctx): PlanResult {
  const p = ctx.program;
  const living = moduleParam(p, 'living_block') ?? { size: 'M' as const, island: true, rearDoor: true };
  const suite = moduleParam(p, 'primary_suite') ?? { size: 'M' as const, doubleVanity: false };
  const beds = moduleParam(p, 'bed_bath_pair') ?? { beds: 2 as const };
  const garage = moduleParam(p, 'garage');
  if (moduleParam(p, 'flex_room')) warn(ctx, 'GRAMMAR-RANCH-FLEX', 'flex_room slot is not yet supported in split_ranch — omitted.');
  if (moduleParam(p, 'upper_bed_wing')) warn(ctx, 'GRAMMAR-RANCH-UPPER', 'split_ranch is one story — upper_bed_wing ignored.');

  const D = 384;
  const garW = garage ? GARAGE_W[garage.bays] : 144;
  const centerW = SIZE.living[living.size];
  const bedColW = beds.beds === 3 ? 384 : 288;
  const W = garW + centerW + bedColW;
  const clg = ceilingIn(p);
  const bedX = garW + centerW;

  const l1: Room[] = [];
  if (garage) {
    const mudW = garW >= 288 ? 144 : 96;
    l1.push(
      room('l1-gar', 'Garage', 'garage', 0, 0, garW, GARAGE_D),
      room('l1-mud', 'Mudroom', 'mudroom', 0, GARAGE_D, mudW, D - GARAGE_D),
      room('l1-lau', 'Laundry', 'laundry', mudW, GARAGE_D, garW - mudW, D - GARAGE_D),
    );
  } else {
    l1.push(
      room('l1-mud', 'Mudroom', 'mudroom', 0, 0, garW, 192),
      room('l1-lau', 'Laundry', 'laundry', 0, 192, garW, D - 192),
    );
  }
  l1.push(
    room('l1-liv', 'Living / Entry', 'living', garW, 0, centerW, 216),
    room('l1-kit', 'Kitchen / Dining', 'kitchen', garW, 216, centerW, D - 216),
    room('l1-hall', 'Hall', 'hall', bedX, 168, bedColW, 48),
    room('l1-pbed', 'Primary Bedroom', 'bedroom', bedX, 216, 180, D - 216),
    room('l1-wic', 'W.I.C.', 'closet', bedX + 180, 216, bedColW - 180, 72),
    room('l1-pbath', 'Primary Bath', 'bathroom', bedX + 180, 288, bedColW - 180, D - 288),
  );
  const frontBand = [
    { id: 'l1-bed2', name: 'Bedroom 2', w: 132 },
    { id: 'l1-bath2', name: 'Bath 2', w: 60 },
    { id: 'l1-bed3', name: 'Bedroom 3', w: bedColW - 192 - (beds.beds === 3 ? 96 : 0) },
    ...(beds.beds === 3 ? [{ id: 'l1-bed4', name: 'Bedroom 4', w: 96 }] : []),
  ];
  let fx = bedX;
  for (const b of frontBand) {
    l1.push(room(b.id, b.name, b.id.includes('bath') ? 'bathroom' : 'bedroom', fx, 0, b.w, 168));
    fx += b.w;
  }

  const r = ctx.reqs;
  r.push({ kind: 'exterior', level: 0, roomId: 'l1-liv', side: 'front', type: 'door', width: ctx.style.entryDoorIn, height: 80, egress: true });
  r.push(cased(0, 'l1-liv', 'l1-kit', Math.min(120, centerW - 48)));
  r.push(cased(0, 'l1-liv', 'l1-hall', 36));
  r.push(door(0, 'l1-hall', 'l1-pbed'));
  r.push(door(0, 'l1-pbed', 'l1-pbath', 30));
  r.push(door(0, 'l1-pbath', 'l1-wic', 28));
  for (const b of frontBand) r.push(door(0, 'l1-hall', b.id, b.id.includes('bath') ? 30 : 32));
  if (garage) {
    r.push(door(0, 'l1-kit', 'l1-lau'));
    r.push(door(0, 'l1-lau', 'l1-mud'));
    r.push(door(0, 'l1-gar', 'l1-mud', 32, { fireRatingMin: 20, selfClosing: true }));
    garageDoors(ctx, 'l1-gar', garW);
    r.push(windowReq(ctx, 0, 'l1-lau', 'rear', { small: true }));
  } else {
    r.push(door(0, 'l1-kit', 'l1-lau'));
    r.push(door(0, 'l1-lau', 'l1-mud'));
    r.push({ kind: 'exterior', level: 0, roomId: 'l1-mud', side: 'front', type: 'door', width: 36, height: 80 });
  }
  if (living.rearDoor) r.push({ kind: 'exterior', level: 0, roomId: 'l1-kit', side: 'rear', type: 'slider', width: 72, height: 80 });
  r.push(windowReq(ctx, 0, 'l1-liv', 'front', { at: Math.max(60, centerW / 2 - 90) }));
  r.push(windowReq(ctx, 0, 'l1-kit', 'rear', { at: 60 }));
  r.push(windowReq(ctx, 0, 'l1-pbed', 'rear', { egress: true }));
  for (const b of frontBand) {
    if (b.id.includes('bath')) r.push(windowReq(ctx, 0, b.id, 'front', { small: true }));
    else r.push(windowReq(ctx, 0, b.id, 'front', { egress: true }));
  }

  const pf = moduleParam(p, 'porch_front');
  const pr = moduleParam(p, 'porch_rear');
  if (pf) ctx.extras.push({ id: 'x-pf', name: 'Front Porch', kind: 'porchFront', rect: { x: garW, y: -pf.depthIn, w: centerW, h: pf.depthIn } });
  if (pr) ctx.extras.push({ id: 'x-pr', name: 'Rear Porch', kind: 'porchRear', rect: { x: garW, y: D, w: centerW, h: pr.depthIn } });

  return {
    input: {
      spec: baseSpec(ctx),
      roof: roofSpec(ctx),
      bearingLines: [
        { level: 0, x1: garW, y1: 0, x2: garW, y2: D },
        { level: 0, x1: bedX, y1: 0, x2: bedX, y2: D },
      ],
      extras: ctx.extras,
      levels: [{ index: 0, name: 'Main Floor', floorToCeilingIn: clg, footprint: [{ x: 0, y: 0, w: W, h: D }], rooms: l1 }],
      openingRequests: ctx.reqs,
    },
    grammarFindings: ctx.findings,
  };
}

// ---------------------------------------------------------------------------
// compact_two_story
// ---------------------------------------------------------------------------

function compact(ctx: Ctx): PlanResult {
  const p = ctx.program;
  const flex = moduleParam(p, 'flex_room') ?? { use: 'office' as const };
  const upper = moduleParam(p, 'upper_bed_wing') ?? { beds: 2 as const, loft: true, bonus: false };
  const stairP = moduleParam(p, 'stair_core') ?? { widthIn: 42 as const };
  if (moduleParam(p, 'garage')) warn(ctx, 'GRAMMAR-COMPACT-GARAGE', 'compact_two_story v0 has no garage slot — omitted (narrow-lot street parking).');
  if (moduleParam(p, 'primary_suite')) warn(ctx, 'GRAMMAR-COMPACT-SUITE', 'compact_two_story puts all bedrooms upstairs — primary_suite params fold into upper_bed_wing.');

  const front = frontRowDepth(p);
  const W = 288;
  const D = front + 288;
  const clg = ceilingIn(p);
  const flexType = flex.use === 'office' ? 'office' : flex.use === 'theater' ? 'theater' : 'flex';

  const l1: Room[] = [
    room('l1-foy', 'Foyer', 'foyer', 0, 0, 96, front),
    room('l1-stair', 'Stair', 'stairwell', 96, 0, 48, front),
    room('l1-flex', flex.use === 'office' ? 'Office' : 'Flex', flexType, 144, 0, W - 144, front),
    room('l1-kit', 'Kitchen / Dining', 'kitchen', 0, front, W, 144),
    room('l1-liv', 'Living', 'living', 0, front + 144, W, D - front - 144),
  ];
  const n = Math.min(upper.beds, 2) as 2;
  if (upper.beds > 2) warn(ctx, 'GRAMMAR-COMPACT-BEDS', 'compact_two_story v0 fits 2 upstairs bedrooms — extra bedrooms omitted.');
  const l2: Room[] = [
    room('l2-bath', 'Bath', 'bathroom', 0, 0, 96, front),
    room('l2-stair', 'Stair', 'stairwell', 96, 0, 48, front),
    room('l2-loft', upper.loft ? 'Loft' : 'Laundry', upper.loft ? 'loft' : 'laundry', 144, 0, W - 144, front),
    room('l2-hall', 'Hall', 'hall', 0, front, W, 48),
    room('l2-bed1', 'Primary Bedroom', 'bedroom', 0, front + 48, 144, D - front - 48),
    room('l2-bed2', 'Bedroom 2', 'bedroom', 144, front + 48, 144, D - front - 48),
  ];
  void n;

  const r = ctx.reqs;
  r.push({ kind: 'exterior', level: 0, roomId: 'l1-foy', side: 'front', type: 'door', width: ctx.style.entryDoorIn, height: 80, egress: true });
  r.push(cased(0, 'l1-foy', 'l1-kit', 60));
  r.push(door(0, 'l1-kit', 'l1-flex'));
  r.push(cased(0, 'l1-kit', 'l1-liv', 120));
  r.push({ kind: 'exterior', level: 0, roomId: 'l1-liv', side: 'rear', type: 'slider', width: 72, height: 80 });
  r.push(windowReq(ctx, 0, 'l1-liv', 'left'));
  r.push(windowReq(ctx, 0, 'l1-liv', 'right'));
  r.push(windowReq(ctx, 0, 'l1-kit', 'left', { small: true }));
  if (flexType !== 'theater') r.push(windowReq(ctx, 0, 'l1-flex', 'front'));
  r.push(door(1, 'l2-hall', 'l2-bed1'));
  r.push(door(1, 'l2-hall', 'l2-bed2'));
  r.push(door(1, 'l2-hall', 'l2-bath', 30));
  r.push(cased(1, 'l2-hall', 'l2-loft', 60));
  r.push(windowReq(ctx, 1, 'l2-bed1', 'rear', { egress: true }));
  r.push(windowReq(ctx, 1, 'l2-bed2', 'rear', { egress: true }));
  r.push(windowReq(ctx, 1, 'l2-bath', 'front', { small: true }));
  r.push(windowReq(ctx, 1, 'l2-loft', 'front'));

  const pf = moduleParam(p, 'porch_front');
  if (pf) ctx.extras.push({ id: 'x-pf', name: 'Front Porch', kind: 'porchFront', rect: { x: 0, y: -pf.depthIn, w: W, h: pf.depthIn } });

  return {
    input: {
      spec: baseSpec(ctx),
      roof: roofSpec(ctx),
      bearingLines: [],
      extras: ctx.extras,
      stair: {
        levelFrom: 0, levelTo: 1, roomId: 'l1-stair',
        stairwell: { x: 96, y: 0, w: 48, h: front },
        widthIn: stairP.widthIn, treadDepthIn: 10, direction: 'rear',
      },
      levels: [
        { index: 0, name: 'Main Floor', floorToCeilingIn: clg, footprint: [{ x: 0, y: 0, w: W, h: D }], rooms: l1 },
        { index: 1, name: 'Upper Floor', floorToCeilingIn: UPPER_CEILING_IN, footprint: [{ x: 0, y: 0, w: W, h: D }], rooms: l2 },
      ],
      openingRequests: ctx.reqs,
    },
    grammarFindings: ctx.findings,
  };
}
