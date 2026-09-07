/**
 * v2 golden fixture: `farmhouse_two_story` (core-engine fixture; the grammar
 * generates its own program fixtures on top of this).
 *
 * Session-1 history note: the original openings-free version had a primary
 * suite reachable only through a 24" sliver — the circulation check (added
 * with the reference-adopted check suite) caught it, and the right wing was
 * re-tiled with the hall spanning full width. Golden hash updated with that
 * change.
 *
 * 64' × 34' main level, 40' × 34' upper level, rooms tile EXACTLY; openings
 * are grammar-style requests resolved against derived walls. Front is y = 0.
 */
import type { HousePlanInput } from '../house/build.js';

export function farmhouseV2(): HousePlanInput {
  return {
    spec: {
      seed: 1,
      engineVersion: '2.0.0-s2',
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
    extras: [
      { id: 'x-porch-f', name: 'Front Porch', kind: 'porchFront', rect: { x: 288, y: -96, w: 288, h: 96 } },
      { id: 'x-porch-r', name: 'Rear Porch', kind: 'porchRear', rect: { x: 480, y: 408, w: 288, h: 120 } },
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
          { id: 'l1-hall', name: 'Hall', type: 'hall', rect: { x: 288, y: 144, w: 480, h: 48 } },
          { id: 'l1-kit', name: 'Kitchen / Dining', type: 'kitchen', rect: { x: 288, y: 192, w: 288, h: 216 } },
          { id: 'l1-pbed', name: 'Primary Bedroom', type: 'bedroom', rect: { x: 576, y: 0, w: 192, h: 144 } },
          { id: 'l1-wic', name: 'W.I.C.', type: 'closet', rect: { x: 576, y: 192, w: 80, h: 72 } },
          { id: 'l1-pbath', name: 'Primary Bath', type: 'bathroom', rect: { x: 656, y: 192, w: 112, h: 72 } },
          { id: 'l1-liv', name: 'Living', type: 'living', rect: { x: 576, y: 264, w: 192, h: 144 } },
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
    openingRequests: [
      // level 0 — entry + circulation
      { kind: 'exterior', level: 0, roomId: 'l1-foy', side: 'front', type: 'door', width: 36, height: 80, egress: true },
      { kind: 'between', level: 0, roomA: 'l1-foy', roomB: 'l1-hall', type: 'cased', width: 60, height: 96 },
      { kind: 'between', level: 0, roomA: 'l1-hall', roomB: 'l1-kit', type: 'cased', width: 96, height: 96 },
      { kind: 'between', level: 0, roomA: 'l1-hall', roomB: 'l1-off', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'l1-hall', roomB: 'l1-pbed', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'l1-hall', roomB: 'l1-pbath', width: 30, height: 80 },
      { kind: 'between', level: 0, roomA: 'l1-pbath', roomB: 'l1-wic', width: 28, height: 80 },
      { kind: 'between', level: 0, roomA: 'l1-kit', roomB: 'l1-liv', type: 'cased', width: 96, height: 96 },
      { kind: 'between', level: 0, roomA: 'l1-kit', roomB: 'l1-lau', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'l1-lau', roomB: 'l1-mud', width: 32, height: 80 },
      { kind: 'between', level: 0, roomA: 'l1-gar', roomB: 'l1-mud', width: 32, height: 80, fireRatingMin: 20, selfClosing: true },
      // level 0 — exterior
      { kind: 'exterior', level: 0, roomId: 'l1-gar', side: 'front', type: 'garageDoor', width: 108, height: 84, at: 72 },
      { kind: 'exterior', level: 0, roomId: 'l1-gar', side: 'front', type: 'garageDoor', width: 108, height: 84, at: 204 },
      { kind: 'exterior', level: 0, roomId: 'l1-liv', side: 'rear', type: 'slider', width: 72, height: 80 },
      { kind: 'exterior', level: 0, roomId: 'l1-pbed', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true, egress: true, at: 48 },
      { kind: 'exterior', level: 0, roomId: 'l1-pbed', side: 'right', type: 'window', width: 36, height: 60, sill: 24, operable: true, at: 72 },
      { kind: 'exterior', level: 0, roomId: 'l1-kit', side: 'rear', type: 'window', width: 36, height: 48, sill: 36, operable: true, at: 96 },
      { kind: 'exterior', level: 0, roomId: 'l1-kit', side: 'rear', type: 'window', width: 36, height: 48, sill: 36, operable: true, at: 192 },
      { kind: 'exterior', level: 0, roomId: 'l1-off', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true },
      { kind: 'exterior', level: 0, roomId: 'l1-stair', side: 'front', type: 'window', width: 30, height: 60, sill: 36 },
      { kind: 'exterior', level: 0, roomId: 'l1-mud', side: 'rear', type: 'window', width: 24, height: 36, sill: 48, operable: true },
      { kind: 'exterior', level: 0, roomId: 'l1-lau', side: 'rear', type: 'window', width: 24, height: 36, sill: 48, operable: true },
      // level 1 — circulation
      { kind: 'between', level: 1, roomA: 'l2-hall', roomB: 'l2-bed2', width: 32, height: 80 },
      { kind: 'between', level: 1, roomA: 'l2-hall', roomB: 'l2-bed3', width: 32, height: 80 },
      { kind: 'between', level: 1, roomA: 'l2-hall', roomB: 'l2-bed4', width: 32, height: 80 },
      { kind: 'between', level: 1, roomA: 'l2-hall', roomB: 'l2-bath', width: 30, height: 80 },
      { kind: 'between', level: 1, roomA: 'l2-hall', roomB: 'l2-bonus', width: 32, height: 80 },
      { kind: 'between', level: 1, roomA: 'l2-hall', roomB: 'l2-loft', type: 'cased', width: 72, height: 96 },
      // level 1 — windows (bedroom egress at rear)
      { kind: 'exterior', level: 1, roomId: 'l2-bed2', side: 'rear', type: 'window', width: 36, height: 60, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 1, roomId: 'l2-bed3', side: 'rear', type: 'window', width: 36, height: 60, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 1, roomId: 'l2-bed4', side: 'rear', type: 'window', width: 36, height: 60, sill: 24, operable: true, egress: true },
      { kind: 'exterior', level: 1, roomId: 'l2-bath', side: 'front', type: 'window', width: 24, height: 36, sill: 48, operable: true },
      { kind: 'exterior', level: 1, roomId: 'l2-loft', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true },
      { kind: 'exterior', level: 1, roomId: 'l2-bonus', side: 'front', type: 'window', width: 36, height: 60, sill: 24, operable: true },
    ],
  };
}
