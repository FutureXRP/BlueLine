/**
 * Layout solver v0.1 (Build Bible §7).
 *
 * Deterministic zone-band placement on the 24" planning module with seeded
 * proportion/mirror variation via mulberry32. Produces a complete, validated
 * Model from (ProgramSpec, seed).
 *
 * §7 honesty note applies: candidates are serviceable starting points — the
 * guided editor carries the product. Current cut:
 *   - rect footprint family (L/T fall back to rect until the annealer lands)
 *   - extraRooms beyond laundry are not yet placed (office/flex/diningFormal
 *     TODO with the annealer); laundry always ships
 * Candidates that fail hard validation are discarded and re-rolled with the
 * next seed (§7.5) by generateCandidates().
 */
import type { Model, Opening, Room, Wall } from '../model/types.js';
import type { ProgramSpec } from '../model/programSpec.js';
import { mulberry32, pick, snapTo, type Rng } from './mulberry32.js';
import { mirrorPlan } from '../ops/index.js';
import { validate } from '../validate/index.js';
import { loadRuleSet } from '../validate/ruleSet.js';

const MODULE = 24; // planning module (§5 Stage 2)
const GRID = 2;

const g2 = (v: number) => Math.round(v / GRID) * GRID;

interface Cursor {
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  fixtures: Model['fixtures'];
  n: Record<string, number>;
}

function id(c: Cursor, prefix: string): string {
  c.n[prefix] = (c.n[prefix] ?? 0) + 1;
  return `${prefix}-${c.n[prefix]}`;
}

