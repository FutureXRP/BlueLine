/**
 * Deterministic validation engine (Build Bible §8).
 *
 * validate(model, ruleSet) → Finding[] — a pure function. Every check
 * resolves its rule from the table by ID; if the rule or a param is missing,
 * the check emits a VERIFY finding rather than inventing a value (Law #6).
 */
import type { Finding, Model, Opening, Room, Severity, Wall } from '../model/types.js';
import { HABITABLE_TYPES } from '../model/types.js';
import {
  formatFeetInches,
  formatSquareFeet,
} from '../model/format.js';
import {
  openingsOfRoom,
  roomArea,
  roomMinDim,
  roomsAtOpening,
  wallById,
  windowGlazingArea,
  windowNetClearOpening,
  bbox,
} from '../model/geometry.js';
import { getRule, intParam, loadRuleSet, type Rule, type RuleSet } from './ruleSet.js';
import fixtureCatalog from '../rules/fixtureCatalog.json' with { type: 'json' };

export { loadRuleSet, getRule, intParam } from './ruleSet.js';
export type { Rule, RuleSet } from './ruleSet.js';

type Refs = Finding['refs'];

function finding(rule: Rule, message: string, refs: Refs, severity?: Severity): Finding {
  return {
    ruleId: rule.id,
    severity: severity ?? rule.severity,
    message,
    refs,
    verified: rule.verified,
    citation: rule.citation,
  };
}

/** Emitted when a rule/param cannot be resolved — never invent (Law #6). */
function verifyFinding(ruleId: string, context: string, refs: Refs): Finding {
  return {
    ruleId,
    severity: 'warn',
    message: `VERIFY WITH LOCAL CODE OFFICIAL — ${context} (rule ${ruleId} not available in the loaded rule tables).`,
    refs,
    verified: false,
    citation: '',
  };
}

export function validate(model: Model, ruleSet: RuleSet = loadRuleSet()): Finding[] {
  const findings: Finding[] = [
    ...checkModelIntegrity(model),
    ...checkRoomAreas(model, ruleSet),
    ...checkCeiling(model, ruleSet),
    ...checkBedroomEgress(model, ruleSet),
    ...checkEgressDoor(model, ruleSet),
    ...checkHalls(model, ruleSet),
    ...checkGarageSeparation(model, ruleSet),
    ...checkBathClearances(model, ruleSet),
    ...checkLightVent(model, ruleSet),
    ...checkAlarms(model, ruleSet),
    ...checkSafetyGlazing(model, ruleSet),
    ...checkHeaders(model, ruleSet),
    ...checkSpans(model, ruleSet),
    ...checkBracedWallLines(model, ruleSet),
  ];
  return findings;
}

export function hardFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === 'hard');
}

export function engineerFlags(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === 'engineer');
}

// ---------------------------------------------------------------------------
// Model integrity (geometry sanity, not IRC — ruleId MODEL-GEOM, no citation)
// ---------------------------------------------------------------------------

