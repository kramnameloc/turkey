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
} from '../src/gameplay/courses.js';
import { DISHES, Obstacles } from '../src/field.js';
import { doverParking } from '../src/world/dover/block.js';
import { yardBarriers } from '../src/world/dover/yard.js';
import { walkingTrail } from '../src/gameplay/trail.js';
import { Hunt } from '../src/game.js';
import { EnemyHealthBars } from '../src/ui/enemy-health-bars.js';
import { DoverCottage } from '../src/world/dover/cottage.js';
import { hasRecipe } from '../src/world/dover/location.js';
import { CORNUCOPIA, WEAPONS } from '../src/gameplay/weapons.js';
import { FoodFight } from '../src/gameplay/foodfight.js';
import { TURKEY_EYE } from '../src/player/turkey-scale.js';

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
    allTargets: DISHES.map((dish) => ({
      ...dish,
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
    for (const t of hunt.targets) {
      assert.equal(t.health, t.baseHealth);
      assert.equal(t.maxHealth, t.health);
      t.caught = true;
    }
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
    fieldHeight: () => 0,
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

test('casts respect range, cover and cooldown and only finishing hits earn captures and weapons', () => {
  const { fight, g } = field();
  const [net, popper, sling] = WEAPONS;
  const shotModels = {
    net: new T.LineSegments(),
    popper: fight.art.projectile(popper.shot),
    sling: fight.art.projectile(sling.shot),
  };
  const targets = [0, 5].map((x) => {
    const model = new T.Group();
    model.position.set(x, 0, -25);
    model.userData.aimHeight = TURKEY_EYE;
    return { model, shadow: new T.Group(), health: 48, maxHealth: 48 };
  });
  let rewards = 0;
  fight.reward = () => { rewards++; return ''; };
  const hunt = Object.assign(Object.create(Hunt.prototype), {
    ...g, fight, targets, shotModels, net: shotModels.net, castModel: shotModels.net,
    netStart: new T.Vector3(), netEnd: new T.Vector3(), weapon: net,
    playing: true, house: { inside: false }, occluded: () => false,
    bankedCount: 0, count: 1, paradeCaptures: 0, hits: 0, shots: 0,
    elapsed: 3, cooldown: 0, setHUD() {}, guide: { reset() {} },
  });
  hunt.cast();
  assert.equal(targets[0].health, 24);
  assert.equal(targets[0].snaredUntil, 4.1);
  assert.equal(targets[1].health, 48);
  hunt.cast();
  assert.equal(hunt.shots, 1);
  assert.equal(rewards, 0);
  hunt.cooldown = 0;
  hunt.occluded = () => true;
  hunt.cast();
  assert.equal(hunt.hits, 1);
  assert.equal(hunt.shots, 2);
  assert.equal(targets[0].health, 24);
  hunt.occluded = () => false;
  hunt.cooldown = 0;
  hunt.cast();
  assert.equal(hunt.count, 2);
  assert.equal(rewards, 1);
  assert.equal(hunt.weapon, popper);
  assert.equal(targets[0].caught, true);
  targets[1].model.position.set(0, 0, -42);
  hunt.switchWeapon();
  assert.equal(hunt.weapon, net);
  assert.equal(hunt.aim(), null);
  hunt.switchWeapon();
  assert.equal(hunt.weapon, popper);
  assert.equal(hunt.aim(), targets[1]);
  assert.equal(hunt.cooldown, net.cooldown);
  hunt.cooldown = 0;
  hunt.cast();
  assert.equal(targets[1].health, 48 - popper.damage);
  assert.equal(hunt.castModel, shotModels.popper);
  assert.equal(hunt.cooldown, popper.cooldown);
  hunt.paradeCaptures = 3;
  assert.match(hunt.unlockWeapon(), /Buttered Roll Sling/);
  assert.equal(hunt.weapon, sling);
  assert.equal(hunt.aim(), null);
  hunt.fight.wide = 1;
  hunt.cooldown = 0;
  hunt.completeHunt = () => {};
  hunt.cast();
  assert.equal(targets[1].health, 0);
  assert.equal(targets[1].caught, true);
  assert.equal(fight.wide, 0);
  assert.equal(rewards, 2);
  fight.dispose();
});

test('an interrupted windup cancels only the targeted throw', () => {
  const { fight, dish } = field();
  fight.windUp(dish, 'can');
  assert.equal(fight.interrupt({}), false);
  assert.equal(fight.attack.dish, dish);
  assert.equal(fight.interrupt(dish), true);
  assert.equal(fight.warning(), '');
  assert.equal(fight.tosses.length, 0);
  fight.windUp(dish, 'roll');
  fight.release(fight.attack);
  assert.equal(fight.interrupt(dish), false);
  assert.equal(fight.tosses.length, 1);
  fight.dispose();
});

test('health bars track individual dishes and pursuers and retire after capture', () => {
  const bars = new EnemyHealthBars(), camera = new T.PerspectiveCamera();
  const actors = [20, 60].map((health, i) => {
    const model = new T.Group();
    model.position.set(i * 3, 0, -8);
    model.userData.labelHeight = 2;
    return { model, health, maxHealth: 80 };
  });
  const [dish, chaser] = actors;
  const chasers = new Set([chaser]);
  bars.update([dish], chasers, camera.position, camera);
  const [first, second] = bars.children;
  assert.equal(first.children[0].scale.x * 3, second.children[0].scale.x);
  dish.caught = true;
  bars.update([dish], chasers, camera.position, camera);
  assert.equal(first.position.x, chaser.model.position.x);
  assert.equal(second.visible, false);
  chasers.clear();
  bars.update([dish], chasers, camera.position, camera);
  assert.equal(first.visible, false);
  bars.dispose();
});

test('the hidden recipe unlocks from a reachable cupboard and the horn heals only on a dish capture', () => {
  const { fight, dish, g } = field();
  const house = Object.assign(Object.create(DoverCottage.prototype), {
    inside: true, recipeFound: false, recipe: new T.Group(),
  });
  const net = new T.LineSegments();
  const hunt = Object.assign(Object.create(Hunt.prototype), {
    ...g, fight, house, playing: true, weapon: WEAPONS[0],
    bankedCount: 0, count: 36, paradeCaptures: 0, hits: 0, shots: 0,
    net, castModel: net, shotModels: { cornucopia: fight.art.projectile(CORNUCOPIA.shot) },
    netStart: new T.Vector3(), netEnd: new T.Vector3(), cooldown: 0,
    occluded: () => false, guide: { reset() {} }, setHUD() {}, completeHunt() {},
  });
  assert.ok(!hunt.availableWeapons.includes(CORNUCOPIA), 'capture milestones cannot reveal the secret');
  const p = hunt.camera.position;
  p.set(3.43, TURKEY_EYE, -3.3);
  assert.ok(!house.blocked(p.x, p.z));
  assert.match(house.prompt(p, true), /Unfold/);
  hunt.interact();
  assert.equal(hunt.weapon, CORNUCOPIA);
  assert.ok(hasRecipe());
  assert.ok(!house.recipe.visible);
  assert.equal(house.prompt(p, true), '');
  assert.match(house.prompt({ x: 0, z: -1.5 }, true), /Grail/);
  assert.ok(house.inside, 'secret discovery leaves the campaign objective available');
  house.inside = false;
  hunt.count = 0;
  hunt.switchWeapon();
  assert.equal(hunt.weapon, WEAPONS[0]);
  hunt.switchWeapon();
  assert.equal(hunt.weapon, CORNUCOPIA, 'available even at zero captures');

  p.set(0, TURKEY_EYE, 0);
  Object.assign(dish, { health: 101, maxHealth: 101, shadow: new T.Group() });
  dish.model.userData.aimHeight = TURKEY_EYE;
  hunt.targets = [dish];
  fight.health = 94;
  hunt.cast();
  assert.equal(dish.health, 1);
  assert.equal(fight.health, 94);
  assert.equal(hunt.cooldown, CORNUCOPIA.cooldown);
  hunt.cast();
  assert.equal(hunt.shots, 1);
  hunt.cooldown = 0;
  hunt.cast();
  assert.ok(dish.caught);
  assert.equal(fight.health, 100);
  assert.equal(hunt.count, 1);
  const horn = fight.art.tool(CORNUCOPIA.id);
  assert.ok(!new T.Box3().setFromObject(horn).isEmpty());
  fight.dispose();
});
