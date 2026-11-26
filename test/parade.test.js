import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paradeRoute } from '../src/parade-route.js';
import { segmentDistanceSq } from '../src/field.js';
import { Parade } from '../src/parade.js';
import { TurkeyAvatar } from '../src/turkey-avatar.js';

const park = JSON.parse(
  await readFile(new URL('../public/geo/broomfield.json', import.meta.url))
);

test('both rows of turkey handlers move forward inside the surveyed streets through every turn and the loop seam', () => {
  const route = paradeRoute(park.roads);
  const streets = park.roads.filter(
    (r) =>
      ['Main St', 'E 1St Ave', 'Community Park Rd', 'Unnamed Street'].includes(
        r.name
      ) && r.type !== 'Parking Lot'
  );
  assert.ok(route.length > 890 && route.length < 915);
  for (const side of [-2.4, 2.4]) {
    for (let d = 0; d <= route.length; d += 0.25) {
      const p = route.sample(d, side),
        q = route.sample(d + 0.25, side);
      const dx = q.x - p.x,
        dz = q.z - p.z;
      assert.ok(
        dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw) > 0,
        'backstep at ' + d
      );
      assert.ok(Math.hypot(dx, dz) < 0.55, 'jump at ' + d);
      assert.ok(
        streets.some(({ points, width }) =>
          points.some(
            (b, i) =>
              i &&
              segmentDistanceSq(p.x, p.z, ...points[i - 1], ...b) <
                (width * 0.49) ** 2
          )
        )
      );
    }
    const end = route.sample(route.length - 0.015, side),
      start = route.sample(0.015, side);
    assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < 0.06);
  }
});

test('the walking rig leads with its head and holds its tether at the beak on every side of the block', async (t) => {
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function (path) {
    this.register((parser) => {
      parser.loadImageSource = async () => new Texture();
      return { name: 'HeadlessTextures' };
    });
    const file = await readFile(new URL('../public' + path, import.meta.url));
    return this.parseAsync(Uint8Array.from(file).buffer, '');
  });
  const avatar = new TurkeyAvatar();
  await avatar.load(new Group(), new Group());
  const world = { height: () => 0, solids: { occupied: () => false } };
  const parade = await Parade.load(park, world, avatar, new Texture());
  assert.equal(parade.floats.length, 22);
  assert.equal(new Set(parade.floats.map((f) => f.label)).size, 22);
  assert.ok(parade.floats.every((f) => f.handlers.length === 4));
  const before = new Vector3(),
    after = new Vector3(),
    head = new Vector3(),
    tail = new Vector3();
  for (const time of [0, 85, 387, 618, 812, 970, 1219]) {
    parade.update(time);
    const snapshot = parade.floats.flatMap((f) =>
      f.handlers.map((h) => h.body.position.clone())
    );
    parade.update(time + 0.05);
    for (const [index, h] of parade.floats
      .flatMap((f) => f.handlers)
      .entries()) {
      const travel = after
        .copy(h.body.position)
        .sub(snapshot[index])
        .normalize();
      h.skin.skeleton.getBoneByName('Head').getWorldPosition(head);
      h.skin.skeleton.getBoneByName('Tail').getWorldPosition(tail);
      head.sub(tail).setY(0).normalize();
      assert.ok(
        head.dot(travel) > 0.9,
        'handler ' + index + ' faces away from the route at ' + time
      );
      const grip = h.skin
        .getVertexPosition(h.beakIndex, before)
        .applyMatrix4(h.skin.matrixWorld);
      const matrix = h.body.matrix.clone();
      parade.ropes.getMatrixAt(index * 4, matrix);
      const lowerEnd = new Vector3(0, -0.5, 0).applyMatrix4(matrix);
      assert.ok(
        grip.distanceTo(lowerEnd) < 0.002,
        'rope slipped away from beak'
      );
    }
  }
  // The planted left foot should stay almost still while the body advances.
  const handler = parade.floats[0].handlers[0];
  const foot = handler.skin.skeleton.getBoneByName('Foot_L');
  parade.update((0.63 * 0.32) / 0.74);
  foot.getWorldPosition(before);
  const bodyStart = handler.body.position.clone();
  parade.update((0.82 * 0.32) / 0.74);
  foot.getWorldPosition(after);
  assert.ok(handler.body.position.distanceTo(bodyStart) > 0.055);
  assert.ok(
    Math.hypot(after.x - before.x, after.z - before.z) < 0.02,
    'planted foot slides along the road'
  );
});
