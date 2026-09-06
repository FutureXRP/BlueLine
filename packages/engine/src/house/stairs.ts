/**
 * Stair math (BLUELINE_V2.md §6): risers from floor-to-floor, rise reported
 * as an exact fraction computed from integers. Limits come from RULE TABLE
 * rows (Law 6) — never numeric literals here.
 */
import { fraction, type Finding, type Rect, type Stair } from './types.js';

export interface StairRules {
  /** max riser in hundredths of an inch (e.g. 775 for 7.75") + source row id */
  maxRiserHundredths: number;
  maxRiserRuleId: string;
  minTreadIn: number;
  minTreadRuleId: string;
  minWidthIn: number;
  minWidthRuleId: string;
}

export interface StairInput {
  levelFrom: number;
  levelTo: number;
  roomId: string;
  stairwell: Rect;
  widthIn: number;
  treadDepthIn: number;
  direction: 'front' | 'rear' | 'left' | 'right';
  floorToFloorIn: number;
}

export function computeStair(
  input: StairInput,
  rules: StairRules,
): { stair: Stair; findings: Finding[] } {
  const findings: Finding[] = [];
  const rise = input.floorToFloorIn;
  // riserCount = ceil(rise / maxRiser), integer-safe: hundredths both sides
  const riserCount = Math.ceil((rise * 100) / rules.maxRiserHundredths);
  const riserHeight = fraction(rise, riserCount);
  const runIn = (riserCount - 1) * input.treadDepthIn;

  if (input.treadDepthIn < rules.minTreadIn) {
    findings.push({
      severity: 'error',
      code: rules.minTreadRuleId,
      message: `Stair tread ${input.treadDepthIn}" is below the ${rules.minTreadIn}" minimum.`,
      refs: { level: input.levelFrom, roomIds: [input.roomId] },
    });
  }
  if (input.widthIn < rules.minWidthIn) {
    findings.push({
      severity: 'error',
      code: rules.minWidthRuleId,
      message: `Stair width ${input.widthIn}" is below the ${rules.minWidthIn}" minimum.`,
      refs: { level: input.levelFrom, roomIds: [input.roomId] },
    });
  }
  // run must fit the stairwell along its long axis
  const along = input.direction === 'front' || input.direction === 'rear' ? input.stairwell.h : input.stairwell.w;
  if (runIn > along) {
    findings.push({
      severity: 'error',
      code: 'GEOM-STAIR-RUN',
      message: `Stair run ${runIn}" exceeds the ${along}" stairwell; add risers space or deepen the well.`,
      refs: { level: input.levelFrom, roomIds: [input.roomId] },
    });
  }

  const stair: Stair = {
    levelFrom: input.levelFrom,
    levelTo: input.levelTo,
    roomId: input.roomId,
    widthIn: input.widthIn,
    riserCount,
    riserHeight,
    treadDepthIn: input.treadDepthIn,
    runIn,
    direction: input.direction,
    // stair opening projected to the level above = the stairwell rect
    opening: { ...input.stairwell },
  };
  return { stair, findings };
}
