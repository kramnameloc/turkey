import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Texture } from 'three';
import { Obstacles } from '../src/maps/obstacles.js';
import { dailyRoutines, sampleRoutine } from '../src/world/daily-routines.js';
import { Residents } from '../src/world/residents.js';

async function venue(id) {
  const file = await readFile(new URL('../public/models/trip-' + id + '.glb', import.meta.url));
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
  const data = gltf.nodes.find((n) => n.extras?.plan).extras.plan;
  const solids = new Obstacles(data);
  return { data: { ...data, id }, blocked: solids.blocked.bind(solids) };
}

test('every trip venue has complete walking and activity cycles clear of its furnished footprints', async () => {
  for (const [id, count] of Object.entries({ airport: 4, ice: 3, springs: 3, pearl: 4 })) {
    const { data, blocked } = await venue(id);
    const routines = dailyRoutines(data, blocked);
    assert.equal(routines.length, count, id);
    for (const routine of routines) {
      const activities = new Set(routine.legs.map((leg) => leg.activity));
      assert.ok(activities.has('walk') && activities.size >= 3, id);
      const start = sampleRoutine(routine, 0, {});
      let prev = start;
      for (let t = 0.1; t < routine.duration + 0.2; t += 0.1) {
        const pose = sampleRoutine(routine, t, {});
        assert.ok(!blocked(pose.x, pose.z), id + ' at ' + t);
        assert.ok(Math.hypot(pose.x - prev.x, pose.z - prev.z) <= routine.speed * 0.1 + 1e-5);
        prev = pose;
      }
      const end = sampleRoutine(routine, routine.duration, {});
      assert.ok(Math.hypot(start.x - end.x, start.z - end.z) < 1e-5);
    }
  }
});

test('the Dover courier carries the parcel on the delivery leg and walks back empty-handed', () => {
  const routine = dailyRoutines({ id: 'dover' }, () => false).find((r) => r.item === 'parcel');
  for (const { start, duration, activity } of routine.legs.filter((leg) => ['collect', 'deliver'].includes(leg.activity))) {
    const at = (progress) => sampleRoutine(routine, start + duration * progress + routine.duration - routine.offset, {});
    assert.equal(at(0.25).carrying, activity === 'deliver');
    assert.equal(at(0.75).carrying, activity === 'collect');
  }
  assert.equal(routine.legs.at(-1).carrying, false);
});

test('a walking traveler waits for a stationary player and resumes from the same spot', async () => {
  const { data, blocked } = await venue('airport');
  const residents = new Residents(new Texture());
  residents.enter(data, blocked);
  const traveler = residents.people[0];
  residents.update(0, 0, { x: 0, y: 0.67, z: 21 }, () => 0);
  const origin = traveler.model.position.clone();
  const { yaw } = traveler.state;
  const listener = { x: origin.x + 0.8 * Math.sin(yaw), y: 0.67, z: origin.z + 0.8 * Math.cos(yaw) };
  for (let i = 1; i <= 20; i++) residents.update(i * 0.05, 0.05, listener, () => 0);
  assert.ok(traveler.model.position.distanceTo(origin) < 0.001);
  assert.equal(traveler.state.activity, 'greet');
  listener.x += 5;
  for (let i = 21; i <= 40; i++) residents.update(i * 0.05, 0.05, listener, () => 0);
  assert.ok(traveler.model.position.distanceTo(origin) > 1);
  assert.ok(traveler.shadow.position.distanceTo(traveler.model.position) < 0.02);
  residents.enter(null, blocked);
  assert.equal(residents.nearby.length, 0);
  assert.equal(residents.group.children.length, 0);
  residents.dispose();
});
