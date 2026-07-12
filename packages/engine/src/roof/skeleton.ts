/**
 * Straight skeleton for rectilinear footprints (Build Bible §9 "Roof
 * geometry" — the hardest single geometry task; built early with golden
 * fixtures).
 *
 * Event-driven wavefront shrink for axis-aligned simple polygons. Each edge's
 * offset line advances inward at unit speed (speed 0 for gable-end edges —
 * the weighted skeleton gives gable ridges for free). Vertex trajectories are
 * linear in t, so events are exact:
 *
 *   - edge collapse: an edge's endpoints meet
 *   - split: a reflex (270°) vertex hits a non-adjacent edge's offset line
 *   - final rectangle: 4-edge chains finish in closed form (ridge or apex)
 *
 * Output arcs carry the offset time t at each node; roof height at a node is
 * t × pitch / 12. Works for Phase-1 rect / L / T footprints (and any simple
 * rectilinear polygon whose events stay generic).
 *
 * Internally uses exact-enough float math (event times are multiples of 0.5
 * on integer input); output nodes are NOT forced to integers — the skeleton
 * is derived geometry, consumed only by renderers, never stored in the model.
 */
import type { Point, Polygon, RoofSpec } from '../model/types.js';
import { pointInPolygon } from '../model/geometry.js';

export type ArcKind = 'ridge' | 'hip' | 'valley' | 'gable';

export interface SkeletonNode {
  x: number;
  y: number;
  /** Offset distance (inches of plan run) when this node formed. 0 = eave. */
  t: number;
}

export interface SkeletonArc {
  a: SkeletonNode;
  b: SkeletonNode;
  kind: ArcKind;
}

export interface Skeleton {
  arcs: SkeletonArc[];
}

interface WEdge {
  axis: 'h' | 'v'; // 'h': line y = c + dir·speed·t ; 'v': x = c + dir·speed·t
  c: number;
  dir: 1 | -1;
  speed: 0 | 1;
}

interface WVertex {
  birth: SkeletonNode;
  reflex: boolean;
}

interface Chain {
  edges: WEdge[]; // edges[i] runs from vertices[i] to vertices[i+1]
  vertices: WVertex[]; // vertices[i] joins edges[i-1] and edges[i]
  t0: number; // chain birth time
}

const EPS = 1e-7;

function lineAt(e: WEdge, t: number): number {
  return e.c + e.dir * e.speed * t;
}

/** Vertex position at time t = intersection of its two edges' offset lines. */
function vertexPos(prev: WEdge, next: WEdge, t: number): { x: number; y: number } {
  const v = prev.axis === 'v' ? prev : next;
  const h = prev.axis === 'h' ? prev : next;
  return { x: lineAt(v, t), y: lineAt(h, t) };
}

function chainVertexPos(ch: Chain, i: number, t: number): { x: number; y: number } {
  const n = ch.edges.length;
  return vertexPos(ch.edges[(i + n - 1) % n]!, ch.edges[i]!, t);
}

function arcKind(vertex: WVertex, prev: WEdge, next: WEdge): ArcKind {
  if (vertex.reflex) return 'valley';
  if (prev.speed === 0 || next.speed === 0) return 'gable';
  return 'hip';
}

/**
 * Build the initial wavefront chain from a footprint. `gableEdges` are
 * footprint edge indices that do not advance (speed 0).
 */
function initialChain(footprint: Polygon, gableEdges: number[]): Chain {
  const n = footprint.length;
  const edges: WEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = footprint[i]!;
    const b = footprint[(i + 1) % n]!;
    if (a.x !== b.x && a.y !== b.y) throw new Error('Footprint must be rectilinear');
    const axis: 'h' | 'v' = a.y === b.y ? 'h' : 'v';
    const c = axis === 'h' ? a.y : a.x;
    // Determine inward direction by probing just off the edge midpoint.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const probe: Point =
      axis === 'h' ? { x: Math.round(mx), y: my + 1 } : { x: mx + 1, y: Math.round(my) };
    const dir: 1 | -1 = pointInPolygon(probe, footprint) ? 1 : -1;
    edges.push({ axis, c, dir, speed: gableEdges.includes(i) ? 0 : 1 });
  }
  const vertices: WVertex[] = [];
  for (let i = 0; i < n; i++) {
    const p = footprint[i]!;
    vertices.push({ birth: { x: p.x, y: p.y, t: 0 }, reflex: isReflex(footprint, i) });
  }
  return { edges, vertices, t0: 0 };
}

