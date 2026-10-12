// A wallet profile: what a dapp sees of a wallet, as conformance/recorder.js
// recorded it. src/profile-build.ts builds and compares profiles; this is its
// command line, and the reading of a trace file.
//
//   npm run profile -- build <trace.json> --wallet <name> --version <x.y.z> [--out <file>]
//   npm run profile -- diff <a.json> <b.json>
//
// `build` turns a trace into a profile: the chunks the conformance suite sent
// (one per test), or the single trace copied from a browser console. `diff`
// prints, method by method and event by event, where two profiles differ in
// the shape of what the wallet answers: the one table a dapp developer needs.

import fs from 'node:fs';

import { buildProfile, diffProfiles, type TraceChunk } from '../src/profile-build';

export * from '../src/profile-build';

/** The trace as a console copy gives it (one chunk) or as the suite's file holds it (one chunk per line). */
export function readTrace(file: string): TraceChunk[] {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text) as TraceChunk[];
  if (text.startsWith('{') && !text.includes('\n{')) return [JSON.parse(text) as TraceChunk];
  return text.split('\n').map((line) => JSON.parse(line) as TraceChunk);
}

function main(args: string[]): void {
  const [command] = args;
  if (command === 'build') {
    const { options, positional } = parse(args.slice(1), ['wallet', 'version', 'out']);
    const [file] = positional;
    if (!file || !options.wallet || !options.version) {
      console.error('Usage: npm run profile -- build <trace.json> --wallet <name> --version <x.y.z> [--out <file>]');
      process.exit(1);
    }
    const profile = buildProfile(readTrace(file), {
      wallet: { name: options.wallet, version: options.version },
      recorded: { by: 'hand', date: new Date().toISOString() },
    });
    const json = `${JSON.stringify(profile, null, 2)}\n`;
    if (options.out) {
      fs.writeFileSync(options.out, json);
      console.log(`Profile written to ${options.out}`);
    } else {
      process.stdout.write(json);
    }
    return;
  }
  if (command === 'diff') {
    const [a, b] = args.slice(1);
    if (!a || !b) {
      console.error('Usage: npm run profile -- diff <a.json> <b.json>');
      process.exit(1);
    }
    process.stdout.write(diffProfiles(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8'))));
    return;
  }
  console.error('Usage: npm run profile -- build … | diff …');
  process.exit(1);
}

// The --name value options among `names`, and the other arguments in order
function parse(args: string[], names: string[]): { options: Record<string, string>; positional: string[] } {
  const options: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && names.includes(name)) options[name] = args[++i];
    else positional.push(args[i]);
  }
  return { options, positional };
}

if (require.main === module) main(process.argv.slice(2));
