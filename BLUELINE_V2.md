# BLUELINE_V2.md — Build Bible (second attempt)

**Product:** Blueline. Describe a house, or ask for a new concept, and get a new house design with exact dimensions, a full construction document set, section and detail views of the hard assemblies, and high-definition 3D renderings.
**Owner:** PassageLab LLC. Solo builder, Claude Code execution, this file is the persistent context.
**Status:** v1 was built and rejected. A working mock of v2's architecture exists (`/mock/blueline-mock.html`). This document is the single source of truth for everything after the mock.

Read fully before writing code. Section 2 wins over everything else in this file. Section 12 tells you which session you are in.

---

## 0. Why v1 failed and what v2 does differently

v1 asked one person to build three research-grade systems at once: a constraint solver that invents floor plans, a freeform CAD editor, and a from-scratch drawing renderer that had to look like a real set. All three shipped weak. The plans were bad, the drawings did not look professional, the editor was clunky. Diagnosis: the spec, not the execution.

v2 changes:

| v1 | v2 |
|---|---|
| Simulated-annealing solver invents plans | **Module grammar.** House assembled from parametric, pre-validated modules. Claude chooses and configures modules; the engine never invents geometry. |
| Drag-walls SVG editor | **Conversation + parameter panel.** No freeform CAD. Edits are requests to the designer or knob turns on module parameters. |
| Custom SVG/PDF renderer for the sheet set | **Blender + Bonsai (IFC-native BIM)** produces plans, elevations, sections, details, DXF, and renders from one model. Our TS geometry engine owns the model; Bonsai owns the linework. |
| No 3D | Three.js preview in-app (proven in the mock) plus a Blender render service for hero images. |
| Claude limited to intake language | Claude is the **designer**, but speaks only a structured design language against the grammar. Still never draws. |

Market check (Sept 2026): Higharc, ~100 people, trained on 3,500 proprietary BIM home files, has shipped room-furnishing generation and is still developing whole-house generation from natural language. Consumer AI floor plan tools produce concept sketches, not construction documents. Image models (including the ChatGPT drawings that started this) have no geometry and produce plausible-looking plans with hundreds of square feet of error. Nobody is serving the individual client or small custom builder with buildable output. That is the lane.

---

## 1. Product definition

**Input.** A brief in plain language ("modern farmhouse, four bed, primary down, theater, big rear porch, 3-car garage, keep the footprint tight") or a one-liner ("invent something new") or a follow-up ("make the kitchen bigger and move the office to the front").

**Output, per design:**
1. A dimensioned construction document set, 24×36, PDF and DXF, unstamped, with explicit excluded-scope language on the cover sheet (§10.5).
2. Section cuts and detail sheets for the difficult assemblies, generated from the same model, not clip art.
3. An interactive 3D model (finished, framing, section-cut) in the browser.
4. High-definition still renders (exterior hero, rear, eye level; interior kitchen and living in Phase 3).
5. A schedule of every room, opening, and area, all computed from geometry.

**What it never does.** Never emits a dimension that was not computed from the model. Never emits a code value not marked `verified: true` in a rule table. Never lets an image model touch anything with a number on it. Never claims stamped or permit-ready status.

**Who buys.** Individuals planning a custom build, small custom builders, and drafters who want a validated starting model (DXF/IFC). Traditional residential drafting: $1,500 to $5,000 and weeks. Blueline: minutes, $299 to $799 per set, paid revision rounds.

---

## 2. Architecture laws (non-negotiable)

