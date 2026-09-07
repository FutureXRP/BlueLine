# Changelog

## 1.0.0 — Initial reproducible geometry lock

- Established a 1/8-inch integer source geometry.
- Defined stable IDs for rooms, walls, doors, windows, sliders, and garage doors.
- Built first- and second-floor deterministic vector plans.
- Added deterministic ASCII DXF export in inches.
- Added deterministic OBJ 3D wall/slab mass model and convenience GLB export.
- Added room and opening schedules.
- Added 17 automatic geometry/program/circulation validations.
- Added byte-for-byte reproducibility test across two clean generations.
- Validator caught and forced correction of an early stair/central-hall overlap before v1.0.0 was accepted.

### Current architectural status

This is the locked geometric framework, not a permit-ready structural/code set. Roof geometry, exact stair riser/tread engineering, structural framing, foundation/site engineering, MEP, energy code, and jurisdiction-specific code review remain future model layers.
