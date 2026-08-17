const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('GitHub Pages workflow tests and deploys only the static showcase files', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /node --test/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /mkdir -p _site/);
  for (const file of [
    'index.html',
    'styles.css',
    'app.js',
    'picker-core.js',
    'catalog.js',
    'favicon.svg',
    'code-catalog-template.csv',
  ]) {
    assert.match(workflow, new RegExp(`\\b${file.replace('.', '\\.')}\\b`));
  }
  assert.match(ignore, /^_site\/$/m);
  assert.match(ignore, /^tests\/artifacts\/$/m);
});
