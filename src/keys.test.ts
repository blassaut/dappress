import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressOf } from './keys';

// Anvil's first account, from its default mnemonic
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADDRESS = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

test('the address of a private key, with or without 0x', () => {
  assert.equal(addressOf(KEY), ADDRESS);
  assert.equal(addressOf(KEY.slice(2)), ADDRESS);
});

test('anything but 32 bytes of hex is refused', () => {
  assert.throws(() => addressOf('0x1234'), /32 bytes in hex/);
  assert.throws(() => addressOf('not a key'), /32 bytes in hex/);
});
