const test = require('node:test');
const assert = require('node:assert/strict');

const catalog = require('../catalog.js');
const { suggestCodes } = require('../picker-core.js');

const scenarios = [
  {
    name: 'major generator purchase',
    criteria: {
      query: 'purchase generator package',
      fund: 'owner-furnished',
      phase: '3-procurement',
      discipline: 'electrical',
      costType: 'equipment',
    },
    expected: 'DEMO-3000',
  },
  {
    name: 'temporary construction power',
    criteria: {
      query: 'temporary construction power',
      fund: 'base-capital',
      phase: '4-installation',
      discipline: 'electrical',
      costType: 'temporary-works',
    },
    expected: 'DEMO-3030',
  },
  {
    name: 'commissioning authority services',
    criteria: {
      query: 'commissioning authority services',
      fund: 'base-capital',
      phase: '5-commissioning',
      discipline: 'commissioning',
      costType: 'professional-services',
    },
    expected: 'DEMO-6000',
  },
  {
    name: 'approved change budget',
    criteria: {
      query: 'approved change budget',
      fund: 'approved-change',
      costType: 'other',
    },
    expected: 'DEMO-8100',
  },
];

for (const scenario of scenarios) {
  test(`acceptance scenario: ${scenario.name}`, () => {
    const results = suggestCodes(catalog.entries, scenario.criteria);
    assert.equal(results[0]?.code, scenario.expected);
  });
}

test('does not force a near match when exact funding dimensions conflict', () => {
  const results = suggestCodes(catalog.entries, {
    query: 'purchase generator package',
    fund: 'base-capital',
    phase: '3-procurement',
    discipline: 'electrical',
    costType: 'equipment',
  });

  assert.deepEqual(results, []);
});
