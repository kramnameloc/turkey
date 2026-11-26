import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldData, loadMapImage, regionData } from '../src/field.js';

test('map requests share work, keep the two maps separate, and retry failed responses', async (t) => {
  const responses = [
    new Response('offline', { status: 503 }),
    new Response('invalid json'),
    Response.json({ name: 'Community Park' }),
    Response.json({ name: 'Greater Broomfield' }),
  ];
  const request = t.mock.method(globalThis, 'fetch', async () =>
    responses.shift()
  );
  const first = fieldData();
  assert.equal(fieldData(), first);
  await assert.rejects(first, /Broomfield field map/);
  await assert.rejects(fieldData(), SyntaxError);
  const park = await fieldData();
  assert.equal(await fieldData(), park);
  assert.deepEqual(park, { name: 'Community Park' });
  assert.deepEqual(await regionData(), { name: 'Greater Broomfield' });
  assert.deepEqual(
    request.mock.calls.map((call) => call.arguments[0]),
    [
      '/geo/broomfield.json',
      '/geo/broomfield.json',
      '/geo/broomfield.json',
      '/geo/region.json',
    ]
  );
});

test('a failed photograph can be retried by every caller sharing the map', async (t) => {
  const images = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  globalThis.Image = class {
    constructor() {
      images.push(this);
    }
  };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Image', previous);
    else delete globalThis.Image;
  });
  const data = { orthophoto: { url: '/geo/aerial.jpg' } };
  const failed = loadMapImage(data);
  assert.equal(loadMapImage(data), failed);
  images[0].onerror();
  await assert.rejects(failed, /photography/);
  const ready = loadMapImage(data);
  assert.equal(images.length, 2);
  assert.equal(images[1].src, data.orthophoto.url);
  images[1].onload();
  assert.equal(await ready, data.mapImage);
  assert.equal(await loadMapImage(data), images[1]);
});
