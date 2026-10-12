import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revertFailure } from './chain';

const ANVIL = 'http://127.0.0.1:8545';

test('revertFailure: nothing when the node reverted', () => {
  assert.equal(revertFailure('0x1', ANVIL, { result: true }), undefined);
});

test('revertFailure: a snapshot the node does not have, by its id, and how to revert again', () => {
  assert.equal(
    revertFailure('0x1', ANVIL, { result: false }),
    '[dappress] Could not revert to snapshot 0x1 on http://127.0.0.1:8545: the node has no such snapshot. A revert consumes its snapshot and the ones taken after it: take a new one with cy.snapshot() to revert again',
  );
});

test("revertFailure: the node's error, with the id", () => {
  assert.equal(
    revertFailure('zz', ANVIL, { error: { code: -32602, message: 'data did not match any variant of untagged enum NumericSeq' } }),
    '[dappress] Could not revert to snapshot zz on http://127.0.0.1:8545: data did not match any variant of untagged enum NumericSeq',
  );
  assert.equal(
    revertFailure('0x1', ANVIL, { error: { code: -32601, message: 'Method not found' } }),
    '[dappress] Could not revert to snapshot 0x1 on http://127.0.0.1:8545: Method not found',
  );
});

test('revertFailure: an answer that is neither true nor false', () => {
  assert.equal(revertFailure('0x1', ANVIL, { result: null }), '[dappress] Could not revert to snapshot 0x1 on http://127.0.0.1:8545: the node answered null');
});
