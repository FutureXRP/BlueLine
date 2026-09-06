/**
 * v2 golden fixture: `farmhouse_two_story` (BLUELINE_V2.md §13, Session 1).
 *
 * Hand-authored level plans standing in for grammar output until Sessions
 * 2–3; the room layout matches the farmhouse plan type (§4.3): living block
 * rear, primary suite right wing, stair core center, service core + garage
 * left, flex front; upper bed wing over the center/right.
 *
 * 64' × 34' main level, 40' × 34' upper level. Rooms tile each level
 * EXACTLY (the tiling test enforces it). Front is y = 0 (§6).
 */
import type { HousePlanInput } from '../house/build.js';

export function farmhouseV2(): HousePlanInput {
  return {
    spec: {
      seed: 1,
      engineVersion: '2.0.0-s1',
      style: 'modern_farmhouse',
      planType: 'farmhouse_two_story',
      foundation: 'slab',
      studs: '2x6',
      exteriorWallThicknessIn: 6,
      interiorWallThicknessIn: 5,
      floorToFloorIn: 116,
      roofPitch: 8,
    },
    roof: { style: 'gable', pitch: 8, overhangIn: 18, gableEdges: [] },
    bearingLines: [
      { level: 0, x1: 288, y1: 0, x2: 288, y2: 408 },
      { level: 0, x1: 576, y1: 0, x2: 576, y2: 408 },
    ],
    stair: {
      levelFrom: 0,
      levelTo: 1,
      roomId: 'l1-stair',
      stairwell: { x: 384, y: 0, w: 48, h: 144 },
      widthIn: 42,
      treadDepthIn: 10,
      direction: 'rear',
    },
    levels: [
      {
        index: 0,
        name: 'Main Floor',
        floorToCeilingIn: 108,
        footprint: [{ x: 0, y: 0, w: 768, h: 408 }],
        rooms: [
          { id: 'l1-gar', name: 'Garage', type: 'garage', rect: { x: 0, y: 0, w: 288, h: 264 } },
          { id: 'l1-mud', name: 'Mudroom', type: 'mudroom', rect: { x: 0, y: 264, w: 144, h: 144 } },
          { id: 'l1-lau', name: 'Laundry', type: 'laundry', rect: { x: 144, y: 264, w: 144, h: 144 } },
          { id: 'l1-foy', name: 'Foyer', type: 'foyer', rect: { x: 288, y: 0, w: 96, h: 144 } },
          { id: 'l1-stair', name: 'Stair', type: 'stairwell', rect: { x: 384, y: 0, w: 48, h: 144 } },
          { id: 'l1-off', name: 'Office', type: 'office', rect: { x: 432, y: 0, w: 144, h: 144 } },
          { id: 'l1-hall', name: 'Hall', type: 'hall', rect: { x: 288, y: 144, w: 288, h: 48 } },
          { id: 'l1-kit', name: 'Kitchen / Dining', type: 'kitchen', rect: { x: 288, y: 192, w: 288, h: 216 } },
          { id: 'l1-pbed', name: 'Primary Bedroom', type: 'bedroom', rect: { x: 576, y: 0, w: 192, h: 168 } },
          { id: 'l1-wic', name: 'W.I.C.', type: 'closet', rect: { x: 576, y: 168, w: 80, h: 72 } },
          { id: 'l1-pbath', name: 'Primary Bath', type: 'bathroom', rect: { x: 656, y: 168, w: 112, h: 72 } },
          { id: 'l1-liv', name: 'Living', type: 'living', rect: { x: 576, y: 240, w: 192, h: 168 } },
        ],
      },
      {
        index: 1,
        name: 'Upper Floor',
        floorToCeilingIn: 96,
        footprint: [{ x: 288, y: 0, w: 480, h: 408 }],
        rooms: [
          { id: 'l2-bonus', name: 'Bonus', type: 'flex', rect: { x: 288, y: 0, w: 96, h: 144 } },
          { id: 'l2-stair', name: 'Stair', type: 'stairwell', rect: { x: 384, y: 0, w: 48, h: 144 } },
          { id: 'l2-bath', name: 'Bath 2', type: 'bathroom', rect: { x: 432, y: 0, w: 144, h: 144 } },
          { id: 'l2-loft', name: 'Loft', type: 'loft', rect: { x: 576, y: 0, w: 192, h: 144 } },
          { id: 'l2-hall', name: 'Hall', type: 'hall', rect: { x: 288, y: 144, w: 480, h: 48 } },
          { id: 'l2-bed2', name: 'Bedroom 2', type: 'bedroom', rect: { x: 288, y: 192, w: 192, h: 216 } },
          { id: 'l2-bed3', name: 'Bedroom 3', type: 'bedroom', rect: { x: 480, y: 192, w: 144, h: 216 } },
          { id: 'l2-bed4', name: 'Bedroom 4', type: 'bedroom', rect: { x: 624, y: 192, w: 144, h: 216 } },
        ],
      },
    ],
  };
}
