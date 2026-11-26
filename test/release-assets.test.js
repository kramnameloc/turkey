import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readBuiltAsset, fetchLiveAsset } from '../scripts/release-assets.mjs';

test('the verifier reads the homepage and regular files inside the build', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turkey-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), 'home');
  await writeFile(join(dist, 'assets', 'index-a123.css'), 'body {}');
  assert.equal((await readBuiltAsset(dist, '/')).toString(), 'home');
  assert.equal(
    (await readBuiltAsset(dist, '/assets/index-a123.css')).toString(),
    'body {}'
  );
  await writeFile(join(root, 'outside.txt'), 'fixture');
  await symlink(join(root, 'outside.txt'), join(dist, 'linked.txt'));
  await assert.rejects(readBuiltAsset(dist, '/linked.txt'), /outside/i);
});

test('unqualified, external and non-canonical asset references are rejected before I/O', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', () =>
    assert.fail('unexpected request')
  );
  for (const path of [
    'relative.css',
    'https://example.org/style.css',
    '//example.org/style.css',
    '/assets/../style.css',
    '/assets/%2e/file.css',
    '/assets/file.css?next=1',
    '/assets/file.css#fragment',
    '/assets/foo\\bar.css',
  ]) {
    await assert.rejects(readBuiltAsset('unused', path), /asset path/i);
    await assert.rejects(fetchLiveAsset(path), /asset path/i);
  }
  assert.equal(request.mock.callCount(), 0);
});

test('live checks request the canonical HTTPS origin and reject redirects', async (t) => {
  const response = new Response('ok');
  const request = t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await fetchLiveAsset('/geo/region.json'), response);
  const [url, options] = request.mock.calls[0].arguments;
  assert.equal(String(url), 'https://turkey.kramnameloc.com/geo/region.json');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
});
