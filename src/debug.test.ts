import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserLogArgs, debugging, timed } from './debug';

// The tests run without DAPPRESS_DEBUG: diagnostics off change nothing

test('off by default', () => {
  assert.equal(debugging, Boolean(process.env.DAPPRESS_DEBUG));
});

test('timed: off, yields what the work yields and throws what it throws', { skip: debugging }, async () => {
  assert.equal(await timed('work', async () => 42), 42);
  await assert.rejects(
    timed('work', async () => {
      throw new Error('broken');
    }),
    /broken/,
  );
});

test('browserLogArgs: off, no argument for Chrome', { skip: debugging }, () => {
  assert.deepEqual(browserLogArgs(), []);
});
