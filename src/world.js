import * as T from 'three';
import {
  loadStreetscape,
  streetScenery,
  ranchHouses,
  streetSegments,
} from './streetscape.js';
import { FieldGrasses, loadGrasses } from './grass.js';
import { parkFloor } from './surfaces.js';
import {
  pavement,
  streetJunctions,
  streetMaterials,
  streetDetails,
} from './streets.js';
import {
  Obstacles,
  contains,
  plantParkSaplings,
  regionData,
  SPAWN,
  BODY_RADIUS,
  PARK_SIGNS,
  SIGN_WIDTH,
  SIGN_DEPTH,
} from './field.js';
import { DOVER } from './dover-location.js';
import { makeTerrain } from './terrain.js';
import { loadOaks, TreeStand } from './trees.js';
const loader = new T.TextureLoader();
function texture(url, repeat = false) {
  return loader.loadAsync(url).then((t) => {
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  });
}
function geometry(positions, uvs) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  if (uvs) g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
function houseMaterial(map) {
  const material = new T.MeshLambertMaterial({ map, side: T.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 house; varying vec3 vHouse;'
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHouse = house;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHouse;')
      .replace(
        '#include <map_fragment>',
        `
        // Six atlas rows: plain masonry, windows and a door bay for each finish.
        float eave = max(vHouse.x, 1.0);
        float storeys = max(1.0, floor(eave / 2.9 + .5));
        vec2 bay = vec2(vMapUv.x, vMapUv.y * storeys / eave);
        float row = 0.0;
        if (vMapUv.y >= 0.0 && vMapUv.y < eave && vHouse.z > -.5) {
          row = vHouse.z > .5 && bay.x < 1.0 && bay.y < 1.0 ? 2.0 : 1.0;
        }
        vec2 uv = vec2(bay.x, 1.0 - (floor(vHouse.y + .5) * 3.0 + row + 1.0 - fract(bay.y)) / 6.0);
        vec2 scale = vec2(1.0, 1.0 / 6.0);
        diffuseColor.rgb *= textureGrad(map, uv, dFdx(bay)*scale, dFdy(bay)*scale).rgb;`
      );
  };
  return material;
}

function buildings(list, photo, bounds, elev, wallMats) {
  const group = new T.Group(),
    walls = wallMats.map(() => []),
    wallUV = wallMats.map(() => []),
    houseStyles = [],
    roofs = [],
    roofUV = [];
  for (const b of list) {
    if (b.points.length < 3) continue;
    const pts = b.points.map((p) => new T.Vector2(...p));
    const levels = pts.map((p) => elev(p.x, p.y)).sort((a, b) => a - b);
    const base = levels[Math.floor(levels.length / 2)];
    const house = b.type === 'Single Family' || b.type === 'Townhome';
    const kind = house ? 2 : b.type === 'Apartment' ? 0 : 1;
    const finish = (Math.round(pts[0].x * 3) ^ Math.round(pts[0].y * 7)) & 1;
    let entranceEdge = 0;
    // A gable follows the footprint's longest edge. Split triangles at the
    // ridge so that rectangular footprints retain pitched roofs as well.
    let ridge = null;
    if (house) {
      let longest = 0,
        normal;
      for (let i = 0; i < pts.length; i++) {
        const edge = pts[(i + 1) % pts.length].clone().sub(pts[i]);
        if (edge.lengthSq() > longest) {
          longest = edge.lengthSq();
          entranceEdge = i;
          normal = new T.Vector2(-edge.y, edge.x).normalize();
        }
      }
      if (normal) {
        const distances = pts.map((p) => p.dot(normal)),
          low = Math.min(...distances),
          high = Math.max(...distances),
          half = (high - low) / 2;
        if (half > 0.1)
          ridge = {
            normal,
            offset: (high + low) / 2,
            half,
            rise: Math.min(
              2.2,
              half * 0.34,
              b.roofHeight ? Math.max(0, b.roofHeight - 2.4) : Infinity
            ),
          };
      }
    }
    // Survey heights include the roof. The fallback estimates describe eaves.
    const top =
      base + (b.roofHeight ? b.roofHeight - (ridge?.rise || 0) : b.height);
    const distance = (p) => (ridge ? p.dot(ridge.normal) - ridge.offset : 0);
    const roofHeight = (p) =>
      ridge
        ? top + ridge.rise * Math.max(0, 1 - Math.abs(distance(p)) / ridge.half)
        : top;
    function crossing(a, d) {
      return a.clone().lerp(d, distance(a) / (distance(a) - distance(d)));
    }
    function wall(a, d, edge) {
      const first = roofHeight(a),
        last = roofHeight(d),
        u = a.distanceTo(d) / 8;
      const lower = levels[0] - 1;
      walls[kind].push(
        a.x,
        lower,
        a.y,
        d.x,
        lower,
        d.y,
        d.x,
        last,
        d.y,
        a.x,
        lower,
        a.y,
        d.x,
        last,
        d.y,
        a.x,
        first,
        a.y
      );
      if (house) {
        const origin = pts[edge],
          edgeLength = origin.distanceTo(pts[(edge + 1) % pts.length]);
        const bays = Math.max(1, Math.round(edgeLength / 5.6));
        const u0 = (origin.distanceTo(a) / (edgeLength || 1)) * bays;
        const u1 = (origin.distanceTo(d) / (edgeLength || 1)) * bays;
        const bottom = lower - base;
        wallUV[kind].push(
          u0,
          bottom,
          u1,
          bottom,
          u1,
          last - base,
          u0,
          bottom,
          u1,
          last - base,
          u0,
          first - base
        );
        const openings = edgeLength < 2.8 ? -1 : Number(edge === entranceEdge);
        for (let i = 0; i < 6; i++)
          houseStyles.push(top - base, finish, openings);
        return;
      }
      const va = (first - lower) / 7,
        vb = (last - lower) / 7;
      wallUV[kind].push(0, 0, u, 0, u, vb, 0, 0, u, vb, 0, va);
    }
    function roofTriangle(a, d, c) {
      for (const p of [a, d, c]) {
        roofs.push(p.x, roofHeight(p), p.y);
        roofUV.push(
          (p.x - bounds.minX) / (bounds.maxX - bounds.minX),
          (bounds.maxZ - p.y) / (bounds.maxZ - bounds.minZ)
        );
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        d = pts[(i + 1) % pts.length];
      if (distance(a) * distance(d) < 0) {
        const middle = crossing(a, d);
        wall(a, middle, i);
        wall(middle, d, i);
      } else wall(a, d, i);
    }
    for (const tri of T.ShapeUtils.triangulateShape(pts, [])) {
      const corners = tri.map((i) => pts[i]);
      const signs = corners.map(distance);
      if (!ridge || Math.min(...signs) >= 0 || Math.max(...signs) <= 0) {
        roofTriangle(...corners);
        continue;
      }
      for (const side of [-1, 1]) {
        const clipped = [];
        for (let i = 0; i < 3; i++) {
          const a = corners[i],
            d = corners[(i + 1) % 3];
          if (distance(a) * side >= 0) clipped.push(a);
          if (distance(a) * distance(d) < 0) clipped.push(crossing(a, d));
        }
        for (let i = 1; i < clipped.length - 1; i++)
          roofTriangle(clipped[0], clipped[i], clipped[i + 1]);
      }
    }
  }
  for (let i = 0; i < walls.length; i++) {
    if (!walls[i].length) continue;
    const geo = geometry(walls[i], wallUV[i]);
    if (i === 2)
      geo.setAttribute('house', new T.Float32BufferAttribute(houseStyles, 3));
    group.add(new T.Mesh(geo, wallMats[i]));
  }
  if (roofs.length)
    group.add(
      new T.Mesh(
        geometry(roofs, roofUV),
        new T.MeshBasicMaterial({ map: photo, side: T.DoubleSide })
      )
    );
  return group;
}
export function groundMaterial(photo, grass, options = {}) {
  const mat = new T.MeshBasicMaterial({ ...options, map: photo });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailTile = { value: grass };
    shader.vertexShader =
      'varying vec2 groundXZ;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n groundXZ=position.xz;'
      );
    shader.fragmentShader =
      'varying vec2 groundXZ; uniform sampler2D detailTile;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec3 detail=texture2D(detailTile,groundXZ*.49).rgb;
      float vegetation=smoothstep(-.02,.07,diffuseColor.g-diffuseColor.b);
      float nearDetail=1.-smoothstep(35.,210.,length(cameraPosition.xz-groundXZ));
      diffuseColor.rgb *= mix(vec3(1.),vec3(.64)+detail*1.8,vegetation*nearDetail*.85);
    `
      );
  };
  return mat;
}
function parkSign({ title, x, z, angle }, height) {
  const board = document.createElement('canvas');
  board.width = 768;
  board.height = 248;
  const c = board.getContext('2d');
  c.fillStyle = '#32473b';
  c.fillRect(0, 0, 768, 248);
  c.strokeStyle = '#a0946c';
  c.lineWidth = 5;
  c.strokeRect(11, 11, 746, 226);
  c.fillStyle = '#eed8a1';
  c.font = '500 23px "IBM Plex Mono", monospace';
  c.fillText('CITY & COUNTY OF BROOMFIELD', 37, 56);
  c.fillStyle = '#f9f1d9';
  c.font = '700 84px "Barlow Condensed", sans-serif';
  c.fillText(title, 32, 150, 704);
  c.fillStyle = '#cdbc8d';
  c.fillRect(36, 179, 692, 2);
  c.font = '500 23px "IBM Plex Mono", monospace';
  c.fillText('COLORADO   /   PARK TRAILS', 36, 215);
  const t = new T.CanvasTexture(board);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  const g = new T.Group(),
    wood = new T.MeshLambertMaterial({ color: '#80664b' });
  for (const dx of [-1.63, 1.63]) {
    const m = new T.Mesh(new T.BoxGeometry(0.15, 1.08, SIGN_DEPTH), wood);
    m.position.set(dx, 0.54, 0);
    g.add(m);
  }
  const back = new T.Mesh(new T.BoxGeometry(SIGN_WIDTH, 1.23, 0.12), wood);
  back.position.y = 1.65;
  g.add(back);
  for (const side of [-1, 1]) {
    const sign = new T.Mesh(
      new T.PlaneGeometry(SIGN_WIDTH - 0.02, 1.21),
      new T.MeshBasicMaterial({ map: t })
    );
    sign.position.set(0, 1.65, side * 0.065);
    sign.rotation.y = side < 0 ? Math.PI : 0;
    g.add(sign);
  }
  g.position.set(x, height(x, z), z);
  g.rotation.y = angle;
  return g;
}
function water(scene, rings, height) {
  const positions = [];
  for (const r of rings) {
    const points = r.points.map((p) => new T.Vector2(...p));
    const center = points
      .reduce((sum, p) => sum.add(p), new T.Vector2())
      .divideScalar(points.length);
    const surfaceY = height(center.x, center.y) + 0.07;
    for (const tri of T.ShapeUtils.triangulateShape(points, []))
      for (const i of tri) positions.push(points[i].x, surfaceY, points[i].y);
  }
  const surface = new T.MeshPhongMaterial({
    color: 0x608889,
    transparent: true,
    opacity: 0.55,
    specular: 0x9caead,
    shininess: 80,
    side: T.DoubleSide,
    depthWrite: false,
  });
  scene.add(new T.Mesh(geometry(positions), surface));
}
export async function buildWorld(scene, data) {
  const [
    photo,
    grass,
    sky,
    brick,
    civic,
    treeTexture,
    oaks,
    fine,
    regional,
    streets,
    houses,
    grassModels,
    streetModels,
  ] = await Promise.all([
    texture(data.orthophoto.url),
    texture('/scenery/grass.webp', true),
    texture('/scenery/sky.webp'),
    texture('/scenery/brick-facade.webp', true),
    texture('/scenery/civic-facade.webp', true),
    texture('/scenery/tree-materials.webp'),
    loadOaks(),
    fetch('/geo/park-elevation.json').then((r) => {
      if (!r.ok) throw Error('The park elevation map could not load.');
      return r.json();
    }),
    regionData(),
    streetMaterials(texture),
    texture('/scenery/street-houses.webp', true),
    loadGrasses(),
    loadStreetscape(),
  ]);
  sky.mapping = T.EquirectangularReflectionMapping;
  scene.background = sky;
  scene.fog = new T.FogExp2('#b8c0ac', 0.00063);
  scene.add(new T.HemisphereLight('#fff4da', '#a8997b', 1.7));
  const sun = new T.DirectionalLight('#fff0cd', 2.1);
  sun.position.set(130, 110, 50);
  scene.add(sun);
  const walls = [brick, civic].map(
    (map) => new T.MeshLambertMaterial({ map, side: T.DoubleSide })
  );
  walls.push(houseMaterial(houses));
  const terrain = makeTerrain(fine, regional.elevation, data.bounds);
  const { height } = terrain;
  const solids = new Obstacles(data, PARK_SIGNS);
  const junctions = streetJunctions(data.roads);
  const scenery = streetScenery(data, junctions, streetModels, height, solids);
  const structures = buildings(
    data.buildings.filter((b) => !scenery.houses.has(b)),
    photo,
    data.bounds,
    height,
    walls
  );
  const plantings = [...data.trees, ...plantParkSaplings(data, solids)];
  const grasses = new FieldGrasses(scene, grassModels, height);
  grasses.update(SPAWN.x, SPAWN.z);
  const trees = new TreeStand(scene, treeTexture, oaks);
  trees.add(
    'park',
    plantings.map((t) => ({ ...t, ground: height(t.x, t.z) }))
  );
  trees.update(SPAWN.x, SPAWN.z);
  scene.add(
    new T.Mesh(terrain.parkGround(), groundMaterial(photo, grass)),
    structures
  );
  const signs = PARK_SIGNS.map((s) => parkSign(s, height));
  scene.add(
    parkFloor({ ...data, trees: plantings }, height),
    pavement(
      [...data.roads, ...data.paths, ...scenery.frontWalks],
      terrain,
      streets,
      junctions,
      {
        crossingRoads: data.roads,
      }
    ),
    streetDetails(data.roads, junctions, terrain, streets),
    ...signs
  );
  scene.add(scenery.group, scenery.homes);
  water(scene, data.water, height);
  return {
    streetModels,
    updateSignals: scenery.updateSignals,
    paradeSignal: scenery.signalCrossing,
    frontWalks: scenery.frontWalks,
    walls: [
      ...scenery.homes.children,
      ...structures.children,
      ...signs.flatMap((sign) => sign.children),
    ],
    solids,
    grass,
    terrain,
    height,
    groundPatch: terrain.groundPatch,
    streets,
    trees,
    grasses,
    wallMaterials: walls,
  };
}

export async function addRegion(scene, world) {
  const data = await regionData(),
    photo = await texture(data.orthophoto.url),
    b = data.bounds,
    height = world.height;
  const material = groundMaterial(photo, world.grass);
  const junctions = streetJunctions(data.roads);
  scene.add(
    ...world.terrain.regionGround().map((geo) => new T.Mesh(geo, material)),
    pavement(data.roads, world.terrain, world.streets, junctions, {
      regional: true,
    })
  );
  const active = new Map();
  // A footprint belongs to its centroid's tile. Include features that extend
  // over a tile edge when deciding which collision data must be ready.
  const coverage = new Map(),
    spill = 220,
    cellSize = 400;
  const cellKey = (x, z) =>
    Math.floor(x / cellSize) + ',' + Math.floor(z / cellSize);
  for (const tile of data.tiles) {
    const v = tile.bounds;
    for (
      let i = Math.floor((v.minX - spill) / cellSize);
      i <= Math.floor((v.maxX + spill) / cellSize);
      i++
    ) {
      for (
        let j = Math.floor((v.minZ - spill) / cellSize);
        j <= Math.floor((v.maxZ + spill) / cellSize);
        j++
      ) {
        const key = i + ',' + j;
        if (!coverage.has(key)) coverage.set(key, []);
        coverage.get(key).push(tile);
      }
    }
  }
  function covers(tile, x, z, margin) {
    const v = tile.bounds;
    return (
      x >= v.minX - margin &&
      x <= v.maxX + margin &&
      z >= v.minZ - margin &&
      z <= v.maxZ + margin
    );
  }
  function ensureTile(tile) {
    const existing = active.get(tile.url);
    if (existing) return existing.ready;
    const entry = {};
    active.set(tile.url, entry);
    entry.ready = loadTile(tile, entry).catch((error) => {
      if (active.get(tile.url) === entry) active.delete(tile.url);
      throw error;
    });
    return entry.ready;
  }
  async function loadTile(tile, entry) {
    const r = await fetch(tile.url);
    if (!r.ok) throw Error('Unable to load terrain at this landmark.');
    const d = await r.json();
    if (active.get(tile.url) !== entry) return;
    entry.mapData = { ...d, url: tile.url };
    const buildingsList = d.buildings || [],
      trees = (d.trees || []).map((t) => ({
        ...t,
        ground: height(t.x, t.z),
      }));
    // Only detail homes around the playable landmarks. Keep the quest cottage's
    // surveyed wall and attached entrance together at Dover.
    const sites = (data.detailMaps ?? []).filter(
      ({ bounds }) =>
        bounds.minX <= tile.bounds.maxX &&
        bounds.maxX >= tile.bounds.minX &&
        bounds.minZ <= tile.bounds.maxZ &&
        bounds.maxZ >= tile.bounds.minZ
    );
    const localHomes = buildingsList.filter(
      (h) =>
        h.type === 'Single Family' &&
        sites.some((s) => covers(s, ...h.points[0], 0)) &&
        !contains(h.points, DOVER.x, DOVER.z)
    );
    const roads = streetSegments(
      [...new Set(sites.flatMap((s) => s.roads))].filter(
        (r) => r.type !== 'Parking Lot'
      )
    );
    const { homes, houses } = ranchHouses(
      localHomes,
      roads,
      world.streetModels,
      height
    );
    const cluster = buildings(
      buildingsList.filter((h) => !houses.has(h)),
      photo,
      b,
      height,
      world.wallMaterials
    );
    entry.solids = new Obstacles({
      buildings: buildingsList,
      trees,
      water: [],
      bounds: b,
    });
    world.trees.add(tile.url, trees);
    if (homes.children.length) cluster.add(...homes.children);
    entry.mesh = cluster;
    scene.add(cluster);
  }
  function update(x, z) {
    for (const t of data.tiles) {
      const near = covers(t, x, z, 650),
        old = active.get(t.url);
      if (near && !old) {
        // Walking retries failed prefetches. Never open a pending tile for movement.
        ensureTile(t).catch(() => {});
      } else if (!near && old) {
        if (old.mesh) {
          world.trees.remove(t.url);
          scene.remove(old.mesh);
          old.mesh.traverse((m) => {
            if (m.isInstancedMesh) m.dispose();
            else if (m.isMesh) {
              m.geometry.dispose();
              if (!world.wallMaterials.includes(m.material))
                m.material.dispose();
            }
          });
        }
        active.delete(t.url);
      }
    }
  }
  return {
    data,
    height,
    update,
    junctions,
    mapTiles: () =>
      Array.from(active.values(), (e) => e.mapData).filter(Boolean),
    occludes: (ray) =>
      Array.from(active.values()).some(
        (entry) =>
          entry.mesh &&
          ray.intersectObjects(
            entry.mesh.children.filter((m) => m.isMesh),
            false
          ).length
      ),
    async prepareAt(x, z) {
      const tiles = (coverage.get(cellKey(x, z)) || []).filter((tile) =>
        covers(tile, x, z, spill)
      );
      await Promise.all(tiles.map(ensureTile));
    },
    blocked(x, z) {
      if (
        x < b.minX + BODY_RADIUS ||
        x > b.maxX - BODY_RADIUS ||
        z < b.minZ + BODY_RADIUS ||
        z > b.maxZ - BODY_RADIUS
      )
        return true;
      for (const tile of coverage.get(cellKey(x, z)) || []) {
        if (!covers(tile, x, z, spill)) continue;
        const solids = active.get(tile.url)?.solids;
        if (!solids || solids.occupied(x, z)) return true;
      }
      return false;
    },
  };
}
