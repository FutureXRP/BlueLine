/**
 * v2 SVG renderers from HouseModel (Law 5: same model as sheets/3D). Used by
 * the web design view and the browser demo. Plans per level + elevations.
 */
import type { HouseModel, LevelModel, Opening, Wall } from '../house/types.js';
import { formatFraction } from '../house/types.js';
import { elevationRoofProfile, roofField, unionOutline } from '../house/roofgeom.js';
import { STYLE_TOKENS } from './tokens.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wallLen(w: Wall): number {
  return Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
}

export function renderLevelSvg(model: HouseModel, levelIndex: number, opts: { ink?: string; paper?: string } = {}): string {
  const ink = opts.ink ?? '#23272B';
  const paper = opts.paper ?? '#F7F5EF';
  const level = model.levels.find((l) => l.index === levelIndex)!;
  const rects = [...level.footprint, ...(levelIndex === 0 ? model.extras.map((e) => e.rect) : [])];
  const minX = Math.min(...rects.map((r) => r.x)) - 48;
  const minY = Math.min(...rects.map((r) => r.y)) - 48;
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + 48;
  const maxY = Math.max(...rects.map((r) => r.y + r.h)) + 48;
  // §6: plans are drawn with the FRONT (y=0) at the BOTTOM — geometry is
  // flipped in a group; text is emitted upright with mapped coordinates.
  const FY = (y: number) => minY + maxY - y;
  const texts: string[] = [];
  const s: string[] = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY + 30}" data-kind="blueline-v2-plan" style="background:${paper}">`);
  s.push(`<g transform="translate(0,${minY + maxY}) scale(1,-1)">`);

  // porches (level 0)
  if (levelIndex === 0) {
    for (const e of model.extras) {
      s.push(`<rect x="${e.rect.x}" y="${e.rect.y}" width="${e.rect.w}" height="${e.rect.h}" fill="${ink}" fill-opacity="0.05" stroke="${ink}" stroke-width="1.5" stroke-dasharray="10 6"/>`);
      texts.push(`<text x="${e.rect.x + e.rect.w / 2}" y="${FY(e.rect.y + e.rect.h / 2) + 4}" text-anchor="middle" font-size="12" fill="${ink}" fill-opacity="0.6">${esc(e.name.toUpperCase())}</text>`);
    }
  }

  // room labels
  for (const r of level.rooms) {
    const cx = r.rect.x + r.rect.w / 2;
    const cy = r.rect.y + r.rect.h / 2;
    texts.push(`<text x="${cx}" y="${FY(cy) - 2}" text-anchor="middle" font-size="13" letter-spacing="1" fill="${ink}">${esc(r.name.toUpperCase())}</text>`);
    texts.push(`<text x="${cx}" y="${FY(cy) + 14}" text-anchor="middle" font-size="10.5" fill="${ink}" fill-opacity="0.6">${Math.round((r.rect.w * r.rect.h) / 144)} SF</text>`);
  }

  // walls with opening breaks
  for (const w of level.walls) {
    const len = wallLen(w);
    const horizontal = w.y1 === w.y2;
    const gaps = level.openings
      .filter((o) => o.wallId === w.id)
      .map((o) => ({ a: o.offset - o.width / 2, b: o.offset + o.width / 2 }))
      .sort((p, q) => p.a - q.a);
    const segs: Array<{ a: number; b: number }> = [];
    let cur = 0;
    for (const g of gaps) {
      if (g.a > cur) segs.push({ a: cur, b: g.a });
      cur = Math.max(cur, g.b);
    }
    if (cur < len) segs.push({ a: cur, b: len });
    for (const seg of segs) {
      const t = w.thickness;
      if (horizontal) s.push(`<rect x="${w.x1 + seg.a}" y="${w.y1 - t / 2}" width="${seg.b - seg.a}" height="${t}" fill="${ink}"/>`);
      else s.push(`<rect x="${w.x1 - t / 2}" y="${w.y1 + seg.a}" width="${t}" height="${seg.b - seg.a}" fill="${ink}"/>`);
    }
    for (const o of level.openings.filter((o) => o.wallId === w.id)) {
      s.push(openingSvg(w, o, ink));
    }
  }

  // stair treads
  if (model.stair && (model.stair.levelFrom === levelIndex || model.stair.levelTo === levelIndex)) {
    const st = model.stair;
    const o = st.opening;
    const along = st.direction === 'front' || st.direction === 'rear';
    const treads = st.riserCount - 1;
    for (let i = 1; i <= treads; i++) {
      const d = i * st.treadDepthIn;
      if (along) {
        if (d < o.h) s.push(`<line x1="${o.x + 2}" y1="${o.y + d}" x2="${o.x + o.w - 2}" y2="${o.y + d}" stroke="${ink}" stroke-width="0.8"/>`);
      } else if (d < o.w) {
        s.push(`<line x1="${o.x + d}" y1="${o.y + 2}" x2="${o.x + d}" y2="${o.y + o.h - 2}" stroke="${ink}" stroke-width="0.8"/>`);
      }
    }
    texts.push(`<text x="${o.x + o.w / 2}" y="${FY(o.y + o.h) + 12}" text-anchor="middle" font-size="8" fill="${ink}">${st.riserCount}R @ ${esc(formatFraction(st.riserHeight))}</text>`);
  }

  s.push('</g>');
  s.push(...texts);
  s.push(`<text x="${(minX + maxX) / 2}" y="${maxY + 18}" text-anchor="middle" font-size="11" letter-spacing="3" fill="${ink}" fill-opacity="0.55">FRONT</text>`);
  s.push('</svg>');
  return s.join('');
}

