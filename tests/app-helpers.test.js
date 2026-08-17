const test = require('node:test');
const assert = require('node:assert/strict');

const { getResultReason, hasCriteria, humanize, mount } = require('../app.js');

test('turns selection state into concise employee-facing guidance', () => {
  assert.equal(humanize('3-procurement'), '3 · Procurement');
  assert.equal(humanize('owner-furnished'), 'Owner furnished');
  assert.equal(hasCriteria({ query: '', phase: '', discipline: '' }), false);
  assert.equal(hasCriteria({ query: 'switchgear', phase: '' }), true);

  assert.equal(getResultReason({
    confidence: 'strong',
    matchedFacets: ['funding bucket', 'phase', 'discipline', 'cost type'],
    matchedTerms: ['generator', 'purchase'],
  }, 0), 'Best fit · matches all 4 selected dimensions · 2 description terms');

  assert.equal(getResultReason({
    confidence: 'broad',
    matchedFacets: [],
    matchedTerms: ['testing'],
  }, 2), 'Possible match · 1 description term');
  assert.equal(typeof mount, 'function');
});
