# BLUELINE.md — Build Bible

**Working name:** Blueline (open decision — see §18)
**One-liner:** A web platform that interviews a client about their custom home, lets them shape a validated floor plan in a guided editor, and generates a complete, dimensioned, IRC-prescriptive construction document set — buildable, unstamped — as a 24×36 PDF sheet set plus DXF.

**Positioning:** Traditional residential drafting costs $1,500–$5,000 and takes 2–6 weeks. Blueline delivers in under an hour at $299–$799 per set. The moat is not the drawings — it is the validation engine that makes them buildable.

This document is the single source of truth for Claude Code. Read fully before writing any code. When in doubt, the Non-Negotiables in §2 win over everything else in this file.

---

## 1. The Core Reframe

Blueline does **not** ask AI to invent construction documents. It splits the problem:

| Problem | Owner |
|---|---|
| Understanding what the client wants (language) | Claude API |
| Inventing candidate floor plans | Deterministic constraint solver (seeded) |
| Refining the layout (taste) | The client, inside a guided editor that forbids invalid moves |
| Code compliance | Deterministic validation engine (data-driven IRC rule tables) |
| Producing the drawings | Deterministic geometry → PDF/DXF renderer |

The AI never draws. The renderer never guesses. The client never makes an invalid plan without being told exactly why.

---

## 2. Non-Negotiables (Architecture Laws)

These are inherited from the working conventions proven on CodeCompanion, LedgerOne, and the video pipeline. They are not suggestions.

1. **LLM handles language only.** Claude conducts the intake interview and writes human-readable notes. Claude never computes a dimension, never selects a structural member, never asserts code compliance. All geometry, spans, areas, and validations are deterministic TypeScript.
2. **Integer inches everywhere.** All dimensions are stored and computed as integer inches (the money-as-integer-cents rule). Display formatting to feet-and-inches (`14'-6"`) happens only at the render boundary. No floats in the data model. Areas are computed in square inches and displayed as square feet rounded at render time.
3. **Seeded determinism.** Layout generation uses `mulberry32` seeded RNG (same as GREED / EngineWorks). A `(programSpec, seed)` pair always reproduces the identical plan. Every saved project stores its seed chain.
4. **One geometry model, two renderers.** The same TypeScript geometry model drives (a) the live SVG editor in the browser and (b) the server-side PDF/DXF sheet generator. There is never a separate "preview model" — no drift between what the client sees and what they buy.
5. **Data-driven rules, never hardcoded compliance.** Every IRC rule lives in versioned JSON rule tables (`/rules/irc-2021/*.json`) with a citation field. Code checks reference rules by ID. **No numeric code value may appear inline in engine source.**
6. **Fabrication firewall (QA rule from XRPV_DAILY_VIDEO.md, adapted):** The system may never print a code section citation, span value, or "complies with" statement that does not trace to a rule-table entry. If a value is missing from the tables, the output says "VERIFY WITH LOCAL CODE OFFICIAL" — it never invents.
7. **Hard-flag, never guess, on structure.** Any condition outside the IRC prescriptive path (see §8) blocks CD generation for that condition and emits a named engineer-required flag on the cover sheet and the affected sheet. Blueline never sizes an engineered beam.
8. **Complete file replacements over surgical patches.** Standard convention for all sessions on this repo.
9. **No real client PII beyond name/email until legal review of terms is complete.** No site addresses stored in Phase 1 (site plan is excluded scope anyway).

---

## 3. Legal Guardrails (product behavior, not just terms text)

- **Deliverable definition:** "Buildable, unstamped construction documents for a single-family detached dwelling, prepared under the IRC prescriptive provisions, excluding site-specific engineering."
- **State gate at checkout.** A `stateRules.json` table marks each US state as `exempt` (single-family residential drafting permitted without licensure — the majority, including Oklahoma), `restricted`, or `verify`. Restricted states cannot check out; verify states see a prominent notice to confirm with their local jurisdiction. This table ships with conservative defaults and a mandatory task to verify each state before launch (see §17 Open Decisions).
- **Excluded scope, stated on the cover sheet in the drawing set itself,** not just the website: site plan, septic/sewer design, HVAC design ("Mechanical layout by others; Manual J/S/D required"), energy code compliance documentation, sprinkler design, and any condition flagged engineer-required.
- **Local amendments disclaimer** on cover sheet: designed to 2021 IRC base provisions; local amendments govern; buyer is responsible for jurisdiction review.
- **Revision rounds are the human safety valve.** Terms state plainly that the permit office may require changes; one revision round is included (see §15 pricing).
- Every generated sheet carries the notice block: **"NOT AN ARCHITECT'S OR ENGINEER'S SEALED DOCUMENT."**

