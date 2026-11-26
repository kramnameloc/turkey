import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import {
  COURSES,
  TRIP_HUNTS,
  TRIP_CAPTURES,
  captureBonus,
  coursePoint,
  rollSnow,
} from '../src/courses.js';
import { DISHES, Obstacles } from '../src/field.js';
import { doverParking } from '../src/dover-block.js';
import { yardBarriers } from '../src/dover-yard.js';
import { walkingTrail } from '../src/trail.js';
import { Hunt } from '../src/game.js';
import { FoodFight } from '../src/foodfight.js';
import { TURKEY_EYE } from '../src/turkey-scale.js';

test('all six days have walkable spawns, capture targets, gravy and destination prompts', () => {
  const read = (url) =>
    readFileSync(new URL('../public' + url, import.meta.url));
  const region = JSON.parse(read('/geo/region.json'));
  const names = new Set();
  assert.equal(TRIP_HUNTS.length, 18);
  assert.equal(TRIP_CAPTURES, 36);
  assert.equal(COURSES.length, 6);
  for (const course of COURSES) {
    const start = course.spawn;
    let solids;
    if (course.venue) {
      const glb = read('/models/trip-' + course.venue + '.glb');
      const manifest = JSON.parse(
        glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))
      );
      solids = new Obstacles(manifest.nodes[0].extras.plan);
    } else {
      const tiles = region.tiles
        .filter(
          ({ bounds: b }) =>
            b.minX < start.x + 320 &&
            b.maxX > start.x - 320 &&
            b.minZ < start.z + 320 &&
            b.maxZ > start.z - 320
        )
        .map((tile) => JSON.parse(read(tile.url)));
      solids = new Obstacles({
        bounds: region.bounds,
        buildings: [
          ...tiles.flatMap((t) => t.buildings),
          ...doverParking,
          ...yardBarriers,
        ],
        trees: tiles.flatMap((t) => t.trees),
        water: [],
      });
    }
    const blocked = (x, z) => solids.blocked(x, z);
    assert.ok(!blocked(start.x, start.z), course.name + ' spawn');
    assert.equal(course.hunts.length, 3);
    const dayDishes = course.hunts.flatMap((hunt) => hunt.dishes);
    const goals = [...dayDishes.map((d) => d.slice(1)), ...course.gravy].map(
      ([x, z]) => coursePoint(course, x, z)
    );
    if (course.destination)
      goals.push({ x: course.destination.x, z: course.destination.z });
    for (const goal of goals) {
      assert.ok(
        !blocked(goal.x, goal.z),
        course.name + ' ' + JSON.stringify(goal)
      );
      assert.deepEqual(
        walkingTrail(start, goal, blocked).at(-1),
        goal,
        course.name
      );
    }
    assert.equal(new Set(dayDishes.map(([id]) => id)).size, 6, course.name);
    for (const hunt of course.hunts) {
      assert.ok(hunt.name);
      assert.equal(hunt.dishes.length, 2);
      for (const [id] of hunt.dishes) names.add(id);
    }
  }
  assert.deepEqual(names, new Set(DISHES.map((d) => d.id)));
});
test('Pearl Street map stops match the hunts and the tea table is reached through the west door', () => {
  const course = COURSES.find((day) => day.venue === 'pearl');
  const glb = readFileSync(
    new URL('../public/models/trip-pearl.glb', import.meta.url)
  );
  const { plan } = JSON.parse(
    glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))
  ).nodes[0].extras;
  for (const stop of [...course.hunts, course.destination]) {
    assert.ok(
      plan.places.some((place) => place.name === stop.name),
      stop.name
    );
  }
  const [west, north, east, south] = plan.places.find(
    (p) => p.name === course.destination.name
  ).bounds;
  const { x, z } = course.destination;
  assert.ok(
    Math.min(x - west, east - x, z - north, south - z) > 3,
    'interact radius lies indoors'
  );
  const obstacles = new Obstacles(plan);
  const approach = { x: west - 2, z: (north + south) / 2 };
  const route = walkingTrail(approach, course.destination, (x, z) =>
    obstacles.blocked(x, z)
  );
  assert.ok(!obstacles.blocked(west, approach.z));
  assert.ok(obstacles.blocked(west, approach.z - 5));
  assert.deepEqual(route.at(-1), { x, z });
});
test('each pair unlocks only the next hunt and the last pair unlocks the shuttle', () => {
  const hunt = Object.assign(Object.create(Hunt.prototype), {
    mode: 'campaign',
    level: 0,
    huntIndex: 0,
    elapsed: 0,
    timerEnabled: true,
    pendingDestination: null,
    height: () => 0,
    toast() {},
    setHUD() {},
    guide: { reset() {} },
    fight: { clearField() {} },
    allTargets: DISHES.map(({ id }) => ({
      id,
      model: new T.Group(),
      shadow: new T.Group(),
      caught: false,
    })),
  });
  hunt.spawnHunt();
  for (const [i, round] of COURSES[0].hunts.entries()) {
    assert.equal(hunt.huntIndex, i);
    assert.equal(hunt.pendingDestination, null);
    assert.equal(hunt.huntCaptures, 0);
    assert.equal(hunt.countdownElapsed, 0);
    assert.equal(hunt.allTargets.filter((t) => t.caught).length, 2 * i);
    const expected = new Set(round.dishes.map(([id]) => id));
    for (const t of hunt.allTargets) {
      assert.equal(t.model.visible, expected.has(t.id));
      assert.equal(t.shadow.visible, expected.has(t.id));
    }
    assert.equal(hunt.advanceClock(30), false);
    for (const t of hunt.targets) t.caught = true;
    hunt.completeHunt();
  }
  assert.equal(hunt.pendingDestination, COURSES[0].destination);
  assert.equal(hunt.elapsed, 90);
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
