import { NextResponse } from 'next/server';
import { describeToDocuments } from '@blueline/engine/pipeline';
import { renderPlanSvg } from '@blueline/engine/render-svg';
import { conditionedArea, formatSquareFeet, squareFeet } from '@blueline/engine/model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { description } → complete document bundle.
 * Uses ANTHROPIC_API_KEY from the server environment when present (Law #1 —
 * the LLM only turns language into a ProgramSpec); otherwise the
 * deterministic fallback extractor, disclosed in the response.
 */
export async function POST(req: Request) {
  let description: string;
  try {
    const body = (await req.json()) as { description?: string };
    description = (body.description ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!description || description.length > 4000) {
    return NextResponse.json({ error: 'description required (max 4000 chars)' }, { status: 400 });
  }
  try {
    const bundle = await describeToDocuments(description, {
      projectTitle: 'Custom Home',
      issueDate: new Date().toISOString().slice(0, 10),
      watermark: true, // free preview tier (§15): watermarked until purchase
    });
    return NextResponse.json({
      extractor: bundle.extractor,
      assumed: bundle.assumed,
      spec: bundle.spec,
      seed: bundle.seed,
      conditioned: formatSquareFeet(conditionedArea(bundle.model)),
      targetSf: squareFeet(bundle.spec.targetConditionedArea),
      findings: bundle.findings.map((f) => ({ ruleId: f.ruleId, severity: f.severity, message: f.message })),
      svg: renderPlanSvg(bundle.model, { showGrid: false }),
      sheetIndex: bundle.sheets.sheetIndex,
      model: bundle.model, // handed to the editor for optional refinement
      pdfBase64: Buffer.from(bundle.sheets.pdf).toString('base64'),
      takeoffCsv: bundle.takeoffCsv,
    });
  } catch (e) {
    return NextResponse.json({ error: `generation failed: ${String(e).slice(0, 300)}` }, { status: 500 });
  }
}
