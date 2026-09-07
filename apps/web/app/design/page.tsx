'use client';

/**
 * v2 design view (bible §10.1 /design): brief → designer → grammar →
 * validated model → plans, elevations, 3D, findings, schedule, downloads.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';

const Viewer3D = dynamic(() => import('../../components/Viewer3D'), { ssr: false });

interface DesignResponse {
  designer: 'claude' | 'deterministic';
  reviseCycles: number;
  program: { name: string; plan_type: string; style: string; intent: string };
  findings: Array<{ severity: string; code: string; message: string }>;
  model: never;
  plans: string[];
  elevations: Array<{ view: string; svg: string }>;
  schedule: Array<{ level: number; name: string; type: string; areaSqIn: number }>;
  areas: { conditionedTotalSqIn: number; garageSqIn: number };
  sheetIndex: Array<{ id: string; name: string }>;
  pdfBase64: string;
  dxf: string;
  modelHash: string;
  error?: string;
}

const PRESETS = [
  'modern farmhouse, four bed, primary down, theater, big rear porch, 3-car garage',
  'single story craftsman ranch, 3 bedrooms, 2 car garage, walk-in pantry',
  'compact modern two story for a narrow lot, 3 bed, office',
];

type Tab = 'plans' | 'elevations' | '3d' | 'findings' | 'schedule';

export default function DesignPage() {
  const [brief, setBrief] = useState(PRESETS[0]!);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<DesignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('plans');

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief }),
      });
      const data = (await res.json()) as DesignResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setR(data);
      setTab('plans');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const dl = (name: string, data: string, mime: string, base64 = false) => {
    const a = document.createElement('a');
    a.href = base64 ? `data:${mime};base64,${data}` : `data:${mime};charset=utf-8,${encodeURIComponent(data)}`;
    a.download = name;
    a.click();
  };

  const sev = (s: string) => (s === 'error' ? 'var(--redline)' : s === 'engineer' ? 'var(--redline)' : s === 'warn' ? 'var(--amber)' : 'var(--cyanotype)');

  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 40, margin: 0 }}>
        Blueline v2 — Designer
      </h1>
      <p style={{ maxWidth: 760, fontSize: 15 }}>
        Describe a house. The designer composes it from the module grammar; the engine derives every
        wall, opening, stair, and area; validation runs before you see it. Nothing here is drawn by
        an AI — the AI only chooses modules.
      </p>

      <div className="titleblock">
        <h2>Brief</h2>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
          style={{ width: '100%', fontFamily: 'var(--font-body)', fontSize: 15, padding: 10, border: '1px solid var(--graphite)', background: '#fff' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="bl primary" onClick={generate} disabled={busy || !brief.trim()}>
            {busy ? 'Designing…' : 'Design this house'}
          </button>
          {PRESETS.map((p, i) => (
            <button key={i} className="bl" onClick={() => setBrief(p)} style={{ fontSize: 11 }}>
              preset {i + 1}
            </button>
          ))}
        </div>
        {error && <p style={{ color: 'var(--redline)', fontSize: 13 }}>{error}</p>}
      </div>

      {r && (
        <>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginTop: 18, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', margin: 0, fontSize: 24 }}>{r.program.name}</h2>
            <span className="mono" style={{ fontSize: 12 }}>
              {r.program.plan_type} · {r.program.style} · {Math.round(r.areas.conditionedTotalSqIn / 144)} SF conditioned · hash {r.modelHash}
            </span>
            <span className="mono" style={{ fontSize: 11, opacity: 0.65 }}>
              designer: {r.designer}{r.reviseCycles ? ` · ${r.reviseCycles} revise cycles` : ''}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
            {(['plans', 'elevations', '3d', 'findings', 'schedule'] as Tab[]).map((t) => (
              <button key={t} className={`bl${tab === t ? ' primary' : ''}`} onClick={() => setTab(t)}>
                {t === '3d' ? '3D' : t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button className="bl" onClick={() => dl('blueline-sheets.pdf', r.pdfBase64, 'application/pdf', true)}>Sheets PDF</button>
            <button className="bl" onClick={() => dl('blueline-model.dxf', r.dxf, 'application/dxf')}>DXF</button>
          </div>

          {tab === 'plans' && (
            <div style={{ display: 'grid', gridTemplateColumns: r.plans.length > 1 ? '1fr 1fr' : '1fr', gap: 16 }}>
              {r.plans.map((svg, i) => (
                <div key={i} className="titleblock">
                  <h2>{i === 0 ? 'Main floor' : 'Upper floor'}</h2>
                  <div dangerouslySetInnerHTML={{ __html: svg }} />
                </div>
              ))}
            </div>
          )}
          {tab === 'elevations' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {r.elevations.map((e) => (
                <div key={e.view} className="titleblock">
                  <h2>{e.view} elevation</h2>
                  <div dangerouslySetInnerHTML={{ __html: e.svg }} />
                </div>
              ))}
            </div>
          )}
          {tab === '3d' && (
            <div className="titleblock">
              <h2>3D — drag to orbit, scroll to zoom</h2>
              <Viewer3D model={r.model} />
            </div>
          )}
          {tab === 'findings' && (
            <div className="titleblock">
              <h2>Findings</h2>
              {r.findings.length === 0 && <p className="mono">None — the model passes every loaded check. Rule rows remain unverified until Phase 5; sheets carry VERIFY language.</p>}
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {r.findings.map((f, i) => (
                  <li key={i} style={{ borderLeft: `3px solid ${sev(f.severity)}`, padding: '6px 10px', marginBottom: 6, background: '#fff', fontSize: 13 }}>
                    <span className="mono" style={{ color: sev(f.severity) }}>{f.severity} · {f.code}</span> {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === 'schedule' && (
            <div className="titleblock">
              <h2>Room schedule (computed from geometry)</h2>
              <table className="mono" style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
                <tbody>
                  {r.schedule.map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: '2px 12px 2px 0' }}>L{row.level}</td>
                      <td style={{ padding: '2px 16px 2px 0' }}>{row.name}</td>
                      <td style={{ padding: '2px 16px 2px 0', opacity: 0.6 }}>{row.type}</td>
                      <td style={{ textAlign: 'right' }}>{Math.round(row.areaSqIn / 144)} SF</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: 12, opacity: 0.65, marginTop: 18, maxWidth: 820 }}>
            Sheets are the v2 interim renderer (Bonsai/IFC pipeline is Phase 3). Unstamped; IRC 2021
            prescriptive basis; local amendments govern; engineer-flagged conditions print on the
            cover and are never softened.
          </p>
        </>
      )}
    </main>
  );
}