1. **The LLM never touches geometry.** Claude emits a `DesignProgram` (§5) against the grammar schema. Deterministic code turns it into geometry. If a prompt cannot be satisfied within the grammar, the answer is a finding, never an approximation.
2. **Integer inches everywhere.** Every coordinate, length, and offset in the model is an integer inch. Areas are derived. Fractions appear only in stair rise reporting and are computed from integers. Same discipline as integer cents in LedgerOne.
3. **Seeded determinism.** Same `DesignProgram` + same seed + same engine version = byte-identical model, sheets, and IFC. Every RNG is seeded. Golden-file tests enforce this.
4. **Fabrication firewall.** Any value that appears on a sheet or in client copy must trace to (a) the model, (b) a rule table row with `verified: true`, or (c) a static detail asset with a source note. Claude's narrator prompt is forbidden from introducing numbers not present in its input payload.
5. **One model, many outputs.** Plans, elevations, sections, details, schedules, 3D, renders, IFC, DXF all derive from the same `HouseModel`. No output has private geometry.
6. **Validation is data, not code.** IRC checks live in JSON rule tables with `code_ref`, `value`, `unit`, `verified`, `edition`, `source`. Engine code reads tables; it does not hard-code values.
7. **Engineer-required is a first-class result.** Anything outside the prescriptive path is flagged with the specific condition and stays flagged on the cover sheet. Never softened.
8. **Image models are downstream of geometry only.** Optional photoreal passes are conditioned on exact renders (depth/edge) and may only change materials, lighting, and entourage. They never produce a plan, elevation, section, or anything dimensioned.
9. **Working conventions carried forward:** complete file replacements over surgical patches; one batch commit per session; banned-word discipline in generated copy (no "seamless," "cutting-edge," "elevate," "delve," "robust," "leverage"); ship-first-then-iterate inside a phase, never across a law.

---

## 3. System overview

```
 brief ─► Designer (Claude, structured output) ─► DesignProgram (JSON)
                    ▲                                    │
                    │ findings                           ▼
                    │                        Grammar instantiation (TS)
                    │                                    │
                    └──────── Validation (TS, rule tables) ◄── HouseModel (TS, integer inches)
                                                         │
             ┌──────────────┬──────────────┬─────────────┼──────────────┐
             ▼              ▼              ▼             ▼              ▼
      Three.js viewer   IFC export   Render service   Schedules    Narrator (Claude,
      (browser)         (web-ifc)    (Python: Blender  (TS)         language only)
                                      + Bonsai)
                                          │
                              sheets PDF · DXF · sections · details · hero renders
```

**Repo layout (monorepo, pnpm):**
```
apps/web                Next.js App Router. Brief, design view, sheets, 3D, checkout, account.
packages/engine         HouseModel, ops, stairs, openings, roof (straight skeleton). Pure TS, zero deps.
packages/grammar        Module definitions, style packs, composition rules, instantiation. Pure TS.
packages/validate       Rule-table loader, checks, findings. Pure TS.
packages/ifc            HouseModel → IFC4 (web-ifc). Pure TS.
packages/viewer         Three.js viewer (lifted from the mock). Browser only.
packages/preview-svg    Fast SVG plan/elevation/section for in-app preview (lifted from the mock). Not the deliverable.
services/render         Python. FastAPI + ifcopenshell + Blender (headless) + Bonsai. Produces sheets, DXF, renders.
fixtures/               Golden DesignPrograms and their expected HouseModel/IFC/sheet hashes.
rules/                  IRC rule tables (JSON) with verification status.
details/                Parametric detail templates (§8.4).
mock/                   The proof-of-concept HTML. Reference only; do not extend.
```

---

## 4. The module grammar (the core of v2)

A house is a **composition of modules** attached at **ports**, resolved by **composition rules**, dressed by a **style pack**. Modules are parametric and each ships pre-validated for its own interior logic (island clearances, suite circulation, mudroom-to-garage sequence). The grammar guarantees that any legal composition is geometrically consistent; validation then checks code and program.

### 4.1 Module catalog (Phase 1 set)

| Module | Role | Key parameters | Internal logic it guarantees |
|---|---|---|---|
| `living_block` | Open living / kitchen / dining | width, depth, kitchen side (L/R), island (bool), rear-porch door (bool), fireplace (bool) | Island 42" clearance both sides; work triangle within range; dining seats N; rear door aligned to porch |
| `primary_suite` | Bedroom + bath + WIC | bed size class, bath tier (3-fixture / 4-fixture / 5-fixture), WIC size, entry side | Bath fixtures fit with code clearances; WIC reachable from bath or bed per option; one exterior wall for egress |
| `bed_bath_pair` | Secondary bedroom(s) + shared or private bath | count 1–2, bath type (shared hall / jack-and-jill / private), closet type | Each bedroom ≥ 120 sf and ≥ 10' min dim; egress wall; bath ≥ 5' × 8' |
| `stair_core` | Stair + hall spine + foyer | width, run direction, foyer depth, powder room (bool) | Rise/tread from floor-to-floor; landing at both ends; headroom envelope; stacks identically on every level |
| `service_core` | Mudroom, laundry, pantry, garage entry | laundry (bool), pantry (walk-in / reach-in), drop zone length | Garage door → mudroom → kitchen sequence; laundry has exterior or garage wall for venting |
| `flex_room` | Office, theater, playroom, guest | type, area class | Theater has no exterior wall option; office prefers front |
| `garage` | Attached garage | bays 1–3, depth 22/24, side, door count | Header per bay from tables; 20-minute door to house; slab step |
| `porch_front` | Covered front porch | depth, extent (full / entry bay / partial), post spacing | Roof ties below second-floor sill line; posts on grid |
| `porch_rear` | Covered rear porch | depth, extent, screened (bool) | Aligns to living_block rear door |
| `upper_bed_wing` | Second-floor bedrooms + baths + loft | bedroom count, loft (bool), laundry (bool) | Wet rooms stack over first-floor wet zones or a declared chase; sits over bearing lines |

