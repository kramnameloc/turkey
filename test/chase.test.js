import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Group, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ChaseView, TURKEY_EYE } from '../src/player/chase-camera.js';
import { TurkeyAvatar } from '../src/player/turkey-avatar.js';
import { doverLeg } from '../src/world/dover/guide.js';

test('chase camera retracts immediately at cover, clears the terrain, and extends smoothly after the wall', () => {
  const eye = new Vector3(2, TURKEY_EYE, 1),
    camera = new ChaseView();
  const follow = (blocked, floor, snap = false) =>
    camera.follow(eye, 0, 0, 1 / 60, snap, blocked, floor, false);
  follow(
    () => false,
    () => 0,
    true
  );
  const full = camera.distance;
  assert.ok(full > 5.5 && camera.position.z > eye.z);
  assert.ok(camera.position.y > 1.8 && camera.position.y < 2.3);
  follow(
    (x, z) => z >= 2.7,
    () => 0
  );
  const short = camera.distance;
  assert.ok(short < 2 && camera.position.z < 2.7);
  follow(
    () => false,
    () => 0
  );
  assert.ok(camera.distance > short && camera.distance < full);
  follow(
    () => false,
    (x, z) => (z > 2 ? 6 : 0),
    true
  );
  assert.ok(camera.position.z < 2.01);
  assert.deepEqual(eye.toArray(), [2, TURKEY_EYE, 1]);
});

test('the standing bird is grounded, with the first-person eye inside its posed head', async (t) => {
  const file = await readFile(
    new URL('../public/models/bourbon-red.glb', import.meta.url)
  );
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function () {
    this.register((parser) => {
      parser.loadImageSource = async () => new Texture();
      return { name: 'HeadlessTextures' };
    });
    return this.parseAsync(Uint8Array.from(file).buffer, '');
  });
  const avatar = new TurkeyAvatar();
  await avatar.load(new Group(), new Group());
  avatar.updateMatrixWorld(true);
  const skin = avatar.getObjectByName('Mesh');
  const bounds = new Box3(),
    head = new Box3(),
    p = new Vector3();
  const headIndex = skin.skeleton.bones.indexOf(avatar.getObjectByName('Head'));
  for (let i = 0; i < skin.geometry.attributes.position.count; i++) {
    skin.getVertexPosition(i, p).applyMatrix4(skin.matrixWorld);
    bounds.expandByPoint(p);
    if (skin.geometry.attributes.skinIndex.getX(i) === headIndex)
      head.expandByPoint(p);
  }
  assert.ok(Math.abs(bounds.min.y) < 0.005);
  assert.ok(Math.abs(bounds.max.y - 0.9) < 0.005);
  assert.ok(TURKEY_EYE > head.getCenter(p).y && TURKEY_EYE < head.max.y);
});

test('Dover directions reconnect a wandering player and end at the doorway', () => {
  const path = [
    { x: 0, z: 0 },
    { x: 35, z: 0 },
    { x: 35, z: 42 },
  ];
  const joining = doverLeg({ x: 28, z: -25 }, path);
  assert.deepEqual(joining.next, { x: 28, z: -7 });
  assert.equal(joining.distance, 74);
  assert.deepEqual(doverLeg(path.at(-1), path).next, path.at(-1));
  assert.equal(doverLeg(path.at(-1), path).distance, 0);
});
