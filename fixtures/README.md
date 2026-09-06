# Fixtures

Golden fixtures and their expected hashes (BLUELINE_V2.md §3, §11). Every
fixture must hash identically on every CI run — model JSON now; IFC and sheet
SVGs as those pipelines land (Phase 3+).

## Current fixtures

| Fixture | Source | Golden |
|---|---|---|
| `farmhouse_two_story` | `packages/engine/src/fixtures/farmhouseV2.ts` | `farmhouse.hash.json` |

The farmhouse is currently a hand-authored `HousePlanInput` (level plans →
`buildHouse`). When the grammar lands (Sessions 2–3) it becomes a
`DesignProgram` fixture instantiated through `packages/grammar`, and the
ranch + compact-two-story fixtures join it. Do not edit a fixture and its
hash in the same commit without saying why in the commit message.

## Updating a golden

1. Make the engine change.
2. Run the suite; the determinism test prints the new hash on failure.
3. Review the diff of the model JSON (not just the hash), then update the
   `.hash.json` file in the same commit as the change that moved it.

v1 note (2026-09): the `/mock` proof-of-concept referenced by BLUELINE_V2.md
was never committed to this repository, so Session 1 built the engine core
from the bible's §6 spec directly, carrying forward v1's proven primitives
(integer-inch discipline, stable hashing, straight skeleton).
