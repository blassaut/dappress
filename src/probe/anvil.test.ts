import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startAnvil, isListening } from './anvil';

/** A port something listens on, for as long as the test needs it. */
async function takenPort(): Promise<{ port: number; release: () => Promise<void> }> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, release: () => new Promise((resolve) => server.close(() => resolve())) };
}

test('a port something listens on is taken, a free one is not', async () => {
  const { port, release } = await takenPort();
  assert.equal(await isListening(port), true);
  await release();
  assert.equal(await isListening(port), false);
});

test("Anvil is never started over a node that already listens: it may be the user's own", async () => {
  const { port, release } = await takenPort();
  try {
    await assert.rejects(startAnvil({ port }), new RegExp(`Something already listens on 127\\.0\\.0\\.1:${port}: stop it, or pass --anvil-port`));
  } finally {
    await release();
  }
});

test('without Anvil, the error says how to install it', async () => {
  const { port, release } = await takenPort();
  await release();
  await assert.rejects(startAnvil({ port, binary: '/nonexistent/anvil' }), /Anvil is not installed\. It is part of Foundry: getfoundry\.sh/);
});
