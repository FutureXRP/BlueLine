import { describe, expect, it } from 'vitest';
import { generateDxf } from '../src/render-dxf/index.js';
import { rect3bed } from '../src/fixtures/index.js';

describe('DXF writer', () => {
  const dxf = generateDxf(rect3bed());

  it('emits a structurally valid document', () => {
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true);
    expect(dxf.endsWith('0\nEOF')).toBe(true);
    expect(dxf).toContain('2\nENTITIES');
    expect(dxf).toContain('2\nLAYER');
    for (const layer of ['WALLS', 'OPENINGS', 'TEXT', 'DIMS', 'ROOF']) {
      expect(dxf).toContain(`8\n${layer}`);
    }
  });

  it('contains wall lines, door arcs, and room labels', () => {
    expect((dxf.match(/0\nLINE/g) ?? []).length).toBeGreaterThan(100);
    expect((dxf.match(/0\nARC/g) ?? []).length).toBeGreaterThan(5); // door swings
    expect(dxf).toContain('PRIMARY BEDROOM');
    expect(dxf).toContain('GARAGE');
  });

  it('exports dimensions as exploded geometry with feet-inch text', () => {
    expect(dxf).toContain(`60'-0"`); // overall width
    expect(dxf).toContain(`32'-0"`); // overall depth
    expect(dxf).not.toContain('\nDIMENSION\n'); // no associative dims by design
  });

  it('is deterministic', () => {
    expect(generateDxf(rect3bed())).toBe(dxf);
  });

  it('uses integer-inch coordinates from the model (y flipped only)', () => {
    // footprint corner (0,0) → (0, 384) after flip appears as a wall line coordinate
    expect(dxf).toContain('10\n0\n20\n384');
  });
});
