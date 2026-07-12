/**
 * CLI: tell it what you want, get finished blueprints + takeoff.
 *
 *   pnpm --filter @blueline/engine blueprint "1800 sq ft, 3 bed 2 bath, \
 *     2-car garage, hip roof, open kitchen with island, office"
 *
 * Uses the Claude API when ANTHROPIC_API_KEY is set; otherwise the
 * deterministic fallback parser (noted in the output).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { describeToDocuments } from '../src/pipeline/index.js';
import { formatSquareFeet } from '../src/model/format.js';
import { conditionedArea } from '../src/model/geometry.js';

const description = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
if (!description) {
  console.error('usage: pnpm blueprint "<describe your home>"');
  process.exit(1);
}

const issueDate = new Date().toISOString().slice(0, 10);
const bundle = await describeToDocuments(description, {
  projectTitle: 'Custom Home',
  issueDate,
  watermark: process.argv.includes('--watermark'),
});

mkdirSync('test-output', { recursive: true });
writeFileSync('test-output/blueprint.pdf', bundle.sheets.pdf);
writeFileSync('test-output/blueprint.dxf', bundle.dxf);
writeFileSync('test-output/blueprint-takeoff.csv', bundle.takeoffCsv);

console.log(`Extractor: ${bundle.extractor}${bundle.extractor === 'deterministic' ? ' (set ANTHROPIC_API_KEY for full language understanding)' : ''}`);
if (bundle.assumed.length) console.log(`Assumed defaults for: ${bundle.assumed.join(', ')}`);
console.log(`Spec: ${bundle.spec.bedrooms} bed / ${bundle.spec.fullBaths} bath, target ${formatSquareFeet(bundle.spec.targetConditionedArea)}, garage ${bundle.spec.garage.bays} bay, ${bundle.spec.roof.style} ${bundle.spec.roof.pitch}:12, ${bundle.spec.foundation}`);
console.log(`Chosen candidate: seed ${bundle.seed} of [${bundle.candidateSeeds.join(', ')}] — ${formatSquareFeet(conditionedArea(bundle.model))} conditioned`);
console.log(`Findings: ${bundle.findings.length} (${bundle.findings.filter((f) => f.severity === 'engineer').length} engineer flags)`);
console.log(`Geometry hash: ${bundle.sheets.geometryHash}`);
console.log('Wrote test-output/blueprint.pdf, blueprint.dxf, blueprint-takeoff.csv');
