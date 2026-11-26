import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export const canonical = 'https://turkey.kramnameloc.com/';

function checkPath(path) {
  // Release filenames are plain, root-relative paths in both HTML and manifests.
  if (path === '/') return;
  const filename = /^\/(?:[\w-]+\/)*[\w-]+(?:\.[\w-]+)+$/;
  if (typeof path !== 'string' || !filename.test(path)) {
    throw new Error('Invalid release asset path');
  }
}

export async function readBuiltAsset(directory, path) {
  checkPath(path);
  const root = await realpath(directory);
  const file = await realpath(
    join(root, path === '/' ? 'index.html' : path.slice(1))
  );
  const fromRoot = relative(root, file);
  if (
    fromRoot === '..' ||
    fromRoot.startsWith('..' + sep) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error('Asset resolves outside the production build');
  }
  return readFile(file);
}

export async function fetchLiveAsset(path) {
  checkPath(path);
  return fetch(new URL(path, canonical), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
}
