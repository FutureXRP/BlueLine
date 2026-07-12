/**
 * Materials takeoff (Build Bible §15 Phase-3 upsell, pulled forward).
 *
 * Deterministic quantity estimate derived ENTIRELY from the locked model +
 * data tables (takeoffFactors.json for practice factors, HDR-TBL for header
 * members). Integer math on square/linear inches; unit conversion only at
 * the formatting boundary, same as everything else (Law #2).
 *
 * Honesty rule (fabrication-firewall spirit): this is a BUDGETING ESTIMATE,
 * not a cut list or an order. Every generated output carries that notice.
 */
import type { Model } from '../model/types.js';
import { bbox, polygonArea, wallLength } from '../model/geometry.js';
import { loadRuleSet, selectHeaders, type RuleSet } from '../validate/index.js';
import { roofSkeleton, nodeHeight } from '../roof/index.js';
import factorsTable from '../rules/takeoffFactors.json' with { type: 'json' };

export type TakeoffCategory =
  | 'foundation'
  | 'framing'
  | 'sheathing'
  | 'roofing'
  | 'openings'
  | 'interior';

export interface TakeoffItem {
  category: TakeoffCategory;
  description: string;
  qty: number;
  unit: 'EA' | 'LF' | 'SF' | 'SHEETS' | 'SQUARES' | 'CU YD';
  /** One-line derivation so a builder can sanity-check the number. */
  basis: string;
}

const F = factorsTable.factors;

const IN_PER_LF = 12;
const SQIN_PER_SF = 144;
const SQIN_PER_CUYD_AT = (thicknessIn: number) => (36 * 36 * 36) / thicknessIn; // sq in of slab per cu yd

function withWaste(qty: number, pct: number): number {
  return Math.ceil(qty * (1 + pct / 100));
}

function lf(inches: number): number {
  return Math.ceil(inches / IN_PER_LF);
}

/** Roof slope factor ×1000 (integer math): sqrt(12² + pitch²)/12. */
function slopeFactor1000(pitch: number): number {
  return Math.round(Math.sqrt(144 + pitch * pitch) * 1000 / 12);
}

