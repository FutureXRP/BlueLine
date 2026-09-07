/**
 * Blair residence — as-built digitization (owner layout PDF + photos).
 *
 * Source of truth: the owner's vector first-floor layout (85 embedded
 * dimension strings) plus the stock-plan room labels and four photos of the
 * finished house. Two wings:
 *
 *   - MIL wing (left, x 0–312): 26'0" wide × 74'0" deep. Rear side-load
 *     2-car garage 26'0" × 22'0", living 26'0" × 18'0" below it, 12'6"-wide
 *     bedroom column at the front with a 4'0" hall, kitchen/dining/bath
 *     column at 9'6", covered porch in the front notch.
 *   - Main house (right, x 312–840): 44'0" wide × 46'6" deep. Rear
 *     side-load 2-car garage 26'0" × 22'0", primary suite on the right
 *     (14'0" × 16'0" bed per stock plan; bath + W.I.C. behind), family room
 *     with the theater above it, kitchen/dining run, stair core.
 *
 * Owner-stated as-builts: family ceiling closed at 10'0" by the theater
 * room added above it; primary bedroom vaulted; upper floor 8'0"; walkout
 * deck above the covered rear porch. Fractional PDF dims (26'1 3/8" etc.)
 * are snapped to whole inches per Law 2; every snap and every inferred room
 * is listed in `annotations` and in the open-questions list for the owner.
 */
import type { HousePlanInput } from '../house/build.js';

