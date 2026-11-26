import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as T from 'three';
import { pavement, streetJunctions } from '../src/streets.js';
import { makeTerrain } from '../src/terrain.js';
import { treeShape } from '../src/field.js';

const read = (name) =>
  JSON.parse(
    readFileSync(new URL('../public/geo/' + name + '.json', import.meta.url))
  );
const park = read('broomfield'),
  region = read('region');
const terrain = makeTerrain(
  read('park-elevation'),
  region.elevation,
  park.bounds
);
const material = new T.MeshBasicMaterial();

function rayHeight(meshes, x, z) {
  const ray = new T.Raycaster(
    new T.Vector3(x, 500, z),
    new T.Vector3(0, -1, 0)
  );
  const hit = ray.intersectObjects(meshes, false)[0];
  assert.ok(hit, 'a visible ground triangle covers ' + [x, z]);
  return hit.point.y;
}

test('the park, regional terrain and aerial overlays share physical ground elevations', () => {
  const ground = [terrain.parkGround(), ...terrain.regionGround()].map(
    (g) => new T.Mesh(g, material)
  );
  const near = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 0.0001, [actual, expected]);
  assert.ok(terrain.height(-650, 650) - terrain.height(650, -650) > 10);
  for (const [x, z] of [
    [-44, 20],
    [-679.999, 169.3],
    [-680.001, 169.3],
    [1144.15, -986.5],
    [-77, -828],
    [1527, -1842],
    [2710, -1727],
  ]) {
    near(rayHeight(ground, x, z), terrain.height(x, z));
  }
  near(terrain.height(23, 680.00001), terrain.height(23, 679.99999));
  const bounds = { minX: 1141.5, maxX: 1156.3, minZ: -996.4, maxZ: -981.1 };
  const patch = new T.Mesh(terrain.groundPatch(bounds), material);
  for (const [x, z] of [
    [1141.51, -996.39],
    [1144.15, -986.5],
    [1155.9, -981.2],
  ]) {
    near(rayHeight([patch], x, z), rayHeight(ground, x, z));
  }
  const pos = patch.geometry.attributes.position,
    uv = patch.geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    assert.ok(uv.getX(i) >= -0.0001 && uv.getX(i) <= 1.0001);
    assert.ok(uv.getY(i) >= -0.0001 && uv.getY(i) <= 1.0001);
    near(uv.getX(i), (pos.getX(i) - bounds.minX) / (bounds.maxX - bounds.minX));
    near(uv.getY(i), (bounds.maxZ - pos.getZ(i)) / (bounds.maxZ - bounds.minZ));
  }
});

test('survey roof and crown measurements preserve local meter scale', () => {
  assert.ok(park.buildings.filter((b) => b.roofHeight > 2).length > 500);
  assert.ok(park.trees.filter((t) => t.surveyHeight > 1).length > 400);
  const tallTree = park.trees.find((t) => t.surveyHeight > 14);
  assert.equal(treeShape(tallTree).height, tallTree.surveyHeight);
  const inventoryTree = park.trees.find((t) => !t.surveyHeight);
  assert.equal(treeShape(inventoryTree).height, inventoryTree.height);
});

test('surveyed crossing paint follows both carriageways and leaves their median open', () => {
  const roads = [-5, 5].map((x) => ({
    type: 'Minor Arterial',
    width: 6,
    oneWay: true,
    points: [
      [x, -30],
      [x, 30],
    ],
  }));
  const crossing = {
    type: 'Cross-walk',
    width: 3,
    points: [
      [-13, 0],
      [13, 0],
    ],
  };
  const meshes = pavement(
    [crossing],
    terrain,
    { surface: material },
    streetJunctions(roads),
    { crossingRoads: roads }
  ).children;
  assert.ok(meshes.length);
  const positions = meshes[0].geometry.attributes.position;
  const sides = new Set();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    assert.ok(Math.abs(Math.abs(x) - 5) < 3);
    assert.ok(Math.abs(y - terrain.height(x, z) - 0.042) < 0.0001);
    sides.add(Math.sign(x));
  }
  assert.equal(sides.size, 2);
});

test('a neighborhood sidewalk meets the park boundary without duplicating the park section', () => {
  const path = {
    type: 'Attached Sidewalk',
    width: 1.7,
    points: [
      [654, 0],
      [699, 0],
    ],
  };
  const meshes = pavement([path], terrain, { surface: material }, new Map(), {
    regional: true,
  }).children;
  const positions = meshes[0].geometry.attributes.position;
  const xs = Array.from({ length: positions.count }, (_, i) =>
    positions.getX(i)
  );
  assert.equal(Math.min(...xs), 680);
  assert.equal(Math.max(...xs), 699);
});