Each module is a TS class with: `params` schema (Zod), `footprint(params)` → integer-inch rect or L, `ports(params)` → list of attachment edges with allowed partner types, `rooms(params)` → internal room rects, `openings(params)` → doors/windows relative to its own frame, `bearing(params)` → bearing lines, and `selfCheck(params)` → findings for its own interior rules.

### 4.2 Ports and attachment

A port is `{ id, edge: "front"|"rear"|"left"|"right", from, to, accepts: ModuleType[], align: "flush"|"centered"|"offset" }`. Composition attaches module B's port to module A's port; the grammar resolves offsets so that shared walls land on a 2" module and doors between modules land on the shared edge.

### 4.3 Composition rules (the "plan types")

Phase 1 ships three plan types; each is a template of module slots and attachment order, not a fixed plan.

- **`split_ranch`** (one story): `stair_core` (as hall spine, no stair) centered; `primary_suite` on one side; `bed_bath_pair` + `flex_room` on the other or behind; `living_block` rear-center; `service_core` between living and `garage`; porches front/rear.
- **`farmhouse_two_story`**: level 1 = `living_block` rear, `primary_suite` one wing, `stair_core` center, `service_core` + `garage` opposite wing, `flex_room` front; level 2 = `upper_bed_wing` over suite side and center, roof over the rest; porches.
- **`compact_two_story`** (narrow lot): no garage or front-load 1-bay; `living_block` full width rear; `stair_core` + `flex_room` front; all bedrooms in `upper_bed_wing` full footprint.

A plan type is data: `{ id, stories, slots: [{ module, required, position, attachTo, port }], roofStrategy, bearingStrategy }`. Adding a plan type is adding a JSON file plus fixtures, not engine code.

### 4.4 Style packs

Style is separate from plan type. A style pack sets: roof form and pitch range, cross-gable and dormer rules, porch post type, window proportions and trim, siding pattern, palette, entry door type, garage door type, foundation preference, ceiling heights. Phase 1: `modern_farmhouse`, `craftsman`, `modern`. The mock's `PAL` object is the seed of this.

### 4.5 Grammar output

`instantiate(plan_type, modules[], style) → HouseModel`. Deterministic. The engine then runs stairs, openings, roof skeleton, bearing, and returns the model plus grammar-level findings (modules that could not attach, ports left unsatisfied, footprint outside limits).

### 4.6 What the grammar is not

It is not a solver. It never searches. If Claude asks for a composition the grammar cannot satisfy, the result is a named finding ("`upper_bed_wing` requires `stair_core` on the same level; none placed"). That finding goes back to Claude in the revise loop (§5.3). The grammar's job is to make every legal design good; Claude's job is to pick a good legal design.

---

## 5. The designer loop (Claude)

### 5.1 DesignProgram schema (Zod, abbreviated)

```ts
DesignProgram = {
  name: string,                       // project name, generated
  style: "modern_farmhouse"|"craftsman"|"modern",
  plan_type: "split_ranch"|"farmhouse_two_story"|"compact_two_story",
  site: { lot_width_ft?: number, front_setback_ft?: number, orientation?: "N"|"S"|"E"|"W" },
  modules: [ { type: ModuleType, params: {...}, slot: string } ],
  finishes: { foundation: "slab"|"crawlspace", studs: "2x4"|"2x6", ceiling_ft: 8|9|10, roof_pitch: 4..12 },
  intent: string                      // one sentence of design intent, used by the narrator only
}
```

Room counts, areas, adjacencies are not free-form fields; they are consequences of module choices and parameters. That is the point: Claude cannot ask for "a 12×11 bath" that the grammar has no way to place.

