# Unverified rule rows

Every row in `rules/*.json` with `verified: false` is listed here. Verification
means a human reads the cited code section, records `source` (publication,
page/URL) on the row, flips `verified: true`, and removes the row from this
list. CI fails launch branches while any enabled check references an
unverified row (BLUELINE_V2.md §7.1, §11).

| Rule id | Subject |
|---|---|
| R311.7.5.1-rise | stair riser height, max |
| R311.7.5.2-tread | stair tread depth, min |
| R311.7.1-width | stair clear width, min |
| R311.7.2-headroom | stair headroom, min |
| R304.1-area | habitable room area, min |
| R304.2-dim | habitable room horizontal dimension, min |
| R305.1-ceiling | habitable ceiling height, min |
| R311.6-hall | hallway clear width, min |
| R310.2.1-egress-area | emergency escape opening net clear area, min |

Count: 9 unverified / 9 total.
