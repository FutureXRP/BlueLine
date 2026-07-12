# Blueline

A web platform that interviews a client about their custom home, lets them shape a validated floor plan in a guided editor, and generates a complete, dimensioned, IRC-prescriptive construction document set — buildable, unstamped — as a 24×36 PDF sheet set plus DXF.

**[Build.md](./Build.md) is the build bible.** The Non-Negotiables in its §2 govern everything in this repo.

## Repository layout

```
packages/engine   — pure TypeScript geometry/validation/render engine (no UI)
  src/model/        types + geometry + render-boundary formatters (integer inches everywhere)
  src/ops/          pure mutations: moveWall, openings, mirror… (return new Model + Finding[])
  src/solve/        mulberry32 seeded solver: ProgramSpec → validated candidate models
  src/validate/     validate(model, ruleSet) → Finding[]; rule loader; fabrication scan
  src/roof/         straight skeleton for rectilinear footprints (hip + gable)
  src/dims/         three-tier exterior dimension-string generator
  src/render-svg/   editor renderer (browser)
  src/render-sheet/ pdf-lib ARCH D sheet set (A-000, A-101, A-401 so far)
  src/render-dxf/   minimal DXF writer (LINE/CIRCLE/ARC/TEXT, exploded dims)
  src/takeoff/      materials takeoff: model → quantity estimate (A-901 sheet + CSV)
  src/rules/        irc-2021/*.json rule tables + roomPrograms/openingDefaults/stateRules
  src/fixtures/     golden fixture models (rect-3bed)
apps/web          — Next.js 14 app: landing + guided editor (/editor)
```

## Quick start

```bash
pnpm install
pnpm -r test                 # engine test suite (determinism, rule coverage, golden roofs…)
pnpm --filter @blueline/engine demo   # fixture model → test-output/rect3bed.pdf (A-000/A-101/A-401)
pnpm --filter @blueline/web build && pnpm --filter @blueline/web start   # editor at /editor
```

## Status vs. Build.md §17 build order

| Step | Status |
|---|---|
| 1. engine/model + ops + unit tests | ✅ |
| 2. validate + rule tables + fixture tests | ✅ (all rules ship `verified:false` — see below) |
| 3. render-svg + minimal editor | ✅ core loop: drag walls, invalid moves ghost + never commit |
| 4. roof straight skeleton + golden fixtures | ✅ rect/L/T, hip + gable |
| 5. dims + render-sheet A-101 end to end | ✅ **first milestone: fixture → dimensioned floor-plan PDF** |
| 6. Remaining sheets (A-102…A-601) | ◻ A-401 + A-901 (materials takeoff) done; A-102/201/202/301/501/E-101/601 next |
| 7. solve/ | ✅ v0.1 (rect family, zone-band placement; annealer + L/T next) |
| 8. Intake interview + spec sheet UI | ◻ (ProgramSpec Zod schema in place — prompts derive from it) |
| 9. Supabase, lock flow, Stripe, watermarking | ◻ (watermark renderer exists; wiring next) |
| 10. render-dxf | ✅ minimal writer |
| 11. Marketing site | ◻ (token system + landing stub in place) |

## Non-negotiables enforced in code

- **Integer inches everywhere** — feet-and-inches formatting only at the render boundary (`model/format.ts`); a test walks the fixture model and asserts every number is an integer.
- **Seeded determinism** — `(spec, seed)` → byte-identical model JSON in CI; sheet PDFs are byte-identical across runs.
- **Data-driven rules** — every check resolves its numeric values from `rules/irc-2021/*.json` by rule ID. No code value inline in engine source.
- **Fabrication firewall** — `fabricationScan()` fails CI if any `R###` citation in sheet text doesn't trace to a rule-table entry; missing rules render as "VERIFY WITH LOCAL CODE OFFICIAL", never an invented number.
- **One geometry model, two renderers** — the SVG editor and the PDF/DXF sheets consume the identical `Model`.

## ⚠ Rule verification status

**Every value in `rules/irc-2021/*.json` is REPRESENTATIVE and ships `verified: false`.** A mandatory pre-launch task is line-by-line verification of every rule against the published 2021 IRC, recording the verifying session in each rule's `citation` and flipping `verified: true`. Until then every generated sheet carries VERIFY language, and the cover sheet says so explicitly.

Deliverables are prepared under the IRC prescriptive provisions, exclude site-specific engineering, and are **not an architect's or engineer's sealed documents**.

## Materials takeoff (A-901)

`materialsTakeoff(model)` derives a purchase-planning quantity estimate directly from the locked model: concrete/vapor barrier/anchor bolts, studs + plates + headers (headers reuse the HDR-TBL selection, never invented), ceiling joists, rafters and ridge/hip/valley lengths from the straight skeleton with true slope-adjusted lengths, wall/roof sheathing, shingles, door/window counts by size (rated garage door called out), and gypsum including 5/8" Type X at the garage separation. Practice factors (spacing, waste percentages, sheet sizes) live in `rules/takeoffFactors.json`, not in code. Every item carries a one-line `basis` so a builder can sanity-check it, and every output — the A-901 sheet and `takeoffToCsv()` — carries the notice: **quantity estimate for budgeting only; verify with your framer and supplier before purchase.**
