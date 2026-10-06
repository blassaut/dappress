import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readReports, renderMatrix, renderBadge, type Report, type ReportEntry } from './matrix';

const report = (metamaskVersion: string, mode: string, failing: string[] = []): Report => ({
  dappressVersion: '0.3.1',
  metamaskVersion,
  mode,
  date: '2026-10-02T21:17:31.000Z',
  passed: failing.length === 0,
  actions: ['connectToDapp', 'approveNewNetwork', 'confirmTransaction'].map((action) =>
    failing.includes(action) ? { action, status: 'failed', error: 'Timed out' } : { action, status: 'passed' },
  ),
});

const entry = (version: string, mode: string, failing?: string[]): ReportEntry => ({ version, mode, report: report(version, mode, failing) });

test('reads the reports of a folder by version and mode, and nothing else in it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-matrix-'));
  fs.writeFileSync(path.join(dir, 'metamask-13.49.0-sidepanel.json'), JSON.stringify(report('13.49.0', 'sidepanel')));
  fs.writeFileSync(path.join(dir, 'metamask-13.50.0-popup.json'), JSON.stringify(report('13.50.0', 'popup')));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a report');
  fs.mkdirSync(path.join(dir, 'profiles'));

  const reports = readReports(dir)
    .map(({ version, mode }) => `${version} ${mode}`)
    .sort();
  assert.deepEqual(reports, ['13.49.0 sidepanel', '13.50.0 popup']);
});

test('one row per version, newest first, one column per mode', () => {
  const matrix = renderMatrix([
    entry('13.9.0', 'sidepanel'),
    entry('13.50.0', 'sidepanel'),
    entry('13.50.0', 'headless'),
    entry('13.50.0', 'popup', ['approveNewNetwork']),
  ]);
  const rows = matrix.split('\n').filter((line) => /^\| \d/.test(line));
  assert.deepEqual(rows, ['| 13.50.0 | ✅ 3/3 | ✅ 3/3 | ❌ 2/3 | 0.3.1 | 2026-10-02 |', '| 13.9.0 | ✅ 3/3 | – | – | 0.3.1 | 2026-10-02 |']);
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

test('one row per action, one column per version, with the modes an action failed in', () => {
  const older = entry('13.49.0', 'sidepanel');
  older.report.actions = older.report.actions.slice(0, 2);
  const matrix = renderMatrix([
    older,
    entry('13.50.0', 'sidepanel'),
    entry('13.50.0', 'headless', ['approveNewNetwork']),
    entry('13.50.0', 'popup', ['approveNewNetwork']),
  ]);
  const rows = matrix
    .slice(matrix.indexOf('## Actions'))
    .split('\n')
    .filter((line) => line.startsWith('|'));
  assert.deepEqual(rows, [
    '| Action | 13.50.0 | 13.49.0 |',
    '| --- | --- | --- |',
    '| connectToDapp | ✅ | ✅ |',
    '| approveNewNetwork | ❌ Headless, Popup | ✅ |',
    '| confirmTransaction | ✅ | – |',
  ]);
});

test('the actions table keeps the latest eight versions', () => {
  const matrix = renderMatrix(Array.from({ length: 10 }, (_, minor) => entry(`13.${minor}.0`, 'sidepanel')));
  const [header] = matrix
    .slice(matrix.indexOf('## Actions'))
    .split('\n')
    .filter((line) => line.startsWith('|'));
  assert.equal(header, '| Action | 13.9.0 | 13.8.0 | 13.7.0 | 13.6.0 | 13.5.0 | 13.4.0 | 13.3.0 | 13.2.0 |');
  assert.match(matrix, /one column per MetaMask release, the latest 8\./);
});