function openingSvg(w: Wall, o: Opening, ink: string): string {
  const horizontal = w.y1 === w.y2;
  const t = w.thickness;
  const cx = horizontal ? w.x1 + o.offset : w.x1;
  const cy = horizontal ? w.y1 : w.y1 + o.offset;
  const a = o.width / 2;
  const out: string[] = [];
  if (o.type === 'window') {
    if (horizontal) {
      out.push(`<rect x="${cx - a}" y="${cy - t / 2}" width="${o.width}" height="${t}" fill="none" stroke="${ink}" stroke-width="1.2"/>`);
      out.push(`<line x1="${cx - a}" y1="${cy}" x2="${cx + a}" y2="${cy}" stroke="${ink}" stroke-width="0.8"/>`);
    } else {
      out.push(`<rect x="${cx - t / 2}" y="${cy - a}" width="${t}" height="${o.width}" fill="none" stroke="${ink}" stroke-width="1.2"/>`);
      out.push(`<line x1="${cx}" y1="${cy - a}" x2="${cx}" y2="${cy + a}" stroke="${ink}" stroke-width="0.8"/>`);
    }
  } else if (o.type === 'garageDoor' || o.type === 'slider' || o.type === 'cased') {
    const dash = o.type === 'cased' ? '12 8' : '8 5';
    if (horizontal) out.push(`<line x1="${cx - a}" y1="${cy}" x2="${cx + a}" y2="${cy}" stroke="${ink}" stroke-width="1.2" stroke-dasharray="${dash}"/>`);
    else out.push(`<line x1="${cx}" y1="${cy - a}" x2="${cx}" y2="${cy + a}" stroke="${ink}" stroke-width="1.2" stroke-dasharray="${dash}"/>`);
  } else {
    // door leaf + quarter arc
    if (horizontal) {
      out.push(`<line x1="${cx - a}" y1="${cy}" x2="${cx - a}" y2="${cy + o.width}" stroke="${ink}" stroke-width="1.2"/>`);
      out.push(`<path d="M ${cx + a} ${cy} A ${o.width} ${o.width} 0 0 1 ${cx - a} ${cy + o.width}" fill="none" stroke="${ink}" stroke-width="0.7"/>`);
    } else {
      out.push(`<line x1="${cx}" y1="${cy - a}" x2="${cx + o.width}" y2="${cy - a}" stroke="${ink}" stroke-width="1.2"/>`);
      out.push(`<path d="M ${cx} ${cy + a} A ${o.width} ${o.width} 0 0 1 ${cx + o.width} ${cy - a}" fill="none" stroke="${ink}" stroke-width="0.7"/>`);
    }
  }
  return out.join('');
}