/** Reflex test for a rectilinear polygon vertex (interior angle 270°). */
function isReflex(poly: Polygon, i: number): boolean {
  const n = poly.length;
  const a = poly[(i + n - 1) % n]!;
  const b = poly[i]!;
  const c = poly[(i + 1) % n]!;
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  // winding: positive doubled area (shoelace as in geometry.ts) pairs with
  // convex cross sign; compare against polygon winding
  let s = 0;
  for (let k = 0; k < n; k++) {
    const p = poly[k]!;
    const q = poly[(k + 1) % n]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s > 0 ? cross < 0 : cross > 0;
}

/** Earliest time ≥ t0 when the edge's endpoints coincide (edge collapse). */
function edgeCollapseTime(ch: Chain, i: number, t0: number): number | null {
  const n = ch.edges.length;
  const e = ch.edges[i]!;
  const prev = ch.edges[(i + n - 1) % n]!;
  const next = ch.edges[(i + 1) % n]!;
  // endpoints of edge i are governed by prev & next along e's axis direction
  if (prev.axis !== next.axis) return null; // neighbors not parallel — cannot collapse cleanly
  // position of start/end along the edge axis:
  const p0 = prev.c;
  const v0 = prev.dir * prev.speed;
  const q0 = next.c;
  const w0 = next.dir * next.speed;
  const dv = v0 - w0;
  if (Math.abs(dv) < EPS) return null;
  const t = (q0 - p0) / dv;
  // events at exactly t0 are legal (simultaneous events from a prior split)
  return t > t0 - EPS ? t : null;
}

/** Earliest split: reflex vertex i hits non-adjacent edge j's offset line. */
function splitTime(
  ch: Chain,
  i: number,
  t0: number,
): { t: number; edge: number } | null {
  const n = ch.edges.length;
  const prev = ch.edges[(i + n - 1) % n]!;
  const next = ch.edges[i]!;
  let best: { t: number; edge: number } | null = null;
  for (let j = 0; j < n; j++) {
    if (j === i || j === (i + n - 1) % n) continue;
    const e = ch.edges[j]!;
    // vertex coordinate along e's axis over time
    const gov = e.axis === 'h' ? (prev.axis === 'h' ? prev : next) : prev.axis === 'v' ? prev : next;
    if (gov.axis !== e.axis) continue;
    const p0 = gov.c;
    const v0 = gov.dir * gov.speed;
    const q0 = e.c;
    const w0 = e.dir * e.speed;
    if (Math.abs(v0 - w0) < EPS) continue;
    const t = (q0 - p0) / (v0 - w0);
    if (t < t0 - EPS) continue;
    // vertex must land within edge j's span at time t, and edge must face the vertex
    const pos = chainVertexPos(ch, i, t);
    const along = e.axis === 'h' ? pos.x : pos.y;
    const j0 = chainVertexPos(ch, j, t);
    const j1 = chainVertexPos(ch, (j + 1) % n, t);
    const lo = Math.min(e.axis === 'h' ? j0.x : j0.y, e.axis === 'h' ? j1.x : j1.y);
    const hi = Math.max(e.axis === 'h' ? j0.x : j0.y, e.axis === 'h' ? j1.x : j1.y);
    if (along < lo - EPS || along > hi + EPS) continue;
    if (!best || t < best.t - EPS) best = { t, edge: j };
  }
  return best;
}

/**
 * Closed-form finish for a 3-edge chain: two parallel edges + one
 * perpendicular. Born from a split where the reflex vertex's edge line
 * coincides with the opposing edge — the region is (or becomes) a segment:
 * the ridge of a collapsed bar.
 */
function finishTriple(ch: Chain, arcs: SkeletonArc[]): void {
  const axes = ch.edges.map((e) => e.axis);
  const perp = axes.indexOf(axes.filter((a) => axes.filter((b) => b === a).length === 1)[0]!);
  if (perp < 0) return;
  const parallel = [0, 1, 2].filter((k) => k !== perp) as [number, number];
  const pa = ch.edges[parallel[0]]!;
  const pb = ch.edges[parallel[1]]!;
  const va = pa.dir * pa.speed;
  const vb = pb.dir * pb.speed;
  if (Math.abs(va - vb) < EPS) return;
  const tEnd = Math.max((pb.c - pa.c) / (va - vb), ch.t0);
  const linePos = lineAt(pa, tEnd);
  const perpPos = lineAt(ch.edges[perp]!, tEnd);
  const end: SkeletonNode =
    ch.edges[perp]!.axis === 'v'
      ? { x: perpPos, y: linePos, t: tEnd }
      : { x: linePos, y: perpPos, t: tEnd };
  // vertex q joins the two parallel edges: the one not an endpoint of `perp`
  for (let i = 0; i < 3; i++) {
    const v = ch.vertices[i]!;
    const isQ = i !== perp && i !== (perp + 1) % 3;
    if (isQ) {
      if (Math.hypot(v.birth.x - end.x, v.birth.y - end.y) > EPS) {
        arcs.push({ a: v.birth, b: end, kind: 'ridge' });
      }
    } else {
      pushArc(arcs, v, end, ch, i);
    }
  }
}

/** Closed-form finish for a 4-edge (rectangle) chain. */
function finishRectangle(ch: Chain, arcs: SkeletonArc[]): void {
  const n = 4;
  // pair opposite edges by axis
  const idx = [0, 1, 2, 3];
  const hIdx = idx.filter((i) => ch.edges[i]!.axis === 'h');
  const vIdx = idx.filter((i) => ch.edges[i]!.axis === 'v');
  if (hIdx.length !== 2 || vIdx.length !== 2) {
    // degenerate (should not happen for simple rectilinear input)
    return;
  }
  const meet = (a: WEdge, b: WEdge): number | null => {
    const va = a.dir * a.speed;
    const vb = b.dir * b.speed;
    if (Math.abs(va - vb) < EPS) return null;
    const t = (b.c - a.c) / (va - vb);
    return t > ch.t0 - EPS ? t : null;
  };
  const tH = meet(ch.edges[hIdx[0]!]!, ch.edges[hIdx[1]!]!);
  const tV = meet(ch.edges[vIdx[0]!]!, ch.edges[vIdx[1]!]!);
  const candidates = [tH, tV].filter((t): t is number => t !== null);
  if (!candidates.length) return;
  const tEnd = Math.min(...candidates);

  // ridge endpoints: at tEnd the collapsing pair coincides on one line; the
  // other pair's offset lines bound the remaining segment.
  const collapseH = tH !== null && tH <= tEnd + EPS;
  const ridgeAxisEdges = collapseH ? vIdx : hIdx; // edges bounding the ridge run
  const lineEdges = collapseH ? hIdx : vIdx;
  const linePos = lineAt(ch.edges[lineEdges[0]!]!, tEnd);
  const e0 = lineAt(ch.edges[ridgeAxisEdges[0]!]!, tEnd);
  const e1 = lineAt(ch.edges[ridgeAxisEdges[1]!]!, tEnd);
  const lo = Math.min(e0, e1);
  const hi = Math.max(e0, e1);
  const A: SkeletonNode = collapseH ? { x: lo, y: linePos, t: tEnd } : { x: linePos, y: lo, t: tEnd };
  const B: SkeletonNode = collapseH ? { x: hi, y: linePos, t: tEnd } : { x: linePos, y: hi, t: tEnd };

  if (hi - lo > EPS) arcs.push({ a: A, b: B, kind: 'ridge' });

  // corner arcs: each vertex ends at the ridge endpoint nearest its trajectory
  for (let i = 0; i < n; i++) {
    const v = ch.vertices[i]!;
    const end = chainVertexPos(ch, i, tEnd);
    const target =
      Math.hypot(end.x - A.x, end.y - A.y) <= Math.hypot(end.x - B.x, end.y - B.y) ? A : B;
    pushArc(arcs, v, { x: target.x, y: target.y, t: tEnd }, ch, i);
  }
}

function pushArc(arcs: SkeletonArc[], v: WVertex, end: SkeletonNode, ch: Chain, i: number): void {
  if (Math.abs(v.birth.x - end.x) < EPS && Math.abs(v.birth.y - end.y) < EPS) return;
  const n = ch.edges.length;
  const kind = arcKind(v, ch.edges[(i + n - 1) % n]!, ch.edges[i]!);
  arcs.push({ a: v.birth, b: end, kind });
}

/** Compute the straight skeleton of a rectilinear footprint. */
export function straightSkeleton(footprint: Polygon, gableEdges: number[] = []): Skeleton {
  const arcs: SkeletonArc[] = [];
  const queue: Chain[] = [initialChain(footprint, gableEdges)];
  let guard = 0;

  while (queue.length) {
    if (++guard > 64) throw new Error('Skeleton did not converge');
    const ch = queue.pop()!;
    const n = ch.edges.length;

    if (n < 3) continue;
    if (n === 3) {
      finishTriple(ch, arcs);
      continue;
    }
    if (n === 4) {
      finishRectangle(ch, arcs);
      continue;
    }

    // find earliest event; a split beats a collapse at the same instant
    // (simultaneous pinch+split — processing the split first keeps both
    // sub-regions intact, and the pinch resolves closed-form inside them)
    let bestCollapse: { t: number; i: number } | null = null;
    for (let i = 0; i < n; i++) {
      const tc = edgeCollapseTime(ch, i, ch.t0);
      if (tc !== null && (!bestCollapse || tc < bestCollapse.t - EPS)) bestCollapse = { t: tc, i };
    }
    let bestSplit: { t: number; i: number; edge: number } | null = null;
    for (let i = 0; i < n; i++) {
      if (!ch.vertices[i]!.reflex) continue;
      const s = splitTime(ch, i, ch.t0);
      if (s && (!bestSplit || s.t < bestSplit.t - EPS)) bestSplit = { t: s.t, i, edge: s.edge };
    }
    const useSplit = bestSplit && (!bestCollapse || bestSplit.t <= bestCollapse.t + EPS);
    const best = useSplit
      ? { ...bestSplit!, type: 'split' as const }
      : bestCollapse
        ? { ...bestCollapse, type: 'collapse' as const, edge: undefined as number | undefined }
        : null;
    if (!best) continue; // nothing left to do (degenerate)

    if (best.type === 'collapse') {
      const i = best.i;
      const t = best.t;
      const vA = ch.vertices[i]!;
      const vB = ch.vertices[(i + 1) % n]!;
      const endA = chainVertexPos(ch, i, t);
      pushArc(arcs, vA, { ...endA, t }, ch, i);
      pushArc(arcs, vB, { ...endA, t }, ch, (i + 1) % n);
      // remove edge i; neighbors prev/next become adjacent. They are parallel
      // (same axis). If their offset lines coincide at t, merge them into one
      // edge; otherwise the region pinches shut here — finish remaining as-is.
      const prevI = (i + n - 1) % n;
      const nextI = (i + 1) % n;
      const prev = ch.edges[prevI]!;
      const next = ch.edges[nextI]!;
      if (Math.abs(lineAt(prev, t) - lineAt(next, t)) < EPS && prev.dir === next.dir) {
        // merge: drop edge i and edge nextI, keep prev spanning both
        const keepEdges: WEdge[] = [];
        const keepVerts: WVertex[] = [];
        for (let k = 0; k < n; k++) {
          if (k === i || k === nextI) continue;
          keepEdges.push(ch.edges[k]!);
        }
        // vertices: drop vertices i and i+1, birth a new vertex at endA
        for (let k = 0; k < n; k++) {
          if (k === i || k === (i + 1) % n) continue;
          keepVerts.push(ch.vertices[k]!);
        }
        // rebuild aligned arrays: edges[k] from vertices[k] to vertices[k+1]
        // Reconstruct by walking original indices in order starting after nextI
        const edges: WEdge[] = [];
        const vertices: WVertex[] = [];
        let k = (nextI + 1) % n;
        // new merged edge = prev's line; new vertex sits at endA between last
        // kept edge and merged edge — easier: rebuild sequentially
        const orderEdges: number[] = [];
        while (k !== i) {
          orderEdges.push(k);
          k = (k + 1) % n;
        }
        // orderEdges excludes i; starts at nextI+1 .. prevI, then prev merged with next
        // Walk vertices from (i+2) to (i-1): those keep; plus new vertex at endA
        for (const e of orderEdges) {
          if (e === nextI) continue;
          edges.push(ch.edges[e]!);
        }
        edges.push({ ...prev }); // merged line (prev == next line at t)
        let vk = (i + 2) % n;
        while (vk !== i) {
          vertices.push(ch.vertices[vk]!);
          vk = (vk + 1) % n;
        }
        vertices.push({ birth: { ...endA, t }, reflex: false });
        // Now edges.length === vertices.length === n-2
        // rotate so that edges[j] runs vertices[j]→vertices[j+1]:
        // our construction: vertices list starts at original vertex (i+2),
        // edges list starts at original edge (i+1+1)= (nextI+1). Edge (nextI+1)
        // runs from vertex (nextI+1)=(i+2) to (i+3): aligned. ✓
        queue.push({ edges, vertices, t0: t });
      } else {
        // pinch: treat remaining chain minus edge i as two sub-chains is not
        // needed for Phase-1 shapes; emit remaining vertex arcs and stop.
        for (let k = 0; k < n; k++) {
          if (k === i || k === (i + 1) % n) continue;
          const end = chainVertexPos(ch, k, t);
          pushArc(arcs, ch.vertices[k]!, { ...end, t }, ch, k);
        }
      }
      continue;
    }

    // split event: reflex vertex i hits edge j
    const { i, t } = best;
    const j = best.edge!;
    const P = chainVertexPos(ch, i, t);
    pushArc(arcs, ch.vertices[i]!, { ...P, t }, ch, i);

    // Build two sub-chains. Edge j is split at P into jA (toward vertex j+1
    // side kept with one chain) and jB. Chain A: edges i..j (vertex i replaced
    // by new vertex at P), Chain B: edges j..i.
    const mkVertex = (): WVertex => ({ birth: { ...P, t }, reflex: false });

    // chain A: start at vertex i (new), follow edges i, i+1 … j (split part), close.
    const edgesA: WEdge[] = [];
    const vertsA: WVertex[] = [];
    vertsA.push(mkVertex());
    let k = i;
    while (true) {
      edgesA.push(ch.edges[k]!);
      if (k === j) break;
      vertsA.push(ch.vertices[(k + 1) % n]!);
      k = (k + 1) % n;
    }
    queue.push({ edges: edgesA, vertices: vertsA, t0: t });

    // chain B: start at vertex j+1… wait — start at new vertex at P, follow
    // edge j (other part), then j+1 … i-1.
    const edgesB: WEdge[] = [];
    const vertsB: WVertex[] = [];
    vertsB.push(mkVertex());
    k = j;
    while (true) {
      edgesB.push(ch.edges[k]!);
      if ((k + 1) % n === i) break;
      vertsB.push(ch.vertices[(k + 1) % n]!);
      k = (k + 1) % n;
    }
    queue.push({ edges: edgesB, vertices: vertsB, t0: t });
  }

  return dedupeArcs(arcs);
}

function dedupeArcs(arcs: SkeletonArc[]): Skeleton {
  const seen = new Set<string>();
  const out: SkeletonArc[] = [];
  const key = (a: SkeletonArc) => {
    const p = [a.a, a.b]
      .map((n) => `${n.x.toFixed(3)},${n.y.toFixed(3)}`)
      .sort()
      .join('|');
    return `${p}|${a.kind}`;
  };
  for (const a of arcs) {
    const k = key(a);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  }
  return { arcs: out };
}

/** Skeleton for a model's roof: hip uses all edges; gable pins gableEdges. */
export function roofSkeleton(footprint: Polygon, roof: RoofSpec): Skeleton {
  return straightSkeleton(footprint, roof.style === 'gable' ? roof.gableEdges : []);
}

/** Height above plate at a skeleton node: run t at `pitch` in 12. */
export function nodeHeight(node: SkeletonNode, pitch: number): number {
  return (node.t * pitch) / 12;
}
