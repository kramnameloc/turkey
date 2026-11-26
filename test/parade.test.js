import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paradeRoute } from '../src/parade-route.js';
import { segmentDistanceSq, slideMove } from '../src/field.js';
import { BODY_RADIUS } from '../src/turkey-scale.js';
import { separateFromActors } from '../src/body-collision.js';
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

async function loadParade(t) {
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
  const world = {
    height: () => 0,
    solids: { occupied: () => false },
    paradeSignal: { x: -255.4, z: 279.6 },
  };
  return {
    parade: await Parade.load(park, world, avatar, new Texture()),
    world,
  };
}

test('the walking rig leads with its head and holds its tether at the beak on every side of the block', async (t) => {
  const { parade, world } = await loadParade(t);
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
  parade.update(80);
  const leader = parade.floats[0].balloon;
  assert.ok(
    Math.hypot(
      leader.position.x - world.paradeSignal.x,
      leader.position.z - world.paradeSignal.z
    ) < 23
  );
  assert.ok(leader.position.y > 9, 'balloon clears the signal mast');
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

test('participants block a sprint, chase only when hit, and a released balloon leaves its original crew', async (t) => {
  const { parade } = await loadParade(t);
  parade.update(0);
  const float = parade.floats[0],
    handler = float.handlers[0];
  const player = handler.body.position.clone();
  player.x += 4;
  parade.update(0, player);
  slideMove(player, -8, 0, (x, z) => parade.blocks(x, z));
  assert.ok(player.x - handler.body.position.x >= BODY_RADIUS + handler.radius);
  assert.equal(parade.chasers.size, 0);

  // A marcher also yields space when a player stands in its path.
  player.copy(handler.body.position);
  separateFromActors(player, 0, parade.nearbyActors, (x, z) =>
    parade.blocks(x, z)
  );
  assert.ok(
    player.distanceTo(handler.body.position) >= BODY_RADIUS + handler.radius
  );
  player.x += 7;
  const release = float.balloon.position.clone(),
    original = handler.body.position.clone();
  const ropes = parade.ropes.count;
  assert.match(parade.hit(handler), /floating away/);
  parade.update(0, player);
  assert.equal(parade.ropes.count, ropes - 16);
  assert.ok(float.balloon.position.equals(release));
  assert.ok(
    float.handlers.slice(1).every((other) => !parade.chasers.has(other))
  );
  for (let i = 1; i <= 25; i++) parade.update(i * 0.05, player);
  assert.ok(
    player.distanceTo(handler.body.position) < player.distanceTo(original) - 3
  );
  assert.ok(parade.blocks(handler.body.position.x, handler.body.position.z));
  assert.ok(float.balloon.position.y > release.y + 1);
  const firstRelease = float.release;
  parade.hit(float.handlers[1]);
  assert.equal(float.release, firstRelease);
  assert.equal(parade.floats.filter((f) => f.release).length, 1);
  assert.ok(
    Math.abs(parade.leader.x - parade.route.sample(parade.headDistance).x) <
      0.01
  );

  const person = parade.crowd.people[0],
    origin = person.home.clone();
  player.copy(origin);
  player.z += 4;
  parade.update(2, player);
  slideMove(player, 0, -7, (x, z) => parade.blocks(x, z));
  assert.ok(player.z - origin.z >= BODY_RADIUS + person.radius);
  player.z += 5;
  parade.hit(person);
  for (let i = 1; i <= 20; i++) parade.update(2 + i * 0.05, player);
  assert.ok(
    player.distanceTo(person.model.position) < player.distanceTo(origin) - 1.5
  );
  assert.ok(!parade.blocks(origin.x, origin.z));
  const shadow = parade.crowd.group.getObjectByName('Spectator shadows'),
    m = person.model.matrix.clone();
  shadow.getMatrixAt(person.shadowIndex, m);
  assert.ok(Math.abs(m.elements[14] - person.model.position.z) < 0.001);
  assert.equal(parade.chasers.size, 3);
  player.copy(person.model.position);
  assert.equal(parade.contactAttack(player, 0), null);
  parade.update(3.6, player);
  assert.equal(
    parade.contactAttack(
      player,
      person.model.position.y + person.height + 0.02
    ),
    null
  );
  assert.equal(parade.contactAttack(player, 0), null);
  parade.update(4.2, player);
  assert.equal(parade.contactAttack(player, 0), person);
  assert.equal(parade.contactAttack(player, 0), null, 'contact has a cooldown');
  assert.match(parade.hit(person), /netted/);
  parade.update(4.3, player);
  assert.ok(!parade.nearbyActors.includes(person));
  shadow.getMatrixAt(person.shadowIndex, m);
  assert.equal(m.elements[0], 0);
  assert.match(parade.hit(handler), /netted/);
  assert.ok(!handler.body.visible && !handler.shadow.visible);
  assert.equal(float.release, firstRelease);
  assert.equal(parade.chasers.size, 1);
  parade.update(75, player);
  assert.equal(float.balloon.visible, false);
  parade.reset();
  parade.update(0);
  assert.equal(parade.chasers.size, 0);
  assert.ok(person.model.position.equals(origin));
  assert.ok(float.balloon.visible && float.shadow.visible && !float.release);
  assert.ok(float.balloon.position.distanceTo(release) < 0.001);
});
