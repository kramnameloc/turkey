import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ChaseView, TURKEY_EYE } from '../src/view.js';
import { doverLeg } from '../src/dover-guide.js';

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
  assert.ok(
    full > 4 && camera.position.y > eye.y + 1.6 && camera.position.z > eye.z
  );
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
