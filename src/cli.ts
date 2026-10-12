#!/usr/bin/env node
// The `dappress` command of the package's bin: `npx dappress probe`.
import { runCli } from './probe/command';

void runCli(process.argv.slice(2)).then((code) => {
  if (code !== undefined) process.exitCode = code;
});
