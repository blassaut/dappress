// A wallet profile: what a dapp sees of a wallet, as conformance/recorder.js
// recorded it and scripts/profile.ts shaped it. Each request to the provider
// with its result or error, each event with its payload, and how the provider
// turned up, grouped by method and by event. Nothing is interpreted: what was
// not observed is not in the profile. The mock wallet replays one.

import fs from 'node:fs';
import path from 'node:path';

import { SCHEMA, type Profile } from './profile-schema';

export * from './profile-schema';

// The profiles the package ships: reports/profiles, copied into dist/profiles by
// the build. From the sources, as the conformance suite runs them, reports/profiles itself
const SHIPPED =
  [path.join(__dirname, 'profiles'), path.join(__dirname, '..', 'reports', 'profiles')].find((dir) => fs.existsSync(dir)) ?? path.join(__dirname, 'profiles');

/**
 * The profile named by `name`: a path to a profile file, or the name of a
 * wallet the package ships a profile of, `metamask`, `rabby`, `phantom`, in
 * its latest version.
 */
export function loadProfile(name: string, dir = SHIPPED): Profile {
  const file = name.endsWith('.json') ? name : shippedProfile(name, dir);
  if (!fs.existsSync(file)) throw new Error(`[dappress] No wallet profile at ${file}`);
  const profile = JSON.parse(fs.readFileSync(file, 'utf8')) as Profile;
  if (profile.schema !== SCHEMA) throw new Error(`[dappress] ${file} is not a wallet profile (schema ${profile.schema}, expected ${SCHEMA})`);
  return profile;
}

function shippedProfile(name: string, dir: string): string {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.startsWith(`${name.toLowerCase()}-`) && file.endsWith('.json')) : [];
  if (!files.length) {
    const shipped = fs.existsSync(dir) ? fs.readdirSync(dir).join(', ') : 'none';
    throw new Error(`[dappress] No profile of "${name}" among the shipped ones (${shipped}). Give the path of a profile file instead`);
  }
  // The newest version, by its numbers
  return path.join(dir, files.sort((a, b) => compareVersions(versionOf(b), versionOf(a)))[0]);
}

const versionOf = (file: string) => (/-(\d+(?:\.\d+)*)/.exec(file)?.[1] ?? '0').split('.').map(Number);
const compareVersions = (a: number[], b: number[]) => a.map((n, i) => n - (b[i] ?? 0)).find((d) => d !== 0) ?? 0;
