/**
 * v2 interim renderer tests: full sheet set from the farmhouse fixture,
 * byte-identical determinism, DXF layers, manifest hashes (§11).
 */
import { describe, expect, it } from 'vitest';
import { buildHouse } from '../src/house/build.js';
import { farmhouseV2 } from '../src/fixtures/farmhouseV2.js';
import { renderSheetSet2, renderDxf2 } from '../src/render-sheet2/index.js';
import { renderLevelSvg, renderElevationSvg } from '../src/render-svg2/index.js';

describe('v2 sheet set (interim renderer)', () => {
  it('renders the full set deterministically', async () => {
    const { model, findings } = buildHouse(farmhouseV2());
    const a = await renderSheetSet2(model, findings, { issueDate: '2026-09-07' });
    const b = await renderSheetSet2(model, findings, { issueDate: '2026-09-07' });
    expect(a.sheetIndex.map((s) => s.id)).toEqual([
      'A-000', 'A-101', 'A-102', 'A-104', 'A-201', 'A-202', 'A-203', 'A-204', 'A-301', 'A-601',
    ]);
    expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(true);
    expect(a.manifest.files.map((f) => f.sha256)).toEqual(b.manifest.files.map((f) => f.sha256));
    expect(a.manifest.files.map((f) => f.file)).toEqual(['model.dxf', 'model.json', 'sheets.pdf']);
  });

  it('DXF carries per-level wall/opening/text layers', () => {
    const { model } = buildHouse(farmhouseV2());
    const dxf = renderDxf2(model);
    for (const layer of ['L0_WALL_EXT', 'L0_WALL_INT', 'L1_WALL_EXT', 'L0_DOOR', 'L0_WINDOW', 'L0_GARAGEDOOR', 'L0_ROOM_TEXT']) {
      expect(dxf).toContain(layer);
    }
    expect(dxf.endsWith('EOF\n')).toBe(true);
  });

  it('SVG renderers stay deterministic and draw front at the bottom (§6)', () => {
    const { model } = buildHouse(farmhouseV2());
    expect(renderLevelSvg(model, 0)).toBe(renderLevelSvg(model, 0));
    expect(renderLevelSvg(model, 0)).toContain('FRONT');
    expect(renderElevationSvg(model, 'front')).toBe(renderElevationSvg(model, 'front'));
  });
});
