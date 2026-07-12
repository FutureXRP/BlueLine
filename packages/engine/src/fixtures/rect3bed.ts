/**
 * Golden fixture: "rect-3bed" — 60' × 32' single-story rectangle, 3 bed /
 * 2 bath, 2-bay attached garage, gable roof, slab. 1,392 SF conditioned.
 *
 * Rooms tile the footprint exactly (wall centerlines as boundaries), so the
 * fixture doubles as a geometry-integrity test: conditioned + garage area
 * equals footprint area.
 *
 * Layout (x east 0–720, y south 0–384, integer inches):
 *   West column: mudroom + laundry (north), 2-bay garage (south)
 *   Center column: kitchen/dining (north), living (south, front entry)
 *   East column: primary suite (north), hall, beds 2–3 + bath 2 (south)
 */
import type { Model } from '../model/types.js';

export function rect3bed(): Model {
  return {
    modelVersion: 1,
    units: 'in',
    footprint: [
      { x: 0, y: 0 },
      { x: 0, y: 384 },
      { x: 720, y: 384 },
      { x: 720, y: 0 },
    ],
    ceilingHeight: 108,
    foundation: 'slab',
    exteriorWall: '2x6',
    roof: { style: 'gable', pitch: 6, overhang: 18, gableEdges: [0, 2] },
    seedChain: [],
    rooms: [
      { id: 'r-mud', name: 'Mudroom', type: 'mudroom', x: 0, y: 0, w: 144, h: 120 },
      { id: 'r-lau', name: 'Laundry', type: 'laundry', x: 144, y: 0, w: 144, h: 120 },
      { id: 'r-gar', name: 'Garage', type: 'garage', x: 0, y: 120, w: 288, h: 264 },
      { id: 'r-kit', name: 'Kitchen / Dining', type: 'kitchen', x: 288, y: 0, w: 168, h: 168 },
      { id: 'r-liv', name: 'Living', type: 'living', x: 288, y: 168, w: 168, h: 216 },
      { id: 'r-pbed', name: 'Primary Bedroom', type: 'bedroom', x: 456, y: 0, w: 168, h: 168 },
      { id: 'r-wic', name: 'W.I.C.', type: 'closet', x: 624, y: 0, w: 96, h: 60 },
      { id: 'r-pbath', name: 'Primary Bath', type: 'bathroom', x: 624, y: 60, w: 96, h: 108 },
      { id: 'r-hall', name: 'Hall', type: 'hall', x: 456, y: 168, w: 264, h: 42 },
      { id: 'r-bed2', name: 'Bedroom 2', type: 'bedroom', x: 456, y: 210, w: 120, h: 174 },
      { id: 'r-bath2', name: 'Bath 2', type: 'bathroom', x: 576, y: 210, w: 60, h: 174 },
      { id: 'r-bed3', name: 'Bedroom 3', type: 'bedroom', x: 636, y: 210, w: 84, h: 174 },
    ],
    walls: [
      // exterior (centerline on footprint)
      { id: 'w-ext-n', kind: 'exterior', x1: 0, y1: 0, x2: 720, y2: 0, thickness: 6 },
      { id: 'w-ext-s', kind: 'exterior', x1: 0, y1: 384, x2: 720, y2: 384, thickness: 6 },
      { id: 'w-ext-w', kind: 'exterior', x1: 0, y1: 0, x2: 0, y2: 384, thickness: 6 },
      { id: 'w-ext-e', kind: 'exterior', x1: 720, y1: 0, x2: 720, y2: 384, thickness: 6 },
      // garage separation
      { id: 'w-gsep-n', kind: 'garageSeparation', x1: 0, y1: 120, x2: 288, y2: 120, thickness: 5 },
      { id: 'w-gsep-e', kind: 'garageSeparation', x1: 288, y1: 120, x2: 288, y2: 384, thickness: 5 },
      // interior partitions
      { id: 'w-mud-lau', kind: 'interior', x1: 144, y1: 0, x2: 144, y2: 120, thickness: 5 },
      { id: 'w-lau-kit', kind: 'interior', x1: 288, y1: 0, x2: 288, y2: 120, thickness: 5 },
      { id: 'w-kit-liv', kind: 'interior', x1: 288, y1: 168, x2: 456, y2: 168, thickness: 5 },
      { id: 'w-kit-pbed', kind: 'interior', x1: 456, y1: 0, x2: 456, y2: 168, thickness: 5 },
      { id: 'w-liv-bed2', kind: 'interior', x1: 456, y1: 210, x2: 456, y2: 384, thickness: 5 },
      { id: 'w-suite-hall', kind: 'interior', x1: 456, y1: 168, x2: 720, y2: 168, thickness: 5 },
      { id: 'w-hall-south', kind: 'interior', x1: 456, y1: 210, x2: 720, y2: 210, thickness: 5 },
      { id: 'w-pbed-bath', kind: 'interior', x1: 624, y1: 0, x2: 624, y2: 168, thickness: 5 },
      { id: 'w-wic-pbath', kind: 'interior', x1: 624, y1: 60, x2: 720, y2: 60, thickness: 5 },
      { id: 'w-bed2-bath2', kind: 'interior', x1: 576, y1: 210, x2: 576, y2: 384, thickness: 5 },
      { id: 'w-bath2-bed3', kind: 'interior', x1: 636, y1: 210, x2: 636, y2: 384, thickness: 5 },
    ],
    openings: [
      // exterior doors
      { id: 'o-front', wallId: 'w-ext-s', type: 'door', offset: 372, width: 36, height: 80, sill: 0, swing: 'inLeft', egressDoor: true },
      { id: 'o-rear', wallId: 'w-ext-n', type: 'door', offset: 380, width: 36, height: 80, sill: 0, swing: 'inRight' },
      { id: 'o-side', wallId: 'w-ext-w', type: 'door', offset: 60, width: 36, height: 80, sill: 0, swing: 'inLeft' },
      { id: 'o-gardoor', wallId: 'w-ext-s', type: 'garageDoor', offset: 144, width: 192, height: 84, sill: 0, swing: 'none' },
      // garage separation door (rated, self-closing)
      { id: 'o-gar-mud', wallId: 'w-gsep-n', type: 'door', offset: 72, width: 32, height: 80, sill: 0, swing: 'inLeft', fireRatingMin: 20, selfClosing: true },
      // interior doors
      { id: 'o-mud-lau', wallId: 'w-mud-lau', type: 'door', offset: 60, width: 32, height: 80, sill: 0, swing: 'inRight' },
      { id: 'o-lau-kit', wallId: 'w-lau-kit', type: 'door', offset: 60, width: 32, height: 80, sill: 0, swing: 'inLeft' },
      { id: 'o-kit-liv', wallId: 'w-kit-liv', type: 'opening', offset: 84, width: 96, height: 96, sill: 0, swing: 'none' },
      { id: 'o-pbed', wallId: 'w-suite-hall', type: 'door', offset: 60, width: 32, height: 80, sill: 0, swing: 'inLeft' },
      { id: 'o-bed2', wallId: 'w-hall-south', type: 'door', offset: 60, width: 32, height: 80, sill: 0, swing: 'inLeft' },
      { id: 'o-bath2', wallId: 'w-hall-south', type: 'door', offset: 150, width: 30, height: 80, sill: 0, swing: 'inRight' },
      { id: 'o-bed3', wallId: 'w-hall-south', type: 'door', offset: 222, width: 32, height: 80, sill: 0, swing: 'inLeft' },
      { id: 'o-pbed-pbath', wallId: 'w-pbed-bath', type: 'door', offset: 120, width: 30, height: 80, sill: 0, swing: 'inRight' },
      { id: 'o-pbath-wic', wallId: 'w-wic-pbath', type: 'door', offset: 48, width: 28, height: 80, sill: 0, swing: 'inLeft' },
      // windows — north
      { id: 'o-w-lau', wallId: 'w-ext-n', type: 'window', offset: 216, width: 24, height: 36, sill: 48, swing: 'none', operable: true },
      { id: 'o-w-kit1', wallId: 'w-ext-n', type: 'window', offset: 320, width: 36, height: 48, sill: 36, swing: 'none', operable: true },
      { id: 'o-w-kit2', wallId: 'w-ext-n', type: 'window', offset: 430, width: 36, height: 48, sill: 36, swing: 'none', operable: true },
      { id: 'o-w-pbed1', wallId: 'w-ext-n', type: 'window', offset: 520, width: 36, height: 60, sill: 24, swing: 'none', operable: true },
      { id: 'o-w-pbed2', wallId: 'w-ext-n', type: 'window', offset: 580, width: 36, height: 60, sill: 24, swing: 'none', operable: true },
      // windows — south
      { id: 'o-w-liv1', wallId: 'w-ext-s', type: 'window', offset: 315, width: 48, height: 60, sill: 24, swing: 'none', operable: true },
      { id: 'o-w-liv2', wallId: 'w-ext-s', type: 'window', offset: 430, width: 48, height: 60, sill: 24, swing: 'none', operable: true },
      { id: 'o-w-bed2', wallId: 'w-ext-s', type: 'window', offset: 516, width: 36, height: 60, sill: 24, swing: 'none', operable: true },
      { id: 'o-w-bath2', wallId: 'w-ext-s', type: 'window', offset: 606, width: 24, height: 36, sill: 48, swing: 'none', operable: true },
      { id: 'o-w-bed3', wallId: 'w-ext-s', type: 'window', offset: 678, width: 36, height: 60, sill: 24, swing: 'none', operable: true },
      // windows — east
      { id: 'o-w-pbath', wallId: 'w-ext-e', type: 'window', offset: 114, width: 24, height: 36, sill: 48, swing: 'none', operable: true },
    ],
    fixtures: [
      // alarms (auto-placed per R314/R315)
      { id: 'f-sa-pbed', type: 'smokeAlarm', roomId: 'r-pbed', x: 540, y: 84, rot: 0 },
      { id: 'f-sa-bed2', type: 'smokeAlarm', roomId: 'r-bed2', x: 516, y: 297, rot: 0 },
      { id: 'f-sa-bed3', type: 'smokeAlarm', roomId: 'r-bed3', x: 678, y: 297, rot: 0 },
      { id: 'f-sa-hall', type: 'smokeAlarm', roomId: 'r-hall', x: 588, y: 189, rot: 0 },
      { id: 'f-co-hall', type: 'coAlarm', roomId: 'r-hall', x: 620, y: 189, rot: 0 },
      // primary bath
      { id: 'f-wc-p', type: 'wc', roomId: 'r-pbath', x: 680, y: 80, rot: 0 },
      { id: 'f-lav-p1', type: 'lavatory', roomId: 'r-pbath', x: 644, y: 146, rot: 2 },
      { id: 'f-lav-p2', type: 'lavatory', roomId: 'r-pbath', x: 672, y: 146, rot: 2 },
      { id: 'f-shr-p', type: 'shower', roomId: 'r-pbath', x: 700, y: 146, rot: 2 },
      // bath 2
      { id: 'f-wc-2', type: 'wc', roomId: 'r-bath2', x: 606, y: 230, rot: 0 },
      { id: 'f-lav-2', type: 'lavatory', roomId: 'r-bath2', x: 606, y: 320, rot: 0 },
      { id: 'f-tub-2', type: 'tub', roomId: 'r-bath2', x: 606, y: 368, rot: 0 },
      // kitchen
      { id: 'f-sink', type: 'kitchenSink', roomId: 'r-kit', x: 350, y: 14, rot: 2 },
      { id: 'f-dw', type: 'dishwasher', roomId: 'r-kit', x: 320, y: 14, rot: 2 },
      { id: 'f-range', type: 'range', roomId: 'r-kit', x: 440, y: 84, rot: 3 },
      { id: 'f-fridge', type: 'refrigerator', roomId: 'r-kit', x: 304, y: 84, rot: 1 },
      // laundry
      { id: 'f-wash', type: 'washer', roomId: 'r-lau', x: 180, y: 18, rot: 2 },
      { id: 'f-dry', type: 'dryer', roomId: 'r-lau', x: 212, y: 18, rot: 2 },
      // garage
      { id: 'f-wh', type: 'waterHeater', roomId: 'r-gar', x: 20, y: 144, rot: 0 },
      { id: 'f-panel', type: 'panel', roomId: 'r-gar', x: 284, y: 200, rot: 1 },
    ],
  };
}