### 5.2 Prompts (exactly three LLM touchpoints)

1. **Designer.** System prompt is generated from the grammar: available plan types, modules, parameter ranges, style packs, and the composition rules in plain language. Output: `DesignProgram` JSON only. Temperature low. Explicit rules: never emit dimensions outside module parameters; never claim compliance; when the brief conflicts with the grammar, choose the closest legal design and put the conflict in `intent`.
2. **Reviser.** Receives the previous `DesignProgram`, the findings list (severity, code, message, module), and the user's follow-up if any. Output: a patched `DesignProgram`. Max 3 automatic revise cycles before surfacing remaining findings to the user.
3. **Narrator.** After lock: cover-sheet Design Summary and client description, from computed facts only (areas, room list, adjacencies, style). Fabrication firewall: no number that is not in the input payload. Banned-word list enforced by a post-check.

The intake interview from v1 is dropped in favor of a single brief plus follow-ups; the parameter panel covers what an interview used to.

### 5.3 The loop

```
brief → Designer → DesignProgram → instantiate → validate → findings
  if errors or engineer flags: Reviser(program, findings) → repeat (≤3)
  → present model, sheets preview, 3D, findings that remain
user follow-up → Reviser → repeat
"lock" → freeze DesignProgram + engine version + seed → render service → deliverables
```

Every DesignProgram and every findings list is stored (Supabase) so a design is reproducible and the conversation is auditable.

### 5.4 Cost control

One Sonnet call per designer/reviser step; Opus for "invent a concept" only if quality demands it (measure). Cache the grammar system prompt. Hard cap: 6 LLM calls per design before lock, then paid revisions.

---

## 6. Geometry engine (`packages/engine`)

Lifted and hardened from the mock's `engine.js`.

