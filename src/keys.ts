// The address of a private key, for the mock wallet: Node's own secp256k1
// gives the public key, and keccak-256 its address. The key is read, never
// kept, and never logged.

import crypto from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3';

export function addressOf(privateKey: string): string {
  const hex = privateKey.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('[dappress] A private key is 32 bytes in hex, with or without 0x');
  const key = crypto.createECDH('secp256k1');
  key.setPrivateKey(Buffer.from(hex, 'hex'));
  // The public key, uncompressed, without its 0x04 prefix; the address is the last 20 bytes of its hash
  const publicKey = key.getPublicKey().subarray(1);
  return `0x${Buffer.from(keccak_256(publicKey)).toString('hex').slice(-40)}`;
}