export function generateModel(spec: ProgramSpec, seed: number): Model {
  const rng = mulberry32(seed);

  // glazing percentage comes from the rule table (Law #5 — never inline)
  const winRule = loadRuleSet().rules.get('WIN-LIGHT');
  const glazePct = typeof winRule?.params['minGlazingPctOfFloor'] === 'number'
    ? (winRule.params['minGlazingPctOfFloor'] as number)
    : null;
  const needGlazing = (roomArea: number) => (glazePct === null ? 0 : (roomArea * glazePct) / 100);

  // --- footprint synthesis (§7.3): snap to 24" module -----------------------
  const bays = spec.garage.bays;
  const garageW = bays > 0 ? Math.max(288, bays * 144) : 0;
  const GARAGE_D = 264;
  const garageArea = bays > 0 ? garageW * GARAGE_D : 0;

  const westW = bays > 0 ? garageW : 144; // service column (garage or laundry strip)
  const southBedCount = Math.min(spec.bedrooms - 1, 2);
  const bed4North = spec.bedrooms === 4;
  const publicMin = 168;
  const privateMinSouth = southBedCount * 96 + 60;
  const privateMinNorth = 120 + 96 + (bed4North ? 120 : 0);
  const minPrivate = snapTo(Math.max(privateMinSouth, privateMinNorth) + MODULE / 2, MODULE);
  const minWidth = westW + publicMin + minPrivate;

  // choose (width, depth) minimizing conditioned-area error on the module grid
  let width = 0;
  let depth = 0;
  let bestErr = Infinity;
  const jitter = Math.floor(rng() * 3); // seeded tie-break among near-best pairs
  const options: Array<{ w: number; d: number; err: number }> = [];
  for (let d = 336; d <= 528; d += MODULE) {
    // conditioned area excludes the garage but includes the flex strip
    // behind a capped-depth garage, so garage footprint loss is constant
    const gLoss = bays > 0 ? garageW * Math.min(GARAGE_D, d - 120) : 0;
    let w = snapTo((spec.targetConditionedArea + gLoss) / d, MODULE);
    if (w < minWidth) w = minWidth;
    if (w < d) continue; // keep plans wider than deep
    const err = Math.abs(w * d - gLoss - spec.targetConditionedArea) + (w > 720 ? 1e9 : 0);
    options.push({ w, d, err });
  }
  options.sort((a, b) => a.err - b.err || a.d - b.d);
  // seeded variety may only roam within the spec's area tolerance of the best fit
  const eligible = options.filter(
    (o) => o.err <= Math.max(options[0]?.err ?? 0, spec.areaTolerance),
  );
  const chosen = eligible[Math.min(jitter, eligible.length - 1)] ?? { w: minWidth, d: 384, err: 0 };
  width = chosen.w;
  depth = chosen.d;
  bestErr = chosen.err;
  void bestErr;

  // --- column widths ---------------------------------------------------------
  const rest = width - westW;
  let privateW = snapTo(Math.max(minPrivate, g2(rest * (0.5 + rng() * 0.08))), MODULE);
  if (rest - privateW < publicMin) privateW = snapTo(rest - publicMin, MODULE);
  if (privateW < minPrivate) privateW = minPrivate;
  const publicW = rest - privateW;

  const x1 = westW; // west column | public
  const x2 = westW + publicW; // public | private
  const x3 = width;

  // --- row depths ------------------------------------------------------------
  const serviceD = 120;
  const northD = g2(depth * (0.4 + rng() * 0.06)); // kitchen / primary suite row
  const hallD = 42;
  const southY = northD + hallD;

  const c: Cursor = { walls: [], rooms: [], openings: [], fixtures: [], n: {} };

  // --- exterior walls ----------------------------------------------------------
  const extT = spec.exteriorWall === '2x6' ? 6 : 5;
  const wN: Wall = { id: 'w-ext-n', kind: 'exterior', x1: 0, y1: 0, x2: width, y2: 0, thickness: extT };
  const wS: Wall = { id: 'w-ext-s', kind: 'exterior', x1: 0, y1: depth, x2: width, y2: depth, thickness: extT };
  const wW: Wall = { id: 'w-ext-w', kind: 'exterior', x1: 0, y1: 0, x2: 0, y2: depth, thickness: extT };
  const wE: Wall = { id: 'w-ext-e', kind: 'exterior', x1: width, y1: 0, x2: width, y2: depth, thickness: extT };
  c.walls.push(wN, wS, wW, wE);

  const wall = (kind: Wall['kind'], ax: number, ay: number, bx: number, by: number): Wall => {
    const w: Wall = { id: id(c, 'w'), kind, x1: ax, y1: ay, x2: bx, y2: by, thickness: 5 };
    c.walls.push(w);
    return w;
  };
  const room = (name: string, type: Room['type'], x: number, y: number, w: number, h: number): Room => {
    const r: Room = { id: id(c, 'r'), name, type, x, y, w, h };
    c.rooms.push(r);
    return r;
  };
  const door = (w: Wall, offset: number, width = 32, extra: Partial<Opening> = {}): Opening => {
    const o: Opening = {
      id: id(c, 'o'),
      wallId: w.id,
      type: 'door',
      offset: g2(offset),
      width,
      height: 80,
      sill: 0,
      swing: 'inLeft',
      ...extra,
    };
    c.openings.push(o);
    return o;
  };
  /** Collision-aware window placement: nudge along the wall in 2" steps until
   *  clear of existing openings; skip silently if no slot exists. */
  const window = (w: Wall, offset: number, ww: number, hh: number, sill: number): Opening | null => {
    const len = Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
    const siblings = c.openings.filter((o) => o.wallId === w.id);
    const clear = (off: number) =>
      off - ww / 2 >= 4 &&
      off + ww / 2 <= len - 4 &&
      siblings.every((o) => Math.abs(o.offset - off) >= (o.width + ww) / 2 + 6);
    let off: number | null = null;
    for (let step = 0; step <= 60; step += 2) {
      if (clear(g2(offset) + step)) { off = g2(offset) + step; break; }
      if (clear(g2(offset) - step)) { off = g2(offset) - step; break; }
    }
    if (off === null) return null;
    const o: Opening = {
      id: id(c, 'o'),
      wallId: w.id,
      type: 'window',
      offset: off,
      width: ww,
      height: hh,
      sill,
      swing: 'none',
      operable: true,
    };
    c.openings.push(o);
    return o;
  };

  // --- west column: service + garage -----------------------------------------
  let garage: Room | null = null;
  if (bays > 0) {
    const mudW = snapTo(westW / 2, MODULE);
    const mud = room('Mudroom', 'mudroom', 0, 0, mudW, serviceD);
    const lau = room('Laundry', 'laundry', mudW, 0, westW - mudW, serviceD);
    // garage depth capped at 264; deeper plans get a flex strip behind it
    const garageD = Math.min(264, depth - serviceD);
    const garageY = depth - garageD;
    const hasStrip = garageY - serviceD >= 96;
    garage = room('Garage', 'garage', 0, hasStrip ? garageY : serviceD, westW, hasStrip ? garageD : depth - serviceD);
    if (hasStrip) {
      room('Flex', 'flex', 0, serviceD, westW, garageY - serviceD);
      wall('interior', 0, serviceD, westW, serviceD); // service | strip
      const stripKit = wall('interior', westW, serviceD, westW, garageY);
      door(stripKit, Math.min(48, (garageY - serviceD) / 2));
      window(wW, serviceD + (garageY - serviceD) / 2, 36, 60, 24);
    }
    const gsepN = wall('garageSeparation', 0, garage.y, westW, garage.y);
    const gsepE = wall('garageSeparation', westW, garage.y, westW, depth);
    void gsepE;
    wall('interior', mudW, 0, mudW, serviceD);
    const lauKit = wall('interior', westW, 0, westW, serviceD);
    // garage → dwelling rated door (into mudroom, or the strip when present)
    door(gsepN, mudW / 2, 32, { fireRatingMin: 20, selfClosing: true });
    // mud → laundry
    door(c.walls.find((w) => w.x1 === mudW && w.kind === 'interior')!, serviceD / 2);
    // laundry → kitchen
    door(lauKit, serviceD / 2);
    // side entry through mudroom
    door(wW, serviceD / 2, 36, { swing: 'inRight' });
    // garage door(s)
    const gdW = bays === 1 ? 108 : 192;
    c.openings.push({
      id: id(c, 'o'), wallId: wS.id, type: 'garageDoor',
      offset: g2(westW / 2 - (bays === 3 ? 66 : 0)), width: gdW, height: 84, sill: 0, swing: 'none',
    });
    if (bays === 3) {
      c.openings.push({
        id: id(c, 'o'), wallId: wS.id, type: 'garageDoor',
        offset: g2(westW - 78), width: 108, height: 84, sill: 0, swing: 'none',
      });
    }
    // laundry window
    window(wN, mudW + (westW - mudW) / 2, 24, 36, 48);
    c.fixtures.push(
      { id: id(c, 'f'), type: 'washer', roomId: lau.id, x: g2(mudW + 30), y: 18, rot: 0 },
      { id: id(c, 'f'), type: 'dryer', roomId: lau.id, x: g2(mudW + 62), y: 18, rot: 0 },
      { id: id(c, 'f'), type: 'waterHeater', roomId: garage.id, x: 20, y: garage.y + 24, rot: 0 },
      { id: id(c, 'f'), type: 'panel', roomId: garage.id, x: westW - 4, y: g2(garage.y + 80), rot: 1 },
    );
    void mud;
  } else {
    const lau = room('Laundry', 'laundry', 0, 0, westW, serviceD);
    room('Flex', 'flex', 0, serviceD, westW, depth - serviceD);
    wall('interior', 0, serviceD, westW, serviceD);
    const lauKitWall = wall('interior', westW, 0, westW, serviceD);
    const flexWall = wall('interior', westW, serviceD, westW, depth);
    door(lauKitWall, serviceD / 2);
    door(flexWall, 60); // flex opens to living column
    window(wN, westW / 2, 24, 36, 48);
    window(wS, westW / 2, 36, 60, 24); // flex needs light
    c.fixtures.push(
      { id: id(c, 'f'), type: 'washer', roomId: lau.id, x: 30, y: 18, rot: 0 },
      { id: id(c, 'f'), type: 'dryer', roomId: lau.id, x: 62, y: 18, rot: 0 },
    );
  }

  // --- public column: kitchen north, living south ----------------------------
  const kitchen = room('Kitchen / Dining', 'kitchen', x1, 0, publicW, northD);
  const living = room('Living', 'living', x1, northD, publicW, depth - northD);
  const kitLiv = wall('interior', x1, northD, x2, northD);
  // cased opening between kitchen and living (openness — spec.kitchen.openToLiving)
  if (spec.kitchen.openToLiving) {
    c.openings.push({
      id: id(c, 'o'), wallId: kitLiv.id, type: 'opening',
      offset: g2(publicW / 2), width: Math.min(96, publicW - 48), height: 96, sill: 0, swing: 'none',
    });
  } else {
    door(kitLiv, publicW / 2, 32);
  }
  // façade composer: pack [windows…, door] across the column with even gaps
  const packFacade = (
    w: Wall,
    colX: number,
    colW: number,
    win: { w: number; h: number; sill: number },
    winCount: number,
    doorWidth: number,
    doorExtra: Partial<Opening>,
  ) => {
    let n = winCount;
    let widths = [...Array(n).fill(win.w), doorWidth];
    while (n > 0 && widths.reduce((a, b) => a + b, 0) + (n + 2) * 8 > colW) {
      n--;
      widths = [...Array(n).fill(win.w), doorWidth];
    }
    const total = widths.reduce((a, b) => a + b, 0);
    const gap = (colW - total) / (widths.length + 1);
    let cursor = colX + gap;
    for (let i = 0; i < n; i++) {
      window(w, cursor + win.w / 2, win.w, win.h, win.sill);
      cursor += win.w + gap;
    }
    door(w, cursor + doorWidth / 2, doorWidth, doorExtra);
  };
  // south façade: living windows + front entry
  const livArea = living.w * living.h;
  const livWinCount = Math.max(2, Math.ceil(needGlazing(livArea) / (48 * 60)));
  packFacade(wS, x1, publicW, { w: 48, h: 60, sill: 24 }, livWinCount, 36, { egressDoor: true });
  // north façade: kitchen windows + rear door
  const kitArea = kitchen.w * kitchen.h;
  const kitWinCount = Math.max(2, Math.ceil(needGlazing(kitArea) / (36 * 48)));
  packFacade(wN, x1, publicW, { w: 36, h: 48, sill: 36 }, kitWinCount, 36, { swing: 'inRight' });
  c.fixtures.push(
    { id: id(c, 'f'), type: 'kitchenSink', roomId: kitchen.id, x: g2(x1 + publicW * 0.35), y: 14, rot: 2 },
    { id: id(c, 'f'), type: 'dishwasher', roomId: kitchen.id, x: g2(x1 + publicW * 0.2), y: 14, rot: 2 },
    { id: id(c, 'f'), type: 'range', roomId: kitchen.id, x: g2(x2 - 16), y: g2(northD * 0.5), rot: 3 },
    { id: id(c, 'f'), type: 'refrigerator', roomId: kitchen.id, x: g2(x1 + 18), y: g2(northD * 0.5), rot: 1 },
  );

  // --- private column ---------------------------------------------------------
  // north row: primary bed + (wic over pbath) + optional bed4
  const pbathW = bed4North ? 96 : Math.max(96, snapTo(privateW * 0.3, MODULE));
  const bed4W = bed4North ? Math.max(120, g2((privateW - pbathW) * 0.38)) : 0;
  const pbedW = privateW - pbathW - bed4W;
  const pbed = room('Primary Bedroom', 'bedroom', x2, 0, pbedW, northD);
  const wicD = Math.min(60, g2(northD * 0.35));
  room('W.I.C.', 'closet', x2 + pbedW, 0, pbathW, wicD);
  const pbath = room('Primary Bath', 'bathroom', x2 + pbedW, wicD, pbathW, northD - wicD);
  wall('interior', x2, 0, x2, northD); // kitchen | primary
  const pbedBath = wall('interior', x2 + pbedW, 0, x2 + pbedW, northD);
  const wicBath = wall('interior', x2 + pbedW, wicD, x2 + pbedW + pbathW, wicD);
  door(pbedBath, wicD + (northD - wicD) / 2, 30, { swing: 'inRight' });
  door(wicBath, pbathW / 2, 28);
  let bed4: Room | null = null;
  if (bed4North) {
    bed4 = room('Bedroom 4', 'bedroom', x2 + pbedW + pbathW, 0, bed4W, northD);
    wall('interior', x2 + pbedW + pbathW, 0, x2 + pbedW + pbathW, northD);
  }

  // hall strip
  const hall = room('Hall', 'hall', x2, northD, privateW, hallD);
  void hall;
  const suiteHall = wall('interior', x2, northD, x3, northD);
  const hallSouth = wall('interior', x2, southY, x3, southY);
  wall('interior', x2, southY, x2, depth); // living | first south bed
  // primary door from hall
  door(suiteHall, Math.min(60, pbedW / 2), 32);
  if (bed4) door(suiteHall, pbedW + pbathW + bed4W / 2, 32);

  // south row: bed2 [bath2] bed3
  const southD = depth - southY;
  const bathW = 60;
  const bedW = g2((privateW - bathW) / southBedCount);
  let sx = x2;
  const southRooms: Room[] = [];
  for (let i = 0; i < southBedCount; i++) {
    const isLast = i === southBedCount - 1;
    const w = isLast ? x3 - sx - (i === 0 ? bathW : 0) : bedW;
    if (i === 1) {
      // bath sits between bed2 and bed3
      const bath = room('Bath 2', 'bathroom', sx, southY, bathW, southD);
      wall('interior', sx, southY, sx, depth);
      door(hallSouth, sx - x2 + bathW / 2, 30, { swing: 'inRight' });
      c.fixtures.push(
        { id: id(c, 'f'), type: 'wc', roomId: bath.id, x: g2(sx + bathW / 2), y: southY + 20, rot: 0 },
        { id: id(c, 'f'), type: 'lavatory', roomId: bath.id, x: g2(sx + bathW / 2), y: g2(southY + southD * 0.6), rot: 0 },
        { id: id(c, 'f'), type: 'tub', roomId: bath.id, x: g2(sx + bathW / 2), y: depth - 16, rot: 0 },
      );
      sx += bathW;
    }
    const bed = room(`Bedroom ${i + 2}`, 'bedroom', sx, southY, i === 0 ? bedW : x3 - sx, southD);
    southRooms.push(bed);
    if (i === 0 && southBedCount > 1) wall('interior', sx + bedW, southY, sx + bedW, depth);
    door(hallSouth, sx - x2 + Math.min(60, bed.w / 2), 32);
    window(wS, bed.x + bed.w / 2, 36, 60, 24);
    if (bed.w * bed.h > 25920) window(wS, bed.x + bed.w / 4, 36, 60, 24);
    c.fixtures.push({ id: id(c, 'f'), type: 'smokeAlarm', roomId: bed.id, x: g2(bed.x + bed.w / 2), y: g2(southY + southD / 2), rot: 0 });
    sx += i === 0 ? bedW : 0;
  }
  // single-secondary-bed case (2 bedrooms total): bath at east end
  if (southBedCount === 1) {
    const bx = x3 - bathW;
    const bath = room('Bath 2', 'bathroom', bx, southY, bathW, southD);
    // shrink bed2 (last pushed room) to make space
    const bed = southRooms[0]!;
    bed.w = bx - bed.x;
    wall('interior', bx, southY, bx, depth);
    door(hallSouth, bx - x2 + bathW / 2, 30, { swing: 'inRight' });
    c.fixtures.push(
      { id: id(c, 'f'), type: 'wc', roomId: bath.id, x: g2(bx + bathW / 2), y: southY + 20, rot: 0 },
      { id: id(c, 'f'), type: 'lavatory', roomId: bath.id, x: g2(bx + bathW / 2), y: g2(southY + southD * 0.6), rot: 0 },
      { id: id(c, 'f'), type: 'tub', roomId: bath.id, x: g2(bx + bathW / 2), y: depth - 16, rot: 0 },
    );
  }

  // primary suite windows + fixtures
  const pbedArea = pbed.w * pbed.h;
  const pbedWinCount = Math.max(1, Math.ceil((pbedArea * 0.08) / (36 * 60)));
  for (let i = 0; i < pbedWinCount; i++) {
    window(wN, x2 + ((i + 0.7) * pbedW) / (pbedWinCount + 1), 36, 60, 24);
  }
  if (bed4) {
    window(wN, bed4.x + bed4.w / 2, 36, 60, 24);
    if (bed4.w * bed4.h > 25920) window(wN, bed4.x + bed4.w / 4, 36, 60, 24);
    c.fixtures.push({ id: id(c, 'f'), type: 'smokeAlarm', roomId: bed4.id, x: g2(bed4.x + bed4.w / 2), y: g2(northD / 2), rot: 0 });
  }
  window(wE, wicD + (northD - wicD) / 2, 24, 36, 48); // primary bath
  c.fixtures.push(
    { id: id(c, 'f'), type: 'smokeAlarm', roomId: pbed.id, x: g2(x2 + pbedW / 2), y: g2(northD / 2), rot: 0 },
    { id: id(c, 'f'), type: 'smokeAlarm', roomId: hall.id, x: g2(x2 + privateW / 2), y: northD + 21, rot: 0 },
    { id: id(c, 'f'), type: 'wc', roomId: pbath.id, x: g2(x2 + pbedW + pbathW / 2), y: wicD + 20, rot: 0 },
    { id: id(c, 'f'), type: 'lavatory', roomId: pbath.id, x: g2(x2 + pbedW + pbathW * 0.3), y: northD - 16, rot: 2 },
    { id: id(c, 'f'), type: 'shower', roomId: pbath.id, x: g2(x2 + pbedW + pbathW * 0.75), y: northD - 20, rot: 2 },
  );
  if (spec.primarySuite.doubleVanity) {
    c.fixtures.push({ id: id(c, 'f'), type: 'lavatory', roomId: pbath.id, x: g2(x2 + pbedW + pbathW * 0.5), y: northD - 16, rot: 2 });
  }
  if (bays > 0) {
    c.fixtures.push({ id: id(c, 'f'), type: 'coAlarm', roomId: hall.id, x: g2(x2 + privateW / 2 + 30), y: northD + 21, rot: 0 });
  }

  const model: Model = {
    modelVersion: 1,
    units: 'in',
    footprint: [
      { x: 0, y: 0 },
      { x: 0, y: depth },
      { x: width, y: depth },
      { x: width, y: 0 },
    ],
    walls: c.walls,
    rooms: c.rooms,
    openings: c.openings,
    fixtures: c.fixtures,
    roof: {
      style: spec.roof.style,
      pitch: spec.roof.pitch,
      overhang: 18,
      gableEdges: spec.roof.style === 'gable' ? [0, 2] : [],
    },
    ceilingHeight: spec.ceilingHeight,
    foundation: spec.foundation,
    exteriorWall: spec.exteriorWall,
    seedChain: [seed],
  };

  // seeded mirror for variety
  if (rng() < 0.5) {
    return { ...mirrorPlan(model).model, seedChain: [seed] };
  }
  return model;
}

export interface Candidate {
  seed: number;
  model: Model;
}

/**
 * Produce `count` candidates that pass hard validation, re-rolling failing
 * seeds (§7.5). Deterministic: same spec + startSeed → same candidates.
 */
export function generateCandidates(
  spec: ProgramSpec,
  startSeed: number,
  count = 4,
  maxAttempts = 64,
): Candidate[] {
  const ruleSet = loadRuleSet();
  const out: Candidate[] = [];
  for (let s = startSeed; s < startSeed + maxAttempts && out.length < count; s++) {
    let model: Model;
    try {
      model = generateModel(spec, s);
    } catch {
      continue;
    }
    const findings = validate(model, ruleSet);
    if (findings.some((f) => f.severity === 'hard')) continue;
    out.push({ seed: s, model });
  }
  return out;
}
