// Build the public conformance matrix from the reports: MATRIX.md, with one
// table of MetaMask versions by mode and one of actions by MetaMask version,
// and badge.json, a shields.io endpoint for the latest version.
//
//   npm run matrix -- <reportsDir> <outDir>

import fs from 'node:fs';
import path from 'node:path';
import { MODES } from './modes';

/** What scripts/conformance.ts writes for one run of the suite. */
export type Report = {
  dappressVersion: string;
  metamaskVersion: string;
  mode: string;
  browser?: string;
  date: string;
  passed: boolean;
  actions: { action: string; status: string; error?: string }[];
};

export type ReportEntry = { version: string; mode: string; report: Report };

type ReportsByMode = Record<string, Report>;

// The actions table has one column per version: the latest ones, to stay readable
const VERSIONS_BY_ACTION = 8;

// metamask-<version>-<mode>.json, as scripts/modes.ts names them
const REPORT_FILE = /^metamask-(\d+\.\d+\.\d+)-([a-z]+)\.json$/;

/** The reports in `dir`, as { version, mode, report }. Anything else in there is left alone. */
export function readReports(dir: string): ReportEntry[] {
  return fs
    .readdirSync(dir)
    .map((file) => ({ file, match: REPORT_FILE.exec(file) }))
    .flatMap(({ file, match }) => (match ? [{ file, match }] : []))
    .map(({ file, match }) => ({ version: match[1], mode: match[2], report: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Report }));
}

/** Newest first. */
function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
}

/** version -> mode -> report, versions newest first. */
function byVersion(reports: ReportEntry[]): Map<string, ReportsByMode> {
  const versions = new Map<string, ReportsByMode>();
  for (const { version, mode, report } of reports) {
    const reportsByMode = versions.get(version) ?? {};
    reportsByMode[mode] = report;
    versions.set(version, reportsByMode);
  }
  return new Map([...versions].sort(([a], [b]) => compareVersions(a, b)));
}

function cell(report: Report | undefined): string {
  if (!report) return '–';
  const passed = report.actions.filter((action) => action.status === 'passed').length;
  const total = report.actions.length;
  return report.passed ? `✅ ${passed}/${total}` : `❌ ${passed}/${total}`;
}

function failures(version: string, modes: ReportsByMode): string[] {
  return Object.entries(modes)
    .filter(([, report]) => !report.passed)
    .flatMap(([mode, report]) =>
      report.actions
        .filter((action) => action.status !== 'passed')
        .map((action) => `- ${version}, ${MODES[mode]?.label || mode}: ${action.action}${action.error ? `: ${action.error}` : ''}`),
    );
}

/**
 * How one action did in one version: passed in every mode that ran it, failed
 * in the modes named, or "–" when no report of the version has it.
 */
function actionCell(reportsByMode: ReportsByMode, action: string): string {
  const ran = Object.entries(reportsByMode)
    .map(([mode, report]) => ({ mode, result: report.actions.find((candidate) => candidate.action === action) }))
    .filter(({ result }) => result);
  if (!ran.length) return '–';
  const failed = ran.filter(({ result }) => result?.status !== 'passed').map(({ mode }) => MODES[mode]?.label || mode);
  return failed.length ? `❌ ${failed.join(', ')}` : '✅';
}

/** The table of actions by version: the actions in the order of the suite, newest version first. */
function actionRows(versions: Map<string, ReportsByMode>): string[] {
  const latest = [...versions].slice(0, VERSIONS_BY_ACTION);
  const actions: string[] = [];
  for (const [, reportsByMode] of latest) {
    for (const report of Object.values(reportsByMode)) {
      for (const { action } of report.actions) if (!actions.includes(action)) actions.push(action);
    }
  }
  return [
    `| Action | ${latest.map(([version]) => version).join(' | ')} |`,
    `| --- | ${latest.map(() => '---').join(' | ')} |`,
    ...actions.map((action) => `| ${action.replace(/\|/g, '\\|')} | ${latest.map(([, reportsByMode]) => actionCell(reportsByMode, action)).join(' | ')} |`),
  ];
}

/** MATRIX.md for the reports. */
export function renderMatrix(reports: ReportEntry[]): string {
  const versions = byVersion(reports);
  const modes = Object.keys(MODES);
  const lines = [
    '# Dappress conformance',
    '',
    "One run of the suite per MetaMask release and mode. A mode is where MetaMask shows the dapp's requests: its side panel, the same without a browser window, or its popup when the wallet comes from the profile cache.",
    '',
    `| MetaMask | ${modes.map((mode) => MODES[mode].label).join(' | ')} | Dappress | Date |`,
    `| --- | ${modes.map(() => '---').join(' | ')} | --- | --- |`,
  ];
  for (const [version, reportsByMode] of versions) {
    const any = Object.values(reportsByMode)[0];
    lines.push(`| ${version} | ${modes.map((mode) => cell(reportsByMode[mode])).join(' | ')} | ${any.dappressVersion} | ${any.date.slice(0, 10)} |`);
  }
  if (versions.size) {
    lines.push(
      '',
      '## Actions',
      '',
      `One row per action of the suite, one column per MetaMask release${versions.size > VERSIONS_BY_ACTION ? `, the latest ${VERSIONS_BY_ACTION}` : ''}. ✅ passed in every mode that ran it, ❌ failed in the modes named, – not in the suite then.`,
      '',
      ...actionRows(versions),
    );
  }
  const failed = [...versions].flatMap(([version, reportsByMode]) => failures(version, reportsByMode));
  if (failed.length) lines.push('', '## Failures', '', ...failed);
  return `${lines.join('\n')}\n`;
}

/** The shields.io endpoint for the latest version: green when every mode passed. */
export function renderBadge(reports: ReportEntry[]): { schemaVersion: 1; label: string; message: string; color: string } {
  const [latest] = byVersion(reports);
  if (!latest) return { schemaVersion: 1, label: 'MetaMask', message: 'no report', color: 'lightgrey' };
  const [version, reportsByMode] = latest;
  const total = Object.keys(MODES).length;
  const passed = Object.keys(MODES).filter((mode) => reportsByMode[mode]?.passed).length;
  const color = passed === total ? 'brightgreen' : passed === 0 ? 'red' : 'yellow';
  return { schemaVersion: 1, label: 'MetaMask', message: `${version} · ${passed}/${total} modes`, color };
}

if (require.main === module) {
  const [reportsDir, outDir] = process.argv.slice(2);
  if (!reportsDir || !outDir) {
    console.error('Usage: npm run matrix -- <reportsDir> <outDir>');
    process.exit(1);
  }
  const reports = readReports(reportsDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'MATRIX.md'), renderMatrix(reports));
  fs.writeFileSync(path.join(outDir, 'badge.json'), `${JSON.stringify(renderBadge(reports), null, 2)}\n`);
  console.log(`[dappress] Matrix of ${reports.length} report(s) written to ${outDir}`);
}
