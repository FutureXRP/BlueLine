'use client';

/**
 * The product front door: describe the home → complete finished blueprints
 * with materials takeoff. The guided editor remains available as an optional
 * refine step on the generated plan.
 */
import { useState } from 'react';
import Link from 'next/link';

interface BlueprintResponse {
  extractor: 'claude' | 'deterministic';
  assumed: string[];
  conditioned: string;
  targetSf: number;
  findings: Array<{ ruleId: string; severity: string; message: string }>;
  svg: string;
  sheetIndex: Array<{ id: string; name: string }>;
  model: unknown;
  pdfBase64: string;
  takeoffCsv: string;
  error?: string;
}

const PLACEHOLDER =
  'Example: 1800 square feet, 3 bedrooms, 2.5 baths, 2-car garage, hip roof, ' +
  'open kitchen with an island and a walk-in pantry, home office, 9 foot ceilings, slab foundation.';

export default function Home() {
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BlueprintResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/blueprint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = (await res.json()) as BlueprintResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      try {
        localStorage.setItem('blueline.model', JSON.stringify(data.model));
      } catch {
        /* editor handoff is best-effort */
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = `data:application/pdf;base64,${result.pdfBase64}`;
    a.download = 'blueline-preview.pdf';
    a.click();
  };

  const downloadCsv = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(result.takeoffCsv)}`;
    a.download = 'blueline-takeoff.csv';
    a.click();
  };

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '48px 24px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 52,
          lineHeight: 1.02,
          margin: 0,
        }}
      >
        Blueline
      </h1>
      <p style={{ fontSize: 18, maxWidth: 680 }}>
        Tell us exactly what you want. Blueline generates complete, dimensioned,
        IRC-prescriptive construction documents with a materials takeoff — buildable, unstamped —
        in minutes, not weeks.
      </p>

      <div className="titleblock" style={{ marginTop: 20 }}>
        <h2>Describe your home</h2>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={5}
          style={{
            width: '100%',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            padding: 10,
            border: '1px solid var(--graphite)',
            background: '#fff',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
          <button className="bl primary" onClick={generate} disabled={busy || !description.trim()}>
            {busy ? 'Generating…' : 'Generate blueprints'}
          </button>
          <span className="mono" style={{ opacity: 0.6, fontSize: 11 }}>
            free watermarked preview · PDF sheet set + takeoff CSV
          </span>
        </div>
        {error && <p style={{ color: 'var(--redline)', fontSize: 13 }}>{error}</p>}
      </div>

      {result && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          <div className="titleblock">
            <h2>Generated plan — {result.conditioned} conditioned (target {result.targetSf} SF)</h2>
            <div dangerouslySetInnerHTML={{ __html: result.svg }} />
          </div>
          <div>
            <div className="titleblock">
              <h2>Document set</h2>
              <ul className="mono" style={{ paddingLeft: 18, fontSize: 12 }}>
                {result.sheetIndex.map((s) => (
                  <li key={s.id}>
                    {s.id} — {s.name}
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="bl primary" onClick={downloadPdf}>
                  Download PDF preview
                </button>
                <button className="bl" onClick={downloadCsv}>
                  Download takeoff CSV
                </button>
                <Link href="/editor?from=generated">
                  <button className="bl" style={{ width: '100%' }}>
                    Refine in the guided editor
                  </button>
                </Link>
              </div>
            </div>
            <div className="titleblock" style={{ marginTop: 14 }}>
              <h2>How it was read</h2>
              <p className="mono" style={{ fontSize: 11.5 }}>
                extractor: {result.extractor}
                {result.extractor === 'deterministic' && ' (keyword parser — server has no ANTHROPIC_API_KEY)'}
              </p>
              {result.assumed.length > 0 && (
                <p style={{ fontSize: 12 }}>
                  Assumed defaults for: <span className="mono">{result.assumed.join(', ')}</span>
                </p>
              )}
              {result.findings.length > 0 ? (
                <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                  {result.findings.map((f, i) => (
                    <li key={i} style={{ color: f.severity === 'warn' ? 'var(--amber)' : 'var(--redline)' }}>
                      {f.ruleId}: {f.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 12 }}>No findings — passes all loaded rule checks.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <p style={{ marginTop: 40, fontSize: 13, opacity: 0.7, maxWidth: 680 }}>
        Deliverables are prepared under the 2021 IRC prescriptive provisions and exclude
        site-specific engineering. Not an architect&apos;s or engineer&apos;s sealed document.
        Local amendments govern; buyers are responsible for jurisdiction review. Takeoff
        quantities are budgeting estimates — verify with your framer and supplier.
      </p>
    </main>
  );
}