export function blairResidence(): HousePlanInput {
  return {
    spec: {
      seed: 7,
      engineVersion: '2.0.0-s2',
      style: 'modern_farmhouse',
      planType: 'blair_asbuilt',
      foundation: 'slab',
      studs: '2x6',
      exteriorWallThicknessIn: 6,
      interiorWallThicknessIn: 5,
      floorToFloorIn: 132,
      roofPitch: 8,
    },
    roof: { style: 'gable', pitch: 8, overhangIn: 18, gableEdges: [] },
    bearingLines: [
      { level: 0, x1: 312, y1: 330, x2: 312, y2: 888 }, // wing junction
      { level: 0, x1: 0, y1: 624, x2: 840, y2: 624 }, // garage front line
      { level: 0, x1: 0, y1: 408, x2: 312, y2: 408 }, // MIL living front
      { level: 0, x1: 312, y1: 430, x2: 840, y2: 430 },
      { level: 1, x1: 312, y1: 624, x2: 840, y2: 624 },
    ],
    extras: [
      { id: 'x-porch-mil', name: 'MIL Covered Porch', kind: 'porchFront', rect: { x: 150, y: 0, w: 162, h: 58 } },
      { id: 'x-porch-main', name: 'Front Porch', kind: 'porchFront', rect: { x: 452, y: 230, w: 220, h: 100 } },
      { id: 'x-lanai', name: 'Covered Rear Porch', kind: 'porchRear', rect: { x: 396, y: 888, w: 396, h: 120 } },
      { id: 'x-deck', name: 'Walkout Deck', kind: 'deck', level: 1, rect: { x: 396, y: 888, w: 396, h: 120 } },
    ],
    stair: {
      levelFrom: 0,
      levelTo: 1,
      roomId: 'b-stair',
      stairwell: { x: 552, y: 430, w: 48, h: 194 },
      widthIn: 42,
      treadDepthIn: 10,
      direction: 'rear',
    },
    levels: [
      {
        index: 0,
        name: 'Main Floor',
        floorToCeilingIn: 120,
        footprint: [
          { x: 0, y: 0, w: 150, h: 408 }, // MIL bedroom column
          { x: 150, y: 58, w: 162, h: 350 }, // MIL hall/kitchen column (porch notch at front)
          { x: 0, y: 408, w: 312, h: 480 }, // MIL living + garage, full wing width
          { x: 312, y: 330, w: 528, h: 558 }, // main house
        ],
        rooms: [
          // MIL wing
          { id: 'b-mil-gar', name: 'MIL Garage', type: 'garage', rect: { x: 0, y: 624, w: 312, h: 264 } },
          { id: 'b-mil-liv', name: 'MIL Living', type: 'living', rect: { x: 0, y: 408, w: 312, h: 216 } },
          { id: 'b-mil-bed2', name: 'MIL Bedroom 2', type: 'bedroom', rect: { x: 0, y: 58, w: 150, h: 204 } },
          { id: 'b-mil-bed3', name: 'MIL Bedroom 3', type: 'bedroom', rect: { x: 0, y: 262, w: 150, h: 146 } },
          { id: 'b-mil-cl', name: 'Closet', type: 'closet', rect: { x: 0, y: 0, w: 58, h: 58 } },
          { id: 'b-mil-bathf', name: 'MIL Bath 2', type: 'bathroom', rect: { x: 58, y: 0, w: 92, h: 58 } },
          { id: 'b-mil-hall', name: 'MIL Hall', type: 'hall', rect: { x: 150, y: 58, w: 48, h: 350 } },
          { id: 'b-mil-din', name: 'MIL Dining', type: 'dining', rect: { x: 198, y: 58, w: 114, h: 134 } },
          { id: 'b-mil-kit', name: 'MIL Kitchen', type: 'kitchen', rect: { x: 198, y: 192, w: 114, h: 120 } },
          { id: 'b-mil-bath', name: 'MIL Bath', type: 'bathroom', rect: { x: 198, y: 312, w: 114, h: 96 } },
          // main house
          { id: 'b-gar', name: 'Garage', type: 'garage', rect: { x: 528, y: 624, w: 312, h: 264 } },
          { id: 'b-kit', name: 'Kitchen / Dining', type: 'kitchen', rect: { x: 396, y: 624, w: 132, h: 264 } },
          { id: 'b-lau', name: 'Laundry', type: 'laundry', rect: { x: 312, y: 624, w: 84, h: 132 } },
          { id: 'b-pan', name: 'Pantry', type: 'pantry', rect: { x: 312, y: 756, w: 84, h: 132 } },
          { id: 'b-fam', name: 'Family', type: 'living', rect: { x: 312, y: 430, w: 240, h: 194 }, ceilingIn: 120 },
          { id: 'b-stair', name: 'Stair', type: 'stairwell', rect: { x: 552, y: 430, w: 48, h: 194 } },
          { id: 'b-hall', name: 'Hall', type: 'hall', rect: { x: 600, y: 430, w: 72, h: 194 } },
          { id: 'b-mbed', name: 'Primary Bedroom', type: 'bedroom', rect: { x: 672, y: 330, w: 168, h: 192 }, ceilingIn: 144 },
          { id: 'b-mbath', name: 'Primary Bath', type: 'bathroom', rect: { x: 672, y: 522, w: 96, h: 102 } },
          { id: 'b-wic', name: 'W.I.C.', type: 'closet', rect: { x: 768, y: 522, w: 72, h: 102 } },
          { id: 'b-study', name: 'Study', type: 'office', rect: { x: 312, y: 330, w: 140, h: 100 } },
          { id: 'b-foy', name: 'Foyer', type: 'foyer', rect: { x: 452, y: 330, w: 220, h: 100 } },
        ],
      },
      {
        index: 1,
        name: 'Upper Floor',
        floorToCeilingIn: 96,
        footprint: [{ x: 312, y: 330, w: 528, h: 558 }],
        rooms: [
          { id: 'b2-loft', name: 'Loft', type: 'loft', rect: { x: 312, y: 330, w: 360, h: 100 } },
          { id: 'b2-bed4', name: 'Bedroom 4', type: 'bedroom', rect: { x: 672, y: 330, w: 168, h: 192 } },
          { id: 'b2-thr', name: 'Theater', type: 'theater', rect: { x: 312, y: 430, w: 240, h: 194 } },
          { id: 'b2-stair', name: 'Stair', type: 'stairwell', rect: { x: 552, y: 430, w: 48, h: 194 } },
          { id: 'b2-hall', name: 'Hall', type: 'hall', rect: { x: 600, y: 430, w: 72, h: 194 } },
          { id: 'b2-bath', name: 'Bath 2', type: 'bathroom', rect: { x: 672, y: 522, w: 168, h: 102 } },
          { id: 'b2-bed5', name: 'Bedroom 5', type: 'bedroom', rect: { x: 312, y: 624, w: 240, h: 264 } },
          { id: 'b2-bonus', name: 'Bonus', type: 'flex', rect: { x: 552, y: 624, w: 288, h: 264 } },
        ],
      },
    ],
    openingRequests: [
      // MIL wing — entry + circulation
      { kind: 'exterior', level: 0, roomId: 'b-mil-din', side: 'front', type: 'door', width: 36, height: 80, egress: true, at: 30 },
      { kind: 'between', level: 0, roomA: 'b-mil-hall', roomB: 'b-mil-bed2', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mil-hall', roomB: 'b-mil-bed3', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mil-hall', roomB: 'b-mil-din', type: 'cased', width: 48, height: 96 },
      { kind: 'between', level: 0, roomA: 'b-mil-hall', roomB: 'b-mil-kit', type: 'cased', width: 48, height: 96 },
      { kind: 'between', level: 0, roomA: 'b-mil-hall', roomB: 'b-mil-bath', width: 30, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mil-hall', roomB: 'b-mil-liv', type: 'cased', width: 36, height: 96 },
      { kind: 'between', level: 0, roomA: 'b-mil-bed2', roomB: 'b-mil-bathf', width: 28, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mil-bed2', roomB: 'b-mil-cl', width: 28, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mil-liv', roomB: 'b-mil-gar', width: 32, height: 80, fireRatingMin: 20, selfClosing: true },
      // the wing connector the owner built
      { kind: 'between', level: 0, roomA: 'b-mil-liv', roomB: 'b-fam', type: 'cased', width: 60, height: 96 },
      // MIL wing — exterior
      { kind: 'exterior', level: 0, roomId: 'b-mil-gar', side: 'left', type: 'garageDoor', width: 192, height: 84 },
      { kind: 'exterior', level: 0, roomId: 'b-mil-bed2', side: 'left', type: 'window', width: 48, height: 62, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 0, roomId: 'b-mil-bed3', side: 'left', type: 'window', width: 48, height: 62, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 0, roomId: 'b-mil-liv', side: 'left', type: 'window', width: 48, height: 60, sill: 24, operable: true, at: 60 },
      { kind: 'exterior', level: 0, roomId: 'b-mil-liv', side: 'left', type: 'window', width: 48, height: 60, sill: 24, operable: true, at: 156 },
      { kind: 'exterior', level: 0, roomId: 'b-mil-din', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true, at: 84 },
      { kind: 'exterior', level: 0, roomId: 'b-mil-kit', side: 'right', type: 'window', width: 36, height: 48, sill: 36, operable: true },
      { kind: 'exterior', level: 0, roomId: 'b-mil-bathf', side: 'front', type: 'window', width: 24, height: 36, sill: 48, operable: true },
      // main house — entry + circulation
      { kind: 'exterior', level: 0, roomId: 'b-foy', side: 'front', type: 'door', width: 36, height: 80, egress: true },
      { kind: 'between', level: 0, roomA: 'b-foy', roomB: 'b-hall', type: 'cased', width: 60, height: 96 },
      { kind: 'between', level: 0, roomA: 'b-foy', roomB: 'b-fam', type: 'cased', width: 72, height: 96 },
      { kind: 'between', level: 0, roomA: 'b-study', roomB: 'b-foy', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-hall', roomB: 'b-mbed', width: 36, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mbed', roomB: 'b-mbath', width: 30, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-mbed', roomB: 'b-wic', width: 28, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-fam', roomB: 'b-kit', type: 'cased', width: 96, height: 96 },
      { kind: 'between', level: 0, roomA: 'b-fam', roomB: 'b-lau', width: 30, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-lau', roomB: 'b-kit', width: 30, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-kit', roomB: 'b-pan', width: 30, height: 80 },
      { kind: 'between', level: 0, roomA: 'b-kit', roomB: 'b-gar', width: 32, height: 80, fireRatingMin: 20, selfClosing: true },
      // main house — exterior
      { kind: 'exterior', level: 0, roomId: 'b-gar', side: 'right', type: 'garageDoor', width: 192, height: 84 },
      { kind: 'exterior', level: 0, roomId: 'b-kit', side: 'rear', type: 'slider', width: 96, height: 80 },
      { kind: 'exterior', level: 0, roomId: 'b-mbed', side: 'front', type: 'window', width: 48, height: 62, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 0, roomId: 'b-mbed', side: 'right', type: 'window', width: 48, height: 60, sill: 24, operable: true },
      { kind: 'exterior', level: 0, roomId: 'b-study', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true },
      // upper floor — circulation
      { kind: 'between', level: 1, roomA: 'b2-loft', roomB: 'b2-thr', width: 36, height: 80 },
      { kind: 'between', level: 1, roomA: 'b2-loft', roomB: 'b2-hall', type: 'cased', width: 60, height: 96 },
      { kind: 'between', level: 1, roomA: 'b2-loft', roomB: 'b2-bed4', width: 32, height: 80 },
      { kind: 'between', level: 1, roomA: 'b2-hall', roomB: 'b2-bath', width: 30, height: 80 },
      { kind: 'between', level: 1, roomA: 'b2-hall', roomB: 'b2-bonus', width: 36, height: 80 },
      { kind: 'between', level: 1, roomA: 'b2-bonus', roomB: 'b2-bed5', width: 32, height: 80 },
      // upper floor — exterior (deck slider off the bonus room)
      { kind: 'exterior', level: 1, roomId: 'b2-bonus', side: 'rear', type: 'slider', width: 72, height: 80 },
      { kind: 'exterior', level: 1, roomId: 'b2-bed4', side: 'front', type: 'window', width: 48, height: 62, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 1, roomId: 'b2-bed4', side: 'right', type: 'window', width: 48, height: 60, sill: 24, operable: true },
      { kind: 'exterior', level: 1, roomId: 'b2-bath', side: 'right', type: 'window', width: 24, height: 36, sill: 48, operable: true },
      { kind: 'exterior', level: 1, roomId: 'b2-loft', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true, at: 96 },
      { kind: 'exterior', level: 1, roomId: 'b2-loft', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true, at: 264 },
      { kind: 'exterior', level: 1, roomId: 'b2-bed5', side: 'left', type: 'window', width: 48, height: 62, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 1, roomId: 'b2-bed5', side: 'rear', type: 'window', width: 48, height: 60, sill: 24, operable: true },
      { kind: 'exterior', level: 1, roomId: 'b2-bonus', side: 'right', type: 'window', width: 48, height: 60, sill: 24, operable: true },
    ],
    annotations: [
      'As-built digitization from owner layout PDF + photos; fractional dims snapped to whole inches.',
      'Primary bedroom ceiling is vaulted; drawn flat at 144" nominal pending vault support (scope flag).',
      'Family ceiling closed at 120" by the theater room added above (stock plan had an open volume).',
      'Upper-floor rooms over the kitchen/garage are inferred from the deck and theater; confirm layout.',
      'MIL wing is single story with no stair (owner-confirmed); wing tie-in and roof intersection require engineer review.',
    ],
  };
}
