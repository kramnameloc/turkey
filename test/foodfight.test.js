import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import {
  COURSES,
  captureBonus,
  coursePoint,
  rollSnow,
} from '../src/courses.js';
import { DISHES, TRAVEL, PARK_SIGNS, Obstacles } from '../src/field.js';
import { walkingTrail } from '../src/trail.js';
import { FoodFight } from '../src/foodfight.js';
import { TURKEY_EYE } from '../src/turkey-scale.js';

test('all twelve distinct campaign dishes and gravy boats are reachable on the surveyed maps', () => {
  const json = (url) =>
    JSON.parse(readFileSync(new URL('../public' + url, import.meta.url)));
  const park = new Obstacles(json('/geo/broomfield.json'), PARK_SIGNS),
    region = json('/geo/region.json');
  const names = [];
  for (const course of COURSES) {
    const start = TRAVEL[course.stop];
    const tiles = region.tiles
      .filter(
        ({ bounds: b }) =>
          b.minX < start.x + 320 &&
          b.maxX > start.x - 320 &&
          b.minZ < start.z + 320 &&
          b.maxZ > start.z - 320
      )
      .map(
        (t) =>
          new Obstacles({ ...json(t.url), water: [], bounds: region.bounds })
      );
    const blocked = (x, z) =>
      park.occupied(x, z) || tiles.some((t) => t.occupied(x, z));
    assert.equal(course.dishes.length, 4);
    names.push(...course.dishes.map((d) => d[0]));
    for (const [x, z] of [
      ...course.dishes.map((d) => d.slice(1)),
      ...course.gravy,
    ]) {
      const goal = coursePoint(course, x, z);
      assert.deepEqual(
        walkingTrail(start, goal, blocked).at(-1),
        goal,
        course.name
      );
    }
  }
  assert.deepEqual(names.sort(), DISHES.map((d) => d.id).sort());
});
test('capture rolls cover both upgrades, dry streak protection and clear or snowy weather', () => {
  assert.equal(
    captureBonus(0, () => 0.8),
    null
  );
  assert.equal(
    captureBonus(0, () => 0.2),
    'speed'
  );
  assert.equal(
    captureBonus(2, () => 0.9),
    'wide'
  );
  assert.equal(
    rollSnow(() => 0.2),
    true
  );
  assert.equal(
    rollSnow(() => 0.8),
    false
  );
});
function field(blocked = () => false) {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera();
  camera.position.set(0, TURKEY_EYE, 0);
  const g = {
    scene,
    camera,
    height: () => 0,
    openSpot: (p) => p,
    isBlocked: blocked,
    toast: () => {},
    targets: [],
    level: 0,
    elapsed: 0,
    yaw: 0,
  };
  const fight = new FoodFight(g);
  const dish = { model: new T.Group(), caught: false };
  dish.model.position.set(0, 0, -14);
  dish.model.userData.labelHeight = 2;
  return { fight, dish, g };
}
test('a dodge during the warning avoids the committed throw, and cover stops it', () => {
  for (const outcome of ['hit', 'dodge', 'cover', 'capture']) {
    const { fight, dish, g } = field(
      (x, z) => outcome === 'cover' && z > -8 && z < -7
    );
    fight.windUp(dish, 'can');
    assert.match(fight.warning(), /cranberry/);
    if (outcome === 'dodge') g.camera.position.x += 3.5;
    if (outcome === 'capture') dish.caught = true;
    for (let i = 0; i < 80; i++) {
      fight.update(0.05);
      g.elapsed += 0.05;
    }
    assert.equal(fight.health, outcome === 'hit' ? 82 : 100, outcome);
    assert.equal(fight.tosses.length, 0);
    fight.dispose();
  }
});
test('gravy stays at full health, heals once, and stays consumed after fast travel', () => {
  const { fight } = field();
  const points = [{ x: 0, z: 0 }];
  fight.stock(points);
  fight.update(0.05);
  assert.equal(fight.pickups.length, 1);
  fight.health = 58;
  fight.update(0.05);
  assert.equal(fight.health, 93);
  assert.equal(fight.pickups.length, 0);
  fight.stock(points);
  assert.equal(fight.pickups.length, 0);
  fight.reset({ health: 89, wide: 3, speed: 5 });
  fight.stock(points);
  fight.update(0.05, 1);
  assert.equal(fight.health, 100);
  assert.equal(fight.speed, 4);
  assert.equal(fight.wide, 3);
  fight.dispose();
});
