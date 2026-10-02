const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readReports, renderMatrix, renderBadge } = require('./matrix');

const report = (metamaskVersion, mode, failing = []) => ({
  dappressVersion: '0.3.1',
  metamaskVersion,
  mode,
  date: '2026-10-02T21:17:31.000Z',
  passed: failing.length === 0,
  actions: ['connectToDapp', 'approveNewNetwork', 'confirmTransaction'].map((action) =>
    failing.includes(action) ? { action, status: 'failed', error: 'Timed out' } : { action, status: 'passed' },
  ),
});

const entry = (version, mode, failing) => ({ version, mode, report: report(version, mode, failing) });

test('reads mode reports, and a report without a mode as side panel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-matrix-'));
  const legacy = report('13.49.0', undefined);
  delete legacy.mode;
  fs.writeFileSync(path.join(dir, 'metamask-13.49.0.json'), JSON.stringify(legacy));
  fs.writeFileSync(path.join(dir, 'metamask-13.50.0-popup.json'), JSON.stringify(report('13.50.0', 'popup')));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a report');

  const reports = readReports(dir).map(({ version, mode }) => `${version} ${mode}`).sort();
  assert.deepEqual(reports, ['13.49.0 sidepanel', '13.50.0 popup']);
});

test('a side panel report wins over a legacy report of the same version', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-matrix-'));
  const legacy = report('13.50.0', undefined, ['connectToDapp']);
  delete legacy.mode;
  fs.writeFileSync(path.join(dir, 'metamask-13.50.0.json'), JSON.stringify(legacy));
  fs.writeFileSync(path.join(dir, 'metamask-13.50.0-sidepanel.json'), JSON.stringify(report('13.50.0', 'sidepanel')));

  assert.match(renderMatrix(readReports(dir)), /\| 13\.50\.0 \| ✅ 3\/3 \|/);
});

test('one row per version, newest first, one column per mode', () => {
  const matrix = renderMatrix([
    entry('13.9.0', 'sidepanel'),
    entry('13.50.0', 'sidepanel'),
    entry('13.50.0', 'headless'),
    entry('13.50.0', 'popup', ['approveNewNetwork']),
  ]);
  const rows = matrix.split('\n').filter((line) => /^\| \d/.test(line));
  assert.deepEqual(rows, [
    '| 13.50.0 | ✅ 3/3 | ✅ 3/3 | ❌ 2/3 | 0.3.1 | 2026-10-02 |',
    '| 13.9.0 | ✅ 3/3 | – | – | 0.3.1 | 2026-10-02 |',
  ]);
  assert.match(matrix, /- 13\.50\.0, Popup: approveNewNetwork: Timed out/);
});

test('no failures section when everything passed', () => {
  assert.doesNotMatch(renderMatrix([entry('13.50.0', 'sidepanel')]), /Failures/);
});

test('badge: the latest version, green only when every mode passed', () => {
  const all = ['sidepanel', 'headless', 'popup'].map((mode) => entry('13.50.0', mode));
  assert.deepEqual(renderBadge([entry('13.49.0', 'sidepanel', ['connectToDapp']), ...all]), {
    schemaVersion: 1,
    label: 'MetaMask',
    message: '13.50.0 · 3/3 modes',
    color: 'brightgreen',
  });
  assert.equal(renderBadge([entry('13.50.0', 'sidepanel'), entry('13.50.0', 'popup', ['connectToDapp'])]).color, 'yellow');
  assert.equal(renderBadge([entry('13.50.0', 'popup', ['connectToDapp'])]).color, 'red');
  assert.equal(renderBadge([]).message, 'no report');
});
