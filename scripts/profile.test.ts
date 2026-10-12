import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTrace, type TraceChunk } from './profile';

const chunks: TraceChunk[] = [
  { recorder: '2', test: 'connectToDapp', entries: [{ kind: 'request', seq: 1, at: 10, method: 'eth_requestAccounts', result: ['0xabc'], ms: 5 }] },
  { recorder: '2', test: 'rejectSignature', entries: [{ kind: 'request', seq: 2, at: 20, method: 'personal_sign', error: { code: 4001 }, ms: 3 }] },
];

test('the trace is read as one chunk, a list of chunks, or one chunk per line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-profile-'));
  const one = path.join(dir, 'one.json');
  fs.writeFileSync(one, JSON.stringify(chunks[0]));
  assert.equal(readTrace(one).length, 1);
  const list = path.join(dir, 'list.json');
  fs.writeFileSync(list, JSON.stringify(chunks, null, 2));
  assert.equal(readTrace(list).length, 2);
  const lines = path.join(dir, 'lines.jsonl');
  fs.writeFileSync(lines, chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n');
  assert.equal(readTrace(lines).length, 2);
  const empty = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  assert.deepEqual(readTrace(empty), []);
});
