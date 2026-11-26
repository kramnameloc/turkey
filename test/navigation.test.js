import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BODY_RADIUS,
  Obstacles,
  treeShape,
  slideMove,
  PARK_SIGNS,
  SIGN_WIDTH,
  SIGN_DEPTH,
} from '../src/field.js';
import { clearTrail, relativeBearing, walkingTrail } from '../src/trail.js';

const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const wall = {
  points: [
    [30, -9],
    [30.12, -9],
    [30.12, 9],
    [30, 9],
  ],
};
const tree = { x: 0, z: 0, height: 7, type: 'Coniferous', species: 'Pine' };
const obstacles = new Obstacles({
  buildings: [wall],
  water: [],
  trees: [tree],
  bounds,
});
const blocked = (x, z) => obstacles.blocked(x, z);

test('the player body collides with thin walls across grid cells and can walk around the end', () => {
  const p = { x: 24, z: 0 };
  slideMove(p, 18, 0, blocked);
  assert.ok(p.x <= 30 - BODY_RADIUS && p.x > 28.8);
  slideMove(p, 0, 12, blocked);
  slideMove(p, 18, 0, blocked);
  assert.ok(p.x > 40);
});

test('low branches have a footprint and tall deciduous trunks leave room to pass underneath the canopy', () => {
  const pine = treeShape(tree);
  assert.ok(pine.radius >= pine.width * 0.4);
  assert.ok(obstacles.occupied(pine.radius + BODY_RADIUS - 0.02, 0));
  assert.equal(obstacles.occupied(pine.radius + BODY_RADIUS + 0.1, 0), false);
  const tall = treeShape({
    ...tree,
    type: 'Deciduous',
    height: 20,
    species: 'Red Oak',
  });
  assert.ok(tall.radius < tall.width * 0.13);
  const p = { x: -8, z: 0 };
  slideMove(p, 16, 0, blocked);
  assert.ok(p.x <= -pine.radius - BODY_RADIUS);
});

test('turn arrows lead around walls and trunks along clear segments', () => {
  const start = { x: -7, z: 0 },
    goal = { x: 36, z: 0 };
  assert.equal(clearTrail(start, goal, blocked), false);
  const path = walkingTrail(start, goal, blocked);
  assert.deepEqual(path.at(-1), goal);
  assert.ok(path.length > 1);
  let previous = start;
  for (const point of path) {
    assert.ok(clearTrail(previous, point, blocked));
    previous = point;
  }
});

test('the navigation needle gives the correct turn when a dish is behind or beside the player', () => {
  const p = { x: 0, z: 0 };
  assert.equal(relativeBearing(p, { x: 0, z: -8 }, 0), 0);
  assert.equal(relativeBearing(p, { x: 8, z: 0 }, 0), Math.PI / 2);
  assert.equal(Math.abs(relativeBearing(p, { x: 0, z: 8 }, 0)), Math.PI);
  assert.ok(
    Math.abs(relativeBearing(p, { x: -8, z: 0 }, Math.PI / 2)) < 0.00001
  );
});

test('both trail signs block their faces, posts and ends, but leave a walkable route around', () => {
  const geometry = new Obstacles(
    { buildings: [], water: [], bounds },
    PARK_SIGNS
  );
  const blocked = (x, z) => geometry.blocked(x, z);
  for (const sign of PARK_SIGNS) {
    const c = Math.cos(sign.angle),
      s = Math.sin(sign.angle);
    const point = (along, normal) => ({
      x: sign.x + along * c + normal * s,
      z: sign.z - along * s + normal * c,
    });
    for (const [along, normal] of [
      [0, 0],
      [1.63, 0],
      [-1.63, 0],
      [SIGN_WIDTH / 2, 0],
      [-SIGN_WIDTH / 2, 0],
      [0, SIGN_DEPTH / 2],
    ]) {
      const p = point(along, normal);
      assert.ok(blocked(p.x, p.z), sign.title);
    }
    for (const facing of [-1, 1]) {
      const start = point(0, 4 * facing),
        goal = point(0, -4 * facing);
      const p = { ...start };
      slideMove(p, goal.x - start.x, goal.z - start.z, blocked);
      assert.ok(
        facing * ((p.x - sign.x) * s + (p.z - sign.z) * c) >=
          SIGN_DEPTH / 2 + BODY_RADIUS,
        sign.title
      );
      assert.equal(clearTrail(start, goal, blocked), false);
      const route = walkingTrail(start, goal, blocked);
      assert.ok(route.length > 1);
      assert.deepEqual(route.at(-1), goal);
      for (const q of route) {
        assert.ok(clearTrail(start, q, blocked));
        Object.assign(start, q);
      }
    }
    const beyond = point(SIGN_WIDTH / 2 + BODY_RADIUS + 0.15, 0);
    assert.equal(blocked(beyond.x, beyond.z), false);
  }
});
