const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const demoCatalog = require('../catalog.js');
const { parseCatalogCsv } = require('../picker-core.js');

test('ships a clearly labeled, structurally complete demo catalog', () => {
  assert.equal(demoCatalog.isDemo, true);
  assert.match(demoCatalog.name, /demo/i);
  assert.ok(demoCatalog.entries.length >= 25);

  const codes = demoCatalog.entries.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);

  for (const entry of demoCatalog.entries) {
    assert.ok(entry.code.startsWith('DEMO-'));
    assert.ok(entry.name);
    assert.ok(entry.description);
    assert.ok(Array.isArray(entry.fund) && entry.fund.length);
    assert.ok(Array.isArray(entry.phase) && entry.phase.length);
    assert.ok(Array.isArray(entry.discipline) && entry.discipline.length);
    assert.ok(Array.isArray(entry.costType) && entry.costType.length);
    assert.ok(Array.isArray(entry.keywords));
    assert.equal(typeof entry.active, 'boolean');
  }

  const phases = new Set(demoCatalog.entries.flatMap((entry) => entry.phase));
  for (const phase of [
    '0-strategy',
    '1-concept',
    '2-design',
    '3-procurement',
    '4-installation',
    '5-commissioning',
    '6-turnover',
  ]) {
    assert.ok(phases.has(phase), `missing phase ${phase}`);
  }
});

test('includes an import template that the parser accepts unchanged', () => {
  const template = fs.readFileSync(path.resolve(__dirname, '..', 'code-catalog-template.csv'), 'utf8');
  const parsed = parseCatalogCsv(template);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.catalog.length, 1);
  assert.equal(parsed.catalog[0].code, 'YOUR-CODE');
});
