/**
 * Shared plan-view drawing: walls with openings, door swings, windows,
 * fixtures, room labels, dimension strings. Used by A-101 (and later A-102 /
 * E-101, which reuse the same wall fabric — one geometry model, §2.4).
 */
import type { PDFPage } from 'pdf-lib';
import { rgb, degrees } from 'pdf-lib';
import type { Model, Opening, Room, Wall } from '../model/types.js';
import {
  bbox,
  pointOnWall,
  roomArea,
  roomsAtOpening,
  wallLength,
} from '../model/geometry.js';
import { formatFeetInches, formatSquareFeet } from '../model/format.js';
import { exteriorDimStrings, pruneDimStrings, type Side } from '../dims/index.js';
import { PEN, TEXT, type PlanTransform, toPage } from './layout.js';
import type { Fonts } from './titleblock.js';
import fixtureCatalog from '../rules/fixtureCatalog.json' with { type: 'json' };

const BLACK = rgb(0, 0, 0);

export interface PlanCtx {
  page: PDFPage;
  tr: PlanTransform;
  minY: number;
  fonts: Fonts;
}

export function pt(ctx: PlanCtx, mx: number, my: number): { x: number; y: number } {
  return toPage(ctx.tr, mx, my, ctx.minY);
}

function line(ctx: PlanCtx, a: { x: number; y: number }, b: { x: number; y: number }, thickness: number, dash?: number[]): void {
  ctx.page.drawLine({
    start: pt(ctx, a.x, a.y),
    end: pt(ctx, b.x, b.y),
    thickness,
    color: BLACK,
    ...(dash ? { dashArray: dash } : {}),
  });
}

interface Interval {
  a: number;
  b: number;
}

function openIntervals(wall: Wall, openings: Opening[]): Interval[] {
  return openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({ a: o.offset - o.width / 2, b: o.offset + o.width / 2 }))
    .sort((p, q) => p.a - q.a);
}

function solidIntervals(wall: Wall, openings: Opening[]): Interval[] {
  const len = wallLength(wall);
  const gaps = openIntervals(wall, openings);
  const out: Interval[] = [];
  let cur = 0;
  for (const g of gaps) {
    if (g.a > cur) out.push({ a: cur, b: g.a });
    cur = Math.max(cur, g.b);
  }
  if (cur < len) out.push({ a: cur, b: len });
  return out;
}

/** Unit direction + left normal of a wall in model space. */
function wallVectors(w: Wall): { ux: number; uy: number; nx: number; ny: number } {
  const len = wallLength(w);
  const ux = (w.x2 - w.x1) / len;
  const uy = (w.y2 - w.y1) / len;
  return { ux, uy, nx: -uy, ny: ux };
}

export function drawWalls(ctx: PlanCtx, model: Model): void {
  for (const w of model.walls) {
    const len = wallLength(w);
    if (len === 0) continue;
    const { ux, uy, nx, ny } = wallVectors(w);
    const half = w.thickness / 2;
    const weight = w.kind === 'interior' ? PEN.medium : PEN.heavy;
    for (const seg of solidIntervals(w, model.openings)) {
      const ax = w.x1 + ux * seg.a;
      const ay = w.y1 + uy * seg.a;
      const bx = w.x1 + ux * seg.b;
      const by = w.y1 + uy * seg.b;
      // double line
      line(ctx, { x: ax + nx * half, y: ay + ny * half }, { x: bx + nx * half, y: by + ny * half }, weight);
      line(ctx, { x: ax - nx * half, y: ay - ny * half }, { x: bx - nx * half, y: by - ny * half }, weight);
      // end caps
      line(ctx, { x: ax + nx * half, y: ay + ny * half }, { x: ax - nx * half, y: ay - ny * half }, weight);
      line(ctx, { x: bx + nx * half, y: by + ny * half }, { x: bx - nx * half, y: by - ny * half }, weight);
    }
    for (const o of model.openings.filter((o) => o.wallId === w.id)) {
      drawOpening(ctx, model, w, o);
    }
  }
}

