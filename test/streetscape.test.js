import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Matrix4, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Obstacles, PARK_SIGNS, segmentDistanceSq } from '../src/field.js';
import { streetJunctions } from '../src/streets.js';
import {
  loadStreetscape,
  streetScenery,
  streetSegments,
} from '../src/streetscape.js';

test('the street library fits the surveyed block and leaves sidewalks and crossings clear', async (t) => {
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function (url) {
    this.register((parser) => {
      parser.loadImageSource = async () => new Texture();
      return { name: 'HeadlessTextures' };
    });
    const bytes = await readFile(new URL('../public' + url, import.meta.url));
    return this.parseAsync(Uint8Array.from(bytes).buffer, '');
  });
  const data = JSON.parse(
    await readFile(new URL('../public/geo/broomfield.json', import.meta.url))
  );
  const solids = new Obstacles(data, PARK_SIGNS);
  const models = await loadStreetscape();
  const { group, homes, houses, frontWalks, updateSignals } = streetScenery(
    data,
    streetJunctions(data.roads),
    models,
    () => 0,
    solids
  );
  assert.ok(frontWalks.length > 1);
  const roadways = streetSegments([
    ...data.roads.filter((r) => r.type !== 'Parking Lot'),
    ...data.paths,
    ...frontWalks,
  ]);
  const m = new Matrix4(),
    p = new Vector3();
  for (const mesh of group.children) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      assert.ok(
        solids.occupied(p.x, p.z),
        mesh.name + ' needs a ground footprint'
      );
      assert.ok(
        !roadways.some(
          (s) =>
            segmentDistanceSq(p.x, p.z, s.ax, s.az, s.bx, s.bz) < s.half ** 2
        ),
        mesh.name + ' in travel lane'
      );
    }
  }
  for (const name of [
    'Bench',
    'PathLamp',
    'Signal',
    'StopSign',
    'Hydrant',
    'Streetlamp',
    'LitterBin',
    'RecyclingBin',
    'RoundShrub',
    'LowShrub',
  ])
    assert.ok(group.getObjectByName(name)?.count > 0, name);
  for (let i = 1; i <= 6; i++)
    assert.ok(models.get('Onlooker' + i)[0].geometry.attributes.color);
  const red = group.children.filter(
    (m) => m.material.name === 'Traffic_Light_Red'
  );
  assert.equal(
    red.reduce((n, m) => n + m.count, 0),
    4
  );
  for (const [time, lit] of [
    [0, 2],
    [15, 4],
    [16, 2],
    [31, 4],
  ]) {
    updateSignals(time);
    assert.equal(
      red
        .filter((m) => m.material.emissiveIntensity > 0)
        .reduce((n, m) => n + m.count, 0),
      lit
    );
  }
  const brick = homes.getObjectByName('BrickRanch');
  const brickRoofHeight = 5;
  for (const z of [202, 220]) {
    let matched = false;
    for (let i = 0; i < brick.count; i++) {
      brick.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.hypot(p.x + 286, p.z - z) > 5) continue;
      matched = true;
      assert.ok(new Vector3().setFromMatrixScale(m).y * brickRoofHeight < 4.5);
    }
    assert.ok(matched, 'one-story Main Street home at ' + z);
  }
  assert.ok([...houses].every((b) => b.type === 'Single Family'));
});
