import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DOVER_ROUTE } from '../src/dover-route.js';
import { bluePod } from '../src/soccer.js';
import { PORCH } from '../src/dover-location.js';
import { Obstacles, PARK_SIGNS, slideMove, TRAVEL } from '../src/field.js';
import { clearTrail } from '../src/trail.js';

const readMap = (url) =>
  JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url)));

test('every Commons-to-Dover waypoint can be walked with the live map collision shapes', () => {
  const park = new Obstacles(readMap('/geo/broomfield.json'), PARK_SIGNS);
  const region = readMap('/geo/region.json');
  const xs = DOVER_ROUTE.map((p) => p.x),
    zs = DOVER_ROUTE.map((p) => p.z);
  // Regional building polygons can spill out of their source tile by 220 m.
  const relevantTiles = region.tiles
    .filter(
      ({ bounds: b }) =>
        b.maxX + 220 >= Math.min(...xs) &&
        b.minX - 220 <= Math.max(...xs) &&
        b.maxZ + 220 >= Math.min(...zs) &&
        b.minZ - 220 <= Math.max(...zs)
    )
    .map(({ url }) => readMap(url));
  const commons = readMap('/geo/courses/maps.json').find(
    (site) => site.id === 'commons'
  );
  const goals = bluePod(commons, () => 0);
  const solids = new Obstacles({
    buildings: [
      ...relevantTiles.flatMap((tile) => tile.buildings),
      ...goals.barriers,
    ],
    trees: relevantTiles.flatMap((tile) => tile.trees),
    water: [],
    bounds: region.bounds,
  });
  const blocked = (x, z) => park.occupied(x, z) || solids.blocked(x, z);
  const player = { x: TRAVEL[2].x, z: TRAVEL[2].z };
  assert.deepEqual(DOVER_ROUTE[0], player);
  assert.equal(blocked(player.x, player.z), false);
  for (const [i, point] of DOVER_ROUTE.slice(1).entries()) {
    const dx = point.x - player.x,
      dz = point.z - player.z;
    assert.ok(
      Math.hypot(dx, dz) <= 60,
      `Waypoint ${i + 1} must stay within local tracking range`
    );
    assert.ok(
      clearTrail(player, point, blocked),
      `Blocked leg to waypoint ${i + 1}`
    );
    slideMove(player, dx, dz, blocked);
    assert.ok(
      Math.hypot(player.x - point.x, player.z - point.z) < 0.01,
      `Collision on leg ${i + 1}`
    );
  }
  assert.ok(
    player.x >= PORCH.x &&
      Math.hypot(player.x - PORCH.x, player.z - PORCH.z) < 3.1
  );
});