function drawOpening(ctx: PlanCtx, model: Model, w: Wall, o: Opening): void {
  const { ux, uy, nx, ny } = wallVectors(w);
  const half = w.thickness / 2;
  const a = o.offset - o.width / 2;
  const b = o.offset + o.width / 2;
  const P = (d: number, n: number) => ({ x: w.x1 + ux * d + nx * n, y: w.y1 + uy * d + ny * n });

  if (o.type === 'window') {
    // jambs + triple glazing lines
    line(ctx, P(a, half), P(a, -half), PEN.medium);
    line(ctx, P(b, half), P(b, -half), PEN.medium);
    for (const n of [half * 0.6, 0, -half * 0.6]) {
      line(ctx, P(a, n), P(b, n), PEN.fine);
    }
    return;
  }
  if (o.type === 'garageDoor') {
    line(ctx, P(a, half), P(a, -half), PEN.medium);
    line(ctx, P(b, half), P(b, -half), PEN.medium);
    line(ctx, P(a, 0), P(b, 0), PEN.fine, [6, 4]);
    return;
  }
  if (o.type === 'opening') {
    // cased opening: jambs + dashed head line
    line(ctx, P(a, half), P(a, -half), PEN.medium);
    line(ctx, P(b, half), P(b, -half), PEN.medium);
    line(ctx, P(a, 0), P(b, 0), PEN.fine, [10, 6]);
    return;
  }
  // door: jambs + leaf + quarter-circle swing arc
  line(ctx, P(a, half), P(a, -half), PEN.medium);
  line(ctx, P(b, half), P(b, -half), PEN.medium);
  // swing side: toward the first room this opening serves; hinge per swing L/R
  const rooms = roomsAtOpening(model, o);
  const center = pointOnWall(w, o.offset);
  let sideSign = 1;
  if (rooms.length) {
    const r = rooms[0]!;
    const rcx = r.x + r.w / 2;
    const rcy = r.y + r.h / 2;
    sideSign = Math.sign((rcx - center.x) * nx + (rcy - center.y) * ny) || 1;
  }
  if (o.swing === 'outLeft' || o.swing === 'outRight') sideSign = -sideSign;
  const hingeAtA = o.swing === 'inLeft' || o.swing === 'outLeft' || o.swing === 'none';
  const hinge = hingeAtA ? a : b;
  const leafDir = hingeAtA ? 1 : -1;
  // leaf: perpendicular to wall on the swing side
  const leafEnd = {
    x: w.x1 + ux * hinge + nx * sideSign * o.width,
    y: w.y1 + uy * hinge + ny * sideSign * o.width,
  };
  line(ctx, P(hinge, 0), leafEnd, PEN.medium);
  // quarter arc from open jamb to leaf end (polyline approximation)
  const steps = 10;
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= steps; i++) {
    const th = (Math.PI / 2) * (i / steps);
    const along = hinge + leafDir * Math.cos(th) * o.width;
    const out = Math.sin(th) * o.width * sideSign;
    const p = { x: w.x1 + ux * along + nx * out, y: w.y1 + uy * along + ny * out };
    if (prev) line(ctx, prev, p, PEN.fine);
    prev = p;
  }
}

export function drawRoomLabels(ctx: PlanCtx, model: Model): void {
  for (const r of model.rooms) {
    const c = pt(ctx, r.x + r.w / 2, r.y + r.h / 2);
    const name = r.name.toUpperCase();
    const nameW = ctx.fonts.body.widthOfTextAtSize(name, TEXT.room);
    ctx.page.drawText(name, {
      x: c.x - nameW / 2,
      y: c.y + 2,
      size: TEXT.room,
      font: ctx.fonts.body,
      color: BLACK,
    });
    const area = formatSquareFeet(roomArea(r));
    const areaW = ctx.fonts.mono.widthOfTextAtSize(area, TEXT.roomArea);
    ctx.page.drawText(area, {
      x: c.x - areaW / 2,
      y: c.y - TEXT.room - 2,
      size: TEXT.roomArea,
      font: ctx.fonts.mono,
      color: BLACK,
    });
  }
}

