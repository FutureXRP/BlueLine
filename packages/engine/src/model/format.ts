/**
 * Render-boundary formatters (Law #2): the ONLY place integer inches become
 * human-readable feet-and-inches or square feet.
 */
import type { Inches } from './types.js';

/** 174 → `14'-6"`, 168 → `14'-0"`, 7 → `0'-7"` */
export function formatFeetInches(inches: Inches): string {
  const neg = inches < 0 ? '-' : '';
  const abs = Math.abs(Math.round(inches));
  const ft = Math.floor(abs / 12);
  const inch = abs % 12;
  return `${neg}${ft}'-${inch}"`;
}

/** Square inches → whole square feet, rounded at render time. */
export function formatSquareFeet(sqIn: number): string {
  return `${Math.round(sqIn / 144)} SF`;
}

export function squareFeet(sqIn: number): number {
  return Math.round(sqIn / 144);
}

/** 108 → `9'-0" CLG` style plate/ceiling callout. */
export function formatCeiling(inches: Inches): string {
  return `${formatFeetInches(inches)} CLG`;
}

/** Roof pitch 6 → `6:12`. */
export function formatPitch(rise: number): string {
  return `${rise}:12`;
}
