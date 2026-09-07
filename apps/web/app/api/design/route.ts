import { NextResponse } from 'next/server';
import { design } from '@blueline/grammar';
import { renderLevelSvg, renderElevationSvg } from '@blueline/engine/render-svg2';
import { renderSheetSet2 } from '@blueline/engine/render-sheet2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { brief, seed? } → v2 design bundle.
 * Designer: Claude when ANTHROPIC_API_KEY is set (Law 1 — DesignProgram only),
 * else the deterministic fallback; always disclosed.
 */
export async function POST(req: Request) {
  let brief: string;
  let seed: number | undefined;
  try {
    const body = (await req.json()) as { brief?: string; seed?: number };
    brief = (body.brief ?? '').trim();
    seed = body.seed;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!brief || brief.length > 2000) {
    return NextResponse.json({ error: 'brief required (max 2000 chars)' }, { status: 400 });
  }
  try {
    const r = await design(brief, { seed });
    const sheets = await renderSheetSet2(r.model, r.findings, {
      issueDate: new Date().toISOString().slice(0, 10),
      watermark: true,
    });
    return NextResponse.json({
      designer: r.designer,
      reviseCycles: r.reviseCycles,
      program: r.program,
      findings: r.findings,
      model: r.model,
      plans: r.model.levels.map((l) => renderLevelSvg(r.model, l.index)),
      elevations: (['front', 'rear', 'left', 'right'] as const).map((v) => ({
        view: v,
        svg: renderElevationSvg(r.model, v),
      })),
      schedule: r.model.schedule,
      areas: r.model.areas,
      sheetIndex: sheets.sheetIndex,
      pdfBase64: Buffer.from(sheets.pdf).toString('base64'),
      dxf: sheets.dxf,
      manifest: sheets.manifest,
      modelHash: sheets.modelHash,
    });
  } catch (e) {
    return NextResponse.json({ error: `design failed: ${String(e).slice(0, 300)}` }, { status: 500 });
  }
}
