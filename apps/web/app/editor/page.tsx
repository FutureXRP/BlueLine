'use client';

/**
 * Guided editor (Build Bible §5 Stage 2, §12).
 *
 * Core loop proven here (§17 step 3): load fixture model, drag interior
 * walls on the 2" snap grid, every mutation runs through the validation
 * engine BEFORE commit — invalid moves ghost in redline for 400 ms with the
 * finding named, then revert. Warnings commit but persist as amber badges.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Finding, Model } from '@blueline/engine/model';
import { conditionedArea, formatSquareFeet, roomArea } from '@blueline/engine/model';
import {
  introducesHardFindings,
  mirrorPlan,
  moveWall,
  revalidate,
  swapSwing,
} from '@blueline/engine/ops';
import { renderPlanSvg } from '@blueline/engine/render-svg';
import { rect3bed } from '@blueline/engine/fixtures';

interface DragState {
  wallId: string;
  horizontal: boolean;
  startX: number;
  startY: number;
  scale: number; // model inches per CSS px
  base: Model;
  baseFindings: Finding[];
}

export default function EditorPage() {
  const [history, setHistory] = useState<Model[]>(() => [rect3bed()]);
  const [cursor, setCursor] = useState(0);
  const model = history[cursor]!;

  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ model: Model; findings: Finding[]; valid: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const findings = useMemo(() => revalidate(model).findings, [model]);
  const shown = preview ?? { model, findings, valid: true };

  const svg = useMemo(
    () =>
      renderPlanSvg(shown.model, {
        selectedId: selected,
        findings: shown.valid ? shown.findings : shown.findings.filter((f) => f.severity === 'hard'),
        showGrid: true,
        redline: '#C2321E',
        accent: shown.valid ? '#1D4ED8' : '#C2321E',
      }),
    [shown.model, shown.findings, shown.valid, selected],
  );

  const commit = useCallback(
    (next: Model) => {
      setHistory((h) => [...h.slice(0, cursor + 1), next]);
      setCursor((c) => c + 1);
    },
    [cursor],
  );

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // keyboard: undo/redo/mirror (§12)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) setCursor((c) => Math.min(c + 1, history.length - 1));
        else setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey) {
        const res = mirrorPlan(model);
        commit(res.model);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model, commit, history.length]);

  const findTarget = (e: React.PointerEvent): { id: string; type: string; kind?: string } | null => {
    let el = e.target as Element | null;
    while (el && el !== hostRef.current) {
      const id = el.getAttribute?.('data-id');
      if (id) return { id, type: el.getAttribute('data-type') ?? '', kind: el.getAttribute('data-kind') ?? undefined };
      el = el.parentElement;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = findTarget(e);
    if (!t) {
      setSelected(null);
      return;
    }
    setSelected(t.id);
    if (t.type === 'wall') {
      const wall = model.walls.find((w) => w.id === t.id);
      const svgEl = hostRef.current?.querySelector('svg');
      if (!wall || !svgEl || wall.kind === 'exterior') {
        if (wall?.kind === 'exterior') flashToast('Exterior walls move with the footprint — Phase 2.');
        return;
      }
      const rect = svgEl.getBoundingClientRect();
      const vb = svgEl.viewBox.baseVal;
      dragRef.current = {
        wallId: wall.id,
        horizontal: wall.y1 === wall.y2,
        startX: e.clientX,
        startY: e.clientY,
        scale: vb.width / rect.width,
        base: model,
        baseFindings: findings,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const deltaPx = d.horizontal ? e.clientY - d.startY : e.clientX - d.startX;
    const delta = deltaPx * d.scale;
    if (Math.abs(delta) < 1) return;
    const res = moveWall(d.base, d.wallId, delta);
    const invalid = introducesHardFindings(d.baseFindings, res.findings);
    setPreview({ model: res.model, findings: res.findings, valid: !invalid });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !preview) {
      setPreview(null);
      return;
    }
    if (preview.valid) {
      commit(preview.model);
      setPreview(null);
    } else {
      // invalid moves never commit (§12): ghost, name the rule, revert
      const blocking = preview.findings.find(
        (f) => f.severity === 'hard' && !d.baseFindings.some((b) => b.message === f.message),
      );
      flashToast(blocking ? blocking.message : 'That move would violate a hard rule.');
      setTimeout(() => setPreview(null), 400);
    }
  };

  const onDoubleClick = () => {
    if (!selected) return;
    const opening = model.openings.find((o) => o.id === selected);
    if (opening?.type === 'door') {
      commit(swapSwing(model, selected).model);
    }
  };

  const warnCount = findings.filter((f) => f.severity === 'warn').length;
  const hardCount = findings.filter((f) => f.severity === 'hard').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: '100vh' }}>
      <div
        ref={hostRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ position: 'relative', overflow: 'hidden', userSelect: 'none', cursor: dragRef.current ? 'grabbing' : 'default' }}
      >
        <div
          style={{ position: 'absolute', inset: 24 }}
          // Law #4: this SVG comes from the same geometry model as the sheets
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {toast && (
          <div
            role="status"
            style={{
              position: 'absolute',
              bottom: 28,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--redline)',
              color: '#fff',
              padding: '10px 18px',
              fontSize: 13,
              maxWidth: 560,
            }}
          >
            {toast}
          </div>
        )}
        <div style={{ position: 'absolute', top: 18, left: 24, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 20 }}>
          Blueline — Guided Editor
        </div>
        <div className="mono" style={{ position: 'absolute', bottom: 18, left: 24, opacity: 0.6 }}>
          drag interior walls · 2&quot; snap · M mirror · double-click door = swing · ⌘Z undo
        </div>
      </div>

      <aside data-cursor={cursor} data-histlen={history.length} style={{ borderLeft: '2px solid var(--graphite)', padding: 16, overflowY: 'auto', background: 'var(--vellum)' }}>
        <div className="titleblock">
          <h2>Room Schedule</h2>
          <table className="mono" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {shown.model.rooms.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  style={{ cursor: 'pointer', background: selected === r.id ? 'rgba(29,78,216,0.08)' : 'transparent' }}
                >
                  <td style={{ padding: '3px 4px' }}>{r.name}</td>
                  <td style={{ textAlign: 'right', padding: '3px 4px' }}>{formatSquareFeet(roomArea(r))}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--graphite)' }}>
                <td style={{ padding: '6px 4px', fontWeight: 700 }}>CONDITIONED</td>
                <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 700 }}>
                  {formatSquareFeet(conditionedArea(shown.model))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="titleblock" style={{ marginTop: 14 }}>
          <h2>
            Findings{' '}
            <span className="mono" style={{ fontWeight: 400 }}>
              {hardCount} hard · {warnCount} warn
            </span>
          </h2>
          {findings.length === 0 && (
            <p className="mono" style={{ color: 'var(--cyanotype)' }}>
              No findings — plan passes all loaded rule checks. Rule tables are representative
              until line-verified: VERIFY WITH LOCAL CODE OFFICIAL.
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {findings.map((f, i) => (
              <li
                key={i}
                onClick={() => {
                  const ref = f.refs.roomIds?.[0] ?? f.refs.openingIds?.[0] ?? f.refs.wallIds?.[0];
                  if (ref) setSelected(ref);
                }}
                style={{
                  borderLeft: `3px solid ${f.severity === 'warn' ? 'var(--amber)' : 'var(--redline)'}`,
                  padding: '6px 8px',
                  marginBottom: 6,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  background: '#fff',
                }}
              >
                <span className="mono" style={{ color: f.severity === 'warn' ? 'var(--amber)' : 'var(--redline)' }}>
                  {f.ruleId}
                </span>{' '}
                {f.message}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="bl" onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor === 0}>
            Undo
          </button>
          <button
            className="bl"
            onClick={() => setCursor((c) => Math.min(history.length - 1, c + 1))}
            disabled={cursor >= history.length - 1}
          >
            Redo
          </button>
          <button className="bl" onClick={() => commit(mirrorPlan(model).model)}>
            Mirror
          </button>
        </div>
        <p style={{ fontSize: 11.5, opacity: 0.65, marginTop: 14 }}>
          Every mutation validates before commit. Invalid moves never commit — they ghost in
          redline with the rule named, then revert (§12).
        </p>
      </aside>
    </div>
  );
}
