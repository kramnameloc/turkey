import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { DISHES, Obstacles, SPAWN, TRAVEL, dishSpawn } from '../src/field.js';

const asset = (path) => new URL('../public' + path, import.meta.url);
const json = (path) => JSON.parse(readFileSync(asset(path), 'utf8'));
const park = json('/geo/broomfield.json'),
  region = json('/geo/region.json');

test('every park dish can be reached from the spawn without crossing water or buildings', () => {
  const obstacles = new Obstacles(park);
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
  const parkObstacles = new Obstacles(park);
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
