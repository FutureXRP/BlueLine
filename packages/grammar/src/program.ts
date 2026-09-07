/**
 * DesignProgram (bible §5.1). Claude — or the deterministic fallback designer
 * — emits THIS and only this. Room counts, areas, and adjacencies are
 * consequences of module choices; there is no free-form geometry anywhere in
 * the schema (Law 1).
 */
import { z } from 'zod';

export const SizeClass = z.enum(['S', 'M', 'L']);

export const ModuleParamsSchemas = {
  living_block: z.object({
    size: SizeClass.describe('Open living/kitchen/dining size class'),
    island: z.boolean().describe('Kitchen island (requires M or L living block)'),
    rearDoor: z.boolean().describe('Slider to the rear porch/yard'),
  }),
  primary_suite: z.object({
    size: SizeClass.describe('Suite size class (bed + bath + walk-in closet)'),
    doubleVanity: z.boolean().describe('Double vanity in the primary bath'),
  }),
  stair_core: z.object({
    widthIn: z.union([z.literal(42), z.literal(48)]).describe('Stair clear width; 42 default'),
  }),
  service_core: z.object({
    pantry: z.enum(['none', 'walk-in']).describe('Pantry off the kitchen/service zone'),
  }),
  flex_room: z.object({
    use: z.enum(['office', 'theater', 'playroom', 'guest']).describe('Flex room use; theater prefers no exterior wall'),
  }),
  garage: z.object({
    bays: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe('Garage bays; 3 bays flags engineer review for the header'),
  }),
  bed_bath_pair: z.object({
    beds: z.union([z.literal(2), z.literal(3)]).describe('Secondary bedrooms on the main level (ranch)'),
  }),
  upper_bed_wing: z.object({
    beds: z.union([z.literal(2), z.literal(3), z.literal(4)]).describe('Second-floor bedrooms'),
    loft: z.boolean().describe('Open loft at the stair'),
    bonus: z.boolean().describe('Bonus/flex room upstairs'),
  }),
  porch_front: z.object({
    depthIn: z.union([z.literal(72), z.literal(96)]).describe('Covered front porch depth'),
  }),
  porch_rear: z.object({
    depthIn: z.union([z.literal(96), z.literal(120)]).describe('Covered rear porch depth'),
  }),
} as const;

export type ModuleType = keyof typeof ModuleParamsSchemas;

const moduleEntry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('living_block'), params: ModuleParamsSchemas.living_block }),
  z.object({ type: z.literal('primary_suite'), params: ModuleParamsSchemas.primary_suite }),
  z.object({ type: z.literal('stair_core'), params: ModuleParamsSchemas.stair_core }),
  z.object({ type: z.literal('service_core'), params: ModuleParamsSchemas.service_core }),
  z.object({ type: z.literal('flex_room'), params: ModuleParamsSchemas.flex_room }),
  z.object({ type: z.literal('garage'), params: ModuleParamsSchemas.garage }),
  z.object({ type: z.literal('bed_bath_pair'), params: ModuleParamsSchemas.bed_bath_pair }),
  z.object({ type: z.literal('upper_bed_wing'), params: ModuleParamsSchemas.upper_bed_wing }),
  z.object({ type: z.literal('porch_front'), params: ModuleParamsSchemas.porch_front }),
  z.object({ type: z.literal('porch_rear'), params: ModuleParamsSchemas.porch_rear }),
]);

export const DesignProgramSchema = z.object({
  name: z.string().min(1).max(60).describe('Project name'),
  style: z.enum(['modern_farmhouse', 'craftsman', 'modern']).describe('Style pack'),
  plan_type: z
    .enum(['split_ranch', 'farmhouse_two_story', 'compact_two_story'])
    .describe('Composition template; determines which module slots exist'),
  seed: z.number().int().min(1).describe('Determinism seed (Law 3)'),
  modules: z.array(moduleEntry).describe('Module choices; unsupported slots for the plan type are findings'),
  finishes: z.object({
    foundation: z.enum(['slab', 'crawlspace']),
    studs: z.enum(['2x4', '2x6']),
    ceiling_ft: z.union([z.literal(8), z.literal(9), z.literal(10)]),
  }),
  intent: z.string().max(300).describe('One sentence of design intent — narrator only, never geometry'),
});

export type DesignProgram = z.infer<typeof DesignProgramSchema>;

export function moduleParam<T extends ModuleType>(
  program: DesignProgram,
  type: T,
): z.infer<(typeof ModuleParamsSchemas)[T]> | null {
  const m = program.modules.find((x) => x.type === type);
  return m ? (m.params as z.infer<(typeof ModuleParamsSchemas)[T]>) : null;
}
