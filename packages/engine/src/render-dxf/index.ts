/**
 * Minimal in-house DXF writer (Build Bible §4): LINE, CIRCLE, ARC, TEXT on
 * named layers, R12-flavor ASCII. Dimensions are exported as exploded
 * geometry (lines + ticks + text) — no associative dimensions by design.
 *
 * Coordinates: model integer inches, y flipped (DXF is y-up).
 * Deterministic: same model → byte-identical string.
 */
import type { Model } from '../model/types.js';
import { bbox, pointOnWall, roomArea, wallLength } from '../model/geometry.js';
import { formatFeetInches, formatSquareFeet } from '../model/format.js';
import { exteriorDimStrings, pruneDimStrings } from '../dims/index.js';
import { roofSkeleton } from '../roof/index.js';

const LAYERS = ['WALLS', 'OPENINGS', 'FIXTURES', 'TEXT', 'DIMS', 'ROOF'] as const;
type Layer = (typeof LAYERS)[number];

class Dxf {
  private ents: string[] = [];
  private flipY: number;

  constructor(maxY: number) {
    this.flipY = maxY;
  }

  private y(v: number): number {
    return this.flipY - v;
  }

  line(layer: Layer, x1: number, y1: number, x2: number, y2: number): void {
    this.ents.push(
      `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${this.y(y1)}\n30\n0\n11\n${x2}\n21\n${this.y(y2)}\n31\n0`,
    );
  }

  circle(layer: Layer, cx: number, cy: number, r: number): void {
    this.ents.push(`0\nCIRCLE\n8\n${layer}\n10\n${cx}\n20\n${this.y(cy)}\n30\n0\n40\n${r}`);
  }

  /** Angles in degrees, model-space CCW after the y-flip. */
  arc(layer: Layer, cx: number, cy: number, r: number, a1: number, a2: number): void {
    this.ents.push(
      `0\nARC\n8\n${layer}\n10\n${cx}\n20\n${this.y(cy)}\n30\n0\n40\n${r}\n50\n${a1}\n51\n${a2}`,
    );
  }

  text(layer: Layer, x: number, y: number, h: number, value: string, rotation = 0): void {
    this.ents.push(
      `0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${this.y(y)}\n30\n0\n40\n${h}\n1\n${value}\n50\n${rotation}`,
    );
  }

