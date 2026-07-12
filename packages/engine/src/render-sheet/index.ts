/**
 * Sheet-set renderer (Build Bible §9). Server-side, pure: same model that
 * drives the editor (Law #4). Returns PDF bytes + a text log of every string
 * drawn, for the fabrication scan (§16: no code citation may appear that
 * doesn't trace to a rule-table entry).
 */
import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib';
import type { Finding, Model } from '../model/types.js';
import { bbox, conditionedArea, garageArea, geometryHash, porchArea } from '../model/geometry.js';
import { formatFeetInches, formatPitch, formatSquareFeet } from '../model/format.js';
import { loadRuleSet, selectHeaders, validate, type RuleSet } from '../validate/index.js';
import { roofSkeleton } from '../roof/index.js';
import { exteriorDimStrings } from '../dims/index.js';
import {
  DRAW_AREA,
  PAGE_H,
  PAGE_W,
  PEN,
  TEXT,
  planTransform,
  type PlanTransform,
} from './layout.js';
import { drawTitleBlock, drawWatermark, type Fonts, type SheetMeta } from './titleblock.js';
import {
  drawDimensions,
  drawFixtures,
  drawOpeningTags,
  drawRoomLabels,
  drawWalls,
  openingTags,
  tagForOpening,
  type PlanCtx,
} from './plan.js';
import { rgb } from 'pdf-lib';

const BLACK = rgb(0, 0, 0);

export interface SheetSetOptions {
  projectTitle: string;
  /** Caller supplies the date string — the renderer itself is deterministic. */
  issueDate: string;
  revision?: string;
  watermark?: boolean;
}

export interface SheetSetResult {
  pdf: Uint8Array;
  /** Every text string drawn, for the fabrication scan (§16). */
  textLog: string[];
  sheetIndex: Array<{ id: string; name: string }>;
  geometryHash: string;
}

interface SheetDef {
  id: string;
  name: string;
  draw: (page: PDFPage, ctx: RenderCtx) => string; // returns scale label
}

interface RenderCtx {
  model: Model;
  ruleSet: RuleSet;
  findings: Finding[];
  fonts: Fonts;
  log: (s: string) => string;
  opts: SheetSetOptions;
}

export async function renderSheetSet(
  model: Model,
  opts: SheetSetOptions,
  ruleSet: RuleSet = loadRuleSet(),
): Promise<SheetSetResult> {
  const doc = await PDFDocument.create();
  // deterministic output: fixed metadata, no timestamps
  doc.setTitle(`${opts.projectTitle} — Construction Documents`);
  doc.setProducer('Blueline');
  doc.setCreator('Blueline deterministic renderer');
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));

  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  const findings = validate(model, ruleSet);
  const textLog: string[] = [];
  const ctx: RenderCtx = {
    model,
    ruleSet,
    findings,
    fonts,
    log: (s: string) => {
      textLog.push(s);
      return s;
    },
    opts,
  };

  const sheets: SheetDef[] = [
    { id: 'A-000', name: 'Cover Sheet', draw: drawCover },
    { id: 'A-101', name: 'Floor Plan', draw: drawFloorPlan },
    { id: 'A-401', name: 'Roof Plan', draw: drawRoofPlan },
  ];

  for (const sheet of sheets) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const scaleLabel = sheet.draw(page, ctx);
    const meta: SheetMeta = {
      sheetId: sheet.id,
      sheetName: sheet.name,
      projectTitle: opts.projectTitle,
      issueDate: opts.issueDate,
      scaleLabel,
      revision: opts.revision ?? 'A',
      ruleSetVersion: ruleSet.version,
    };
    drawTitleBlock(page, fonts, meta);
    ctx.log(`NOT AN ARCHITECT'S OR ENGINEER'S SEALED DOCUMENT.`);
    if (opts.watermark) drawWatermark(page, fonts);
  }

  const pdf = await doc.save({ useObjectStreams: false });
  return {
    pdf,
    textLog,
    sheetIndex: sheets.map((s) => ({ id: s.id, name: s.name })),
    geometryHash: geometryHash(model),
  };
}

// ---------------------------------------------------------------------------
// A-000 — Cover
// ---------------------------------------------------------------------------

