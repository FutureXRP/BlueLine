import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '64px 24px' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 56,
          lineHeight: 1.02,
          margin: 0,
        }}
      >
        Blueline
      </h1>
      <p style={{ fontSize: 18, maxWidth: 620 }}>
        A validated floor plan you shape yourself, delivered as a complete, dimensioned,
        IRC-prescriptive construction document set — buildable, unstamped — for a fraction of
        traditional drafting cost.
      </p>
      <p className="mono" style={{ color: 'var(--cyanotype)' }}>
        24×36 PDF sheet set + DXF · 2021 IRC prescriptive provisions · deterministic validation
        engine
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Link href="/editor">
          <button className="bl primary">Open the guided editor demo</button>
        </Link>
      </div>
      <p style={{ marginTop: 48, fontSize: 13, opacity: 0.7, maxWidth: 620 }}>
        Deliverables are prepared under the IRC prescriptive provisions and exclude site-specific
        engineering. Not an architect&apos;s or engineer&apos;s sealed document. Local amendments
        govern; buyers are responsible for jurisdiction review.
      </p>
    </main>
  );
}