  toString(): string {
    const header = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC'];
    const tables = [
      '0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length),
      ...LAYERS.flatMap((l) => ['0', 'LAYER', '2', l, '70', '0', '62', '7', '6', 'CONTINUOUS']),
      '0', 'ENDTAB', '0', 'ENDSEC',
    ];
    return [
      ...header,
      ...tables,
      '0', 'SECTION', '2', 'ENTITIES',
      ...this.ents.flatMap((e) => e.split('\n')),
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');
  }
}

export function generateDxf(model: Model): string {
  const box = bbox(model.footprint);
  const d = new Dxf(box.maxY);

  // walls: double lines with openings punched out, caps at segment ends
  for (const w of model.walls) {
    const len = wallLength(w);
    if (len === 0) continue;
    const horizontal = w.y1 === w.y2;
    const ux = horizontal ? Math.sign(w.x2 - w.x1) : 0;
    const uy = horizontal ? 0 : Math.sign(w.y2 - w.y1);
    const nx = -uy;
    const ny = ux;
    const half = w.thickness / 2;
    const gaps = model.openings
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
    for (const s of segs) {
      const ax = w.x1 + ux * s.a;
      const ay = w.y1 + uy * s.a;
      const bx = w.x1 + ux * s.b;
      const by = w.y1 + uy * s.b;
      d.line('WALLS', ax + nx * half, ay + ny * half, bx + nx * half, by + ny * half);
      d.line('WALLS', ax - nx * half, ay - ny * half, bx - nx * half, by - ny * half);
      d.line('WALLS', ax + nx * half, ay + ny * half, ax - nx * half, ay - ny * half);
      d.line('WALLS', bx + nx * half, by + ny * half, bx - nx * half, by - ny * half);
    }
    // openings
    for (const o of model.openings.filter((o) => o.wallId === w.id)) {
      const c = pointOnWall(w, o.offset);
      const a = o.width / 2;
      const jx = (t: number) => c.x + ux * t;
      const jy = (t: number) => c.y + uy * t;
      // jambs
      d.line('OPENINGS', jx(-a) + nx * half, jy(-a) + ny * half, jx(-a) - nx * half, jy(-a) - ny * half);
      d.line('OPENINGS', jx(a) + nx * half, jy(a) + ny * half, jx(a) - nx * half, jy(a) - ny * half);
      if (o.type === 'window') {
        for (const t of [-half * 0.6, 0, half * 0.6]) {
          d.line('OPENINGS', jx(-a) + nx * t, jy(-a) + ny * t, jx(a) + nx * t, jy(a) + ny * t);
        }
      } else if (o.type === 'garageDoor' || o.type === 'opening') {
        d.line('OPENINGS', jx(-a), jy(-a), jx(a), jy(a));
      } else {
        // door: leaf + quarter-circle swing arc (exploded)
        const hinge = { x: jx(-a), y: jy(-a) };
        const leafEnd = { x: hinge.x + nx * o.width, y: hinge.y + ny * o.width };
        d.line('OPENINGS', hinge.x, hinge.y, leafEnd.x, leafEnd.y);
        const startDeg = horizontal ? 0 : 270; // in flipped space, cosmetic
        d.arc('OPENINGS', hinge.x, hinge.y, o.width, startDeg, startDeg + 90);
      }
    }
  }

  // room labels
  for (const r of model.rooms) {
    d.text('TEXT', r.x + r.w / 2 - r.name.length * 3, r.y + r.h / 2 - 3, 8, r.name.toUpperCase());
    d.text('TEXT', r.x + r.w / 2 - 12, r.y + r.h / 2 + 10, 6, formatSquareFeet(roomArea(r)));
  }

  // fixtures as simple rectangles / circles
  for (const f of model.fixtures) {
    if (f.type === 'smokeAlarm' || f.type === 'coAlarm') {
      d.circle('FIXTURES', f.x, f.y, 6);
    } else {
      d.line('FIXTURES', f.x - 10, f.y - 6, f.x + 10, f.y - 6);
      d.line('FIXTURES', f.x + 10, f.y - 6, f.x + 10, f.y + 6);
      d.line('FIXTURES', f.x + 10, f.y + 6, f.x - 10, f.y + 6);
      d.line('FIXTURES', f.x - 10, f.y + 6, f.x - 10, f.y - 6);
    }
  }

  // exploded exterior dimension strings (§9: overall → segment → opening)
  const TIER_OFF: Record<number, number> = { 1: 24, 2: 44, 3: 64 };
  for (const s of pruneDimStrings(exteriorDimStrings(model))) {
    const off = TIER_OFF[s.tier]!;
    const horizontal = s.side === 'N' || s.side === 'S';
    const base =
      s.side === 'N' ? box.minY - off
      : s.side === 'S' ? box.maxY + off
      : s.side === 'W' ? box.minX - off
      : box.maxX + off;
    const t0 = s.ticks[0]!;
    const tn = s.ticks[s.ticks.length - 1]!;
    if (horizontal) d.line('DIMS', t0, base, tn, base);
    else d.line('DIMS', base, t0, base, tn);
    for (let i = 0; i < s.ticks.length; i++) {
      const t = s.ticks[i]!;
      if (horizontal) d.line('DIMS', t - 2, base + 2, t + 2, base - 2);
      else d.line('DIMS', base - 2, t - 2, base + 2, t + 2);
      if (i > 0) {
        const label = formatFeetInches(t - s.ticks[i - 1]!);
        const mid = (t + s.ticks[i - 1]!) / 2;
        if (horizontal) d.text('DIMS', mid - label.length * 2, base - 3, 6, label);
        else d.text('DIMS', base - 3, mid + label.length * 2, 6, label, 90);
      }
    }
  }

  // roof skeleton on its own layer
  for (const a of roofSkeleton(model.footprint, model.roof).arcs) {
    d.line('ROOF', a.a.x, a.a.y, a.b.x, a.b.y);
  }

  return d.toString();
}
