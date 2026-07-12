import { describe, expect, it } from 'vitest';
import type { Model } from '../src/model/types.js';
import { loadRuleSet, validate } from '../src/validate/index.js';
import { rect3bed } from '../src/fixtures/index.js';

const rs = loadRuleSet();

function findingsFor(model: Model, ruleId: string) {
  return validate(model, rs).filter((f) => f.ruleId === ruleId);
}

describe('rect3bed passes clean', () => {
  it('has zero findings of any severity', () => {
    const findings = validate(rect3bed(), rs);
    expect(findings).toEqual([]);
  });
});

/**
 * Rule coverage (Build Bible §16): every rule ID in the tables is exercised
 * by at least one passing and one failing fixture. The clean-fixture test
 * above is the passing side for every rule; each entry below is the failing
 * side, produced by a targeted mutation of the fixture.
 */
const failCases: Record<string, (m: Model) => Model> = {
  'R304-AREA': (m) => {
    m.rooms.find((r) => r.id === 'r-bed3')!.w = 60; // below 7'-0" min dim
    return m;
  },
  'R305-CEIL': (m) => {
    (m as { ceilingHeight: number }).ceilingHeight = 80;
    return m;
  },
  'R310-EGRESS': (m) => {
    m.openings = m.openings.filter((o) => o.id !== 'o-w-bed3');
    return m;
  },
  'R311-DOOR': (m) => {
    for (const o of m.openings) {
      if (o.type === 'door' && ['o-front', 'o-rear', 'o-side'].includes(o.id)) o.width = 30;
    }
    return m;
  },
  'R311-HALL': (m) => {
    m.rooms.find((r) => r.id === 'r-hall')!.h = 30;
    return m;
  },
  'GAR-SEP': (m) => {
    const d = m.openings.find((o) => o.id === 'o-gar-mud')!;
    d.selfClosing = false;
    return m;
  },
  'BATH-CLR': (m) => {
    m.fixtures.find((f) => f.id === 'f-wc-p')!.x = 634; // 10" to side wall
    return m;
  },
  'WIN-LIGHT': (m) => {
    m.openings = m.openings.filter((o) => !['o-w-kit1', 'o-w-kit2'].includes(o.id));
    return m;
  },
  'R314-SMOKE': (m) => {
    m.fixtures = m.fixtures.filter((f) => f.id !== 'f-sa-bed2');
    return m;
  },
  'R315-CO': (m) => {
    m.fixtures = m.fixtures.filter((f) => f.id !== 'f-co-hall');
    return m;
  },
  'R308-GLAZE': (m) => {
    m.openings.find((o) => o.id === 'o-w-liv1')!.sill = 12; // hazard zone
    return m;
  },
  'HDR-TBL': (m) => {
    m.openings.push({
      id: 'o-huge',
      wallId: 'w-ext-e',
      type: 'window',
      offset: 280,
      width: 200,
      height: 60,
      sill: 24,
      swing: 'none',
      operable: true,
    });
    return m;
  },
  'SPAN-CJ': (m) => {
    m.footprint = [
      { x: 0, y: 0 },
      { x: 0, y: 800 },
      { x: 780, y: 800 },
      { x: 780, y: 0 },
    ];
    return m;
  },
  'SPAN-R': (m) => {
    m.footprint = [
      { x: 0, y: 0 },
      { x: 0, y: 800 },
      { x: 780, y: 800 },
      { x: 780, y: 0 },
    ];
    return m;
  },
  'BWL-SPC': (m) => {
    m.footprint = [
      { x: 0, y: 0 },
      { x: 0, y: 384 },
      { x: 800, y: 384 },
      { x: 800, y: 0 },
    ];
    return m;
  },
};

describe('rule coverage: every table rule has a failing fixture', () => {
  it('covers every rule id in the loaded rule set', () => {
    const tableIds = [...rs.rules.keys()].sort();
    expect(Object.keys(failCases).sort()).toEqual(tableIds);
  });

  for (const [ruleId, mutate] of Object.entries(failCases)) {
    it(`${ruleId} fails on its targeted mutation`, () => {
      const found = findingsFor(mutate(rect3bed()), ruleId);
      expect(found.length).toBeGreaterThan(0);
      const rule = rs.rules.get(ruleId)!;
      // finding carries the table's citation + verified flag (fabrication firewall)
      expect(found[0]!.citation).toBe(rule.citation);
      expect(found[0]!.verified).toBe(rule.verified);
    });
  }
});

describe('severity behavior', () => {
  it('engineer conditions use the required flag text pattern', () => {
    const m = failCases['HDR-TBL']!(rect3bed());
    const f = findingsFor(m, 'HDR-TBL')[0]!;
    expect(f.severity).toBe('engineer');
    expect(f.message).toMatch(/^⚠ ENGINEER REQUIRED — .+ exceeds IRC prescriptive provisions/);
  });
  it('unverified rules carry verified:false so sheets print VERIFY language', () => {
    const m = failCases['R304-AREA']!(rect3bed());
    expect(findingsFor(m, 'R304-AREA')[0]!.verified).toBe(false);
  });
});