export function drawFixtures(ctx: PlanCtx, model: Model): void {
  const cat = fixtureCatalog.fixtures as Record<string, { w: number; d: number }>;
  for (const f of model.fixtures) {
    const size = cat[f.type];
    if (!size) continue;
    if (f.type === 'smokeAlarm' || f.type === 'coAlarm') {
      const c = pt(ctx, f.x, f.y);
      const r = 5;
      ctx.page.drawCircle({ x: c.x, y: c.y, size: r, borderColor: BLACK, borderWidth: PEN.medium });
      const label = f.type === 'smokeAlarm' ? 'S' : 'CO';
      const lw = ctx.fonts.body.widthOfTextAtSize(label, 5);
      ctx.page.drawText(label, { x: c.x - lw / 2, y: c.y - 2, size: 5, font: ctx.fonts.body, color: BLACK });
      continue;
    }
    // oriented rectangle outline; rot in quarter turns
    const across = f.rot % 2 === 0 ? size.w : size.d;
    const deep = f.rot % 2 === 0 ? size.d : size.w;
    const x0 = f.x - across / 2;
    const y0 = f.rot === 2 ? f.y - deep : f.rot === 0 ? f.y : f.y - deep / 2;
    const corners = [
      { x: x0, y: y0 },
      { x: x0 + across, y: y0 },
      { x: x0 + across, y: y0 + deep },
      { x: x0, y: y0 + deep },
    ];
    for (let i = 0; i < 4; i++) {
      line(ctx, corners[i]!, corners[(i + 1) % 4]!, PEN.fine);
    }
    if (f.type === 'wc') {
      // bowl ellipse approximated as octagon inside front half
      const cx = f.x;
      const cy = y0 + deep * 0.65;
      const rx = across * 0.32;
      const ry = deep * 0.3;
      let prev: { x: number; y: number } | null = null;
      for (let i = 0; i <= 8; i++) {
        const th = (i / 8) * Math.PI * 2;
        const p = { x: cx + Math.cos(th) * rx, y: cy + Math.sin(th) * ry };
        if (prev) line(ctx, prev, p, PEN.fine);
        prev = p;
      }
    }
  }
}