---

## 4. Stack

- **Next.js 14 (App Router)** on **Vercel**
- **Supabase** — auth, Postgres, storage (generated PDFs/DXFs in a private bucket, signed URLs)
- **Stripe** — one-time purchases + revision-round add-ons
- **Anthropic API** — intake interview + plain-language plan summaries only (Law #1)
- **Geometry/render:** pure TypeScript. SVG in the editor; `pdf-lib` for the sheet set; a minimal in-house DXF writer (entities needed: LINE, LWPOLYLINE, ARC, CIRCLE, TEXT, MTEXT, INSERT/BLOCK, DIMENSION as exploded geometry — do not attempt associative dimensions in DXF).
- **No Tailwind for the drawing surfaces.** Editor canvas and sheet renderer use inline SVG attributes driven by the design-token module. App chrome may use Tailwind.
- Fonts self-hosted (see §14).

---

## 5. The Three-Stage Pipeline

### Stage 1 — Program Interview (`/start`)
Conversational intake powered by Claude with a strict system prompt: extract, don't advise. Output is a **ProgramSpec** JSON (§6) validated by Zod before anything proceeds. The interview covers: stories (Phase 1: one), bed/bath counts, target conditioned square footage, garage bays and orientation, footprint family preference (rect / L / T), roof style (gable / hip), foundation (slab / crawlspace), ceiling height, primary-suite separation preference, kitchen–dining–living openness, and must-have rooms (office, mudroom, pantry, flex).

A visible "spec sheet" panel fills in live as the interview proceeds, and the client can edit any field directly — the conversation is a convenience, not a gate.

### Stage 2 — Layout (`/layout/[projectId]`)
1. **Candidate generation.** The solver (§7) produces 4 candidates from `(ProgramSpec, seeds)`. Client picks one.
2. **Guided editor.** Client refines on a 2-inch snap grid rendered at a 24-inch planning module: drag interior walls, resize rooms, swap door swings, move/resize windows, mirror the plan, adjust garage position. Every mutation runs through the validation engine (§8) *before commit* — invalid moves are rejected with the rule named in plain language ("Bedroom 3 would fall below the 70 sq ft habitable-room minimum — R304"). Live readouts: per-room area, total conditioned area, plan efficiency (net/gross).
3. **Lock.** Client locks the layout. Locking freezes the geometry hash; all CD sheets derive from the locked model.

### Stage 3 — CD Generation (`/set/[projectId]`)
Server-side render of the full sheet set (§9) from the locked model + rule tables. Watermarked preview of every sheet is free to view. Payment removes the watermark and unlocks PDF + DXF download.

---

## 6. ProgramSpec Schema (v1)

```typescript
// All dimensions integer inches. All enums closed — Phase 1 values only.
interface ProgramSpec {
  specVersion: 1;
  stories: 1;
  footprintFamily: 'rect' | 'L' | 'T';
  targetConditionedArea: number;      // sq inches; UI collects sq ft ×144
  areaTolerance: number;              // ± sq inches, default 5% of target
  bedrooms: 2 | 3 | 4;
  fullBaths: 1 | 2 | 3;
  halfBaths: 0 | 1;
  primarySuite: { separated: boolean; walkInCloset: boolean; doubleVanity: boolean };
  kitchen: { openToLiving: boolean; island: boolean; pantry: 'none' | 'reach-in' | 'walk-in' };
  garage: { bays: 0 | 1 | 2 | 3; entry: 'front' | 'side'; attached: true };
  extraRooms: Array<'office' | 'mudroom' | 'flex' | 'diningFormal' | 'laundryRoom'>;
  ceilingHeight: 96 | 108 | 120;      // 8', 9', 10'
  roof: { style: 'gable' | 'hip'; pitch: 4 | 5 | 6 | 8 };  // rise per 12
  foundation: 'slab' | 'crawlspace';
  exteriorWall: '2x4' | '2x6';
  climateNote: string | null;         // free text from interview, display only
  seedChain: number[];                // solver seeds used, for reproducibility
}
```

Zod schema is the single validation source; the Claude interview prompt is generated *from* the Zod schema descriptions so the two can't drift.

---

## 7. Layout Solver (Stage 2 engine)

Approach: adjacency-graph placement + simulated annealing on a coarse grid, per Merrell et al., *Computer-Generated Residential Building Layouts* (SIGGRAPH Asia 2010) — the canonical method, well within solo-dev reach at this constraint level.

1. **Room program expansion.** ProgramSpec → room list with target areas and min dimensions (from `roomPrograms.json`: e.g., primary bed 168–224 sq ft target, secondary bed 120–144, kitchen 140–200, scaled to hit total target area).
2. **Adjacency graph.** Required edges (kitchen–dining, primary bed–primary bath, garage–mudroom/kitchen entry, bedrooms–hall) and forbidden edges (primary suite not adjacent to garage wall if `separated`, baths not opening directly to living/dining).
3. **Footprint synthesis.** Generate the outer footprint first from `footprintFamily` + target gross area, dimensions snapped to the 24" module (framing efficiency and roof simplicity).
4. **Placement + annealing.** Squarified-treemap initial placement into the footprint zones (public / private / service), then simulated annealing with `mulberry32(seed)`: moves are room swaps, wall nudges (24" steps), and door relocations. Cost function terms: area error, adjacency violations, hall length, exterior-wall access for habitable rooms (window eligibility), plumbing clustering (wet walls shared/back-to-back), circulation validity (every room reachable, halls ≥ 36").
5. **Post-pass.** Snap to 2" grid, insert doors/windows per defaults (`openingDefaults.json`), run full validation (§8). Candidates that fail hard rules are discarded and re-rolled with the next seed; ship 4 passing candidates.

Solver honesty note: v1 candidates will be serviceable, not brilliant. That is acceptable **because the guided editor carries the product** — the solver's job is a valid starting point, not a masterpiece. Do not burn weeks tuning the cost function before the editor and CD renderer exist.

---

## 8. Validation Engine + IRC Rule Tables

`/rules/irc-2021/` — versioned JSON, each entry: `{ id, section, title, params, severity: 'hard' | 'warn' | 'engineer', citation, verified: boolean }`.

**⚠️ Every numeric value below is REPRESENTATIVE and ships with `verified: false`. A mandatory pre-launch task is line-by-line verification of every rule against the published 2021 IRC (and recording the verifying session in the rule's `citation`). The fabrication firewall (§2.6) treats unverified rules as advisory: they validate in the editor but print "VERIFY" language on sheets until flipped to `verified: true`.**

Representative rule set (Phase 1):

| Rule ID | Area | Check (representative values) | Severity |
|---|---|---|---|
| R304-AREA | Habitable rooms | ≥ 70 sq ft; ≥ 7'-0" min horizontal dimension | hard |
| R305-CEIL | Ceiling height | ≥ 7'-0" habitable; bath fixture clearances | hard |
| R310-EGRESS | Bedroom egress | Each bedroom: opening ≥ 5.7 sq ft net clear (5.0 at grade), ≥ 24" h, ≥ 20" w, sill ≤ 44" AFF | hard |
| R311-DOOR | Egress door | ≥ one 36" exterior egress door; landings | hard |
| R311-HALL | Halls | ≥ 36" clear width | hard |
| R311-STAIR | Stairs (Phase 2) | riser ≤ 7¾", tread ≥ 10", headroom ≥ 6'-8", width ≥ 36" | hard |
| R308-GLAZE | Safety glazing | Tempered glass zones near doors/tubs | warn (annotation) |
| R314/R315 | Alarms | Smoke: each bedroom + outside sleeping + per story; CO per fuel/garage condition | hard (auto-placed) |
| SPAN-CJ / SPAN-R | Ceiling joists / rafters | Per species-grade-spacing span tables | hard / engineer if exceeded |
| HDR-TBL | Headers | Stock header sizes per opening width & loading per table | hard / engineer if exceeded |
| BWL-SPC | Braced wall lines | Spacing/length per wind & seismic tables | hard / engineer if exceeded |
| GAR-SEP | Garage separation | ½" gyp walls / ⅝" ceiling below habitable; self-closing 1⅜" solid or 20-min door; no direct bedroom opening | hard |
| BATH-CLR | Fixture clearances | 21" front clearance, 15" WC centerline, 30×30 shower | hard |
| WIN-LIGHT | Light & ventilation | Glazing ≥ 8% of floor area, openable ≥ 4% (or mech vent note) | warn |

**Engineer-required triggers (hard-flag, block nothing else, annotate cover sheet + affected sheet):** clear spans beyond table maxima, openings in braced wall segments beyond limits, wall heights beyond prescriptive limits, roof pitches/spans outside table coverage, any cantilever beyond table allowance. Flag text pattern: `⚠ ENGINEER REQUIRED — [condition] exceeds IRC prescriptive provisions ([rule id]). This sheet is incomplete for permit until a licensed engineer details this condition.`

The validation engine is a pure function: `validate(model, ruleSet) → Finding[]`. Findings carry rule ID, severity, plain-language message, and geometry references (room/wall/opening IDs) so the editor can highlight offenders.

---

## 9. The Sheet Set (Stage 3 renderer)

24×36 (ARCH D) landscape, 3/16" = 1'-0" plan scale default (fall back to 1/8" for wide plans — scale chosen automatically to fit), consistent title block on every sheet.

| Sheet | Contents |
|---|---|
| A-000 Cover | Project title, sheet index, area tabulations (conditioned/garage/porch), code basis statement, excluded-scope block, engineer flags, general notes, NOT-SEALED notice |
| A-101 Floor Plan | Dimensioned plan: overall strings, exterior opening strings, interior partitions, door/window tags, room names + areas, plumbing fixtures, smoke/CO alarm symbols |
| A-102 Dimensioned Slab / Foundation Plan | Slab edges, thickened edges/interior bearing (crawlspace: stemwalls, piers, girder lines, vent calcs), anchor bolt note, per §8 tables |
| A-201 Elevations (Front/Rear) | Generated from plan + roof model: grade line, plate heights, roof pitch tags, window/door placement, material keynotes |
| A-202 Elevations (Left/Right) | Same |
| A-301 Building Section | Cut through primary volume: foundation, floor, wall, ceiling, roof assembly with callouts; heel height; insulation notes (generic, "per local energy code") |
| A-401 Roof Plan | Straight-skeleton generated ridges/hips/valleys, pitch arrows, overhang dims, gutter/downspout notes |
| A-501 Wall Sections & Details | Typical wall section per foundation type; eave/rake details; garage separation detail — from a curated static detail library (SVG blocks), selected by model parameters, NOT generated |
| E-101 Electrical Plan | Receptacle spacing per 12'-rule pass, switching, lighting outlets per room type defaults, GFCI/AFCI annotations, panel location |
| A-601 Schedules | Door schedule, window schedule (with egress-qualifying windows marked), room finish schedule (generic), header schedule from HDR-TBL |

**Roof geometry:** implement the straight-skeleton algorithm for the footprint polygon (gable ends handled as skeleton edits). This is the hardest single geometry task in the project — build it early with a golden-file test suite of footprint→skeleton fixtures (rect, L, T, garage projections).

**Dimensioning:** deterministic dimension-string generator — exterior: overall → wall-segment → opening-centerline hierarchy; interior: partition faces. All from the integer-inch model; formatter emits `14'-6"` style. Never hand-place dimensions.

---

## 10. Geometry Engine Module Map (`/packages/engine`)

```
engine/
  model/        — types: Model, Wall, Opening, Room, RoofPlane, Fixture (all integer inches)
  ops/          — pure mutations: moveWall, resizeRoom, placeOpening… (return new Model + Finding[])
  solve/        — footprint synthesis, treemap seed, annealer (mulberry32)
  validate/     — rule loader, validate(), finding types
  roof/         — straight skeleton, plane derivation, elevation profile extraction
  dims/         — dimension string generation
  render-svg/   — editor renderer (browser)
  render-sheet/ — sheet composition, title block, pdf-lib output
  render-dxf/   — DXF writer
  rules/        — irc-2021/*.json, roomPrograms.json, openingDefaults.json, stateRules.json
```

Engine is UI-free and runs in Node and browser identically. Vitest coverage target: `ops/`, `validate/`, `roof/`, `dims/` at 90%+; golden-file snapshot tests for `render-sheet` (rasterize PDFs in CI, pixel-diff against fixtures).

---

## 11. Database Schema (Supabase)

```sql
profiles(id uuid pk → auth.users, email, name, created_at)
projects(id uuid pk, user_id fk, title, program_spec jsonb, model jsonb,
         model_locked boolean, geometry_hash text, seed_chain int[],
         status enum('interview','layout','locked','generated','purchased','revision'),
         state_code text, created_at, updated_at)
findings_snapshots(id, project_id fk, findings jsonb, created_at)   -- audit trail at lock time
sheet_sets(id, project_id fk, version int, pdf_path text, dxf_path text,
           watermarked boolean, rule_set_version text, created_at)
purchases(id, project_id fk, stripe_payment_intent text, tier text,
          revision_rounds_remaining int, amount_cents int, created_at)
```

RLS on everything by `user_id`. Generated files in a private storage bucket; downloads via short-lived signed URLs gated on purchase.

---

## 12. Editor UX Spec

- Full-viewport SVG canvas, plan always fits with 10% margin; pan/zoom (wheel + pinch); desktop-first, tablet-usable, mobile view-only in Phase 1.
- Selection model: click room → room ops panel; click wall → drag handles on 2" snap; click opening → slide along wall, swap swing, resize from `openingDefaults.json` catalog.
- **Invalid moves never commit.** The attempted geometry ghosts in red for 400 ms with the finding message as a toast, then reverts. Warnings (severity `warn`) commit but persist as amber badges on the offending element.
- Persistent right rail: room schedule with live areas, total conditioned area vs. target (delta shown), findings list (click → highlight geometry).
- Undo/redo as a pure model-state stack (ops are pure, so this is free).
- Keyboard: arrows nudge selection 2", shift-arrows 24", `M` mirror plan, `Cmd/Ctrl-Z` undo.

---

## 13. Claude Prompts (the only two LLM touchpoints)

1. **Intake interviewer.** System prompt generated from the Zod schema. Rules: ask one question at a time, never recommend structural or dimensional decisions, never claim code compliance, emit a spec-patch JSON after each answer. Temperature low. If the client asks "will this pass permit?", the scripted answer explains the validation engine and the unstamped/local-amendment reality — this answer is hardcoded copy, not generated.
2. **Plan narrator.** After lock, generates the cover-sheet "Design Summary" paragraph and the client-facing plan description from the model's computed facts (areas, room list, adjacencies — passed in as data). Prompt forbids introducing any number not present in the input payload (fabrication firewall applies).

---

## 14. Visual Identity — "Vellum & Blueline"

The interface should feel like a modern drafting studio, grounded in the artifacts of the trade — vellum, blueline prints, title blocks — without cosplaying as a blueprint.

**Palette (tokens):**
- `--vellum: #F7F5EF` — app background (warm drafting-paper white)
- `--graphite: #23272B` — primary text, linework
- `--blueline: #1D4ED8` → deep working blue `#173FA8` — the single accent: actions, active dimensions, links
- `--cyanotype: #0B2E63` — dark surfaces (editor chrome, footer)
- `--redline: #C2321E` — findings/errors only (redline markup tradition; never decorative)
- `--amber: #B8860B` — warnings

**Type:** Display — **Big Shoulders Display** (condensed, structural, reads like stencil signage without gimmick). Body — **Public Sans**. Data/dimensions — **Chivo Mono** (all editor readouts, schedules, dimension text in-app). None of these overlap the EngineWorks or Signum systems.

**Signature element:** the **live title block**. Every major UI section (interview spec sheet, editor rail, checkout summary) is framed as a drafting title block — thin double-rule border, corner project stamp, revision letter — and the marketing hero is a real plan being drawn stroke-by-stroke by the actual engine (SVG line-dash animation over genuine generated geometry, not a stock illustration). Structure encodes truth: the title-block frame appears only on surfaces that represent the client's actual document.

Restraint: blueline blue is the only accent; redline appears only on real findings; no gradients; motion budget spent entirely on the hero draw-in and the 400 ms invalid-move ghost.

**Sheet output styling is separate and conservative:** black linework on white, standard pen weights (0.13/0.25/0.35/0.5 mm equivalents), professional title block. The sheets must look like they came from a drafting office, not a startup.

---

## 15. Pricing (Stripe)

| Tier | Price | Contents |
|---|---|---|
| Preview | Free | Watermarked full set, on-screen only |
| Standard | $499 | Full PDF set + 1 revision round |
| Pro | $799 | PDF + DXF + editable model retained 24 months + 2 revision rounds |
| Revision round add-on | $149 | Unlock model for edits + regenerate |

(Phase 3 upsell: materials takeoff sheet, $99 — GC-facing.)

A **revision round** = unlock model → client edits in the same guided editor → regenerate set as version N+1. Deterministic pipeline makes regeneration free to serve; the entire revision economics of traditional drafting inverts in our favor.

---

## 16. QA Firewall

- **Determinism test:** same `(spec, seed)` → byte-identical model JSON, in CI on every commit.
- **Golden sheets:** fixture projects (rect-3bed, L-4bed-3car, T-2bed) render in CI; rasterized pixel-diff against approved PNGs.
- **Rule coverage test:** every rule ID in the tables must be exercised by at least one passing and one failing unit fixture.
- **Fabrication scan:** CI greps sheet text output for code-section patterns (`R\d{3}`) and fails if any citation lacks a matching rule-table entry.
- **No hype vocabulary** in client-facing generated copy (inherit the banned-word list pattern from the video pipeline QA).

---

## 17. Phases & Build Order

**Phase 1 cut line (ship this):** one story · rect/L/T · gable+hip · slab/crawlspace · 2–4 bed · attached garage 0–3 bays · 8/9/10' ceilings · the 10-sheet set in §9 · Oklahoma + exempt states only.

**Explicitly out of Phase 1:** two story, basements, vaulted/cathedral ceilings, porches beyond a simple front stoop module, detached garages, metric, site plans.

**Phase 2:** two story (stacked bearing + plumbing validation, stairs, R311-STAIR), covered porch modules, vaulted great room (with engineer-flag pathway).
**Phase 3:** materials takeoff sheet, options packages, builder/GC accounts, plan marketplace (sell locked plans as stock with parametric re-fit — a second revenue engine that falls out of the architecture for free).

**Build order for Claude Code sessions:**
1. `engine/model` + `ops` + unit tests (the vocabulary of the whole product)
2. `validate` + rule-table loader + fixture tests
3. `render-svg` + minimal editor (load fixture model, drag walls, see findings) — *prove the core loop before any solver work*
4. `roof/` straight skeleton + golden fixtures
5. `dims/` + `render-sheet` A-101 only, end to end → **first milestone: fixture model → real dimensioned floor-plan PDF**
6. Remaining sheets (A-102 → A-601)
7. `solve/` (footprint synthesis → annealer)
8. Intake interview + spec sheet UI
9. Supabase wiring, lock flow, Stripe, watermarking
10. `render-dxf`
11. Marketing site (Vellum & Blueline system, live-draw hero)

---

## 18. Open Decisions

1. **Name/domain.** "Blueline" is the working title. Candidates to check: blueline.build, drawnset.com, planwright.com. Trademark scan needed.
2. **State rules table** — legal verification per state before enabling checkout beyond Oklahoma.
3. **IRC edition strategy** — ship 2021 tables; decide whether jurisdiction selection swaps 2018/2015 tables (architecture supports it via `rule_set_version`) or Phase 2.
4. **Detail library authorship** — the A-501 static details need to be drawn once, well. Commission from a drafter (~$1–2k) vs. build in-engine. Recommend commissioning; they're static assets.
5. **Electrical plan depth** — Phase 1 ships receptacle/switch/lighting layout with NEC-pattern annotations, or defers E-101 to Phase 2. Recommend shipping it; it's mostly rule-driven placement.
6. **DXF at Standard tier?** Currently Pro-only. Drafters will ask.

---

*End of build bible. Laws in §2 govern. Verify every rule-table value before `verified: true`. Ship Phase 1, then iterate.*