/** Elevation as SVG: wall band per level, openings, roof profile. */
export function renderElevationSvg(model: HouseModel, view: 'front' | 'rear' | 'left' | 'right', opts: { ink?: string; paper?: string; gableSides?: Array<'front' | 'rear' | 'left' | 'right'> } = {}): string {
  const ink = opts.ink ?? '#23272B';
  const paper = opts.paper ?? '#F7F5EF';
  const tokens = STYLE_TOKENS[model.spec.style] ?? STYLE_TOKENS['modern_farmhouse']!;
  const gables = opts.gableSides ?? tokens.gableSides;
  const horizontal = view === 'front' || view === 'rear';

  // level elevations (z up in inches)
  const l1 = model.levels[0]!;
  const zPlate1 = l1.floorToCeilingIn;
  const zFloor2 = model.spec.floorToFloorIn;
  const l2 = model.levels[1];
  const zPlate2 = l2 ? zFloor2 + l2.floorToCeilingIn : zPlate1;

  const field = roofField(l1.footprint, model.roof, gables);
  const upperField = l2 ? roofField(l2.footprint, model.roof, gables) : null;
  const prof = elevationRoofProfile(field, view);
  const prof2 = upperField ? elevationRoofProfile(upperField, view) : null;

  const b = field.bounds;
  const a0 = horizontal ? b.minX : b.minY;
  const a1 = horizontal ? b.maxX : b.maxY;
  const maxRoof = Math.max(...prof.map((p) => p.height + zPlate1), ...(prof2 ?? []).map((p) => p.height + zPlate2));
  const H = maxRoof + 36;
  const flip = view === 'rear' || view === 'left';
  const A = (v: number) => (flip ? a1 - v : v - a0);

  const s: string[] = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-24} ${-24} ${a1 - a0 + 48} ${H + 48}" data-kind="blueline-v2-elevation" style="background:${paper}">`);
  const Y = (z: number) => H - z - 24;

  // grade line
  s.push(`<line x1="${A(a0)}" y1="${Y(0)}" x2="${A(a1)}" y2="${Y(0)}" stroke="${ink}" stroke-width="2.5"/>`);

  // level wall bands: outline extents of each level's footprint along the view
  const bandsFor = (level: LevelModel, z0: number, z1: number) => {
    const edges = unionOutline(level.footprint).filter((e) => e.out === view);
    for (const e of edges) {
      const p0 = horizontal ? Math.min(e.a.x, e.b.x) : Math.min(e.a.y, e.b.y);
      const p1 = horizontal ? Math.max(e.a.x, e.b.x) : Math.max(e.a.y, e.b.y);
      const xa = Math.min(A(p0), A(p1));
      const xb = Math.max(A(p0), A(p1));
      s.push(`<rect x="${xa}" y="${Y(z1)}" width="${xb - xa}" height="${z1 - z0}" fill="${tokens.siding}" stroke="${ink}" stroke-width="1.5"/>`);
    }
  };
  // closed roof silhouette: profile down to the plate line at both ends
  const drawProfile = (profile: Array<{ along: number; height: number }>, zBase: number) => {
    const live = profile.filter((p) => p.height >= 0);
    if (!live.length) return;
    const first = live[0]!;
    const last = live[live.length - 1]!;
    const pts = [
      `${A(first.along)},${Y(zBase)}`,
      ...live.map((p) => `${A(p.along)},${Y(p.height + zBase)}`),
      `${A(last.along)},${Y(zBase)}`,
    ].join(' ');
    s.push(`<polygon points="${pts}" fill="${tokens.roof}" fill-opacity="0.95" stroke="${ink}" stroke-width="1.5"/>`);
  };

  // layered massing: L1 walls → L1 roof → L2 walls (occludes) → L2 roof
  bandsFor(l1, 0, zPlate1);
  drawProfile(prof, zPlate1);
  if (l2) bandsFor(l2, zFloor2, zPlate2);
  if (prof2 && l2) drawProfile(prof2, zPlate2);

  // openings on exterior walls facing this view
  const drawOpenings = (level: LevelModel, zFloor: number) => {
    for (const o of level.openings) {
      const w = level.walls.find((x) => x.id === o.wallId);
      if (!w || !w.exterior) continue;
      const room = level.rooms.find((r) => w.roomIds.includes(r.id));
      if (!room) continue;
      const wallSide =
        w.y1 === w.y2
          ? (w.y1 === Math.min(...level.footprint.map((r) => r.y)) ? 'front' : w.y1 === Math.max(...level.footprint.map((r) => r.y + r.h)) ? 'rear' : null)
          : w.x1 === Math.min(...level.footprint.map((r) => r.x)) ? 'left' : w.x1 === Math.max(...level.footprint.map((r) => r.x + r.w)) ? 'right' : null;
      if (wallSide !== view) continue;
      const along = (w.y1 === w.y2 ? w.x1 : w.y1) + o.offset;
      const x0 = Math.min(A(along - o.width / 2), A(along + o.width / 2));
      const z0 = zFloor + o.sill;
      s.push(`<rect x="${x0}" y="${Y(z0 + o.height)}" width="${o.width}" height="${o.height}" fill="${paper}" stroke="${ink}" stroke-width="1.3"/>`);
      if (o.type === 'window') {
        s.push(`<line x1="${x0}" y1="${Y(z0 + o.height / 2)}" x2="${x0 + o.width}" y2="${Y(z0 + o.height / 2)}" stroke="${ink}" stroke-width="0.7"/>`);
        s.push(`<line x1="${x0 + o.width / 2}" y1="${Y(z0)}" x2="${x0 + o.width / 2}" y2="${Y(z0 + o.height)}" stroke="${ink}" stroke-width="0.7"/>`);
      }
      if (o.type === 'garageDoor') {
        for (let gz = 12; gz < o.height; gz += 18) {
          s.push(`<line x1="${x0}" y1="${Y(z0 + gz)}" x2="${x0 + o.width}" y2="${Y(z0 + gz)}" stroke="${ink}" stroke-width="0.6"/>`);
        }
      }
    }
  };
  drawOpenings(l1, 0);
  if (l2) drawOpenings(l2, zFloor2);

  s.push('</svg>');
  return s.join('');
}
