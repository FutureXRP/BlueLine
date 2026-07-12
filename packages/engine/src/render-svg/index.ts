/**
 * Editor SVG renderer (Law #4: same geometry model as the sheet renderer —
 * this is the browser view of it). Pure function: model → SVG string with
 * data-id attributes for editor hit-testing. No Tailwind, no external CSS on
 * the drawing surface (§4) — colors come in via options (design tokens).
 */
import type { Finding, Model, Opening, Wall } from '../model/types.js';
import {
  bbox,
  pointOnWall,
  roomArea,
  wallLength,
} from '../model/geometry.js';
import { formatSquareFeet } from '../model/format.js';

export interface SvgOptions {
  /** Design tokens (§14). */
  ink?: string; // linework
  accent?: string; // selection
  redline?: string; // hard findings
  amber?: string; // warnings
  paper?: string;
  selectedId?: string | null;
  /** IDs of geometry referenced by findings, mapped to worst severity. */
  findings?: Finding[];
  /** Ghost model drawn semi-transparent in redline (invalid move preview). */
  showGrid?: boolean;
  margin?: number; // model inches around plan
}

const DEF: Required<Pick<SvgOptions, 'ink' | 'accent' | 'redline' | 'amber' | 'paper'>> = {
  ink: '#23272B',
  accent: '#1D4ED8',
  redline: '#C2321E',
  amber: '#B8860B',
  paper: '#F7F5EF',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function severityColor(sev: 'hard' | 'warn' | 'engineer', o: typeof DEF): string {
  return sev === 'warn' ? o.amber : o.redline;
}

export function renderPlanSvg(model: Model, opts: SvgOptions = {}): string {
  const o = { ...DEF, ...opts };
  const margin = opts.margin ?? 60;
  const box = bbox(model.footprint);
  const vb = `${box.minX - margin} ${box.minY - margin} ${box.maxX - box.minX + margin * 2} ${box.maxY - box.minY + margin * 2}`;

  const flagged = new Map<string, 'hard' | 'warn' | 'engineer'>();
  for (const f of opts.findings ?? []) {
    for (const idv of [...(f.refs.roomIds ?? []), ...(f.refs.wallIds ?? []), ...(f.refs.openingIds ?? [])]) {
      const prev = flagged.get(idv);
      if (!prev || (prev !== 'hard' && f.severity === 'hard')) flagged.set(idv, f.severity);
    }
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" data-kind="blueline-plan" style="background:${o.paper}">`,
  );

  if (opts.showGrid) {
    parts.push(`<g data-layer="grid" stroke="${o.ink}" stroke-opacity="0.07" stroke-width="1">`);
    for (let x = box.minX; x <= box.maxX; x += 24) {
      parts.push(`<line x1="${x}" y1="${box.minY}" x2="${x}" y2="${box.maxY}"/>`);
    }
    for (let y = box.minY; y <= box.maxY; y += 24) {
      parts.push(`<line x1="${box.minX}" y1="${y}" x2="${box.maxX}" y2="${y}"/>`);
    }
    parts.push('</g>');
  }

  // rooms (fill for hit-testing + finding highlight)
  parts.push(`<g data-layer="rooms">`);
  for (const r of model.rooms) {
    const flag = flagged.get(r.id);
    const sel = opts.selectedId === r.id;
    const fill = flag ? severityColor(flag, o) : sel ? o.accent : o.ink;
    const fillOp = flag ? 0.14 : sel ? 0.08 : 0.001; // near-zero keeps rooms clickable
    parts.push(
      `<rect data-id="${r.id}" data-type="room" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" fill-opacity="${fillOp}"/>`,
    );
    parts.push(
      `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - 4}" text-anchor="middle" font-size="13" letter-spacing="1.5" fill="${o.ink}" style="pointer-events:none">${esc(r.name.toUpperCase())}</text>`,
    );
    parts.push(
      `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 14}" text-anchor="middle" font-size="11" fill="${o.ink}" fill-opacity="0.65" style="pointer-events:none">${esc(formatSquareFeet(roomArea(r)))}</text>`,
    );
  }
  parts.push('</g>');

  // walls
  parts.push(`<g data-layer="walls" stroke-linecap="butt">`);
  for (const w of model.walls) {
    parts.push(renderWall(model, w, o, opts.selectedId ?? null, flagged.get(w.id)));
  }
  parts.push('</g>');

  // openings
  parts.push(`<g data-layer="openings">`);
  for (const op of model.openings) {
    const w = model.walls.find((x) => x.id === op.wallId);
    if (w) parts.push(renderOpening(w, op, o, opts.selectedId ?? null, flagged.get(op.id)));
  }
  parts.push('</g>');

  // fixtures (simple glyphs)
  parts.push(`<g data-layer="fixtures" stroke="${o.ink}" stroke-width="1" fill="none" stroke-opacity="0.55">`);
  for (const f of model.fixtures) {
    if (f.type === 'smokeAlarm' || f.type === 'coAlarm') {
      parts.push(`<circle cx="${f.x}" cy="${f.y}" r="6" />`);
    } else {
      parts.push(`<rect x="${f.x - 10}" y="${f.y - 6}" width="20" height="12"/>`);
    }
  }
  parts.push('</g>');

  parts.push('</svg>');
  return parts.join('');
}

function renderWall(
  model: Model,
  w: Wall,
  o: typeof DEF,
  selectedId: string | null,
  flag?: 'hard' | 'warn' | 'engineer',
): string {
  const len = wallLength(w);
  if (len === 0) return '';
  const horizontal = w.y1 === w.y2;
  const half = w.thickness / 2;
  const color = flag ? severityColor(flag, o) : selectedId === w.id ? o.accent : o.ink;
  // wall body as one rect per solid segment (openings punched out)
  const gaps = model.openings
    .filter((op) => op.wallId === w.id)
    .map((op) => ({ a: op.offset - op.width / 2, b: op.offset + op.width / 2 }))
    .sort((p, q) => p.a - q.a);
  const segs: Array<{ a: number; b: number }> = [];
  let cur = 0;
  for (const g of gaps) {
    if (g.a > cur) segs.push({ a: cur, b: g.a });
    cur = Math.max(cur, g.b);
  }
  if (cur < len) segs.push({ a: cur, b: len });
  const out: string[] = [`<g data-id="${w.id}" data-type="wall" data-kind="${w.kind}">`];
  // invisible fat hit area
  out.push(
    horizontal
      ? `<line x1="${Math.min(w.x1, w.x2)}" y1="${w.y1}" x2="${Math.max(w.x1, w.x2)}" y2="${w.y1}" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(14, w.thickness + 8)}"/>`
      : `<line x1="${w.x1}" y1="${Math.min(w.y1, w.y2)}" x2="${w.x1}" y2="${Math.max(w.y1, w.y2)}" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(14, w.thickness + 8)}"/>`,
  );
  const x0 = Math.min(w.x1, w.x2);
  const y0 = Math.min(w.y1, w.y2);
  for (const s of segs) {
    if (horizontal) {
      out.push(
        `<rect x="${x0 + s.a}" y="${w.y1 - half}" width="${s.b - s.a}" height="${w.thickness}" fill="${color}"/>`,
      );
    } else {
      out.push(
        `<rect x="${w.x1 - half}" y="${y0 + s.a}" width="${w.thickness}" height="${s.b - s.a}" fill="${color}"/>`,
      );
    }
  }
  out.push('</g>');
  return out.join('');
}

function renderOpening(
  w: Wall,
  op: Opening,
  o: typeof DEF,
  selectedId: string | null,
  flag?: 'hard' | 'warn' | 'engineer',
): string {
  const horizontal = w.y1 === w.y2;
  const half = w.thickness / 2;
  const color = flag ? severityColor(flag, o) : selectedId === op.id ? o.accent : o.ink;
  const c = pointOnWall(w, op.offset);
  const a = op.width / 2;
  const out: string[] = [`<g data-id="${op.id}" data-type="opening" stroke="${color}" fill="none">`];
  if (op.type === 'window') {
    if (horizontal) {
      out.push(`<rect x="${c.x - a}" y="${c.y - half}" width="${op.width}" height="${w.thickness}" stroke-width="1.5"/>`);
      out.push(`<line x1="${c.x - a}" y1="${c.y}" x2="${c.x + a}" y2="${c.y}" stroke-width="1"/>`);
    } else {
      out.push(`<rect x="${c.x - half}" y="${c.y - a}" width="${w.thickness}" height="${op.width}" stroke-width="1.5"/>`);
      out.push(`<line x1="${c.x}" y1="${c.y - a}" x2="${c.x}" y2="${c.y + a}" stroke-width="1"/>`);
    }
  } else if (op.type === 'garageDoor') {
    if (horizontal) {
      out.push(`<line x1="${c.x - a}" y1="${c.y}" x2="${c.x + a}" y2="${c.y}" stroke-width="1.5" stroke-dasharray="10 6"/>`);
    } else {
      out.push(`<line x1="${c.x}" y1="${c.y - a}" x2="${c.x}" y2="${c.y + a}" stroke-width="1.5" stroke-dasharray="10 6"/>`);
    }
  } else if (op.type === 'opening') {
    if (horizontal) {
      out.push(`<line x1="${c.x - a}" y1="${c.y}" x2="${c.x + a}" y2="${c.y}" stroke-width="1" stroke-dasharray="14 8"/>`);
    } else {
      out.push(`<line x1="${c.x}" y1="${c.y - a}" x2="${c.x}" y2="${c.y + a}" stroke-width="1" stroke-dasharray="14 8"/>`);
    }
  } else {
    // door: leaf + arc, drawn on +normal side (editor stylization)
    const sign = 1;
    if (horizontal) {
      const hx = c.x - a;
      out.push(`<line x1="${hx}" y1="${c.y}" x2="${hx}" y2="${c.y + sign * op.width}" stroke-width="1.5"/>`);
      out.push(`<path d="M ${hx + op.width} ${c.y} A ${op.width} ${op.width} 0 0 1 ${hx} ${c.y + sign * op.width}" stroke-width="1"/>`);
    } else {
      const hy = c.y - a;
      out.push(`<line x1="${c.x}" y1="${hy}" x2="${c.x + sign * op.width}" y2="${hy}" stroke-width="1.5"/>`);
      out.push(`<path d="M ${c.x} ${hy + op.width} A ${op.width} ${op.width} 0 0 1 ${c.x + sign * op.width} ${hy}" stroke-width="1"/>`);
    }
    // hit area
    if (horizontal) {
      out.push(`<rect x="${c.x - a}" y="${c.y - half - 4}" width="${op.width}" height="${w.thickness + 8}" fill="#000" fill-opacity="0"/>`);
    } else {
      out.push(`<rect x="${c.x - half - 4}" y="${c.y - a}" width="${w.thickness + 8}" height="${op.width}" fill="#000" fill-opacity="0"/>`);
    }
  }
  out.push('</g>');
  return out.join('');
}
