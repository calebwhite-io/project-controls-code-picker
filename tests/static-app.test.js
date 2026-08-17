const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('provides the complete accessible code-selection surface', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /<title>Project Controls Code Picker<\/title>/);
  assert.doesNotMatch(html, /\bintegra\b/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'catalog.js'), 'utf8'), /\bintegra\b/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /\bintegra\b/i);
  for (const id of [
    'demo-banner',
    'scope-query',
    'fund-filter',
    'phase-filter',
    'discipline-filter',
    'cost-type-filter',
    'results',
    'selection-panel',
    'project-reference',
    'amount',
    'catalog-file',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  assert.match(html, /id="results"[^>]*aria-live="polite"/);
  assert.match(html, /<script src="picker-core\.js"><\/script>[\s\S]*<script src="catalog\.js"><\/script>[\s\S]*<script src="app\.js"><\/script>/);
});

test('documents local use, catalog replacement, and verification', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.match(readme, /index\.html/);
  assert.match(readme, /demo catalog/i);
  assert.match(readme, /Import approved CSV/i);
  assert.match(readme, /node --test\b/i);
  assert.match(readme, /Project Controls \/ Finance confirmation/i);
});