- `HouseModel`: `{ spec, levels[], extras[], walls[], openings[], stair, roof, bearing[], areas, schedule }`. All integer inches. Origin at front-left corner of the main body; front is `y = 0`; the plan is drawn with front at the bottom.
- **Walls** are first-class (not just rect edges): `{ id, x1, y1, x2, y2, thickness, exterior, bearing, level }`, derived from module rooms by edge union. Shared edges become one wall.
- **Openings**: doors and windows with wall id, offset along wall, width, height, sill, swing, type. Windows placed by rule (per style pack spacing), bedrooms guaranteed an egress unit ≥ 5.7 sf clear per R310 table row.
- **Stair**: from floor-to-floor: risers = ceil(rise / 7.75), rise reported as a fraction, treads 10" min, width 36" min (42" default), landing rules, headroom envelope projected to the level above (creates the stair opening rect on level 2).
- **Roof**: straight-skeleton over the union footprint per style pack (gable/hip, cross gable at `stair_core` front, dormer rules). Output: roof planes with pitch, ridge and eave lines with heights, overhangs. This replaces the mock's hand-placed gables.
- **Bearing**: exterior walls plus module-declared bearing lines; floor spans measured between bearing lines drive joist table lookups.
- **Areas**: conditioned (by level), garage, porches, computed from wall geometry. The schedule reports built vs requested and they are allowed to differ but never to disagree with the drawing.
- **Determinism**: no `Math.random`; any variety (window rhythm jitter, entourage) uses a seeded PRNG from `spec.seed`.

Tests: exact tiling (rooms + walls + hall = level footprint); stair math; opening placement never overlaps; every fixture golden-hashes.

---

## 7. Validation engine (`packages/validate`)

### 7.1 Rule table row
```json
{ "id": "R311.7.5.1-rise", "code_ref": "IRC 2021 R311.7.5.1", "subject": "stair riser height", "value": 7.75, "unit": "in", "comparator": "<=", "severity": "error", "edition": "2021", "verified": false, "source": "", "note": "" }
```
`verified: false` rows are allowed in development and **block launch**: the build fails if any row referenced by an enabled check is unverified. Verification = a human reads the code section and records `source` (publication, page/URL) and flips the flag. Track the count on the project board.

### 7.2 Checks (Phase 1)
Habitable room min area and dimension (R304); ceiling height (R305); hall width (R311.6); stair rise/tread/width/headroom/landings (R311.7); egress windows per sleeping room (R310); bath fixture clearances (R307 + fixture table); garage separation and door (R302.5/R302.6); smoke/CO alarm placement rules for E-sheets (R314/R315); floor joist span vs bearing (R502.3 tables by species/grade/size/spacing); header sizing over openings (R602.7 tables); braced wall line spacing and panel count (R602.10, Phase 2 depth); roof rafter span (R802.4); attic access; emergency escape from basements (n/a Phase 1).

### 7.3 Severities
`error` (blocks lock), `engineer` (allowed to lock; prints on cover sheet with the named condition), `warn` (prints in notes), `info` (schedule only). Engineer triggers: clear span beyond prescriptive tables, wall height > 10', openings in braced wall lines beyond limits, 3+ garage bays without a table row, any cantilever, any point load without a defined path.

### 7.4 Jurisdiction
`rule_set_version` selects the edition (2021 default, 2018 optional). State gate at checkout: Oklahoma and stamp-exempt states only at launch (§10.4).

---

## 8. Drawing production (`services/render`)

### 8.1 Why Bonsai
Bonsai (formerly BlenderBIM) is open source, IFC-native, headless-scriptable in Python, and produces architectural 2D drawings (plans, sections, elevations) with proper linework, hatches, and annotation from an IFC model, plus SVG/DXF export and Cycles/EEVEE rendering. It replaces the entire v1 renderer. Fallback if Bonsai drawing quality disappoints on a specific sheet: FreeCAD TechDraw for that sheet only. Do not rebuild a renderer.

### 8.2 The bridge
`packages/ifc` converts `HouseModel` → IFC4 with `IfcWallStandardCase` (with material layers), `IfcSlab`, `IfcRoof`/`IfcSlab` planes, `IfcDoor`, `IfcWindow`, `IfcStair`, `IfcSpace` per room with name and computed area, `IfcBuildingStorey` per level, `IfcColumn` for porch posts, `IfcFooting`. Dimensions are integer inches converted at the boundary. The IFC file is also a deliverable (Pro tier) for drafters and engineers.

### 8.3 The service
FastAPI on a container (Modal or Fly.io; GPU not required for EEVEE, optional for Cycles). Endpoint `POST /jobs {design_id, ifc_url, sheet_list, render_list}` → job id; worker runs Blender headless with a Bonsai script: import IFC, generate drawings per sheet spec, export SVG → PDF (24×36, title block from template), export DXF, render camera list, upload to Supabase Storage, post webhook. Jobs are idempotent by `(design_id, engine_version, seed)`.

### 8.4 Sheet set (Phase 1 deliverable)
```
A-000 Cover: title block, index, design summary (narrator), area table, scope exclusions, engineer-required list, code edition, unstamped notice
A-101 Main floor plan  A-102 Upper floor plan (if 2-story)
A-103 Foundation plan (slab or crawl; footings, piers, anchor bolt notes)
A-104 Roof plan (planes, pitches, ridges, valleys, overhangs, downspouts)
A-201 Front / A-202 Rear / A-203 Left / A-204 Right elevations
A-301 Building section (through stair)  A-302 Building section (through living block)
A-401 Framing plans (floor and roof, joist/rafter direction, bearing, headers)
A-501 Wall sections and details (§8.5)
A-601 Door and window schedules; room finish schedule
E-101 Electrical plan (receptacle/switch/light layout from placement rules; "design by others" for service)
```

### 8.5 Sections and details: the "how to build the hard part" sheets
Two sources, both from the model:
1. **Building sections** cut by Bonsai at engine-chosen planes: through the stair (shows rise, headroom, landings), through the living block (shows plate heights, roof heel, porch tie-in), through any cross gable or dormer.
2. **Parametric detail templates** in `/details`: typical wall at slab, at crawl, at rim; eave and rake; ridge; cross-gable valley; window head/jamb/sill; door threshold at garage; stair stringer and guard; porch beam-to-post-to-pier; roof-to-wall at porch tie-in; bearing beam pocket. Each template is a small Python/Bonsai script parameterized by the spec (stud size, foundation type, pitch, heel height, siding type) and rendered at 3/4" or 1-1/2" scale. Never static clip art. Every callout value traces to the spec or a verified table row.
Also: exploded framing views (3D, sheathing off) for the cross gable and stair opening rendered as annotated images on A-501.

### 8.6 Line and sheet standards
Line weights per AIA convention (cut walls heavy, beyond light, hidden dashed), dimension strings to face of framing, room tags with computed area, north arrow, graphic scale, title block from a single template with the live fields (project, sheet, scale, issue date, engine version hash).

---

## 9. 3D and renders

### 9.1 In-app viewer (`packages/viewer`)
Lift the mock's Three.js viewer wholesale: PBR materials per style pack, sun with shadows, environment map, finished/framing modes, section-cut clipping plane with `clipShadows`, camera presets, 4K PNG export. Add: cap faces at the cut plane (stencil) so cut walls read solid; interior floor and ceiling finishes; furniture blocks from module definitions (bed, island, sofa, tub) so rooms read at scale.

### 9.2 Hero renders (render service)
Blender Cycles (or EEVEE Next for speed) from the same IFC: exterior front three-quarter, rear, eye-level entry, aerial. Material library per style pack. Sky HDRI. 4K output. Phase 3 adds interior kitchen and living renders using module furniture.

### 9.3 Optional photoreal pass (Law 8)
Depth and normal passes from Blender may condition a diffusion model (Higgsfield or a ControlNet-class pipeline) to enhance materials, lighting, and landscaping. Guardrails: the pass is labeled "artistic rendering" in the UI and never appears on a sheet; geometry-preserving conditioning strength only; disabled by default; user opts in per image.

---

## 10. Product shell (`apps/web`)

### 10.1 Pages
`/` marketing (Vellum & Blueline system, live example) · `/design` brief → design view (findings rail, program, areas, tabs: plan, elevations, section previews, 3D, schedule) · `/design/[id]/sheets` sheet viewer after lock · `/account` projects, downloads, revisions.

### 10.2 Supabase schema
`profiles` · `projects (id, user_id, name, state, created_at)` · `designs (id, project_id, design_program jsonb, seed, engine_version, findings jsonb, model_hash, locked_at)` · `messages (design_id, role, content, program_patch jsonb)` · `jobs (design_id, kind, status, artifacts jsonb, error)` · `purchases (design_id, tier, stripe_session, state_code)` · `rule_verifications (rule_id, verified_by, source, verified_at)`.

### 10.3 Tiers
Standard $299: PDF set (A-000 through A-601, E-101), 3D viewer, 2 hero renders, 1 revision round. Pro $799: adds DXF and IFC, all details at 1-1/2" scale, framing exploded views, 6 renders, 3 revision rounds. Revision round: $99. Renders à la carte.

### 10.4 State gate
Checkout requires a state. Enabled list starts with Oklahoma plus states where single-family residential CDs need no stamp; each addition needs a recorded legal check. Disabled states get a clear message and a waitlist.

### 10.5 Cover-sheet language (fixed copy, not generated)
Unstamped; prepared from a validated model against IRC <edition> prescriptive provisions; local amendments, site, soils, septic, HVAC design (Manual J/S/D by others), energy compliance documentation, and structural conditions flagged "engineer required" are excluded; purchaser is responsible for permit submission and local review; dimensions to face of framing; verify in field.

### 10.6 Visual identity
Vellum & Blueline, unchanged from v1: vellum `#F7F5EF`, graphite `#23272B`, working blue `#173FA8`, cyanotype `#0B2E63`, redline `#C2321E` (findings only), amber `#B8860B`. Big Shoulders Display / Public Sans / Chivo Mono. The mock implements this; keep it.

---

## 11. QA firewall

- **Determinism:** every fixture in `/fixtures` hashes identically on every CI run (model JSON, IFC, sheet SVGs).
- **Tiling invariant:** rooms + walls + circulation = footprint, per level, exactly.
- **Area invariant:** schedule totals equal geometry totals; no typed areas anywhere in the codebase (lint rule bans numeric literals in schedule code).
- **Rule verification gate:** CI fails on launch branches if any enabled check references `verified: false`.
- **Sheet diff:** golden PDFs rasterized and diffed per sheet; changes require a reviewed golden update.
- **Drafter review:** before launch, three fixtures (the farmhouse from the mock, the ranch, a compact two-story) are reviewed by a licensed drafter or engineer against the PDFs; every note becomes a test or a rule row.
- **Narrator firewall test:** every number in narrator output must appear in its input payload; test extracts and compares.
- **Banned-word lint** on all generated copy.

---

## 12. Phase plan with the 0–100 score

Score = production readiness where 100 means a client can pay and a framer can build from the set. Current mock: **8**. **Current build: 30** (2026-09-07: Phases 1–2 closed — grammar with 3 plan types/3 styles/module self-checks, designer loop with deterministic fallback, engine invariants, reference-adopted checks. An INTERIM pdf-lib sheet set, SVG elevations, and a Three.js viewer exist but score no Phase 3–6 credit: the Bonsai/IFC pipeline, render service, verified rules, and shell remain open. /mock was never committed; the engine was built from §6 directly.)

| Phase | Sessions | Deliverable | Score after |
|---|---|---|---|
| **1. Grammar** | 1–6 | `packages/engine` hardened from mock; `packages/grammar` with the 10 Phase-1 modules, 3 plan types, 3 style packs; `instantiate()`; fixtures for farmhouse, ranch, compact | 22 |
| **2. Designer loop** | 7–9 | Designer/Reviser prompts generated from grammar; propose-validate-revise; conversation follow-ups; parameter panel wired to module params | 30 |
| **3. Bonsai pipeline** | 10–15 | `packages/ifc`; render service on Modal/Fly; A-101/A-102 and A-201–204 through Bonsai; PDF assembly; DXF | 48 |
| **4. Full set + details** | 16–21 | A-000, A-103, A-104, A-301/302, A-401, A-501 templates, A-601, E-101; exploded framing views | 62 |
| **5. Verified rules** | 22–24 | All Phase-1 rule rows verified with sources; header/joist/rafter tables; braced wall lines; CI gate on | 74 |
| **6. Renders** | 25–26 | Blender hero renders; viewer polish (caps, furniture); optional conditioned pass behind a flag | 80 |
| **7. Shell** | 27–30 | Auth, projects, Stripe tiers, state gate, cover copy, delivery, revision flow, marketing site | 90 |
| **8. Proof** | 31–33 | Three fixtures reviewed by a drafter; fixes; terms; launch in Oklahoma | 100 |

Phase 1 is the whole game. Do not start Phase 3 with a weak grammar; a beautiful set of a bad plan is worthless.

**Explicitly out of v2.0:** basements, vaulted or cathedral ceilings (Phase 2 engineer pathway), detached garages, metric, site plans, commercial, three stories, curved or angled walls.

---

## 13. Session playbook (Claude Code)

At the start of every session: read this file, read `/fixtures/README.md`, run tests, state which phase and session you are in and what "done" is for this session.

Rules:
- Complete file replacements. Never partial edits to files you did not read fully in this session.
- One batch commit per session, message: `S<nn> <phase>: <what shipped>`.
- Every new module, plan type, or style pack ships with a fixture and its golden hash.
- Every rule row you add starts `verified: false` and is listed in `rules/UNVERIFIED.md`.
- Never add a numeric literal to any code path that emits to a sheet; it goes in a rule table or the spec.
- If the grammar cannot express something the brief asks for, add a finding, not a special case.
- When you touch the viewer or preview SVG, render a fixture headlessly and look at it before committing (the mock's `gltest.js` harness shows how: `gl` + `xvfb-run`).
- Update §12's score in this file when a phase closes. Do not round up.

Session 1 target: `packages/engine` extracted from `/mock` into TS with types, integer-inch invariants, and the farmhouse fixture passing tiling and determinism tests. Session 2: `living_block`, `primary_suite`, `stair_core` modules with ports and self-checks. Session 3: `farmhouse_two_story` plan type instantiating end to end into the existing preview SVG and viewer.

---

## 14. Open decisions

1. Render service host: Modal (simplest GPU path) vs Fly.io (cheaper CPU-only EEVEE). Decide in Phase 3.
2. IFC authoring: `web-ifc` from TS (keeps Law 5 in one language) vs `ifcopenshell` in the Python service (richer). Default: web-ifc; fall back if property sets get painful.
3. Detail scale: 3/4" throughout on Standard, 1-1/2" on Pro, or all at 1-1/2" and fewer sheets.
4. Electrical on Standard tier or Pro only.
5. Name and domain (Blueline working title; trademark scan still pending from v1).
6. Whether "invent a concept" uses Opus; measure quality delta on 20 prompts before deciding.
7. Furniture in the viewer at Phase 1 or Phase 6. It helps sell scale early; it costs module authoring time.
8. Whether to expose the DesignProgram JSON to Pro users (power users and drafters would want it; it also invites unsupported edits).

---

*End of bible. Laws in §2 govern. Grammar first. Verify every rule row before `verified: true`. Update the score honestly.*
