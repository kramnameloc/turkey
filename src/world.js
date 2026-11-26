import * as T from 'three';
import { parkFloor, pavement } from './surfaces.js';
import {
  Obstacles,
  plantParkSaplings,
  regionData,
  SPAWN,
  BODY_RADIUS,
  PARK_SIGNS,
  SIGN_WIDTH,
  SIGN_DEPTH,
} from './field.js';
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
function buildings(list, photo, bounds, elev, wallMats) {
  const group = new T.Group(),
    walls = [[], []],
    wallUV = [[], []],
    roofs = [],
    roofUV = [];
  for (const b of list) {
    if (b.points.length < 3) continue;
    const pts = b.points.map((p) => new T.Vector2(...p));
    const levels = pts.map((p) => elev(p.x, p.y)).sort((a, b) => a - b);
    const base = levels[Math.floor(levels.length / 2)];
    const kind = /Single Family|Townhome|Apartment/.test(b.type) ? 0 : 1;
    // A gable follows the footprint's longest edge. Split triangles at the
    // ridge so that rectangular footprints retain pitched roofs as well.
    let ridge = null;
    if (b.type === 'Single Family' || b.type === 'Townhome') {
      let longest = 0,
        normal;
      for (let i = 0; i < pts.length; i++) {
        const edge = pts[(i + 1) % pts.length].clone().sub(pts[i]);
        if (edge.lengthSq() > longest) {
          longest = edge.lengthSq();
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
    function wall(a, d) {
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
        wall(a, middle);
        wall(middle, d);
      } else wall(a, d);
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
  for (let i = 0; i < 2; i++)
    if (walls[i].length)
      group.add(new T.Mesh(geometry(walls[i], wallUV[i]), wallMats[i]));
  if (roofs.length)
    group.add(
      new T.Mesh(
        geometry(roofs, roofUV),
        new T.MeshBasicMaterial({ map: photo, side: T.DoubleSide })
      )
    );
  return group;
}
function parkFurniture(scene, data, height) {
  const pieces = [],
    v = new T.Object3D(),
    colors = [];
  function part(x, y, z, w, h, d, col, a = 0) {
    v.position.set(x, y + height(x, z), z);
    v.rotation.set(0, a, 0);
    v.scale.set(w, h, d);
    v.updateMatrix();
    pieces.push(v.matrix.clone());
    colors.push(col);
  }
  let last = [];
  for (const p of data.paths.filter((p) => p.type === 'Multi-Use Path')) {
    const [x, z] = p.points[0],
      [nx, nz] = p.points[1] || p.points[0],
      ang = Math.atan2(nx - x, nz - z);
    if (
      Math.abs(x) > 320 ||
      Math.abs(z) > 300 ||
      last.some(([a, b]) => Math.hypot(x - a, z - b) < 42)
    )
      continue;
    last.push([x, z]);
    const bx = x + Math.cos(ang) * 2.6,
      bz = z - Math.sin(ang) * 2.6;
    for (const [y, w, h, d, col] of [
      [0.45, 1.9, 0.12, 0.48, '#936b46'],
      [0.82, 1.9, 0.39, 0.09, '#916d4e'],
    ])
      part(
        bx + (y > 0.5 ? 0.21 : 0) * Math.cos(ang),
        y,
        bz - (y > 0.5 ? 0.21 : 0) * Math.sin(ang),
        d,
        h,
        w,
        col,
        ang
      );
    for (const s of [-0.7, 0.7])
      part(
        bx + s * Math.sin(ang),
        0.23,
        bz + s * Math.cos(ang),
        0.34,
        0.45,
        0.09,
        '#393c36',
        ang
      );
    const lx = x - Math.cos(ang) * 2.7,
      lz = z + Math.sin(ang) * 2.7;
    part(lx, 2.1, lz, 0.095, 4.2, 0.095, '#3e4640');
    part(lx, 4.23, lz, 0.32, 0.28, 0.32, '#e4d8ab');
    part(lx, 4.4, lz, 0.42, 0.075, 0.42, '#455149');
  }
  const m = new T.InstancedMesh(
    new T.BoxGeometry(),
    new T.MeshStandardMaterial(),
    pieces.length
  );
  pieces.forEach((p, i) => {
    m.setMatrixAt(i, p);
    m.setColorAt(i, new T.Color(colors[i]));
  });
  scene.add(m);
}
function groundMaterial(photo, grass) {
  const mat = new T.MeshBasicMaterial({ map: photo });
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
  const [photo, grass, sky, brick, civic, treeTexture, oaks, fine, regional] =
    await Promise.all([
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
  const terrain = makeTerrain(fine, regional.elevation, data.bounds);
  const { height } = terrain;
  const structures = buildings(
    data.buildings,
    photo,
    data.bounds,
    height,
    walls
  );
  const solids = new Obstacles(data, PARK_SIGNS);
  const plantings = [...data.trees, ...plantParkSaplings(data, solids)];
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
    parkFloor({ ...data, trees: plantings }, photo, height),
    pavement([...data.roads, ...data.paths], terrain),
    ...signs
  );
  parkFurniture(scene, data, height);
  water(scene, data.water, height);
  return {
    walls: [...structures.children, ...signs.flatMap((sign) => sign.children)],
    solids,
    grass,
    terrain,
    height,
    groundPatch: terrain.groundPatch,
    trees,
    wallMaterials: walls,
  };
}

export async function addRegion(scene, world) {
  const data = await regionData(),
    photo = await texture(data.orthophoto.url),
    b = data.bounds,
    height = world.height;
  const material = groundMaterial(photo, world.grass);
  scene.add(
    ...world.terrain.regionGround().map((geo) => new T.Mesh(geo, material)),
    pavement(data.roads, world.terrain, true)
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
    const cluster = buildings(
      buildingsList,
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
            if (m.isMesh) {
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
