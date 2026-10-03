import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import extractZip from 'extract-zip';
import type { ResolvedOptions } from './types';

function releaseUrl(version: string): string {
  return `https://github.com/MetaMask/metamask-extension/releases/download/v${version}/metamask-chrome-${version}.zip`;
}

function extensionDir(cacheDir: string, version: string): string {
  return path.join(cacheDir, 'metamask', version);
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`[dappress] Could not download ${url}: HTTP ${response.status}`);
  }
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body as ReadableStream), fs.createWriteStream(destination));
}

/**
 * Download and unzip the MetaMask Chrome build for `version` into the cache.
 * Returns the path of the unpacked extension (the folder holding manifest.json).
 * Already cached versions are reused.
 */
export async function prepareExtension({ metamaskVersion, cacheDir }: Pick<ResolvedOptions, 'metamaskVersion' | 'cacheDir'>): Promise<string> {
  const dir = extensionDir(cacheDir, metamaskVersion);
  const manifest = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifest)) return dir;

  const zipPath = path.join(cacheDir, 'metamask', `metamask-chrome-${metamaskVersion}.zip`);
  if (!fs.existsSync(zipPath)) {
    console.log(`[dappress] Downloading MetaMask ${metamaskVersion}…`);
    await download(releaseUrl(metamaskVersion), zipPath);
  }

  console.log(`[dappress] Unpacking MetaMask ${metamaskVersion}…`);
  await fs.promises.rm(dir, { recursive: true, force: true });
  await extractZip(zipPath, { dir });

  if (!fs.existsSync(manifest)) {
    throw new Error(`[dappress] ${zipPath} does not look like a MetaMask build: no manifest.json after extraction`);
  }
  return dir;
}
