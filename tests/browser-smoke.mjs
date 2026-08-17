import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cdpBase = process.env.CDP_BASE || 'http://127.0.0.1:9223';
const appUrl = process.env.APP_URL || 'http://127.0.0.1:8765/';
const artifacts = path.join(here, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });

const targetResponse = await fetch(`${cdpBase}/json/new?about%3Ablank`, { method: 'PUT' });
assert.equal(targetResponse.ok, true, `Could not create Chrome target: ${targetResponse.status}`);
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
const runtimeErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result || {});
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params.exceptionDetails.text || 'Runtime exception');
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    runtimeErrors.push(message.params.entry.text);
  }
});

function send(method, params = {}) {
  commandId += 1;
  const id = commandId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 15000);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result ? response.result.value : undefined;
}

async function waitFor(expression, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(filename, options = {}) {
  const captured = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: Boolean(options.clip),
    ...options,
  });
  const output = path.join(artifacts, filename);
  await fs.writeFile(output, Buffer.from(captured.data, 'base64'));
  return output;
}

try {
  await Promise.all([
    send('Page.enable'),
    send('Runtime.enable'),
    send('Log.enable'),
    send('DOM.enable'),
  ]);
  await send('Browser.grantPermissions', {
    origin: new URL(appUrl).origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: appUrl });
  await waitFor(
    "document.documentElement.dataset.codePickerReady === 'true'",
    'the code picker to mount',
  );

  assert.equal(await evaluate('document.title'), 'Project Controls Code Picker');
  assert.deepEqual(await evaluate('window.__codePickerErrors'), []);
  assert.equal(await evaluate("document.querySelector('#result-count').textContent"), 'Waiting for details');

  await evaluate("document.querySelector('[data-preset=generator]').click(); true");
  await waitFor(
    "window.CodePickerInstance.getState().resultCodes[0] === 'DEMO-3000'",
    'the generator recommendation',
  );
  const generatorState = await evaluate('window.CodePickerInstance.getState()');
  assert.equal(generatorState.resultCodes[0], 'DEMO-3000');
  assert.equal(
    await evaluate("document.querySelector('.result-card .code-label').textContent"),
    'DEMO-3000',
  );
  assert.match(
    await evaluate("document.querySelector('.result-card .match-reason').textContent"),
    /Best fit · matches all 4 selected dimensions/,
  );

  await evaluate("document.querySelector('[data-select-code=\"DEMO-3000\"]').click(); true");
  await waitFor(
    "window.CodePickerInstance.getState().selectedCode === 'DEMO-3000'",
    'the code selection',
  );
  assert.equal(await evaluate("document.querySelector('#selected-code').textContent"), 'DEMO-3000');
  assert.equal(await evaluate("document.querySelector('#selection-content').hidden"), false);
  await evaluate(`(() => {
    document.querySelector('#project-reference').value = 'DC-042';
    document.querySelector('#amount').value = '250000';
    document.querySelector('#copy-summary').click();
    return true;
  })()`);
  await waitFor("document.querySelector('#toast').hidden === false", 'copy feedback');
  assert.equal(
    await evaluate("document.querySelector('#toast').textContent"),
    'Designation copied for review.',
  );
  const desktopShot = await screenshot('code-picker-desktop.png');

  const documentNode = await send('DOM.getDocument', { depth: 1 });
  const fileNode = await send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: '#catalog-file',
  });
  assert.ok(fileNode.nodeId, 'CSV file input was not found');
  await send('DOM.setFileInputFiles', {
    files: [path.join(root, 'code-catalog-template.csv')],
    nodeId: fileNode.nodeId,
  });
  await waitFor(
    "window.CodePickerInstance.getState().isDemo === false",
    'the CSV catalog import',
  );
  assert.equal(await evaluate("document.querySelector('#catalog-mode').textContent"), 'IMPORTED');
  assert.equal(await evaluate("document.querySelector('#catalog-errors').hidden"), true);

  await evaluate(`(() => {
    document.querySelector('#scope-query').value = 'generator';
    document.querySelector('#fund-filter').value = 'base-capital';
    document.querySelector('#phase-filter').value = '4-installation';
    document.querySelector('#discipline-filter').value = 'electrical';
    document.querySelector('#cost-type-filter').value = 'equipment';
    window.CodePickerInstance.render();
    return true;
  })()`);
  await waitFor(
    "window.CodePickerInstance.getState().resultCodes[0] === 'YOUR-CODE'",
    'a result from the imported catalog',
  );
  assert.deepEqual(await evaluate('window.CodePickerInstance.getState().resultCodes'), ['YOUR-CODE']);
  assert.equal(await evaluate("window.CodePickerInstance.selectCode('YOUR-CODE')"), true);
  assert.equal(await evaluate('window.CodePickerInstance.getState().selectedCode'), 'YOUR-CODE');

  await evaluate('window.CodePickerInstance.restoreDemoCatalog(); true');
  assert.equal(await evaluate('window.CodePickerInstance.getState().isDemo'), true);
  await evaluate("window.CodePickerInstance.applyPreset('generator'); window.CodePickerInstance.selectCode('DEMO-3000'); true");
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'),
    true,
    'mobile layout overflows horizontally',
  );
  assert.equal(
    await evaluate("document.querySelector('#copy-summary').getBoundingClientRect().height >= 44"),
    true,
    'mobile copy action is smaller than the minimum touch target',
  );
  const selectionClip = await evaluate(`(() => {
    document.querySelector('#toast').hidden = true;
    const rect = document.querySelector('#selection-panel').getBoundingClientRect();
    return { x: 0, y: window.scrollY + rect.top, width: 390, height: 844, scale: 1 };
  })()`);
  const mobileShot = await screenshot('code-picker-mobile-selection.png', { clip: selectionClip });

  const finalErrors = await evaluate('window.__codePickerErrors');
  assert.deepEqual(finalErrors, []);
  assert.deepEqual(runtimeErrors, []);

  console.log(JSON.stringify({
    status: 'passed',
    generatorTopMatch: generatorState.resultCodes[0],
    importedCatalogResult: 'YOUR-CODE',
    desktopScreenshot: desktopShot,
    mobileScreenshot: mobileShot,
    runtimeErrors,
  }, null, 2));
} finally {
  const closed = new Promise((resolve) => {
    socket.addEventListener('close', resolve, { once: true });
    setTimeout(resolve, 500);
  });
  await fetch(`${cdpBase}/json/close/${target.id}`).catch(() => {});
  await closed;
}
