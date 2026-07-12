/**
 * First-milestone demo (§17 step 5): fixture model → real dimensioned
 * floor-plan PDF. Writes test-output/rect3bed.pdf.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { rect3bed } from '../src/fixtures/index.js';
import { renderSheetSet } from '../src/render-sheet/index.js';

const model = rect3bed();
const result = await renderSheetSet(model, {
  projectTitle: 'Rect 3-Bed Fixture',
  issueDate: '2026-07-12',
  watermark: process.argv.includes('--watermark'),
});

mkdirSync('test-output', { recursive: true });
writeFileSync('test-output/rect3bed.pdf', result.pdf);
console.log(`Wrote test-output/rect3bed.pdf (${result.pdf.length} bytes)`);
console.log(`Sheets: ${result.sheetIndex.map((s) => s.id).join(', ')}`);
console.log(`Geometry hash: ${result.geometryHash}`);
