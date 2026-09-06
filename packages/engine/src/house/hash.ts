/**
 * Golden-file hashing (Law 3): FNV-1a 32 over key-sorted JSON. Same
 * DesignProgram + seed + engine version must produce this exact hash forever
 * unless a golden update is reviewed.
 */
import { stableStringify } from '../model/geometry.js';
import type { HouseModel } from './types.js';

export function stableHash(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function hashHouse(model: HouseModel): string {
  return stableHash(model);
}
