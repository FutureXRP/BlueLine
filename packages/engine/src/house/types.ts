/**
 * HouseModel v2 (BLUELINE_V2.md §6) — the one model every output derives from.
 *
 * Law 2: every coordinate, length, and offset is an INTEGER INCH. Fractions
 * appear only in stair rise reporting and are computed from integers.
 *
 * Coordinates: origin at the front-left corner of the main body; front is
 * y = 0; +x right, +y toward the rear. The plan is drawn front-at-bottom.
 *
 * Walls are FIRST-CLASS: derived from module room rectangles by edge union
 * (shared edges become one wall), never authored by hand. See walls.ts.
 */

export type Inches = number; // integer

export interface Rect {
  x: Inches;
  y: Inches;
  w: Inches;
  h: Inches;
}

export type RoomType =
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'bedroom'
  | 'bathroom'
  | 'closet'
  | 'hall'
  | 'foyer'
  | 'stairwell'
  | 'laundry'
  | 'mudroom'
  | 'pantry'
  | 'office'
  | 'flex'
  | 'loft'
  | 'theater'
  | 'garage'
  | 'porch';

/** Room types counted toward conditioned area. */
export const CONDITIONED: ReadonlySet<RoomType> = new Set([
  'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'closet', 'hall',
  'foyer', 'stairwell', 'laundry', 'mudroom', 'pantry', 'office', 'flex',
  'loft', 'theater',
]);

export const HABITABLE: ReadonlySet<RoomType> = new Set([
  'living', 'kitchen', 'dining', 'bedroom', 'office', 'flex', 'loft', 'theater',
]);

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  rect: Rect;
  /** as-built override of the level's floor-to-ceiling (vaults, dropped or
   *  raised ceilings); when absent the level value applies */
  ceilingIn?: Inches;
}

/** Derived wall segment. `roomIds` = rooms whose edge produced it (1 = at
 *  footprint boundary, 2 = shared interior edge). */
export interface Wall {
  id: string;
  level: number;
  x1: Inches;
  y1: Inches;
  x2: Inches;
  y2: Inches;
  thickness: Inches;
  exterior: boolean;
  bearing: boolean;
  roomIds: string[];
}

export type OpeningType = 'door' | 'window' | 'garageDoor' | 'cased' | 'slider';
export type Swing = 'inLeft' | 'inRight' | 'outLeft' | 'outRight' | 'none';

export interface Opening {
  id: string;
  level: number;
  wallId: string;
  type: OpeningType;
  /** distance from wall start (x1,y1) to opening centerline */
  offset: Inches;
  width: Inches;
  height: Inches;
  sill: Inches;
  swing: Swing;
  fireRatingMin?: number;
  selfClosing?: boolean;
  egress?: boolean;
  operable?: boolean;
}

/** Exact fraction from integer division: whole + num/den, gcd-reduced. */
export interface Fraction {
  whole: number;
  num: number;
  den: number;
}

export interface Stair {
  levelFrom: number;
  levelTo: number;
  /** stairwell room id on the lower level */
  roomId: string;
  widthIn: Inches;
  riserCount: number;
  riserHeight: Fraction; // exact, from floorToFloor / riserCount
  treadDepthIn: Inches;
  runIn: Inches; // (riserCount - 1) * tread
  direction: 'front' | 'rear' | 'left' | 'right';
  /** rect projected onto the upper level as the stair opening */
  opening: Rect;
}

export interface BearingLine {
  level: number;
  x1: Inches;
  y1: Inches;
  x2: Inches;
  y2: Inches;
}

export interface LevelModel {
  index: number; // 0 = main floor
  name: string;
  /** footprint as a set of disjoint rects whose union is the level outline */
  footprint: Rect[];
  floorToCeilingIn: Inches;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
}

export interface RoofSpec {
  style: 'gable' | 'hip';
  pitch: number; // rise per 12
  overhangIn: Inches;
  /** footprint edge indices treated as gable ends (weighted skeleton) */
  gableEdges: number[];
}

export interface HouseSpec {
  seed: number;
  engineVersion: string;
  style: string; // style pack id (grammar, Session 2+)
  planType: string; // plan type id (grammar, Session 3+)
  foundation: 'slab' | 'crawlspace';
  studs: '2x4' | '2x6';
  /** wall thicknesses are spec values (construction dims, not code values) */
  exteriorWallThicknessIn: Inches;
  interiorWallThicknessIn: Inches;
  /** structural floor-to-floor for stair math */
  floorToFloorIn: Inches;
  roofPitch: number;
}

export interface Areas {
  conditionedByLevelSqIn: number[];
  conditionedTotalSqIn: number;
  garageSqIn: number;
  porchSqIn: number;
  footprintSqIn: number;
}

export interface ScheduleRow {
  level: number;
  roomId: string;
  name: string;
  type: RoomType;
  areaSqIn: number; // computed from geometry, never typed
}

export type FindingSeverity = 'error' | 'engineer' | 'warn' | 'info';

export interface Finding {
  severity: FindingSeverity;
  code: string; // rule row id, or GEOM-* for model-integrity findings
  message: string;
  refs: { level?: number; roomIds?: string[]; wallIds?: string[] };
}

/** Open structures attached to a level but outside the conditioned footprint
 *  (bible §6 "extras"): porches, stoops, upper-level decks. Drawn light,
 *  never tiled. `level` defaults to 0. */
export interface Extra {
  id: string;
  name: string;
  kind: 'porchFront' | 'porchRear' | 'stoop' | 'deck';
  rect: Rect;
  level?: number;
}

export interface HouseModel {
  modelVersion: 2;
  spec: HouseSpec;
  levels: LevelModel[];
  extras: Extra[];
  stair: Stair | null;
  roof: RoofSpec;
  bearing: BearingLine[];
  areas: Areas;
  schedule: ScheduleRow[];
  /** as-built notes carried onto A-000 (scope flags, field conditions) */
  annotations?: string[];
}

export function rectArea(r: Rect): number {
  return r.w * r.h;
}

export function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Exact integer division as a reduced mixed fraction. */
export function fraction(numerator: number, denominator: number): Fraction {
  const whole = Math.floor(numerator / denominator);
  const rem = numerator - whole * denominator;
  if (rem === 0) return { whole, num: 0, den: 1 };
  const g = gcd(rem, denominator);
  return { whole, num: rem / g, den: denominator / g };
}

export function formatFraction(f: Fraction): string {
  return f.num === 0 ? `${f.whole}"` : `${f.whole} ${f.num}/${f.den}"`;
}
