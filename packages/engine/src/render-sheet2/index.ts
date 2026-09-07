/**
 * v2 sheet set from HouseModel (bible §8.4 subset — INTERIM renderer).
 *
 * Bonsai/Blender remains the Phase-3 drawing pipeline; this deterministic
 * pdf-lib renderer produces the working set until the render service exists:
 *   A-000 cover · A-101/A-102 plans · A-104 roof plan · A-201..A-204
 *   elevations · A-301 stair section · A-601 schedules
 * plus DXF per level and the SHA-256 deliverable manifest (§11).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Finding, HouseModel, LevelModel, Opening, Wall } from '../house/types.js';
import { formatFraction } from '../house/types.js';
import { elevationRoofProfile, roofField, unionOutline } from '../house/roofgeom.js';
import { straightSkeleton } from '../roof/skeleton.js';
import { hashHouse } from '../house/hash.js';
import { buildManifest, type Manifest } from '../house/manifest.js';
import { loadRuleRows } from '../house/rules.js';
import { STYLE_TOKENS } from '../render-svg2/tokens.js';

const PT_PER_IN = 72;
const PAGE_W = 36 * PT_PER_IN;
const PAGE_H = 24 * PT_PER_IN;
const MARGIN = 36;
const TB_W = 216;
const INK = rgb(0, 0, 0);

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export interface SheetSet2Options {
  issueDate: string;
  watermark?: boolean;
}

export interface SheetSet2Result {
  pdf: Uint8Array;
  dxf: string;
  manifest: Manifest;
  sheetIndex: Array<{ id: string; name: string }>;
  modelHash: string;
}

function winAnsi(s: string): string {
  return s.replace(/⚠/g, '(!)').replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '?');
}

export async function renderSheetSet2(
  model: HouseModel,
  findings: Finding[],
  opts: SheetSet2Options,
): Promise<SheetSet2Result> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.spec.planType} — Blueline v2`);
  doc.setProducer('Blueline v2 interim renderer');
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  const sheets: Array<{ id: string; name: string; draw: (p: PDFPage) => void }> = [];
  sheets.push({ id: 'A-000', name: 'Cover Sheet', draw: (p) => cover(p, model, findings, fonts) });
  for (const level of model.levels) {
    sheets.push({
      id: `A-10${level.index + 1}`,
      name: `${level.name} Plan`,
      draw: (p) => planSheet(p, model, level, fonts),
    });
  }
  sheets.push({ id: 'A-104', name: 'Roof Plan', draw: (p) => roofSheet(p, model, fonts) });
  const views: Array<['front' | 'rear' | 'left' | 'right', string]> = [
    ['front', 'A-201'], ['rear', 'A-202'], ['left', 'A-203'], ['right', 'A-204'],
  ];
  for (const [view, id] of views) {
    sheets.push({ id, name: `${view[0]!.toUpperCase()}${view.slice(1)} Elevation`, draw: (p) => elevationSheet(p, model, view, fonts) });
  }
  if (model.stair) sheets.push({ id: 'A-301', name: 'Building Section at Stair', draw: (p) => sectionSheet(p, model, fonts) });
  sheets.push({ id: 'A-601', name: 'Schedules', draw: (p) => scheduleSheet(p, model, fonts) });

  for (const sheet of sheets) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    sheet.draw(page);
    titleBlock(page, fonts, model, sheet.id, sheet.name, opts.issueDate);
    if (opts.watermark) watermark(page, fonts);
  }

  const pdf = await doc.save({ useObjectStreams: false });
  const dxf = renderDxf2(model);
  const modelHash = hashHouse(model);
  const manifest = await buildManifest(
    { geometryVersion: '2.0.0', engineVersion: model.spec.engineVersion, modelHash },
    [
      { file: 'sheets.pdf', data: pdf },
      { file: 'model.dxf', data: dxf },
      { file: 'model.json', data: JSON.stringify(model) },
    ],
  );
  return { pdf, dxf, manifest, sheetIndex: sheets.map((s) => ({ id: s.id, name: s.name })), modelHash };
}

// ---------------------------------------------------------------------------

function titleBlock(page: PDFPage, fonts: Fonts, model: HouseModel, id: string, name: string, issueDate: string): void {
  page.drawRectangle({ x: MARGIN, y: MARGIN, width: PAGE_W - 2 * MARGIN, height: PAGE_H - 2 * MARGIN, borderColor: INK, borderWidth: 1.4 });
  page.drawRectangle({ x: MARGIN + 4, y: MARGIN + 4, width: PAGE_W - 2 * MARGIN - 8, height: PAGE_H - 2 * MARGIN - 8, borderColor: INK, borderWidth: 0.4 });
  const tbX = PAGE_W - MARGIN - TB_W;
  page.drawLine({ start: { x: tbX, y: MARGIN + 4 }, end: { x: tbX, y: PAGE_H - MARGIN - 4 }, thickness: 1.4, color: INK });
  let y = PAGE_H - MARGIN - 40;
  const t = (s: string, size = 8, bold = false, dy = 12) => {
    page.drawText(winAnsi(s), { x: tbX + 12, y, size, font: bold ? fonts.bold : fonts.body, color: INK });
    y -= dy;
  };
  t('BLUELINE', 20, true, 18);
  t('CONSTRUCTION DOCUMENTS - v2', 6.5, false, 18);
  t('PROJECT', 6.5); t(model.spec.planType.toUpperCase(), 9, true, 16);
  t('STYLE', 6.5); t(model.spec.style.replace(/_/g, ' ').toUpperCase(), 9, false, 16);
  t('ISSUE DATE', 6.5); t(issueDate, 9, false, 16);
  t('ENGINE', 6.5); t(model.spec.engineVersion, 8, false, 16);
  t('MODEL HASH', 6.5); t(hashHouse(model), 8, false, 16);
  t('SEED', 6.5); t(String(model.spec.seed), 8, false, 18);
  for (const line of [
    'NOT AN ARCHITECT\'S OR ENGINEER\'S', 'SEALED DOCUMENT.', '',
    'Prepared from a validated model against', 'IRC 2021 prescriptive provisions. Local',
    'amendments govern. Site, soils, septic,', 'HVAC (Manual J/S/D by others), energy',
    'documentation, and engineer-flagged', 'conditions are excluded. Dimensions to',
    'face of framing. Verify in field.',
  ]) {
    t(line, 6.5, line.includes('SEALED') || line.includes('NOT AN'), 9);
  }
  page.drawText(winAnsi(name.toUpperCase()), { x: tbX + 12, y: MARGIN + 64, size: 9, font: fonts.body, color: INK });
  page.drawText(id, { x: tbX + 12, y: MARGIN + 26, size: 28, font: fonts.bold, color: INK });
}

function watermark(page: PDFPage, fonts: Fonts): void {
  for (const [x, wy] of [[PAGE_W * 0.15, PAGE_H * 0.25], [PAGE_W * 0.4, PAGE_H * 0.55]] as const) {
    page.drawText('PREVIEW - NOT FOR CONSTRUCTION', { x, y: wy, size: 46, font: fonts.bold, color: rgb(0.85, 0.85, 0.85) });
  }
}

interface Tr {
  s: number;
  ox: number;
  oy: number;
  maxY: number; // model maxY for front-at-bottom flip
}

function fitPlan(rects: Array<{ x: number; y: number; w: number; h: number }>, pad: number): Tr {
  const minX = Math.min(...rects.map((r) => r.x)) - pad;
  const minY = Math.min(...rects.map((r) => r.y)) - pad;
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + pad;
  const maxY = Math.max(...rects.map((r) => r.y + r.h)) + pad;
  const availW = PAGE_W - 2 * MARGIN - TB_W - 120;
  const availH = PAGE_H - 2 * MARGIN - 140;
  const s = Math.min(availW / (maxX - minX), availH / (maxY - minY), 1.5);
  return {
    s,
    ox: MARGIN + 80 + (availW - (maxX - minX) * s) / 2 - minX * s,
    oy: MARGIN + 90 + (availH - (maxY - minY) * s) / 2,
    maxY,
  };
}

function px(tr: Tr, x: number): number { return tr.ox + x * tr.s; }
function py(tr: Tr, y: number): number { return tr.oy + (tr.maxY - y) * tr.s; } // flip: front (y=0) at bottom

function line(page: PDFPage, tr: Tr, x1: number, y1: number, x2: number, y2: number, w: number, dash?: number[]): void {
  page.drawLine({ start: { x: px(tr, x1), y: py(tr, y1) }, end: { x: px(tr, x2), y: py(tr, y2) }, thickness: w, color: INK, ...(dash ? { dashArray: dash } : {}) });
}

function planSheet(page: PDFPage, model: HouseModel, level: LevelModel, fonts: Fonts): void {
  const rects = [...level.footprint, ...(level.index === 0 ? model.extras.map((e) => e.rect) : [])];
  const tr = fitPlan(rects, 96);

  if (level.index === 0) {
    for (const e of model.extras) {
      page.drawRectangle({
        x: px(tr, e.rect.x), y: py(tr, e.rect.y + e.rect.h),
        width: e.rect.w * tr.s, height: e.rect.h * tr.s,
        borderColor: INK, borderWidth: 0.7, borderDashArray: [6, 4],
      });
      page.drawText(winAnsi(e.name.toUpperCase()), { x: px(tr, e.rect.x + e.rect.w / 2) - 24, y: py(tr, e.rect.y + e.rect.h / 2), size: 7, font: fonts.body, color: INK });
    }
  }

  for (const w of level.walls) {
    const len = Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
    const horizontal = w.y1 === w.y2;
    const gaps = level.openings.filter((o) => o.wallId === w.id).map((o) => ({ a: o.offset - o.width / 2, b: o.offset + o.width / 2 })).sort((p, q) => p.a - q.a);
    const segs: Array<{ a: number; b: number }> = [];
    let cur = 0;
    for (const g of gaps) { if (g.a > cur) segs.push({ a: cur, b: g.a }); cur = Math.max(cur, g.b); }
    if (cur < len) segs.push({ a: cur, b: len });
    for (const seg of segs) {
      const t = w.thickness * tr.s;
      if (horizontal) {
        page.drawRectangle({ x: px(tr, w.x1 + seg.a), y: py(tr, w.y1) - t / 2, width: (seg.b - seg.a) * tr.s, height: t, color: INK });
      } else {
        page.drawRectangle({ x: px(tr, w.x1) - t / 2, y: py(tr, w.y1 + seg.b), width: t, height: (seg.b - seg.a) * tr.s, color: INK });
      }
    }
    for (const o of level.openings.filter((o) => o.wallId === w.id)) drawOpeningPdf(page, tr, w, o);
  }

  for (const r of level.rooms) {
    const cx = px(tr, r.rect.x + r.rect.w / 2);
    const cy = py(tr, r.rect.y + r.rect.h / 2);
    const name = winAnsi(r.name.toUpperCase());
    page.drawText(name, { x: cx - fonts.body.widthOfTextAtSize(name, 8) / 2, y: cy + 2, size: 8, font: fonts.body, color: INK });
    const area = `${Math.round((r.rect.w * r.rect.h) / 144)} SF`;
    page.drawText(area, { x: cx - fonts.mono.widthOfTextAtSize(area, 6.5) / 2, y: cy - 8, size: 6.5, font: fonts.mono, color: INK });
  }

  // stair treads
  if (model.stair && (model.stair.levelFrom === level.index || model.stair.levelTo === level.index)) {
    const st = model.stair;
    const o = st.opening;
    for (let i = 1; i <= st.riserCount - 1; i++) {
      const d = i * st.treadDepthIn;
      if (st.direction === 'front' || st.direction === 'rear') {
        if (d < o.h) line(page, tr, o.x + 2, o.y + d, o.x + o.w - 2, o.y + d, 0.4);
      } else if (d < o.w) line(page, tr, o.x + d, o.y + 2, o.x + d, o.y + o.h - 2, 0.4);
    }
  }

  // two-tier dimensions per side (overall + wall breaks)
  const fp = level.footprint;
  const minX = Math.min(...fp.map((r) => r.x));
  const maxX = Math.max(...fp.map((r) => r.x + r.w));
  const minY = Math.min(...fp.map((r) => r.y));
  const maxYfp = Math.max(...fp.map((r) => r.y + r.h));
  const fmt = (v: number) => `${Math.floor(v / 12)}'-${v % 12}"`;
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.4, color: INK });
    page.drawLine({ start: { x: x1 - 2, y: y1 - 2 }, end: { x: x1 + 2, y: y1 + 2 }, thickness: 0.8, color: INK });
    page.drawLine({ start: { x: x2 - 2, y: y2 - 2 }, end: { x: x2 + 2, y: y2 + 2 }, thickness: 0.8, color: INK });
    const lw = fonts.mono.widthOfTextAtSize(label, 7);
    if (vertical) page.drawText(label, { x: x1 - 8, y: (y1 + y2) / 2 - lw / 2, size: 7, font: fonts.mono, color: INK, rotate: { type: 'degrees', angle: 90 } as never });
    else page.drawText(label, { x: (x1 + x2) / 2 - lw / 2, y: y1 + 4, size: 7, font: fonts.mono, color: INK });
  };
  const dimY = py(tr, minY) + 40; // below plan (front at bottom)
  dim(px(tr, minX), dimY, px(tr, maxX), dimY, fmt(maxX - minX));
  const dimX = px(tr, minX) - 40;
  dim(dimX, py(tr, minY), dimX, py(tr, maxYfp), fmt(maxYfp - minY), true);
  // interior wall breaks along the front
  const breaks = [...new Set(level.walls.filter((w) => w.x1 === w.x2 && !w.exterior).map((w) => w.x1))].sort((a, b) => a - b);
  const tier2 = [minX, ...breaks.filter((b) => b > minX && b < maxX), maxX];
  for (let i = 1; i < tier2.length; i++) {
    dim(px(tr, tier2[i - 1]!), dimY + 18, px(tr, tier2[i]!), dimY + 18, fmt(tier2[i]! - tier2[i - 1]!));
  }

  const cap = 'FRONT';
  page.drawText(cap, { x: px(tr, (minX + maxX) / 2) - 14, y: py(tr, minY) + 64, size: 8, font: fonts.body, color: INK });
}

function drawOpeningPdf(page: PDFPage, tr: Tr, w: Wall, o: Opening): void {
  const horizontal = w.y1 === w.y2;
  const cx = horizontal ? w.x1 + o.offset : w.x1;
  const cy = horizontal ? w.y1 : w.y1 + o.offset;
  const a = o.width / 2;
  const t = w.thickness;
  if (o.type === 'window') {
    if (horizontal) {
      page.drawRectangle({ x: px(tr, cx - a), y: py(tr, cy) - (t * tr.s) / 2, width: o.width * tr.s, height: t * tr.s, borderColor: INK, borderWidth: 0.7 });
      line(page, tr, cx - a, cy, cx + a, cy, 0.4);
    } else {
      page.drawRectangle({ x: px(tr, cx) - (t * tr.s) / 2, y: py(tr, cy + a), width: t * tr.s, height: o.width * tr.s, borderColor: INK, borderWidth: 0.7 });
      line(page, tr, cx, cy - a, cx, cy + a, 0.4);
    }
  } else if (o.type === 'garageDoor' || o.type === 'slider' || o.type === 'cased') {
    const dash = o.type === 'cased' ? [8, 5] : [5, 3];
    if (horizontal) line(page, tr, cx - a, cy, cx + a, cy, 0.7, dash);
    else line(page, tr, cx, cy - a, cx, cy + a, 0.7, dash);
  } else {
    if (horizontal) {
      line(page, tr, cx - a, cy, cx - a, cy + o.width, 0.7);
      // quarter-arc as polyline
      let prev: [number, number] | null = null;
      for (let i = 0; i <= 8; i++) {
        const th = (Math.PI / 2) * (i / 8);
        const p: [number, number] = [cx + a - (1 - Math.cos(th)) * o.width, cy + Math.sin(th) * o.width];
        if (prev) line(page, tr, prev[0], prev[1], p[0], p[1], 0.35);
        prev = p;
      }
    } else {
      line(page, tr, cx, cy - a, cx + o.width, cy - a, 0.7);
      let prev: [number, number] | null = null;
      for (let i = 0; i <= 8; i++) {
        const th = (Math.PI / 2) * (i / 8);
        const p: [number, number] = [cx + Math.sin(th) * o.width, cy - a + (1 - Math.cos(th)) * o.width];
        if (prev) line(page, tr, prev[0], prev[1], p[0], p[1], 0.35);
        prev = p;
      }
    }
  }
}

function roofSheet(page: PDFPage, model: HouseModel, fonts: Fonts): void {
  const l1 = model.levels[0]!;
  const oh = model.roof.overhangIn;
  const rects = l1.footprint.map((r) => ({ x: r.x - oh, y: r.y - oh, w: r.w + 2 * oh, h: r.h + 2 * oh }));
  const tr = fitPlan(rects, 60);
  // eave outline
  const outline = unionOutline(l1.footprint);
  for (const e of eavesForDraw(outline, oh)) line(page, tr, e[0], e[1], e[2], e[3], 1.1);
  for (const e of outline) line(page, tr, e.a.x, e.a.y, e.b.x, e.b.y, 0.6, [6, 4]);
  // straight skeleton on the primary footprint rect
  const fp = l1.footprint[0]!;
  const tokens = STYLE_TOKENS[model.spec.style] ?? STYLE_TOKENS['modern_farmhouse']!;
  const poly = [
    { x: fp.x, y: fp.y }, { x: fp.x, y: fp.y + fp.h },
    { x: fp.x + fp.w, y: fp.y + fp.h }, { x: fp.x + fp.w, y: fp.y },
  ];
  const gableEdges: number[] = [];
  if (model.roof.style === 'gable') {
    if (tokens.gableSides.includes('left')) gableEdges.push(0);
    if (tokens.gableSides.includes('right')) gableEdges.push(2);
  }
  for (const arc of straightSkeleton(poly, gableEdges).arcs) {
    line(page, tr, arc.a.x, arc.a.y, arc.b.x, arc.b.y, arc.kind === 'ridge' ? 1.2 : 0.7);
  }
  const label = `${model.roof.pitch}:12 ${model.roof.style.toUpperCase()} - OVERHANG ${model.roof.overhangIn}"`;
  page.drawText(winAnsi(label), { x: MARGIN + 80, y: PAGE_H - MARGIN - 60, size: 9, font: fonts.body, color: INK });
}

function eavesForDraw(outline: ReturnType<typeof unionOutline>, oh: number): Array<[number, number, number, number]> {
  return outline.map((e) => {
    const shift = e.out === 'front' ? [0, -oh] : e.out === 'rear' ? [0, oh] : e.out === 'left' ? [-oh, 0] : [oh, 0];
    const ext = e.a.x === e.b.x ? [0, oh] : [oh, 0];
    const lo = { x: Math.min(e.a.x, e.b.x), y: Math.min(e.a.y, e.b.y) };
    const hi = { x: Math.max(e.a.x, e.b.x), y: Math.max(e.a.y, e.b.y) };
    return [lo.x + shift[0]! - ext[0]!, lo.y + shift[1]! - ext[1]!, hi.x + shift[0]! + ext[0]!, hi.y + shift[1]! + ext[1]!];
  });
}

function elevationSheet(page: PDFPage, model: HouseModel, view: 'front' | 'rear' | 'left' | 'right', fonts: Fonts): void {
  const tokens = STYLE_TOKENS[model.spec.style] ?? STYLE_TOKENS['modern_farmhouse']!;
  const l1 = model.levels[0]!;
  const l2 = model.levels[1];
  const zPlate1 = l1.floorToCeilingIn;
  const zFloor2 = model.spec.floorToFloorIn;
  const zPlate2 = l2 ? zFloor2 + l2.floorToCeilingIn : zPlate1;
  const field = roofField(l1.footprint, model.roof, tokens.gableSides);
  const prof = elevationRoofProfile(field, view, 12);
  const field2 = l2 ? roofField(l2.footprint, model.roof, tokens.gableSides) : null;
  const prof2 = field2 ? elevationRoofProfile(field2, view, 12) : null;
  const horizontal = view === 'front' || view === 'rear';
  const b = field.bounds;
  const a0 = horizontal ? b.minX : b.minY;
  const a1 = horizontal ? b.maxX : b.maxY;
  const maxRoof = Math.max(...prof.map((p) => p.height + zPlate1), ...(prof2 ?? []).map((p) => p.height + zPlate2));
  const availW = PAGE_W - 2 * MARGIN - TB_W - 160;
  const availH = PAGE_H - 2 * MARGIN - 200;
  const s = Math.min(availW / (a1 - a0), availH / (maxRoof + 24));
  const ox = MARGIN + 100;
  const oy = MARGIN + 120;
  const flip = view === 'rear' || view === 'left';
  const AX = (v: number) => ox + ((flip ? a1 - v : v - a0)) * s;
  const AY = (z: number) => oy + z * s;

  page.drawLine({ start: { x: ox - 40, y: AY(0) }, end: { x: ox + (a1 - a0) * s + 40, y: AY(0) }, thickness: 1.6, color: INK });

  const band = (level: LevelModel, z0: number, z1: number) => {
    for (const e of unionOutline(level.footprint).filter((e) => e.out === view)) {
      const p0 = horizontal ? Math.min(e.a.x, e.b.x) : Math.min(e.a.y, e.b.y);
      const p1 = horizontal ? Math.max(e.a.x, e.b.x) : Math.max(e.a.y, e.b.y);
      const xa = Math.min(AX(p0), AX(p1));
      page.drawRectangle({ x: xa, y: AY(z0), width: Math.abs(AX(p1) - AX(p0)), height: (z1 - z0) * s, borderColor: INK, borderWidth: 1 });
    }
  };
  const roofPoly = (profile: Array<{ along: number; height: number }>, zBase: number) => {
    let prev: { x: number; y: number } | null = null;
    const first = profile[0]!;
    const last = profile[profile.length - 1]!;
    page.drawLine({ start: { x: AX(first.along), y: AY(zBase) }, end: { x: AX(first.along), y: AY(zBase + first.height) }, thickness: 1, color: INK });
    for (const p of profile) {
      const pt = { x: AX(p.along), y: AY(zBase + p.height) };
      if (prev) page.drawLine({ start: prev, end: pt, thickness: 1, color: INK });
      prev = pt;
    }
    page.drawLine({ start: { x: AX(last.along), y: AY(zBase + last.height) }, end: { x: AX(last.along), y: AY(zBase) }, thickness: 1, color: INK });
  };

  band(l1, 0, zPlate1);
  roofPoly(prof, zPlate1);
  if (l2) band(l2, zFloor2, zPlate2);
  if (prof2 && l2) roofPoly(prof2, zPlate2);

  const openings = (level: LevelModel, zFloor: number) => {
    const fpMinX = Math.min(...level.footprint.map((r) => r.x));
    const fpMaxX = Math.max(...level.footprint.map((r) => r.x + r.w));
    const fpMinY = Math.min(...level.footprint.map((r) => r.y));
    const fpMaxY = Math.max(...level.footprint.map((r) => r.y + r.h));
    for (const o of level.openings) {
      const w = level.walls.find((x) => x.id === o.wallId);
      if (!w || !w.exterior) continue;
      const side =
        w.y1 === w.y2
          ? w.y1 === fpMinY ? 'front' : w.y1 === fpMaxY ? 'rear' : null
          : w.x1 === fpMinX ? 'left' : w.x1 === fpMaxX ? 'right' : null;
      if (side !== view) continue;
      const along = (w.y1 === w.y2 ? w.x1 : w.y1) + o.offset;
      const x0 = Math.min(AX(along - o.width / 2), AX(along + o.width / 2));
      page.drawRectangle({ x: x0, y: AY(zFloor + o.sill), width: o.width * s, height: o.height * s, borderColor: INK, borderWidth: 0.8 });
    }
  };
  openings(l1, 0);
  if (l2) openings(l2, zFloor2);

  // plate/floor datum lines
  for (const [z, label] of [[0, 'T.O. SLAB 0\'-0"'], [zPlate1, `L1 PLATE ${Math.floor(zPlate1 / 12)}'-${zPlate1 % 12}"`], ...(l2 ? [[zFloor2, `L2 FLOOR ${Math.floor(zFloor2 / 12)}'-${zFloor2 % 12}"`] as [number, string]] : [])] as Array<[number, string]>) {
    page.drawLine({ start: { x: ox - 60, y: AY(z) }, end: { x: ox - 12, y: AY(z) }, thickness: 0.4, color: INK });
    page.drawText(winAnsi(label), { x: ox - 60, y: AY(z) + 3, size: 6, font: fonts.mono, color: INK });
  }
}

function sectionSheet(page: PDFPage, model: HouseModel, fonts: Fonts): void {
  const st = model.stair!;
  const l1 = model.levels[0]!;
  const l2 = model.levels[1];
  const zPlate1 = l1.floorToCeilingIn;
  const zFloor2 = model.spec.floorToFloorIn;
  const zPlate2 = l2 ? zFloor2 + l2.floorToCeilingIn : zPlate1;
  const tokens = STYLE_TOKENS[model.spec.style] ?? STYLE_TOKENS['modern_farmhouse']!;
  const field = roofField(l1.footprint, model.roof, tokens.gableSides);
  const cutX = st.opening.x + st.opening.w / 2;
  const minY = Math.min(...l1.footprint.map((r) => r.y));
  const maxY = Math.max(...l1.footprint.map((r) => r.y + r.h));
  const maxRoof = zPlate1 + Math.max(...Array.from({ length: 40 }, (_, i) => field.heightAt(cutX, minY + ((maxY - minY) * i) / 39)));
  const availW = PAGE_W - 2 * MARGIN - TB_W - 160;
  const availH = PAGE_H - 2 * MARGIN - 200;
  const s = Math.min(availW / (maxY - minY), availH / (maxRoof + 30));
  const ox = MARGIN + 110;
  const oy = MARGIN + 120;
  const X = (yv: number) => ox + (maxY - yv) * s; // front (y=0) to the RIGHT
  const Z = (z: number) => oy + z * s;

  // grade + slab
  page.drawLine({ start: { x: X(maxY) - 30, y: Z(0) }, end: { x: X(minY) + 30, y: Z(0) }, thickness: 1.6, color: INK });
  // floor/plate/ceiling lines
  const datum = (z: number, label: string) => {
    page.drawLine({ start: { x: X(maxY), y: Z(z) }, end: { x: X(minY), y: Z(z) }, thickness: 0.4, color: INK, dashArray: [8, 5] });
    page.drawText(winAnsi(label), { x: X(maxY) - 96, y: Z(z) + 3, size: 6, font: fonts.mono, color: INK });
  };
  datum(zPlate1, 'L1 CLG');
  if (l2) { datum(zFloor2, 'L2 FLOOR'); datum(zPlate2, 'L2 CLG'); }

  // exterior wall cuts at front/rear
  for (const yv of [minY, maxY]) {
    page.drawRectangle({ x: X(yv) - 2.5, y: Z(0), width: 5, height: (l2 ? zPlate2 : zPlate1) * s, color: INK });
  }

  // stair steps: run along y from opening start toward rear
  const stepsY0 = st.opening.y;
  for (let i = 0; i < st.riserCount; i++) {
    const yA = stepsY0 + i * st.treadDepthIn;
    const zA = Math.round((model.spec.floorToFloorIn * i) / st.riserCount);
    const zB = Math.round((model.spec.floorToFloorIn * (i + 1)) / st.riserCount);
    page.drawLine({ start: { x: X(yA), y: Z(zA) }, end: { x: X(yA), y: Z(zB) }, thickness: 0.9, color: INK });
    if (i < st.riserCount - 1) {
      page.drawLine({ start: { x: X(yA), y: Z(zB) }, end: { x: X(yA + st.treadDepthIn), y: Z(zB) }, thickness: 0.9, color: INK });
    }
  }
  const note = `${st.riserCount} RISERS @ ${formatFraction(st.riserHeight)} - TREADS ${st.treadDepthIn}" - WIDTH ${st.widthIn}"`;
  page.drawText(winAnsi(note), { x: X(stepsY0 + st.opening.h), y: Z(zFloor2) + 14, size: 8, font: fonts.body, color: INK });

  // roof profile along the cut
  let prev: { x: number; y: number } | null = null;
  for (let yv = minY - model.roof.overhangIn; yv <= maxY + model.roof.overhangIn; yv += 12) {
    const pt = { x: X(yv), y: Z(zPlate1 + field.heightAt(cutX, yv)) };
    if (prev) page.drawLine({ start: prev, end: pt, thickness: 1.1, color: INK });
    prev = pt;
  }
  page.drawText('SECTION AT STAIR - LOOKING LEFT - FRONT AT RIGHT', { x: ox, y: PAGE_H - MARGIN - 60, size: 8, font: fonts.body, color: INK });
}

function scheduleSheet(page: PDFPage, model: HouseModel, fonts: Fonts): void {
  let y = PAGE_H - MARGIN - 70;
  const x0 = MARGIN + 60;
  const col = (x: number, t: string, bold = false, size = 7) =>
    page.drawText(winAnsi(t), { x, y, size, font: bold ? fonts.bold : fonts.mono, color: INK });
  page.drawText('ROOM SCHEDULE', { x: x0, y, size: 11, font: fonts.bold, color: INK });
  y -= 16;
  for (const r of model.schedule) {
    col(x0, `L${r.level}`); col(x0 + 30, r.name.slice(0, 24)); col(x0 + 190, r.type); col(x0 + 260, `${Math.round(r.areaSqIn / 144)} SF`);
    y -= 10;
  }
  y -= 14;
  page.drawText('OPENING SCHEDULE', { x: x0, y, size: 11, font: fonts.bold, color: INK });
  y -= 16;
  const yTop = y;
  let x = x0;
  for (const level of model.levels) {
    for (const o of level.openings) {
      col(x, o.id.padEnd(5)); col(x + 40, o.type.slice(0, 6)); col(x + 86, `${o.width}x${o.height}`);
      col(x + 150, o.sill ? `sill ${o.sill}` : '');
      y -= 10;
      if (y < MARGIN + 90) { y = yTop; x += 230; }
    }
  }
  // areas
  const ax = PAGE_W - MARGIN - TB_W - 320;
  let ay = PAGE_H - MARGIN - 70;
  page.drawText('AREAS (COMPUTED FROM GEOMETRY)', { x: ax, y: ay, size: 10, font: fonts.bold, color: INK });
  ay -= 16;
  const arow = (label: string, v: number) => {
    page.drawText(label, { x: ax, y: ay, size: 8, font: fonts.body, color: INK });
    page.drawText(`${Math.round(v / 144)} SF`, { x: ax + 190, y: ay, size: 8, font: fonts.mono, color: INK });
    ay -= 12;
  };
  model.areas.conditionedByLevelSqIn.forEach((v, i) => arow(`Conditioned L${i}`, v));
  arow('Conditioned total', model.areas.conditionedTotalSqIn);
  arow('Garage', model.areas.garageSqIn);
  arow('Porches', model.extras.reduce((s2, e) => s2 + e.rect.w * e.rect.h, 0));
}

function cover(page: PDFPage, model: HouseModel, findings: Finding[], fonts: Fonts): void {
  const x0 = MARGIN + 60;
  let y = PAGE_H - MARGIN - 110;
  page.drawText(winAnsi(`${model.spec.planType.replace(/_/g, ' ').toUpperCase()}`), { x: x0, y, size: 34, font: fonts.bold, color: INK });
  y -= 26;
  page.drawText(winAnsi(`${model.spec.style.replace(/_/g, ' ').toUpperCase()} - ${model.spec.foundation.toUpperCase()} - ${model.spec.studs} EXTERIOR - SEED ${model.spec.seed}`), { x: x0, y, size: 10, font: fonts.body, color: INK });
  y -= 34;

  const section = (t: string) => {
    page.drawText(t, { x: x0, y, size: 11, font: fonts.bold, color: INK });
    page.drawLine({ start: { x: x0, y: y - 4 }, end: { x: x0 + 420, y: y - 4 }, thickness: 0.8, color: INK });
    y -= 20;
  };
  const rowt = (t: string, bold = false) => {
    page.drawText(winAnsi(t), { x: x0, y, size: 7.5, font: bold ? fonts.bold : fonts.body, color: INK });
    y -= 11;
  };

  section('SHEET INDEX');
  const ids = ['A-000 COVER', ...model.levels.map((l) => `A-10${l.index + 1} ${l.name.toUpperCase()} PLAN`), 'A-104 ROOF PLAN', 'A-201..A-204 ELEVATIONS', ...(model.stair ? ['A-301 SECTION AT STAIR'] : []), 'A-601 SCHEDULES'];
  for (const s of ids) rowt(s);
  y -= 12;
  section('AREA TABULATION');
  model.areas.conditionedByLevelSqIn.forEach((v, i) => rowt(`CONDITIONED L${i}: ${Math.round(v / 144)} SF`));
  rowt(`CONDITIONED TOTAL: ${Math.round(model.areas.conditionedTotalSqIn / 144)} SF`, true);
  rowt(`GARAGE: ${Math.round(model.areas.garageSqIn / 144)} SF`);
  if (model.stair) rowt(`STAIR: ${model.stair.riserCount} RISERS @ ${formatFraction(model.stair.riserHeight)}, ${model.stair.treadDepthIn}" TREADS`);
  y -= 12;
  section('RULE TABLE STATUS');
  const rows = loadRuleRows();
  const unverified = [...rows.values()].filter((r) => !r.verified).length;
  rowt(`${rows.size} RULE ROWS LOADED - ${unverified} UNVERIFIED (BLOCKS LAUNCH, NOT DEVELOPMENT).`, unverified > 0);
  if (unverified > 0) rowt('VALUES FROM UNVERIFIED ROWS ARE REPRESENTATIVE. VERIFY WITH LOCAL CODE OFFICIAL.');

  // right column: findings (never softened)
  const fx = x0 + 520;
  let fy = PAGE_H - MARGIN - 170;
  page.drawText('FINDINGS', { x: fx, y: fy, size: 11, font: fonts.bold, color: INK });
  page.drawLine({ start: { x: fx, y: fy - 4 }, end: { x: fx + 460, y: fy - 4 }, thickness: 0.8, color: INK });
  fy -= 20;
  if (!findings.length) {
    page.drawText('NONE - MODEL PASSES ALL LOADED CHECKS.', { x: fx, y: fy, size: 8, font: fonts.body, color: INK });
  }
  for (const f of findings.slice(0, 30)) {
    const tag = f.severity.toUpperCase().padEnd(9);
    page.drawText(winAnsi(`${tag}${f.code}: ${f.message}`.slice(0, 105)), { x: fx, y: fy, size: 6.5, font: f.severity === 'engineer' || f.severity === 'error' ? fonts.bold : fonts.body, color: INK });
    fy -= 10;
  }
}

// ---------------------------------------------------------------------------
// DXF (v2)
// ---------------------------------------------------------------------------

export function renderDxf2(model: HouseModel): string {
  const lines: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const add = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    lines.push('0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '30', '0', '11', String(x2), '21', String(y2), '31', '0');
  };
  const text = (layer: string, x: number, y: number, t: string) => {
    lines.push('0', 'TEXT', '8', layer, '10', String(x), '20', String(y), '30', '0', '40', '6', '1', t);
  };
  for (const level of model.levels) {
    const L = `L${level.index}`;
    for (const w of level.walls) {
      const layer = `${L}_WALL_${w.exterior ? 'EXT' : 'INT'}`;
      add(layer, w.x1, w.y1, w.x2, w.y2);
    }
    for (const o of level.openings) {
      const w = level.walls.find((x) => x.id === o.wallId)!;
      const horizontal = w.y1 === w.y2;
      const cx = horizontal ? w.x1 + o.offset : w.x1;
      const cy = horizontal ? w.y1 : w.y1 + o.offset;
      const a = o.width / 2;
      if (horizontal) add(`${L}_${o.type.toUpperCase()}`, cx - a, cy, cx + a, cy);
      else add(`${L}_${o.type.toUpperCase()}`, cx, cy - a, cx, cy + a);
    }
    for (const r of level.rooms) {
      text(`${L}_ROOM_TEXT`, r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2, r.name);
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n') + '\n';
}
