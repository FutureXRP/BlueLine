/**
 * Title block + border, identical on every sheet (§9). Carries the
 * NOT-SEALED notice (§3) on every page.
 */
import type { PDFFont, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { MARGIN, PAGE_H, PAGE_W, PEN, TEXT, TITLE_BLOCK_W } from './layout.js';

const BLACK = rgb(0, 0, 0);

export interface SheetMeta {
  sheetId: string; // "A-101"
  sheetName: string; // "FLOOR PLAN"
  projectTitle: string;
  issueDate: string; // supplied by caller — renderer stays deterministic
  scaleLabel: string;
  revision: string; // "A"
  ruleSetVersion: string;
}

export interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export function drawTitleBlock(page: PDFPage, fonts: Fonts, meta: SheetMeta): void {
  // double-rule border
  page.drawRectangle({
    x: MARGIN,
    y: MARGIN,
    width: PAGE_W - MARGIN * 2,
    height: PAGE_H - MARGIN * 2,
    borderColor: BLACK,
    borderWidth: PEN.heavy,
  });
  page.drawRectangle({
    x: MARGIN + 4,
    y: MARGIN + 4,
    width: PAGE_W - MARGIN * 2 - 8,
    height: PAGE_H - MARGIN * 2 - 8,
    borderColor: BLACK,
    borderWidth: PEN.fine,
  });

  const tbX = PAGE_W - MARGIN - TITLE_BLOCK_W;
  page.drawLine({
    start: { x: tbX, y: MARGIN + 4 },
    end: { x: tbX, y: PAGE_H - MARGIN - 4 },
    thickness: PEN.heavy,
    color: BLACK,
  });

  const cx = tbX + 14;
  let y = PAGE_H - MARGIN - 40;
  const line = (h: number) => {
    page.drawLine({
      start: { x: tbX, y },
      end: { x: PAGE_W - MARGIN - 4, y },
      thickness: PEN.fine,
      color: BLACK,
    });
    y -= h;
  };

  // brand
  page.drawText('BLUELINE', { x: cx, y, size: 22, font: fonts.bold, color: BLACK });
  y -= 16;
  page.drawText('CONSTRUCTION DOCUMENTS', { x: cx, y, size: 7, font: fonts.body, color: BLACK });
  y -= 14;
  line(24);

  // project
  page.drawText('PROJECT', { x: cx, y, size: 6.5, font: fonts.body, color: BLACK });
  y -= 13;
  page.drawText(meta.projectTitle.toUpperCase().slice(0, 30), {
    x: cx, y, size: 11, font: fonts.bold, color: BLACK,
  });
  y -= 16;
  line(22);

  const field = (label: string, value: string) => {
    page.drawText(label, { x: cx, y, size: 6.5, font: fonts.body, color: BLACK });
    y -= 12;
    page.drawText(value, { x: cx, y, size: 9, font: fonts.mono, color: BLACK });
    y -= 14;
    line(20);
  };
  field('ISSUE DATE', meta.issueDate);
  field('SCALE', meta.scaleLabel);
  field('REVISION', meta.revision);
  field('CODE BASIS', '2021 IRC (BASE PROVISIONS)');
  field('RULE TABLES', meta.ruleSetVersion);

  // notices — every sheet (§3)
  y -= 8;
  const notice = [
    'NOT AN ARCHITECT\'S OR ENGINEER\'S',
    'SEALED DOCUMENT.',
    '',
    'Designed to 2021 IRC base provisions.',
    'Local amendments govern. Buyer is',
    'responsible for jurisdiction review.',
  ];
  for (const t of notice) {
    page.drawText(t, { x: cx, y, size: 7, font: t.includes('SEALED') || t.includes('NOT AN') ? fonts.bold : fonts.body, color: BLACK });
    y -= 10;
  }

  // sheet identity — bottom of column
  const bandY = MARGIN + 90;
  page.drawLine({
    start: { x: tbX, y: bandY },
    end: { x: PAGE_W - MARGIN - 4, y: bandY },
    thickness: PEN.heavy,
    color: BLACK,
  });
  page.drawText(meta.sheetName.toUpperCase(), {
    x: cx, y: bandY - 22, size: 11, font: fonts.body, color: BLACK,
  });
  page.drawText(meta.sheetId, {
    x: cx, y: bandY - 62, size: 34, font: fonts.bold, color: BLACK,
  });
}

/** Diagonal preview watermark (free tier, §5 Stage 3). */
export function drawWatermark(page: PDFPage, fonts: Fonts): void {
  const text = 'PREVIEW — NOT FOR CONSTRUCTION';
  for (const [x, y] of [
    [PAGE_W * 0.12, PAGE_H * 0.2],
    [PAGE_W * 0.38, PAGE_H * 0.5],
    [PAGE_W * 0.12, PAGE_H * 0.75],
  ] as const) {
    page.drawText(text, {
      x,
      y,
      size: 52,
      font: fonts.bold,
      color: rgb(0.82, 0.82, 0.82),
      rotate: { type: 'degrees', angle: 18 } as never,
      opacity: 0.5,
    });
  }
}
