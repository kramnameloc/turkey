import * as T from 'three';
import { streetScenery } from './streetscape.js';
import { pavement, streetDetails } from './streets.js';
import { coursePhoto, groundMaterial } from '../world.js';
import { doverYard, yardBarriers } from './dover/yard.js';
import { bluePod } from './soccer.js';
import { Obstacles } from '../maps/obstacles.js';
import { siteSigns, trailSign } from './trail-sign.js';
import {
  doverParking,
  doverFurniture,
  doverSigns,
  doverVehicles,
} from './dover/block.js';

function intersects(a, b) {
  return (
    a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ
  );
}
function touchesSite(points, b) {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const [x, z] of points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return x0 < b.maxX && x1 > b.minX && z0 < b.maxZ && z1 > b.minZ;
}
export async function courseMaps(scene, world, region) {
  const response = await fetch('/geo/courses/maps.json');
  if (!response.ok) throw Error('Unable to load the regional course maps.');
  const sites = await response.json();
  region.data.detailMaps = sites;
  for (const site of sites) {
    site.orthophoto = { url: '/geo/courses/' + site.id + '.jpg' };
    site.roads = region.data.roads.filter((r) =>
      touchesSite(r.points, site.bounds)
    );
    site.trees = [];
    site.buildings = [];
  }
  function detailsAt(x, z) {
    const bounds = {
      minX: x - 140,
      maxX: x + 140,
      minZ: z - 140,
      maxZ: z + 140,
    };
    return sites.filter((site) => intersects(bounds, site.bounds));
  }
  const updateMapTiles = (site, tiles) => {
    const fresh = tiles.filter((t) => !site.seen.has(t.url));
    for (const tile of fresh) {
      site.seen.add(tile.url);
      site.buildings.push(
        ...tile.buildings.filter((b) => touchesSite(b.points, site.bounds))
      );
      site.trees.push(
        ...tile.trees.filter(
          (t) =>
            t.x >= site.bounds.minX &&
            t.x <= site.bounds.maxX &&
            t.z >= site.bounds.minZ &&
            t.z <= site.bounds.maxZ
        )
      );
    }
    if (fresh.length) site.mapRevision = (site.mapRevision || 0) + 1;
  };
  for (const site of sites) site.seen = new Set();
  async function prepare(x, z) {
    const tiles = region.mapTiles();
    await Promise.all(
      detailsAt(x, z).map(async (site) => {
        updateMapTiles(site, tiles);
        if (site.mesh) return;
        if (!site.pending)
          site.pending = (async () => {
            const texture = await coursePhoto(site);
            const material = groundMaterial(texture, world.grass, {
              polygonOffset: true,
              // Only break the depth tie with the underlying terrain. A slope
              // bias pulls the photo over streets at grazing camera angles.
              polygonOffsetFactor: 0,
              polygonOffsetUnits: -1,
            });
            // A few map extents overlap. Assign their furnishings to one site.
            const contains = (x, z) =>
              !(Math.abs(x) < 680 && Math.abs(z) < 680) &&
              sites.find(
                ({ bounds: b }) =>
                  x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
              ) === site;
            const mesh = new T.Group();
            mesh.add(
              new T.Mesh(world.groundPatch(site.bounds), material),
              pavement(
                site.paths,
                world.terrain,
                world.streets,
                region.junctions,
                {
                  regional: true,
                  crossingRoads: site.roads,
                  turningHead: site.turningHead,
                }
              ),
              streetDetails(
                site.roads,
                region.junctions,
                world.terrain,
                world.streets,
                contains,
                site.id === 'dover' ? doverSigns : []
              )
            );
            let barriers =
              site.id === 'dover' ? [...doverParking, ...yardBarriers] : [];
            if (site.id === 'commons') {
              const pitch = bluePod(site, world.height);
              if (pitch) {
                mesh.add(pitch.group);
                site.markings = pitch.markings;
                site.mapRevision = (site.mapRevision || 0) + 1;
                barriers = pitch.barriers;
              }
            }
            const sign = siteSigns[site.id];
            site.solids = new Obstacles(
              {
                buildings: [
                  ...world.landmarks.collisionFootprints(site.buildings),
                  ...barriers,
                ],
                trees: site.trees,
                water: [],
                bounds: site.bounds,
              },
              sign ? [sign] : []
            );
            if (site.id === 'dover') {
              mesh.add(
                doverFurniture(
                  world.streetModels,
                  world.height,
                  site.solids,
                  site.paths
                )
              );
              mesh.add(
                await doverYard(world.streetModels, world.terrain, site.solids)
              );
              mesh.add(await doverVehicles(world.height));
            }
            const scenery = streetScenery(
              { ...site, buildings: [] },
              region.junctions,
              world.streetModels,
              world.height,
              site.solids,
              contains
            );
            mesh.add(scenery.group);
            if (sign) {
              const board = trailSign(sign, site, texture.image, world.height);
              mesh.add(board);
              world.walls.push(...board.children);
            }
            scene.add(mesh);
            site.mesh = mesh;
          })().finally(() => {
            site.pending = null;
          });
        await site.pending;
      })
    );
  }
  return {
    prepare,
    areaAt: (x, z) => sites.find(({ mesh, bounds: b }) => mesh &&
      x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ),
    blocked: (x, z) => sites.some((s) => s.solids?.occupied(x, z)),
  };
}
