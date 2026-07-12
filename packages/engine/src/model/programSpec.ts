/**
 * ProgramSpec v1 (Build Bible §6). Zod is the single validation source; the
 * Claude interview prompt is generated FROM these .describe() strings so the
 * two cannot drift (§6, §13).
 */
import { z } from 'zod';

export const ProgramSpecSchema = z.object({
  specVersion: z.literal(1),
  stories: z.literal(1).describe('Number of stories. Phase 1 supports one story only.'),
  footprintFamily: z
    .enum(['rect', 'L', 'T'])
    .describe('Overall footprint shape family: simple rectangle, L-shape, or T-shape.'),
  targetConditionedArea: z
    .number()
    .int()
    .min(600 * 144)
    .max(4000 * 144)
    .describe('Target conditioned area in SQUARE INCHES (UI collects square feet and multiplies by 144).'),
  areaTolerance: z
    .number()
    .int()
    .min(0)
    .describe('Acceptable ± deviation from target area, in square inches. Default 5% of target.'),
  bedrooms: z.union([z.literal(2), z.literal(3), z.literal(4)]).describe('Bedroom count: 2, 3, or 4.'),
  fullBaths: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe('Full bathroom count: 1–3.'),
  halfBaths: z.union([z.literal(0), z.literal(1)]).describe('Half bathroom count: 0 or 1.'),
  primarySuite: z.object({
    separated: z.boolean().describe('Primary suite separated from secondary bedrooms.'),
    walkInCloset: z.boolean().describe('Primary suite includes a walk-in closet.'),
    doubleVanity: z.boolean().describe('Primary bath includes a double vanity.'),
  }),
  kitchen: z.object({
    openToLiving: z.boolean().describe('Kitchen open to the living area.'),
    island: z.boolean().describe('Kitchen includes an island.'),
    pantry: z.enum(['none', 'reach-in', 'walk-in']).describe('Pantry type.'),
  }),
  garage: z.object({
    bays: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).describe('Garage bays: 0–3.'),
    entry: z.enum(['front', 'side']).describe('Garage door orientation.'),
    attached: z.literal(true).describe('Phase 1 garages are attached only.'),
  }),
  extraRooms: z
    .array(z.enum(['office', 'mudroom', 'flex', 'diningFormal', 'laundryRoom']))
    .describe('Must-have extra rooms.'),
  ceilingHeight: z
    .union([z.literal(96), z.literal(108), z.literal(120)])
    .describe("Ceiling height in inches: 96 (8'), 108 (9'), or 120 (10')."),
  roof: z.object({
    style: z.enum(['gable', 'hip']).describe('Roof style.'),
    pitch: z
      .union([z.literal(4), z.literal(5), z.literal(6), z.literal(8)])
      .describe('Roof pitch, rise per 12 of run.'),
  }),
  foundation: z.enum(['slab', 'crawlspace']).describe('Foundation type.'),
  exteriorWall: z.enum(['2x4', '2x6']).describe('Exterior wall framing.'),
  climateNote: z
    .string()
    .nullable()
    .describe('Free-text climate note from the interview. Display only — never used in computation.'),
  seedChain: z.array(z.number().int()).describe('Solver seeds used, for reproducibility.'),
});

export type ProgramSpec = z.infer<typeof ProgramSpecSchema>;

export function defaultAreaTolerance(targetConditionedArea: number): number {
  return Math.round(targetConditionedArea * 0.05);
}
