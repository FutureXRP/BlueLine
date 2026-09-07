# Reproducible Farmhouse Generator

This project turns a single dimensioned house specification (`house.yaml`) into deterministic architectural outputs.

## Source of truth

`house.yaml` is the only file that should be edited to change the building geometry. Lengths are parsed into **integer 1/8-inch ticks**, so the model avoids floating-point drift in its source geometry.

Coordinate system:
- Origin = southwest outside corner of the first-floor main house.
- +X = east, +Y = north, +Z = up.
- All wall IDs and opening IDs are stable across regeneration unless deliberately changed.

## Generate

```bash
python generate.py
```

Outputs are written to `output/`:
- `A1.1_first_floor.svg` and `.png`
- `A1.2_second_floor.svg` and `.png`
- `farmhouse.dxf`
- `farmhouse_mass_model.glb`
- `room_schedule.csv`
- `opening_schedule.csv`
- `validation_report.txt`
- `manifest.json`

## Reproducibility test

```bash
python tests/test_reproducible.py
```

The test generates the deliverables twice in clean temporary folders and confirms their SHA-256 hashes match for deterministic outputs.

## Important architectural boundary

The generator guarantees internal dimensional consistency of the encoded model. It does **not** replace site-specific review by a licensed architect/engineer for structural design, foundations/soil, energy code, wind/seismic loads, fire/life-safety, egress, accessibility, or local permitting.

## IFC

The project includes exact geometry and stable IDs suitable for an IFC exporter. IFC generation is intentionally kept optional because `ifcopenshell` is not available in the current execution environment. When it is installed, an IFC export module can consume the same normalized model without changing the house geometry.
