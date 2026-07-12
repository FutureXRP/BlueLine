/**
 * Fabrication firewall scan (Build Bible §16): every code-section citation
 * pattern (R###) appearing in sheet text must trace to a rule-table entry's
 * section. Anything else is a fabricated citation and fails CI.
 */
import type { RuleSet } from './ruleSet.js';
import { loadRuleSet } from './ruleSet.js';

export interface FabricationViolation {
  text: string;
  citation: string;
}

const CITATION = /R\d{3}(?:\.\d+)*/g;

export function fabricationScan(
  texts: string[],
  ruleSet: RuleSet = loadRuleSet(),
): FabricationViolation[] {
  const allowed = new Set<string>();
  for (const rule of ruleSet.rules.values()) {
    for (const m of `${rule.section} ${rule.citation} ${rule.id}`.matchAll(CITATION)) {
      allowed.add(m[0]);
    }
  }
  const out: FabricationViolation[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(CITATION)) {
      // a longer citation like R302.5.1 is fine if its base section is allowed
      const base = m[0].split('.')[0]!;
      if (!allowed.has(m[0]) && !allowed.has(base)) {
        out.push({ text: t, citation: m[0] });
      }
    }
  }
  return out;
}