function drawCover(page: PDFPage, ctx: RenderCtx): string {
  const { fonts, model, findings, opts, log } = ctx;
  let y = PAGE_H - 140;
  const x = DRAW_AREA.x + 40;

  page.drawText(log(opts.projectTitle.toUpperCase()), { x, y, size: 40, font: fonts.bold, color: BLACK });
  y -= 34;
  page.drawText(
    log('BUILDABLE, UNSTAMPED CONSTRUCTION DOCUMENTS — SINGLE-FAMILY DETACHED DWELLING'),
    { x, y, size: 11, font: fonts.body, color: BLACK },
  );
  y -= 18;
  page.drawText(
    log('PREPARED UNDER THE 2021 IRC PRESCRIPTIVE PROVISIONS, EXCLUDING SITE-SPECIFIC ENGINEERING'),
    { x, y, size: 11, font: fonts.body, color: BLACK },
  );

  // columns
  const col2 = x + 620;
  let yL = y - 60;
  const section = (atX: number, atY: number, title: string): number => {
    page.drawText(log(title), { x: atX, y: atY, size: TEXT.sectionTitle, font: fonts.bold, color: BLACK });
    page.drawLine({
      start: { x: atX, y: atY - 6 },
      end: { x: atX + 480, y: atY - 6 },
      thickness: PEN.medium,
      color: BLACK,
    });
    return atY - 26;
  };
  const noteLine = (atX: number, atY: number, s: string, bold = false): number => {
    page.drawText(log(s), { x: atX, y: atY, size: TEXT.note, font: bold ? fonts.bold : fonts.body, color: BLACK });
    return atY - 14;
  };

  // sheet index
  yL = section(x, yL, 'SHEET INDEX');
  for (const s of [
    ['A-000', 'COVER SHEET'],
    ['A-101', 'FLOOR PLAN'],
    ['A-401', 'ROOF PLAN'],
  ]) {
    yL = noteLine(x, yL, `${s[0]}   ${s[1]}`);
  }

  // area tabulation
  yL -= 16;
  yL = section(x, yL, 'AREA TABULATION');
  yL = noteLine(x, yL, `CONDITIONED AREA        ${formatSquareFeet(conditionedArea(model))}`);
  yL = noteLine(x, yL, `GARAGE AREA             ${formatSquareFeet(garageArea(model))}`);
  yL = noteLine(x, yL, `PORCH AREA              ${formatSquareFeet(porchArea(model))}`);
  yL = noteLine(x, yL, `CEILING HEIGHT          ${formatFeetInches(model.ceilingHeight)}`);
  yL = noteLine(x, yL, `ROOF                    ${model.roof.style.toUpperCase()} ${formatPitch(model.roof.pitch)}`);
  yL = noteLine(x, yL, `FOUNDATION              ${model.foundation.toUpperCase()}`);
  yL = noteLine(x, yL, `EXTERIOR WALLS          ${model.exteriorWall} @ 16" O.C.`);

  // general notes
  yL -= 16;
  yL = section(x, yL, 'GENERAL NOTES');
  const verifiedCount = [...ctx.ruleSet.rules.values()].filter((r) => r.verified).length;
  const generalNotes = [
    'ALL DIMENSIONS ARE TO FACE OF STUD / WALL CENTERLINE AS NOTED. DO NOT SCALE DRAWINGS.',
    'DESIGNED TO 2021 IRC BASE PROVISIONS. LOCAL AMENDMENTS GOVERN. BUYER IS RESPONSIBLE',
    'FOR JURISDICTION REVIEW PRIOR TO PERMIT SUBMISSION.',
    'SMOKE AND CO ALARMS: INTERCONNECTED, HARDWIRED WITH BATTERY BACKUP, PLACED AS SHOWN.',
  ];
  if (verifiedCount < ctx.ruleSet.rules.size) {
    generalNotes.push(
      'CODE-CHECK RULE TABLES IN THIS ISSUE ARE NOT YET LINE-VERIFIED AGAINST THE PUBLISHED',
      '2021 IRC. VERIFY WITH LOCAL CODE OFFICIAL.',
    );
  }
  for (const n of generalNotes) yL = noteLine(x, yL, n);

  // excluded scope — stated on the cover sheet itself (§3)
  let yR = y - 60;
  yR = section(col2, yR, 'EXCLUDED SCOPE');
  for (const s of [
    'SITE PLAN — BY OTHERS',
    'SEPTIC / SEWER DESIGN — BY OTHERS',
    'MECHANICAL LAYOUT BY OTHERS; MANUAL J/S/D REQUIRED',
    'ENERGY CODE COMPLIANCE DOCUMENTATION — BY OTHERS',
    'FIRE SPRINKLER DESIGN (WHERE REQUIRED) — BY OTHERS',
    'ANY CONDITION FLAGGED ENGINEER-REQUIRED BELOW',
  ]) {
    yR = noteLine(col2, yR, s);
  }

  // engineer flags (§8) — hard-flag, never guess
  yR -= 16;
  yR = section(col2, yR, 'ENGINEER-REQUIRED CONDITIONS');
  const flags = findings.filter((f) => f.severity === 'engineer');
  if (!flags.length) {
    yR = noteLine(col2, yR, 'NONE — ALL CONDITIONS WITHIN IRC PRESCRIPTIVE PATH');
  } else {
    for (const f of flags) yR = noteLine(col2, yR, f.message.toUpperCase(), true);
  }

  // unresolved findings block (should be empty at lock; belt & suspenders)
  const hard = findings.filter((f) => f.severity === 'hard');
  if (hard.length) {
    yR -= 16;
    yR = section(col2, yR, 'UNRESOLVED VALIDATION FINDINGS');
    for (const f of hard) yR = noteLine(col2, yR, f.message.toUpperCase(), true);
  }

  return 'AS NOTED';
}

