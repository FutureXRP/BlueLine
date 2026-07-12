/**
 * Sheet layout constants — ARCH D 36×24 landscape, conservative drafting
 * style: black linework, standard pen weights (§9, §14).
 */

export const PT_PER_IN = 72;
export const PAGE_W = 36 * PT_PER_IN; // 2592
export const PAGE_H = 24 * PT_PER_IN; // 1728

export const MARGIN = 0.5 * PT_PER_IN;
export const TITLE_BLOCK_W = 3 * PT_PER_IN; // right-hand column

/** Pen weights in pt (0.13 / 0.25 / 0.35 / 0.5 mm equivalents). */
export const PEN = {
  fine: 0.37,
  thin: 0.71,
  medium: 0.99,
  heavy: 1.42,
} as const;

export const TEXT = {
  dim: 7,
  tag: 7,
  room: 10,
  roomArea: 7.5,
  note: 8,
  sectionTitle: 12,
  sheetTitle: 16,
} as const;

/** Drawing area (left of the title block, inside margins). */
export const DRAW_AREA = {
  x: MARGIN,
  y: MARGIN,
  w: PAGE_W - MARGIN * 2 - TITLE_BLOCK_W,
  h: PAGE_H - MARGIN * 2,
} as const;

/** Plan scales: paper pt per model inch. */
export const SCALE_3_16 = (PT_PER_IN * 3) / 16 / 12; // 1.125  (3/16" = 1'-0")
export const SCALE_1_8 = PT_PER_IN / 8 / 12; // 0.75   (1/8" = 1'-0")

export interface PlanTransform {
  s: number; // pt per model inch
  ox: number;
  oy: number;
  planH: number; // model bbox height, for y-flip
  scaleLabel: string;
}

/** Choose scale automatically to fit (§9), center plan in the drawing area. */
export function planTransform(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  dimMarginPt: number,
): PlanTransform {
  const w = maxX - minX;
  const h = maxY - minY;
  let s = SCALE_3_16;
  let label = `3/16" = 1'-0"`;
  if (w * s + dimMarginPt * 2 > DRAW_AREA.w || h * s + dimMarginPt * 2 > DRAW_AREA.h) {
    s = SCALE_1_8;
    label = `1/8" = 1'-0"`;
  }
  const ox = DRAW_AREA.x + (DRAW_AREA.w - w * s) / 2 - minX * s;
  const oy = DRAW_AREA.y + (DRAW_AREA.h - h * s) / 2;
  return { s, ox, oy, planH: h, scaleLabel: label };
}

/** Model point (y-down inches) → page point (y-up pt). */
export function toPage(t: PlanTransform, mx: number, my: number, minY: number): { x: number; y: number } {
  return { x: t.ox + mx * t.s, y: t.oy + (t.planH - (my - minY)) * t.s };
}
