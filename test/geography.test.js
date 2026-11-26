import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import {
  DISHES,
  contains,
  Obstacles,
  SPAWN,
  TRAVEL,
  PARK_SIGNS,
  plantParkSaplings,
  dishSpawn,
} from '../src/field.js';

const asset = (path) => new URL('../public' + path, import.meta.url);
const json = (path) => JSON.parse(readFileSync(asset(path), 'utf8'));
const park = json('/geo/broomfield.json'),
  region = json('/geo/region.json');

test('every park dish can be reached from the spawn without crossing water or buildings', () => {
  const obstacles = new Obstacles(park, PARK_SIGNS);
  plantParkSaplings(park, obstacles);
  const remaining = new Set(DISHES);
  const step = 4;
  const queue = [[SPAWN.x, SPAWN.z]],
    visited = new Set([SPAWN.x + ',' + SPAWN.z]);
  assert.equal(obstacles.blocked(SPAWN.x, SPAWN.z), false);
  for (let i = 0; i < queue.length && remaining.size; i++) {
    const [x, z] = queue[i];
    for (const target of remaining) {
      if (Math.hypot(x - target.x, z - target.z) < step) {
        assert.equal(obstacles.blocked(target.x, target.z), false, target.name);
        remaining.delete(target);
      }
    }
    for (const [dx, dz] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        key = nx + ',' + nz;
      if (visited.has(key)) continue;
      visited.add(key);
      if (
        !obstacles.blocked(nx, nz) &&
        !obstacles.blocked(x + dx / 2, z + dz / 2)
      )
        queue.push([nx, nz]);
    }
  }
  assert.deepEqual(
    [...remaining].map((d) => d.name),
    []
  );
});

test('regional imagery, elevation, and all streaming tiles are present and registered', () => {
  for (const d of [park, region]) {
    assert.deepEqual(d.orthophoto.bounds, d.bounds);
    assert.ok(existsSync(asset(d.orthophoto.url)));
  }
  const e = region.elevation;
  assert.deepEqual(e.bounds, region.bounds);
  assert.equal(e.values.length, e.columns * e.rows);
  assert.ok(e.values.every(Number.isFinite));
  for (const t of region.tiles) {
    const tile = json(t.url);
    assert.ok(
      Array.isArray(tile.buildings) && Array.isArray(tile.trees),
      t.url
    );
    assert.ok(
      t.bounds.minX < t.bounds.maxX && t.bounds.minZ < t.bounds.maxZ,
      t.url
    );
  }
});

test('citywide travel arrivals and nearby food anchors are on open ground', () => {
  assert.equal(new Set(DISHES.map((d) => d.id)).size, DISHES.length);
  const parkObstacles = new Obstacles(park, PARK_SIGNS);
  for (const [i, stop] of TRAVEL.entries()) {
    const tile = region.tiles.find(
      ({ bounds: b }) =>
        stop.x >= b.minX &&
        stop.x < b.maxX &&
        stop.z >= b.minZ &&
        stop.z < b.maxZ
    );
    assert.ok(tile, stop.name);
    const data = json(tile.url);
    const regional = new Obstacles({
      ...data,
      water: [],
      bounds: region.bounds,
    });
    const dishes = DISHES.filter((d) => d.stop === i);
    assert.equal(dishes.length, 2, stop.name);
    assert.equal(dishes.filter((d) => d.dessert).length, 1, stop.name);
    for (const p of [stop, ...dishes.map((d) => dishSpawn(d, 'city'))]) {
      assert.equal(regional.blocked(p.x, p.z), false, stop.name);
      assert.equal(parkObstacles.occupied(p.x, p.z), false, stop.name);
    }
  }
});

test('each landmark replaces one city footprint and the pergola keeps an open aisle', () => {
  const glb = readFileSync(asset('/models/broomfield-landmarks.glb'));
  const pack = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const footprints = [
    ...park.buildings,
    ...region.tiles.flatMap((tile) => json(tile.url).buildings),
  ];
  const matched = new Set();
  for (const node of pack.nodes) {
    const { anchor, footprintName } = node.extras;
    const matches = footprints.filter(
      (b) => b.name === footprintName && contains(b.points, ...anchor)
    );
    assert.equal(matches.length, 1, node.name);
    matched.add(matches[0]);
  }
  assert.equal(pack.nodes.length, 7);
  assert.equal(matched.size, pack.nodes.length);
  const pergola = pack.nodes.find(
    (node) => node.name === 'Brunner Garden Pergola'
  );
  const posts = pergola.extras.postFootprints.map((points) => ({ points }));
  const solids = new Obstacles({
    buildings: posts,
    water: [],
    bounds: region.bounds,
  });
  assert.equal(solids.blocked(...pergola.extras.anchor), false);
  for (const { points } of posts) assert.ok(solids.blocked(...points[0]));
});

test('Dover roof meshes close against the surveyed walls and leave garage clearance', () => {
  const homes = ['/geo/region/8-11.json', '/geo/region/8-12.json']
    .flatMap((url) => json(url).buildings)
    .filter((home) => home.doverFacade);
  assert.equal(homes.length, 17);
  for (const home of homes) {
    const { vertices, faces, edges } = home.doverRoof;
    assert.ok(edges.length <= vertices.length);
    assert.equal(new Set(edges).size, home.points.length);
    assert.ok(
      vertices.every(([x, z, h]) => Number.isFinite(x + z + h) && h >= 2.4)
    );
    const links = new Set();
    const key = (a, b) => [Math.min(a, b), Math.max(a, b)].join(',');
    for (const [a, b, c] of faces) {
      assert.ok(
        [a, b, c].every(
          (i) => Number.isInteger(i) && i >= 0 && i < vertices.length
        )
      );
      for (const [i, j] of [
        [a, b],
        [b, c],
        [c, a],
      ])
        links.add(key(i, j));
    }
    for (let i = 0; i < edges.length; i++)
      assert.ok(
        links.has(key(i, (i + 1) % edges.length)),
        'Missing roof edge above wall'
      );
  }
});

test('each custom Dover exterior replaces the intended house on the streamed block', () => {
  const homes = region.tiles
    .flatMap((tile) => json(tile.url).buildings)
    .filter((home) => home.doverFacade?.model);
  const glb = readFileSync(asset('/models/dover-exteriors.glb'));
  const pack = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  assert.equal(homes.length, 2);
  assert.deepEqual(
    pack.nodes.map((n) => n.extras.footprintName).sort(),
    homes.map((h) => h.doverFacade.model).sort()
  );
  for (const node of pack.nodes) {
    const home = homes.find(
      (h) => h.doverFacade.model === node.extras.footprintName
    );
    assert.ok(contains(home.points, ...node.extras.anchor), node.name);
    assert.ok(pack.meshes[node.mesh].primitives.length > 1, node.name);
  }
});