function checkModelIntegrity(model: Model): Finding[] {
  const out: Finding[] = [];
  for (let i = 0; i < model.rooms.length; i++) {
    for (let j = i + 1; j < model.rooms.length; j++) {
      const a = model.rooms[i]!;
      const b = model.rooms[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        out.push({
          ruleId: 'MODEL-GEOM',
          severity: 'hard',
          message: `${a.name} and ${b.name} overlap — rooms must not intersect.`,
          refs: { roomIds: [a.id, b.id] },
          verified: true,
          citation: '',
        });
      }
    }
  }
  for (const o of model.openings) {
    const w = wallById(model, o.wallId);
    if (!w) {
      out.push({
        ruleId: 'MODEL-GEOM',
        severity: 'hard',
        message: `Opening ${o.id} references missing wall ${o.wallId}.`,
        refs: { openingIds: [o.id] },
        verified: true,
        citation: '',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R304 — habitable room minimum area / dimension
// ---------------------------------------------------------------------------

function checkRoomAreas(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'R304-AREA');
  const rooms = model.rooms.filter((r) => HABITABLE_TYPES.has(r.type));
  if (!rule) return rooms.length ? [verifyFinding('R304-AREA', 'habitable room minimum area', {})] : [];
  const minArea = intParam(rule, 'minAreaSqIn');
  const minDim = intParam(rule, 'minHorizontalDimIn');
  if (minArea === undefined || minDim === undefined) {
    return [verifyFinding(rule.id, 'habitable room minimum area parameters missing', {})];
  }
  const out: Finding[] = [];
  for (const r of rooms) {
    if (roomArea(r) < minArea) {
      out.push(
        finding(
          rule,
          `${r.name} is ${formatSquareFeet(roomArea(r))} — below the ${formatSquareFeet(minArea)} habitable-room minimum (${rule.section}).`,
          { roomIds: [r.id] },
        ),
      );
    }
    if (roomMinDim(r) < minDim) {
      out.push(
        finding(
          rule,
          `${r.name} is ${formatFeetInches(roomMinDim(r))} across — below the ${formatFeetInches(minDim)} minimum horizontal dimension (${rule.section}).`,
          { roomIds: [r.id] },
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R305 — ceiling height
// ---------------------------------------------------------------------------

function checkCeiling(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'R305-CEIL');
  if (!rule) return [verifyFinding('R305-CEIL', 'minimum ceiling height', {})];
  const min = intParam(rule, 'minHabitableCeilingIn');
  if (min === undefined) return [verifyFinding(rule.id, 'minimum ceiling height parameter missing', {})];
  if (model.ceilingHeight < min) {
    return [
      finding(
        rule,
        `Ceiling height ${formatFeetInches(model.ceilingHeight)} is below the ${formatFeetInches(min)} habitable minimum (${rule.section}).`,
        {},
      ),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// R310 — bedroom emergency escape openings
// ---------------------------------------------------------------------------

function checkBedroomEgress(model: Model, rs: RuleSet): Finding[] {
  const bedrooms = model.rooms.filter((r) => r.type === 'bedroom');
  if (!bedrooms.length) return [];
  const rule = getRule(rs, 'R310-EGRESS');
  if (!rule) return [verifyFinding('R310-EGRESS', 'bedroom emergency escape openings', {})];
  const minArea = intParam(rule, 'minNetClearAreaGradeFloorSqIn'); // Phase 1 = one story = grade floor
  const minH = intParam(rule, 'minNetClearHeightIn');
  const minW = intParam(rule, 'minNetClearWidthIn');
  const maxSill = intParam(rule, 'maxSillHeightIn');
  if (minArea === undefined || minH === undefined || minW === undefined || maxSill === undefined) {
    return [verifyFinding(rule.id, 'egress opening parameters missing', {})];
  }
  const out: Finding[] = [];
  for (const bed of bedrooms) {
    const windows = openingsOfRoom(model, bed.id).filter(
      (o) => o.type === 'window' && o.operable !== false,
    );
    const qualifying = windows.filter((o) => {
      const clear = windowNetClearOpening(o);
      return clear.area >= minArea && clear.h >= minH && clear.w >= minW && o.sill <= maxSill;
    });
    if (!qualifying.length) {
      out.push(
        finding(
          rule,
          `${bed.name} has no qualifying emergency escape window — needs net clear opening ≥ ${(minArea / 144).toFixed(1)} sq ft, ≥ ${minH}" high, ≥ ${minW}" wide, sill ≤ ${formatFeetInches(maxSill)} (${rule.section}).`,
          { roomIds: [bed.id], openingIds: windows.map((w) => w.id) },
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R311 — egress door + halls
// ---------------------------------------------------------------------------

function isExteriorOpening(model: Model, o: Opening): boolean {
  const w = wallById(model, o.wallId);
  return !!w && w.kind === 'exterior';
}

function checkEgressDoor(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'R311-DOOR');
  if (!rule) return [verifyFinding('R311-DOOR', 'required egress door', {})];
  const minW = intParam(rule, 'minClearWidthIn');
  if (minW === undefined) return [verifyFinding(rule.id, 'egress door width parameter missing', {})];
  const ok = model.openings.some(
    (o) => o.type === 'door' && isExteriorOpening(model, o) && o.width >= minW,
  );
  if (!ok) {
    return [
      finding(
        rule,
        `No exterior egress door of at least ${formatFeetInches(minW)} clear width found (${rule.section}).`,
        {},
      ),
    ];
  }
  return [];
}

function checkHalls(model: Model, rs: RuleSet): Finding[] {
  const halls = model.rooms.filter((r) => r.type === 'hall');
  if (!halls.length) return [];
  const rule = getRule(rs, 'R311-HALL');
  if (!rule) return [verifyFinding('R311-HALL', 'hallway width', {})];
  const minW = intParam(rule, 'minClearWidthIn');
  if (minW === undefined) return [verifyFinding(rule.id, 'hall width parameter missing', {})];
  const out: Finding[] = [];
  for (const hall of halls) {
    if (roomMinDim(hall) < minW) {
      out.push(
        finding(
          rule,
          `${hall.name} is ${formatFeetInches(roomMinDim(hall))} wide — halls must be at least ${formatFeetInches(minW)} clear (${rule.section}).`,
          { roomIds: [hall.id] },
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R302.5 — garage separation
// ---------------------------------------------------------------------------

function checkGarageSeparation(model: Model, rs: RuleSet): Finding[] {
  const garages = model.rooms.filter((r) => r.type === 'garage');
  if (!garages.length) return [];
  const rule = getRule(rs, 'GAR-SEP');
  if (!rule) return [verifyFinding('GAR-SEP', 'garage separation', {})];
  const minRating = intParam(rule, 'minDoorFireRatingMin');
  if (minRating === undefined) return [verifyFinding(rule.id, 'garage door rating parameter missing', {})];
  const out: Finding[] = [];
  const garageIds = new Set(garages.map((g) => g.id));
  for (const o of model.openings) {
    const rooms = roomsAtOpening(model, o);
    const touchesGarage = rooms.some((r) => garageIds.has(r.id));
    const dwellingSide = rooms.filter((r) => !garageIds.has(r.id) && r.type !== 'porch');
    if (!touchesGarage || !dwellingSide.length) continue;
    if (o.type === 'window' || o.type === 'opening') {
      out.push(
        finding(
          rule,
          `Unprotected ${o.type} between garage and dwelling is not permitted (${rule.section}).`,
          { openingIds: [o.id] },
        ),
      );
      continue;
    }
    if (o.type === 'door') {
      const bedroomSide = dwellingSide.find((r) => r.type === 'bedroom');
      if (bedroomSide) {
        out.push(
          finding(
            rule,
            `Garage door opens directly into ${bedroomSide.name} — garages may not open into sleeping rooms (${rule.section}).`,
            { openingIds: [o.id], roomIds: [bedroomSide.id] },
          ),
        );
      }
      if ((o.fireRatingMin ?? 0) < minRating || !o.selfClosing) {
        out.push(
          finding(
            rule,
            `Garage separation door must be self-closing and rated at least ${minRating} minutes (${rule.section}).`,
            { openingIds: [o.id] },
          ),
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R307 — bath fixture clearances
// ---------------------------------------------------------------------------

function checkBathClearances(model: Model, rs: RuleSet): Finding[] {
  const wcs = model.fixtures.filter((f) => f.type === 'wc');
  if (!wcs.length) return [];
  const rule = getRule(rs, 'BATH-CLR');
  if (!rule) return [verifyFinding('BATH-CLR', 'bathroom fixture clearances', {})];
  const front = intParam(rule, 'wcFrontClearanceIn');
  const side = intParam(rule, 'wcSideCenterlineIn');
  if (front === undefined || side === undefined) {
    return [verifyFinding(rule.id, 'fixture clearance parameters missing', {})];
  }
  const wcSize = (fixtureCatalog.fixtures as Record<string, { w: number; d: number }>)['wc'];
  const out: Finding[] = [];
  for (const wc of wcs) {
    const room = model.rooms.find((r) => r.id === wc.roomId);
    if (!room || !wcSize) continue;
    // facing: rot 0 faces south (+y), 1 west, 2 north, 3 east
    const alongY = wc.rot === 0 || wc.rot === 2;
    const sideClear = alongY
      ? Math.min(wc.x - room.x, room.x + room.w - wc.x)
      : Math.min(wc.y - room.y, room.y + room.h - wc.y);
    if (sideClear < side) {
      out.push(
        finding(
          rule,
          `${room.name}: water closet centerline is ${formatFeetInches(sideClear)} from the side wall — ${formatFeetInches(side)} required (${rule.section}).`,
          { roomIds: [room.id] },
        ),
      );
    }
    const frontEdge =
      wc.rot === 0 ? wc.y + wcSize.d
      : wc.rot === 2 ? wc.y - wcSize.d
      : wc.rot === 3 ? wc.x + wcSize.d
      : wc.x - wcSize.d;
    const frontClear =
      wc.rot === 0 ? room.y + room.h - frontEdge
      : wc.rot === 2 ? frontEdge - room.y
      : wc.rot === 3 ? room.x + room.w - frontEdge
      : frontEdge - room.x;
    if (frontClear < front) {
      out.push(
        finding(
          rule,
          `${room.name}: water closet has ${formatFeetInches(frontClear)} in front — ${formatFeetInches(front)} required (${rule.section}).`,
          { roomIds: [room.id] },
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R303 — light & ventilation (warn)
// ---------------------------------------------------------------------------

function checkLightVent(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'WIN-LIGHT');
  const rooms = model.rooms.filter((r) => HABITABLE_TYPES.has(r.type));
  if (!rule) return rooms.length ? [verifyFinding('WIN-LIGHT', 'light and ventilation', {})] : [];
  const glazePct = intParam(rule, 'minGlazingPctOfFloor');
  const openPct = intParam(rule, 'minOpenablePctOfFloor');
  if (glazePct === undefined || openPct === undefined) {
    return [verifyFinding(rule.id, 'light/ventilation parameters missing', {})];
  }
  const out: Finding[] = [];
  for (const r of rooms) {
    const windows = openingsOfRoom(model, r.id).filter((o) => o.type === 'window');
    const glazing = windows.reduce((s, w) => s + windowGlazingArea(w), 0);
    const openable = windows.filter((w) => w.operable).reduce((s, w) => s + windowGlazingArea(w), 0);
    const floor = roomArea(r);
    if (glazing * 100 < floor * glazePct) {
      out.push(
        finding(
          rule,
          `${r.name}: glazing is below ${glazePct}% of floor area (${rule.section}).`,
          { roomIds: [r.id] },
        ),
      );
    } else if (openable * 100 < floor * openPct) {
      out.push(
        finding(
          rule,
          `${r.name}: openable glazing is below ${openPct}% of floor area — provide mechanical ventilation note (${rule.section}).`,
          { roomIds: [r.id] },
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R314 / R315 — smoke + CO alarms
// ---------------------------------------------------------------------------

function checkAlarms(model: Model, rs: RuleSet): Finding[] {
  const out: Finding[] = [];
  const bedrooms = model.rooms.filter((r) => r.type === 'bedroom');
  const smoke = getRule(rs, 'R314-SMOKE');
  if (!smoke) {
    if (bedrooms.length) out.push(verifyFinding('R314-SMOKE', 'smoke alarm placement', {}));
  } else {
    const alarms = model.fixtures.filter((f) => f.type === 'smokeAlarm');
    const bedIds = new Set(bedrooms.map((b) => b.id));
    for (const bed of bedrooms) {
      if (!alarms.some((a) => a.roomId === bed.id)) {
        out.push(
          finding(smoke, `${bed.name} is missing a smoke alarm (${smoke.section}).`, {
            roomIds: [bed.id],
          }),
        );
      }
    }
    if (bedrooms.length && !alarms.some((a) => !bedIds.has(a.roomId))) {
      out.push(
        finding(
          smoke,
          `A smoke alarm is required outside the sleeping area (${smoke.section}).`,
          {},
        ),
      );
    }
  }
  const co = getRule(rs, 'R315-CO');
  const hasGarage = model.rooms.some((r) => r.type === 'garage');
  if (hasGarage) {
    if (!co) {
      out.push(verifyFinding('R315-CO', 'carbon monoxide alarm placement', {}));
    } else {
      const bedIds = new Set(bedrooms.map((b) => b.id));
      const coAlarms = model.fixtures.filter((f) => f.type === 'coAlarm');
      if (!coAlarms.some((a) => !bedIds.has(a.roomId))) {
        out.push(
          finding(
            co,
            `Dwelling with attached garage requires a CO alarm outside the sleeping area (${co.section}).`,
            {},
          ),
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R308 — safety glazing (warn annotation)
// ---------------------------------------------------------------------------

function checkSafetyGlazing(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'R308-GLAZE');
  if (!rule) return [];
  const maxSill = intParam(rule, 'maxSillForHazardIn');
  if (maxSill === undefined) return [];
  const out: Finding[] = [];
  for (const o of model.openings) {
    if (o.type === 'window' && o.sill <= maxSill) {
      out.push(
        finding(
          rule,
          `Window ${o.id} sill at ${formatFeetInches(o.sill)} — tempered glazing required (${rule.section}).`,
          { openingIds: [o.id] },
          'warn',
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structure — headers, spans, braced wall lines (hard / engineer)
// ---------------------------------------------------------------------------

export interface HeaderSelection {
  openingId: string;
  openingWidth: number;
  member: string | null; // null → engineer required
}

/** Deterministic header selection from HDR-TBL. Exported for the schedule sheet. */
export function selectHeaders(model: Model, rs: RuleSet = loadRuleSet()): HeaderSelection[] {
  const rule = getRule(rs, 'HDR-TBL');
  const out: HeaderSelection[] = [];
  const table = (rule?.params['headers'] ?? []) as Array<{ maxOpeningIn: number; member: string }>;
  for (const o of model.openings) {
    const w = wallById(model, o.wallId);
    if (!w || w.kind === 'interior') continue; // bearing = exterior + garage separation in Phase 1
    const row = table.find((h) => o.width <= h.maxOpeningIn);
    out.push({ openingId: o.id, openingWidth: o.width, member: row ? row.member : null });
  }
  return out;
}

function checkHeaders(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'HDR-TBL');
  if (!rule) {
    return model.openings.length ? [verifyFinding('HDR-TBL', 'header sizing', {})] : [];
  }
  const out: Finding[] = [];
  for (const sel of selectHeaders(model, rs)) {
    if (sel.member === null) {
      out.push(
        finding(
          rule,
          `⚠ ENGINEER REQUIRED — ${formatFeetInches(sel.openingWidth)} opening exceeds IRC prescriptive provisions (${rule.id}). This sheet is incomplete for permit until a licensed engineer details this condition.`,
          { openingIds: [sel.openingId] },
          'engineer',
        ),
      );
    }
  }
  return out;
}

function checkSpans(model: Model, rs: RuleSet): Finding[] {
  const out: Finding[] = [];
  const box = bbox(model.footprint);
  const width = Math.min(box.maxX - box.minX, box.maxY - box.minY);
  const cj = getRule(rs, 'SPAN-CJ');
  if (!cj) {
    out.push(verifyFinding('SPAN-CJ', 'ceiling joist span', {}));
  } else {
    const spans = (cj.params['spans'] ?? []) as Array<{ member: string; maxSpanIn: number }>;
    const maxTable = spans.length ? Math.max(...spans.map((s) => s.maxSpanIn)) : 0;
    // joists span half the building width to a center bearing wall in Phase 1 plans
    const joistSpan = Math.ceil(width / 2);
    if (joistSpan > maxTable) {
      out.push(
        finding(
          cj,
          `⚠ ENGINEER REQUIRED — ${formatFeetInches(joistSpan)} ceiling joist span exceeds IRC prescriptive provisions (${cj.id}). This sheet is incomplete for permit until a licensed engineer details this condition.`,
          {},
          'engineer',
        ),
      );
    }
  }
  const rf = getRule(rs, 'SPAN-R');
  if (!rf) {
    out.push(verifyFinding('SPAN-R', 'rafter span', {}));
  } else {
    const spans = (rf.params['spans'] ?? []) as Array<{ member: string; maxSpanIn: number }>;
    const maxTable = spans.length ? Math.max(...spans.map((s) => s.maxSpanIn)) : 0;
    const rafterRun = Math.ceil(width / 2);
    if (rafterRun > maxTable) {
      out.push(
        finding(
          rf,
          `⚠ ENGINEER REQUIRED — ${formatFeetInches(rafterRun)} rafter span exceeds IRC prescriptive provisions (${rf.id}). This sheet is incomplete for permit until a licensed engineer details this condition.`,
          {},
          'engineer',
        ),
      );
    }
  }
  return out;
}

function checkBracedWallLines(model: Model, rs: RuleSet): Finding[] {
  const rule = getRule(rs, 'BWL-SPC');
  if (!rule) return [verifyFinding('BWL-SPC', 'braced wall line spacing', {})];
  const max = intParam(rule, 'maxSpacingIn');
  if (max === undefined) return [verifyFinding(rule.id, 'braced wall spacing parameter missing', {})];
  const box = bbox(model.footprint);
  const out: Finding[] = [];
  for (const [label, span] of [
    ['north–south', box.maxY - box.minY],
    ['east–west', box.maxX - box.minX],
  ] as const) {
    if (span > max) {
      out.push(
        finding(
          rule,
          `⚠ ENGINEER REQUIRED — ${formatFeetInches(span)} ${label} braced wall line spacing exceeds IRC prescriptive provisions (${rule.id}). This sheet is incomplete for permit until a licensed engineer details this condition.`,
          {},
          'engineer',
        ),
      );
    }
  }
  return out;
}
