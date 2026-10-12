// What the chain commands of src/support.ts make of the node's answers, kept
// out of Cypress to be tested on their own.

/** A JSON-RPC response's body: a result, or an error. */
export type RpcAnswer = { result?: unknown; error?: { code?: number; message: string } };

/**
 * How many blocks to mine for the chain, at block `head` after a revert, to be
 * past `before`, the block it was at before: one more than the revert took away.
 * The real MetaMask takes a block for its latest only if it is higher than the
 * one it has, which may be `before`, a block the revert removed.
 */
export function blocksPast(before: string, head: string): number {
  return Math.max(Number(BigInt(before) - BigInt(head)), 0) + 1;
}

/**
 * Why evm_revert to snapshot `id` failed on the node at `url`, or undefined if
 * it did not. Anvil and Hardhat answer false for a snapshot they do not have:
 * one never taken, or one a revert consumed, its own or one to an earlier snapshot.
 */
export function revertFailure(id: string, url: string, answer: RpcAnswer): string | undefined {
  const failed = `[dappress] Could not revert to snapshot ${id} on ${url}`;
  if (answer.error) return `${failed}: ${answer.error.message}`;
  if (answer.result === true) return undefined;
  if (answer.result === false)
    return `${failed}: the node has no such snapshot. A revert consumes its snapshot and the ones taken after it: take a new one with cy.snapshot() to revert again`;
  return `${failed}: the node answered ${JSON.stringify(answer.result)}`;
}
