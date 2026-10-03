// Print the section of CHANGELOG.md for one version: the notes of its GitHub
// release. Fails when the changelog has no such section, or an empty one.
//
//   npx tsx scripts/release-notes.ts <version>

import fs from 'node:fs';
import path from 'node:path';

/** What `changelog` says of `version`: the text under its "## [version]" heading, up to the next version. */
export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const length = lines.slice(start + 1).findIndex((line) => line.startsWith('## '));
  const notes = lines
    .slice(start + 1, length === -1 ? undefined : start + 1 + length)
    .join('\n')
    .trim();
  if (!notes) throw new Error(`CHANGELOG.md says nothing of ${version}`);
  return notes;
}

if (require.main === module) {
  const [version] = process.argv.slice(2);
  if (!version) {
    console.error('Usage: npx tsx scripts/release-notes.ts <version>');
    process.exit(1);
  }
  try {
    console.log(releaseNotes(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), version));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
