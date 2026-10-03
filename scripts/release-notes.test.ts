import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseNotes } from './release-notes';

const changelog = `# Changelog

## [Unreleased]

## [0.4.0] - 2026-10-03

### Added

- A command.

## [0.3.3] - 2026-10-03

### Fixed

- A bug.
`;

test('the section of a version, without its heading nor the next version', () => {
  assert.equal(releaseNotes(changelog, '0.4.0'), '### Added\n\n- A command.');
});

test('the last section goes to the end of the file', () => {
  assert.equal(releaseNotes(changelog, '0.3.3'), '### Fixed\n\n- A bug.');
});

test('a version is not found by the start of another', () => {
  assert.throws(() => releaseNotes(changelog, '0.4'), /no section for 0\.4/);
});

test('a version the changelog does not have, or says nothing of, is refused', () => {
  assert.throws(() => releaseNotes(changelog, '0.5.0'), /no section for 0\.5\.0/);
  assert.throws(() => releaseNotes(changelog, 'Unreleased'), /says nothing of Unreleased/);
});
