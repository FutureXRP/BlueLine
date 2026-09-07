# IFC export path

The master geometry is already normalized into stable building IDs and exact 1/8-inch integer coordinates. The next BIM adapter will map:

- project -> `IfcProject`
- stories -> `IfcBuildingStorey`
- exterior/interior wall objects -> `IfcWall`
- openings -> `IfcOpeningElement`
- doors -> `IfcDoor`
- windows -> `IfcWindow`
- room polygons -> `IfcSpace`
- floor slabs -> `IfcSlab`

The adapter should consume `output/normalized_model.json`; it must not contain independent dimensions.

`ifcopenshell` is not installed in the current execution environment, so IFC bytes are not included in v1.0.0. The DXF, OBJ, GLB, SVG plans, schedules, and normalized JSON are generated now from the same source geometry.
