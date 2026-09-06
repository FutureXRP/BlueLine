/**
 * v2 rule-table loader (BLUELINE_V2.md §7). Tables live at /rules with the
 * row format { id, code_ref, subject, value, unit, comparator, severity,
 * edition, verified, source, note }. Engine code reads rows by id; it never
 * hard-codes values (Law 6). Unverified rows are permitted in development and
 * gate launch branches (§7.1) — see verificationGate().
 */
import table from '../../../../rules/irc-2021.json' with { type: 'json' };
import type { StairRules } from './stairs.js';

export interface RuleRow {
  id: string;
  code_ref: string;
  subject: string;
  value: number;
  unit: string;
  comparator: string;
  severity: string;
  edition: string;
  verified: boolean;
  source: string;
  note: string;
}

export function loadRuleRows(): Map<string, RuleRow> {
  const map = new Map<string, RuleRow>();
  for (const row of table.rows as RuleRow[]) {
    if (map.has(row.id)) throw new Error(`duplicate rule row ${row.id}`);
    map.set(row.id, row);
  }
  return map;
}

export function requireRow(rows: Map<string, RuleRow>, id: string): RuleRow {
  const row = rows.get(id);
  if (!row) throw new Error(`rule row ${id} missing from table — cannot check without it (Law 4)`);
  return row;
}

/** Stair limits, sourced from the table. Values in inches (converted to
 *  hundredths for integer-safe riser math). */
export function stairRules(rows: Map<string, RuleRow> = loadRuleRows()): StairRules {
  const rise = requireRow(rows, 'R311.7.5.1-rise');
  const tread = requireRow(rows, 'R311.7.5.2-tread');
  const width = requireRow(rows, 'R311.7.1-width');
  return {
    maxRiserHundredths: Math.round(rise.value * 100),
    maxRiserRuleId: rise.id,
    minTreadIn: tread.value,
    minTreadRuleId: tread.id,
    minWidthIn: width.value,
    minWidthRuleId: width.id,
  };
}

/** §11 rule verification gate: ids of enabled-check rows still unverified. */
export function verificationGate(enabledRuleIds: string[], rows = loadRuleRows()): string[] {
  return enabledRuleIds.filter((id) => {
    const row = rows.get(id);
    return !row || !row.verified;
  });
}
