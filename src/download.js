const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const extractZip = require('extract-zip');

function releaseUrl(version) {
  return `https://github.com/MetaMask/metamask-extension/releases/download/v${version}/metamask-chrome-${version}.zip`;
}

function extensionDir(cacheDir, version) {
  return path.join(cacheDir, 'metamask', version);
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`[dappress] Could not download ${url}: HTTP ${response.status}`);
  }
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
}

/**
 * Download and unzip the MetaMask Chrome build for `version` into the cache.
 * Returns the path of the unpacked extension (the folder holding manifest.json).
 * Already cached versions are reused.
 */
async function prepareExtension({ metamaskVersion, cacheDir }) {
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

module.exports = { prepareExtension };