// ---------------------------------------------------------------------------
// A-101 — Floor Plan
// ---------------------------------------------------------------------------

function planCtx(page: PDFPage, ctx: RenderCtx, dimMarginPt: number): PlanCtx & { tr: PlanTransform } {
  const box = bbox(ctx.model.footprint);
  const tr = planTransform(box.minX, box.minY, box.maxX, box.maxY, dimMarginPt);
  return { page, tr, minY: box.minY, fonts: ctx.fonts };
}

function drawFloorPlan(page: PDFPage, ctx: RenderCtx): string {
  const pc = planCtx(page, ctx, 110);
  drawWalls(pc, ctx.model);
  drawRoomLabels(pc, ctx.model);
  drawFixtures(pc, ctx.model);
  drawOpeningTags(pc, ctx.model);
  drawDimensions(pc, ctx.model);
  // log dimension text + room labels for the fabrication scan
  for (const s of exteriorDimStrings(ctx.model)) {
    for (let i = 1; i < s.ticks.length; i++) ctx.log(formatFeetInches(s.ticks[i]! - s.ticks[i - 1]!));
  }
  for (const r of ctx.model.rooms) ctx.log(`${r.name.toUpperCase()} ${formatSquareFeet(r.w * r.h)}`);

  // header schedule note (from HDR-TBL — data-driven, §8)
  const tags = openingTags(ctx.model);
  const headers = selectHeaders(ctx.model, ctx.ruleSet);
  let y = PAGE_H - 120;
  const x = DRAW_AREA.x + DRAW_AREA.w - 420;
  page.drawText(ctx.log('HEADER SCHEDULE (BEARING WALLS)'), { x, y, size: 9, font: ctx.fonts.bold, color: BLACK });
  y -= 14;
  const seen = new Set<string>();
  for (const h of headers) {
    const o = ctx.model.openings.find((oo) => oo.id === h.openingId)!;
    const tag = tagForOpening(tags, o) ?? o.id;
    const key = `${tag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const member = (h.member ?? 'ENGINEER REQUIRED').slice(0, 44);
    page.drawText(ctx.log(`${tag}  ${formatFeetInches(h.openingWidth)}  ${member}`), {
      x, y, size: 7.5, font: ctx.fonts.mono, color: BLACK,
    });
    y -= 11;
  }

  // north arrow (north = model -y = page up)
  const nx = DRAW_AREA.x + 60;
  const ny = PAGE_H - 140;
  page.drawCircle({ x: nx, y: ny, size: 18, borderColor: BLACK, borderWidth: PEN.medium });
  page.drawLine({ start: { x: nx, y: ny - 12 }, end: { x: nx, y: ny + 12 }, thickness: PEN.medium, color: BLACK });
  page.drawLine({ start: { x: nx, y: ny + 12 }, end: { x: nx - 5, y: ny + 2 }, thickness: PEN.medium, color: BLACK });
  page.drawLine({ start: { x: nx, y: ny + 12 }, end: { x: nx + 5, y: ny + 2 }, thickness: PEN.medium, color: BLACK });
  page.drawText('N', { x: nx - 4, y: ny + 24, size: 11, font: ctx.fonts.bold, color: BLACK });

  return pc.tr.scaleLabel;
}

// ---------------------------------------------------------------------------
// A-401 — Roof Plan
// ---------------------------------------------------------------------------

function drawRoofPlan(page: PDFPage, ctx: RenderCtx): string {
  const { model } = ctx;
  const pc = planCtx(page, ctx, 80);
  const box = bbox(model.footprint);
  const toPg = (mx: number, my: number) => ({
    x: pc.tr.ox + mx * pc.tr.s,
    y: pc.tr.oy + (pc.tr.planH - (my - box.minY)) * pc.tr.s,
  });

  // wall line (footprint)
  const n = model.footprint.length;
  for (let i = 0; i < n; i++) {
    const a = model.footprint[i]!;
    const b = model.footprint[(i + 1) % n]!;
    page.drawLine({ start: toPg(a.x, a.y), end: toPg(b.x, b.y), thickness: PEN.medium, color: BLACK, dashArray: [8, 5] });
  }

  // eave line (footprint offset outward by overhang) — rectilinear offset
  const off = model.roof.overhang;
  const eave: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const prev = edgeLine(model.footprint, (i + n - 1) % n, off);
    const cur = edgeLine(model.footprint, i, off);
    // vertex i = intersection of prev and cur offset lines
    const vLine = prev.axis === 'v' ? prev : cur;
    const hLine = prev.axis === 'h' ? prev : cur;
    eave.push({ x: vLine.c, y: hLine.c });
  }
  for (let i = 0; i < n; i++) {
    page.drawLine({
      start: toPg(eave[i]!.x, eave[i]!.y),
      end: toPg(eave[(i + 1) % n]!.x, eave[(i + 1) % n]!.y),
      thickness: PEN.heavy,
      color: BLACK,
    });
  }

  // straight-skeleton arcs (§9 roof geometry)
  const sk = roofSkeleton(model.footprint, model.roof);
  for (const a of sk.arcs) {
    const weight = a.kind === 'ridge' ? PEN.heavy : a.kind === 'gable' ? PEN.fine : PEN.medium;
    page.drawLine({ start: toPg(a.a.x, a.a.y), end: toPg(a.b.x, a.b.y), thickness: weight, color: BLACK });
  }

  // pitch tags at facade midpoints (skip gable ends)
  for (let i = 0; i < n; i++) {
    if (model.roof.style === 'gable' && model.roof.gableEdges.includes(i)) continue;
    const a = model.footprint[i]!;
    const b = model.footprint[(i + 1) % n]!;
    const m = toPg((a.x + b.x) / 2, (a.y + b.y) / 2);
    const label = formatPitch(model.roof.pitch);
    page.drawText(ctx.log(label), { x: m.x + 6, y: m.y + 6, size: 8, font: ctx.fonts.mono, color: BLACK });
  }

  // notes
  let y = PAGE_H - 120;
  const x = DRAW_AREA.x + DRAW_AREA.w - 460;
  for (const s of [
    `OVERHANG ${formatFeetInches(model.roof.overhang)} TYP., MEASURED HORIZONTALLY FROM WALL FACE`,
    'GUTTERS AND DOWNSPOUTS BY OTHERS; SLOPE TO DISCHARGE AWAY FROM FOUNDATION',
    'DASHED LINE INDICATES EXTERIOR WALL BELOW',
  ]) {
    page.drawText(ctx.log(s), { x, y, size: 8, font: ctx.fonts.body, color: BLACK });
    y -= 13;
  }
  return pc.tr.scaleLabel;
}

function edgeLine(
  poly: Array<{ x: number; y: number }>,
  i: number,
  offset: number,
): { axis: 'h' | 'v'; c: number } {
  const a = poly[i]!;
  const b = poly[(i + 1) % poly.length]!;
  if (a.y === b.y) {
    // horizontal edge: outward is away from polygon interior
    const inwardUp = probeInside(poly, (a.x + b.x) / 2, a.y + 1);
    return { axis: 'h', c: inwardUp ? a.y - offset : a.y + offset };
  }
  const inwardRight = probeInside(poly, a.x + 1, (a.y + b.y) / 2);
  return { axis: 'v', c: inwardRight ? a.x - offset : a.x + offset };
}

function probeInside(poly: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
