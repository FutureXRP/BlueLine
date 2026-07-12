/**
 * Blueline geometry model — the vocabulary of the whole product.
 *
 * LAW #2 (Build Bible §2): ALL dimensions are integer inches. No floats in
 * the data model. Areas are computed in square inches; display formatting to
 * feet-and-inches happens only at the render boundary (see model/format.ts).
 *
 * Coordinate system: +x east, +y south (screen-style), origin at the
 * north-west corner of the footprint bounding box. Plan view.
 */

/** Integer inches. */
export type Inches = number;

export interface Point {
  x: Inches;
  y: Inches;
}

/** Closed polygon, counter-clockwise in plan (x east, y south), integer inches. */
export type Polygon = Point[];

export type RoomType =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'hall'
  | 'closet'
  | 'laundry'
  | 'garage'
  | 'office'
  | 'mudroom'
  | 'flex'
  | 'pantry'
  | 'porch';

/** Room types counted as habitable for R304/R305-class checks. */
export const HABITABLE_TYPES: ReadonlySet<RoomType> = new Set([
  'bedroom',
  'kitchen',
  'living',
  'dining',
  'office',
  'flex',
]);

/** Room types counted toward conditioned area. */
export const CONDITIONED_TYPES: ReadonlySet<RoomType> = new Set([
  'bedroom',
  'bathroom',
  'kitchen',
  'living',
  'dining',
  'hall',
  'closet',
  'laundry',
  'office',
  'mudroom',
  'flex',
  'pantry',
]);

/**
 * Phase-1 rooms are axis-aligned rectangles (interior clear dimensions).
 * x,y is the north-west corner of the clear floor area.
 */
export interface Room {
  id: string;
  name: string; // display name, e.g. "Bedroom 2"
  type: RoomType;
  x: Inches;
  y: Inches;
  w: Inches;
  h: Inches;
}

export type WallKind = 'exterior' | 'interior' | 'garageSeparation';

/**
 * Wall centerline segment. Axis-aligned in Phase 1 (x1===x2 or y1===y2).
 */
export interface Wall {
  id: string;
  kind: WallKind;
  x1: Inches;
  y1: Inches;
  x2: Inches;
  y2: Inches;
  /** Framed thickness incl. finish, integer inches (2x4→5, 2x6→7 nominal-ish). */
  thickness: Inches;
}

export type OpeningType = 'door' | 'window' | 'garageDoor' | 'opening'; // 'opening' = cased opening, no door

export type DoorSwing = 'inLeft' | 'inRight' | 'outLeft' | 'outRight' | 'slider' | 'none';

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  /** Distance from wall start (x1,y1) to opening CENTERLINE along the wall. */
  offset: Inches;
  width: Inches;
  height: Inches;
  /** Sill height above finished floor; 0 for doors. */
  sill: Inches;
  swing: DoorSwing;
  /** Door fire rating for garage separation (minutes); 0 = unrated. */
  fireRatingMin?: number;
  /** Self-closing hardware (garage separation requirement). */
  selfClosing?: boolean;
  /** Marks the required exterior egress door. */
  egressDoor?: boolean;
  /** Window operable (openable) flag, for light/vent + egress checks. */
  operable?: boolean;
}

export type FixtureType =
  | 'wc'
  | 'lavatory'
  | 'tub'
  | 'shower'
  | 'kitchenSink'
  | 'range'
  | 'refrigerator'
  | 'dishwasher'
  | 'washer'
  | 'dryer'
  | 'waterHeater'
  | 'smokeAlarm'
  | 'coAlarm'
  | 'panel';

export interface Fixture {
  id: string;
  type: FixtureType;
  roomId: string;
  x: Inches;
  y: Inches;
  /** Rotation in quarter turns clockwise from north-facing (0..3). */
  rot: 0 | 1 | 2 | 3;
}

export type RoofStyle = 'gable' | 'hip';

export interface RoofSpec {
  style: RoofStyle;
  /** Rise per 12 run. */
  pitch: 4 | 5 | 6 | 8;
  /** Horizontal overhang beyond exterior wall face, integer inches. */
  overhang: Inches;
  /**
   * For gable roofs: footprint edge indices (into Model.footprint) that are
   * gable ends. Empty for hip.
   */
  gableEdges: number[];
}

export interface Model {
  modelVersion: 1;
  units: 'in';
  /** Exterior wall centerline footprint, CCW, rectilinear, integer inches. */
  footprint: Polygon;
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  fixtures: Fixture[];
  roof: RoofSpec;
  ceilingHeight: 96 | 108 | 120;
  foundation: 'slab' | 'crawlspace';
  exteriorWall: '2x4' | '2x6';
  /** Solver seeds used, for reproducibility (Law #3). */
  seedChain: number[];
}

/** A validation finding. See validate/. */
export type Severity = 'hard' | 'warn' | 'engineer';

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  /** Geometry references so the editor can highlight offenders. */
  refs: { roomIds?: string[]; wallIds?: string[]; openingIds?: string[] };
  /** True if the underlying rule table entry is verified against 2021 IRC. */
  verified: boolean;
  citation: string;
}
