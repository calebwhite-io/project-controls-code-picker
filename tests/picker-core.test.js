const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDesignation,
  getFacetOptions,
  parseCatalogCsv,
  suggestCodes,
} = require('../picker-core.js');

const catalog = [
  {
    code: 'DEMO-1000',
    name: 'Civil installation',
    description: 'Site and civil subcontract installation',
    fund: ['base-capital'],
    phase: ['4-installation'],
    discipline: ['civil-site'],
    costType: ['subcontract'],
    keywords: ['earthwork', 'sitework'],
    active: true,
  },
  {
    code: 'DEMO-3000',
    name: 'Electrical equipment purchase',
    description: 'Owner-furnished electrical equipment',
    fund: ['owner-furnished'],
    phase: ['3-procurement'],
    discipline: ['electrical'],
    costType: ['equipment'],
    keywords: ['generator', 'switchgear', 'ups'],
    active: true,
  },
];

test('ranks the code matching the selected funding dimensions first', () => {
  const results = suggestCodes(catalog, {
    query: 'generator purchase',
    fund: 'owner-furnished',
    phase: '3-procurement',
    discipline: 'electrical',
    costType: 'equipment',
  });

  assert.equal(results[0].code, 'DEMO-3000');
  assert.equal(results[0].confidence, 'strong');
  assert.deepEqual(results[0].matchedFacets.sort(), [
    'cost type',
    'discipline',
    'funding bucket',
    'phase',
  ]);
});

test('excludes inactive codes unless explicitly requested', () => {
  const retired = {
    ...catalog[1],
    code: 'DEMO-OLD',
    active: false,
  };

  const defaultResults = suggestCodes([...catalog, retired], { query: 'generator' });
  const auditResults = suggestCodes([...catalog, retired], {
    query: 'generator',
    includeInactive: true,
  });

  assert.equal(defaultResults.some((result) => result.code === 'DEMO-OLD'), false);
  assert.equal(auditResults.some((result) => result.code === 'DEMO-OLD'), true);
});

test('treats selected facets as required eligibility filters', () => {
  const results = suggestCodes(catalog, {
    discipline: 'electrical',
    costType: 'equipment',
  });

  assert.deepEqual(results.map((result) => result.code), ['DEMO-3000']);
});

test('parses quoted CSV fields into a normalized catalog row', () => {
  const csv = [
    'code,name,description,fund,phase,discipline,cost_type,keywords,active,requires_review,review_note',
    'PC-300,"Electrical, equipment",Owner-furnished gear,owner-furnished,3-procurement,electrical,equipment,"generator;switchgear;UPS",true,true,"Confirm PO and approved budget"',
  ].join('\r\n');

  const parsed = parseCatalogCsv(csv);

  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.catalog, [{
    code: 'PC-300',
    name: 'Electrical, equipment',
    description: 'Owner-furnished gear',
    fund: ['owner-furnished'],
    phase: ['3-procurement'],
    discipline: ['electrical'],
    costType: ['equipment'],
    keywords: ['generator', 'switchgear', 'UPS'],
    active: true,
    requiresReview: true,
    reviewNote: 'Confirm PO and approved budget',
  }]);
});

test('rejects incomplete and duplicate catalog rows with actionable errors', () => {
  const csv = [
    'code,name,description',
    'PC-100,Civil work,Earthwork',
    'PC-100,Duplicate code,Another row',
    ',Missing code,Invalid row',
    'PC-200,,Missing name',
  ].join('\n');

  const parsed = parseCatalogCsv(csv);

  assert.deepEqual(parsed.catalog.map((entry) => entry.code), ['PC-100']);
  assert.deepEqual(parsed.errors, [
    'Row 3: duplicate code “PC-100”.',
    'Row 4: code is required.',
    'Row 5: name is required.',
  ]);
});

test('builds a review-ready designation summary without implying approval', () => {
  const summary = buildDesignation(catalog[1], {
    project: 'DC-042',
    purpose: 'Purchase generator package',
    amount: '250000',
    catalogName: 'Demo catalog v1.0',
  });

  assert.equal(summary, [
    'PROJECT CONTROLS CODE SELECTION',
    'Project / reference: DC-042',
    'Purpose: Purchase generator package',
    'Amount: $250,000.00',
    'Code: DEMO-3000',
    'Code name: Electrical equipment purchase',
    'Funding bucket: Owner furnished',
    'Catalog: Demo catalog v1.0',
    'Status: Pending Project Controls / Finance confirmation',
  ].join('\n'));
});

test('derives unique, sorted facet options from the active catalog', () => {
  const options = getFacetOptions([
    ...catalog,
    { ...catalog[0], code: 'DEMO-ALL', discipline: ['all', 'electrical'] },
    { ...catalog[0], code: 'DEMO-OLD', discipline: ['mechanical'], active: false },
  ], 'discipline');

  assert.deepEqual(options, ['civil-site', 'electrical']);
});

test('text search removes candidates that match none of the request terms', () => {
  const results = suggestCodes(catalog, { query: 'generator' });

  assert.deepEqual(results.map((result) => result.code), ['DEMO-3000']);
});