/** Tag map: unique opening size per type → D1/W1… Used by A-101 + A-601. */
export function openingTags(model: Model): Map<string, string> {
  const tags = new Map<string, string>();
  let d = 0;
  let wnd = 0;
  for (const o of [...model.openings].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${o.type}|${o.width}x${o.height}`;
    if (tags.has(key)) continue;
    if (o.type === 'window') tags.set(key, `W${++wnd}`);
    else if (o.type === 'door' || o.type === 'garageDoor') tags.set(key, `D${++d}`);
  }
  return tags;
}

export function tagForOpening(tags: Map<string, string>, o: Opening): string | undefined {
  return tags.get(`${o.type}|${o.width}x${o.height}`);
}

export function drawOpeningTags(ctx: PlanCtx, model: Model): void {
  const tags = openingTags(model);
  for (const o of model.openings) {
    const tag = tagForOpening(tags, o);
    if (!tag) continue;
    const w = model.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const { nx, ny } = wallVectors(w);
    const c = pointOnWall(w, o.offset);
    // place tag off the exterior side for exterior walls, +normal otherwise
    const rooms = roomsAtOpening(model, o);
    let sideSign = -1;
    if (w.kind !== 'exterior' || !rooms.length) sideSign = 1;
    else {
      const r = rooms[0]!;
      sideSign = -(Math.sign((r.x + r.w / 2 - c.x) * nx + (r.y + r.h / 2 - c.y) * ny) || 1);
    }
    const p = pt(ctx, c.x + nx * sideSign * 26, c.y + ny * sideSign * 26);
    const rr = 8;
    ctx.page.drawCircle({ x: p.x, y: p.y, size: rr, borderColor: BLACK, borderWidth: PEN.fine });
    const tw = ctx.fonts.body.widthOfTextAtSize(tag, TEXT.tag);
    ctx.page.drawText(tag, { x: p.x - tw / 2, y: p.y - TEXT.tag / 2 + 1, size: TEXT.tag, font: ctx.fonts.body, color: BLACK });
  }
}

const TIER_OFFSET_PT: Record<number, number> = { 1: 26, 2: 48, 3: 70 };

export function drawDimensions(ctx: PlanCtx, model: Model): void {
  const box = bbox(model.footprint);
  const strings = pruneDimStrings(exteriorDimStrings(model));
  for (const s of strings) {
    const off = TIER_OFFSET_PT[s.tier]!;
    drawDimString(ctx, s.side, s.ticks, off, box);
  }
}

function drawDimString(
  ctx: PlanCtx,
  side: Side,
  ticks: number[],
  offsetPt: number,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  const { page, fonts } = ctx;
  const horizontal = side === 'N' || side === 'S';
  // dimension line position in page coords
  const edge =
    side === 'N' ? pt(ctx, 0, box.minY).y + offsetPt
    : side === 'S' ? pt(ctx, 0, box.maxY).y - offsetPt
    : side === 'W' ? pt(ctx, box.minX, 0).x - offsetPt
    : pt(ctx, box.maxX, 0).x + offsetPt;

  const tickPagePos = (v: number) => (horizontal ? pt(ctx, v, 0).x : pt(ctx, 0, v).y);

  // dimension line
  const p0 = tickPagePos(ticks[0]!);
  const p1 = tickPagePos(ticks[ticks.length - 1]!);
  if (horizontal) {
    page.drawLine({ start: { x: p0, y: edge }, end: { x: p1, y: edge }, thickness: PEN.fine, color: BLACK });
  } else {
    page.drawLine({ start: { x: edge, y: p0 }, end: { x: edge, y: p1 }, thickness: PEN.fine, color: BLACK });
  }

  for (let i = 0; i < ticks.length; i++) {
    const v = tickPagePos(ticks[i]!);
    // extension line from near the plan to just past the dim line
    const wallEdge = horizontal
      ? side === 'N' ? pt(ctx, 0, box.minY).y : pt(ctx, 0, box.maxY).y
      : side === 'W' ? pt(ctx, box.minX, 0).x : pt(ctx, box.maxX, 0).x;
    const dir = side === 'N' || side === 'E' ? 1 : -1;
    if (horizontal) {
      page.drawLine({
        start: { x: v, y: wallEdge + dir * 6 },
        end: { x: v, y: edge + dir * 4 },
        thickness: PEN.fine,
        color: BLACK,
      });
      // 45° architectural tick
      page.drawLine({ start: { x: v - 3, y: edge - 3 }, end: { x: v + 3, y: edge + 3 }, thickness: PEN.medium, color: BLACK });
    } else {
      page.drawLine({
        start: { x: wallEdge + dir * 6, y: v },
        end: { x: edge + dir * 4, y: v },
        thickness: PEN.fine,
        color: BLACK,
      });
      page.drawLine({ start: { x: edge - 3, y: v - 3 }, end: { x: edge + 3, y: v + 3 }, thickness: PEN.medium, color: BLACK });
    }
    // segment label
    if (i > 0) {
      const label = formatFeetInches(Math.abs(ticks[i]! - ticks[i - 1]!));
      const lw = fonts.mono.widthOfTextAtSize(label, TEXT.dim);
      const mid = (v + tickPagePos(ticks[i - 1]!)) / 2;
      if (horizontal) {
        page.drawText(label, {
          x: mid - lw / 2,
          y: edge + (side === 'N' ? 3 : 3),
          size: TEXT.dim,
          font: fonts.mono,
          color: BLACK,
        });
      } else {
        page.drawText(label, {
          x: edge + (side === 'W' ? -3 : 3),
          y: mid - lw / 2,
          size: TEXT.dim,
          font: fonts.mono,
          color: BLACK,
          rotate: degrees(90),
        });
      }
    }
  }
}