export function materialsTakeoff(model: Model, ruleSet: RuleSet = loadRuleSet()): TakeoffItem[] {
  const items: TakeoffItem[] = [];
  const box = bbox(model.footprint);
  const footprintArea = polygonArea(model.footprint); // sq in
  const perimeter = model.walls
    .filter((w) => w.kind === 'exterior')
    .reduce((s, w) => s + wallLength(w), 0);
  const extWallLen = perimeter;
  const intWallLen = model.walls
    .filter((w) => w.kind !== 'exterior')
    .reduce((s, w) => s + wallLength(w), 0);
  const wallH = model.ceilingHeight;

  // --- foundation ------------------------------------------------------------
  if (model.foundation === 'slab') {
    const cuyd = Math.ceil(footprintArea / SQIN_PER_CUYD_AT(F.slabThicknessIn));
    items.push({
      category: 'foundation',
      description: `Concrete, ${F.slabThicknessIn}" slab on grade`,
      qty: cuyd,
      unit: 'CU YD',
      basis: `${Math.round(footprintArea / SQIN_PER_SF)} SF slab at ${F.slabThicknessIn}" (excl. thickened edges — see A-102)`,
    });
    if (F.slabVaporBarrier) {
      items.push({
        category: 'foundation',
        description: 'Vapor barrier, 6-mil poly under slab',
        qty: withWaste(Math.ceil(footprintArea / SQIN_PER_SF), F.sheathingWastePct),
        unit: 'SF',
        basis: 'slab area + waste',
      });
    }
  } else {
    items.push({
      category: 'foundation',
      description: 'Stemwall, crawlspace foundation',
      qty: lf(perimeter),
      unit: 'LF',
      basis: 'exterior wall perimeter (piers/girders by A-102)',
    });
  }
  items.push({
    category: 'foundation',
    description: 'Anchor bolts, 1/2" × 10"',
    qty: Math.ceil(perimeter / F.anchorBoltSpacingIn) + model.footprint.length,
    unit: 'EA',
    basis: `perimeter at ${F.anchorBoltSpacingIn}" o.c. + one per corner`,
  });
  if (F.sillSealPerimeter) {
    items.push({
      category: 'foundation',
      description: 'Sill seal, foam gasket',
      qty: lf(perimeter),
      unit: 'LF',
      basis: 'exterior wall perimeter',
    });
  }

  // --- wall framing ----------------------------------------------------------
  const extStud = model.exteriorWall === '2x6' ? '2x6' : '2x4';
  const studLenLabel = `${Math.floor(wallH / 12)}'`;
  const extStuds =
    model.walls
      .filter((w) => w.kind === 'exterior')
      .reduce((s, w) => s + Math.ceil(wallLength(w) / F.studSpacingIn) + 1, 0) +
    model.openings.filter((o) => isExterior(model, o.wallId)).length *
      (F.kingStudsPerOpening + F.jackStudsPerOpening);
  items.push({
    category: 'framing',
    description: `Studs, ${extStud} × ${studLenLabel} (exterior walls)`,
    qty: withWaste(extStuds, F.framingWastePct),
    unit: 'EA',
    basis: `${lf(extWallLen)} LF wall at ${F.studSpacingIn}" o.c. + king/jack at openings + waste`,
  });
  const intStuds =
    model.walls
      .filter((w) => w.kind !== 'exterior')
      .reduce((s, w) => s + Math.ceil(wallLength(w) / F.studSpacingIn) + 1, 0) +
    model.openings.filter((o) => !isExterior(model, o.wallId)).length *
      (F.kingStudsPerOpening + F.jackStudsPerOpening);
  items.push({
    category: 'framing',
    description: `Studs, 2x4 × ${studLenLabel} (interior partitions)`,
    qty: withWaste(intStuds, F.framingWastePct),
    unit: 'EA',
    basis: `${lf(intWallLen)} LF partition at ${F.studSpacingIn}" o.c. + king/jack at openings + waste`,
  });
  const plateLF = lf((extWallLen + intWallLen) * F.plateLayers);
  items.push({
    category: 'framing',
    description: `Plate stock, ${extStud}/2x4 (${F.plateLayers} plates)`,
    qty: withWaste(plateLF, F.framingWastePct),
    unit: 'LF',
    basis: `${lf(extWallLen + intWallLen)} LF wall × ${F.plateLayers} plates + waste`,
  });

  // headers from HDR-TBL (data-driven — same selection as the A-601 schedule)
  const headerCounts = new Map<string, number>();
  for (const h of selectHeaders(model, ruleSet)) {
    if (!h.member || h.member.startsWith('VERIFY')) continue;
    headerCounts.set(h.member, (headerCounts.get(h.member) ?? 0) + 1);
  }
  for (const [member, count] of [...headerCounts.entries()].sort()) {
    items.push({
      category: 'framing',
      description: `Header, ${member}`,
      qty: count,
      unit: 'EA',
      basis: 'per header schedule (HDR-TBL)',
    });
  }

  // ceiling joists
  const joistSpanIn = Math.ceil(Math.min(box.maxX - box.minX, box.maxY - box.minY) / 2);
  const joistLF = lf(Math.ceil(footprintArea / F.ceilingJoistSpacingIn));
  items.push({
    category: 'framing',
    description: 'Ceiling joists (size per SPAN-CJ table)',
    qty: withWaste(joistLF, F.framingWastePct),
    unit: 'LF',
    basis: `ceiling area at ${F.ceilingJoistSpacingIn}" o.c., ~${lf(joistSpanIn)}' spans to center bearing + waste`,
  });

  // --- roof ------------------------------------------------------------------
  const oh = model.roof.overhang;
  const eaveBox = { w: box.maxX - box.minX + 2 * oh, h: box.maxY - box.minY + 2 * oh };
  // plan area of roof approximated by offset bbox scaled by footprint/bbox ratio
  const bboxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
  const roofPlanArea = Math.round((eaveBox.w * eaveBox.h * footprintArea) / bboxArea);
  const sf1000 = slopeFactor1000(model.roof.pitch);
  const roofSurfArea = Math.round((roofPlanArea * sf1000) / 1000);

  const rafterLF = lf(Math.ceil((roofPlanArea / F.rafterSpacingIn) * (sf1000 / 1000)));
  items.push({
    category: 'framing',
    description: 'Rafters (size per SPAN-R table)',
    qty: withWaste(rafterLF, F.framingWastePct),
    unit: 'LF',
    basis: `roof plan area at ${F.rafterSpacingIn}" o.c. × ${model.roof.pitch}:12 slope factor + waste`,
  });

  const sk = roofSkeleton(model.footprint, model.roof);
  let ridgeIn = 0;
  let hipValleyIn = 0;
  for (const a of sk.arcs) {
    const run = Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y);
    const rise = Math.abs(nodeHeight(a.b, model.roof.pitch) - nodeHeight(a.a, model.roof.pitch));
    const trueLen = Math.round(Math.hypot(run, rise));
    if (a.kind === 'ridge') ridgeIn += trueLen;
    else if (a.kind === 'hip' || a.kind === 'valley') hipValleyIn += trueLen;
  }
  if (ridgeIn > 0) {
    items.push({
      category: 'framing',
      description: 'Ridge board',
      qty: withWaste(lf(ridgeIn), F.framingWastePct),
      unit: 'LF',
      basis: 'ridge length from roof geometry (A-401) + waste',
    });
  }
  if (hipValleyIn > 0) {
    items.push({
      category: 'framing',
      description: 'Hip / valley rafters',
      qty: withWaste(lf(hipValleyIn), F.framingWastePct),
      unit: 'LF',
      basis: 'true hip/valley lengths from roof geometry (A-401) + waste',
    });
  }

  // --- sheathing ---------------------------------------------------------------
  const sheetSqIn = F.sheetWIn * F.sheetHIn;
  const extSheathSqIn = extWallLen * wallH;
  items.push({
    category: 'sheathing',
    description: 'Wall sheathing, 7/16" OSB 4×8',
    qty: withWaste(Math.ceil(extSheathSqIn / sheetSqIn), F.sheathingWastePct),
    unit: 'SHEETS',
    basis: `${Math.round(extSheathSqIn / SQIN_PER_SF)} SF exterior wall + waste (openings not deducted — bracing panels)`,
  });
  items.push({
    category: 'sheathing',
    description: 'Roof sheathing, 1/2" OSB 4×8',
    qty: withWaste(Math.ceil(roofSurfArea / sheetSqIn), F.sheathingWastePct),
    unit: 'SHEETS',
    basis: `${Math.round(roofSurfArea / SQIN_PER_SF)} SF roof surface + waste`,
  });

  // --- roofing -----------------------------------------------------------------
  items.push({
    category: 'roofing',
    description: 'Asphalt shingles',
    qty: withWaste(Math.ceil(roofSurfArea / F.shingleSquareSqIn), F.roofingWastePct),
    unit: 'SQUARES',
    basis: `${Math.round(roofSurfArea / SQIN_PER_SF)} SF roof surface + waste`,
  });
  items.push({
    category: 'roofing',
    description: 'Roofing underlayment',
    qty: withWaste(Math.ceil(roofSurfArea / SQIN_PER_SF), F.roofingWastePct),
    unit: 'SF',
    basis: 'roof surface + waste',
  });
  const eavePerimeter = 2 * (eaveBox.w + eaveBox.h);
  items.push({
    category: 'roofing',
    description: 'Drip edge',
    qty: lf(eavePerimeter),
    unit: 'LF',
    basis: 'eave/rake perimeter',
  });

  // --- openings ----------------------------------------------------------------
  const openingCounts = new Map<string, { count: number; desc: string }>();
  for (const o of model.openings) {
    if (o.type === 'opening') continue;
    const kind =
      o.type === 'garageDoor' ? 'Garage door'
      : o.type === 'window' ? 'Window'
      : isExterior(model, o.wallId) ? 'Exterior door'
      : 'Interior door';
    const size = `${Math.floor(o.width / 12)}'-${o.width % 12}" × ${Math.floor(o.height / 12)}'-${o.height % 12}"`;
    const rated = o.fireRatingMin ? `, ${o.fireRatingMin}-min rated self-closing` : '';
    const key = `${kind} ${size}${rated}`;
    const cur = openingCounts.get(key) ?? { count: 0, desc: key };
    cur.count++;
    openingCounts.set(key, cur);
  }
  for (const [key, v] of [...openingCounts.entries()].sort()) {
    void key;
    items.push({
      category: 'openings',
      description: v.desc,
      qty: v.count,
      unit: 'EA',
      basis: 'door/window schedule count',
    });
  }

  // --- interior ------------------------------------------------------------------
  const gypSqIn = intWallLen * wallH * 2 + extWallLen * wallH + footprintArea; // partitions both faces + ext interior face + ceiling
  items.push({
    category: 'interior',
    description: 'Gypsum board, 1/2" 4×8 (walls + ceiling)',
    qty: withWaste(Math.ceil(gypSqIn / sheetSqIn), F.gypsumWastePct),
    unit: 'SHEETS',
    basis: `${Math.round(gypSqIn / SQIN_PER_SF)} SF wall/ceiling faces + waste (5/8" garage ceiling separate)`,
  });
  const garageSepLen = model.walls
    .filter((w) => w.kind === 'garageSeparation')
    .reduce((s, w) => s + wallLength(w), 0);
  if (garageSepLen > 0) {
    items.push({
      category: 'interior',
      description: 'Gypsum board, 5/8" Type X (garage separation, GAR-SEP)',
      qty: withWaste(Math.ceil((garageSepLen * wallH) / sheetSqIn), F.gypsumWastePct),
      unit: 'SHEETS',
      basis: 'garage separation wall area + waste (garage ceiling below habitable N/A — single story)',
    });
  }

  return items;
}

function isExterior(model: Model, wallId: string): boolean {
  return model.walls.find((w) => w.id === wallId)?.kind === 'exterior';
}

/** Notice printed on every takeoff output. */
export const TAKEOFF_NOTICE =
  'QUANTITY ESTIMATE FOR BUDGETING ONLY — derived from plan geometry with standard waste factors. ' +
  'Not a cut list and not an order. VERIFY quantities with your framer and supplier before purchase.';

/** CSV export for spreadsheet use. */
export function takeoffToCsv(items: TakeoffItem[]): string {
  const rows = [['category', 'description', 'qty', 'unit', 'basis']];
  for (const i of items) {
    rows.push([i.category, i.description, String(i.qty), i.unit, i.basis]);
  }
  return (
    `# ${TAKEOFF_NOTICE}\n` +
    rows.map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')).join('\n')
  );
}
