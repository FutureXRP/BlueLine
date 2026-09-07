/** Minimal deterministic DXF writer for HouseModel (v2). Standalone module
 * so browser bundles can import it without pulling pdf-lib. */
import type { HouseModel } from '../house/types.js';


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
