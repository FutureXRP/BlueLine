/**
 * Rule-table loader. Rules live in versioned JSON (Law #5); engine code
 * references them ONLY by ID. The fabrication firewall (Law #6) lives here:
 * a missing rule or param NEVER falls back to an invented number — checks
 * that can't resolve their rule emit a VERIFY finding instead.
 */
import roomsTable from '../rules/irc-2021/rooms.json' with { type: 'json' };
import egressTable from '../rules/irc-2021/egress.json' with { type: 'json' };
import safetyTable from '../rules/irc-2021/safety.json' with { type: 'json' };
import fixturesTable from '../rules/irc-2021/fixtures.json' with { type: 'json' };
import structureTable from '../rules/irc-2021/structure.json' with { type: 'json' };
import type { Severity } from '../model/types.js';

export interface Rule {
  id: string;
  section: string;
  title: string;
  params: Record<string, unknown>;
  severity: Severity;
  citation: string;
  verified: boolean;
}

export interface RuleSet {
  version: string;
  rules: Map<string, Rule>;
}

const TABLES = [roomsTable, egressTable, safetyTable, fixturesTable, structureTable];

let cached: RuleSet | null = null;

export function loadRuleSet(): RuleSet {
  if (cached) return cached;
  const rules = new Map<string, Rule>();
  let version = '';
  for (const t of TABLES) {
    version = t.ruleSetVersion;
    for (const r of t.rules) {
      if (rules.has(r.id)) throw new Error(`Duplicate rule id: ${r.id}`);
      rules.set(r.id, r as Rule);
    }
  }
  cached = { version, rules };
  return cached;
}

/** Resolve a rule by ID. Returns undefined if absent — callers must then emit
 *  VERIFY language, never a number (fabrication firewall). */
export function getRule(ruleSet: RuleSet, id: string): Rule | undefined {
  return ruleSet.rules.get(id);
}

/** Integer param accessor. Returns undefined (never a default) when missing. */
export function intParam(rule: Rule, key: string): number | undefined {
  const v = rule.params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function boolParam(rule: Rule, key: string): boolean | undefined {
  const v = rule.params[key];
  return typeof v === 'boolean' ? v : undefined;
}
