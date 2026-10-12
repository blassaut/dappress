// Builds the probe page into dist/probe, next to the compiled command and
// server: the page's script bundled for the browser, with the profile code it
// shares with Node, and its static files as they are, the recorder among them.
// Deterministic: the reproducible build compares dist with what npm serves.

import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'probe');

async function main(): Promise<void> {
  fs.mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [path.join(root, 'src', 'probe', 'page', 'main.ts')],
    outfile: path.join(out, 'probe.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
  });
  for (const file of ['index.html', 'style.css']) fs.copyFileSync(path.join(root, 'src', 'probe', 'page', file), path.join(out, file));
  fs.copyFileSync(path.join(root, 'conformance', 'recorder.js'), path.join(out, 'recorder.js'));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
