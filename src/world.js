import * as T from 'three';
import { parkFloor, pavement } from './surfaces.js';
import { Obstacles, regionData, treeShape, BODY_RADIUS } from './field.js';
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
const unitPlane = new T.PlaneGeometry(1, 1);
unitPlane.translate(0, 0.5, 0);
function forest(trees, images) {
  const group = new T.Group(),
    dummy = new T.Object3D();
  const groups = new Map();
  for (const t of trees) {
    const shape = treeShape(t);
    if (!groups.has(shape.variety)) groups.set(shape.variety, []);
    groups.get(shape.variety).push({ tree: t, shape });
  }
  for (const [name, matches] of groups) {
    const tex = images[name];
    const m = new T.MeshBasicMaterial({
      map: tex,
      alphaTest: 0.36,
      side: T.DoubleSide,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.trunkOffset = { value: matches[0].shape.trunkX - 0.5 };
      shader.vertexShader =
        'uniform float trunkOffset;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec3 trunk = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
        vec2 toEye = normalize(cameraPosition.xz - trunk.xz + vec2(.0001));
        float billboardX = transformed.x - trunkOffset;
        transformed.x = toEye.y * billboardX;
        transformed.z = -toEye.x * billboardX;
      `
      );
    };
    const mesh = new T.InstancedMesh(unitPlane, m, matches.length);
    matches.forEach(({ tree: t, shape }, i) => {
      dummy.position.set(t.x, t.ground || 0, t.z);
      dummy.scale.set(shape.width, shape.height, shape.width);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const seed = Math.abs(Math.sin(t.x * 3.1 + t.z));
      mesh.setColorAt(
        i,
        new T.Color().setRGB(
          0.78 + seed * 0.22,
          0.76 + seed * 0.21,
          0.77 + seed * 0.18
        )
      );
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
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
    const base = elev(pts[0].x, pts[0].y),
      top = base + b.height;
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
            rise: Math.min(2.2, half * 0.34),
          };
      }
    }
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
      walls[kind].push(
        a.x,
        base - 1,
        a.y,
        d.x,
        base - 1,
        d.y,
        d.x,
        last,
        d.y,
        a.x,
        base - 1,
        a.y,
        d.x,
        last,
        d.y,
        a.x,
        first,
        a.y
      );
      const va = (first - base + 1) / 7,
        vb = (last - base + 1) / 7;
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
function parkFurniture(scene, data) {
  const pieces = [],
    v = new T.Object3D(),
    colors = [];
  function part(x, y, z, w, h, d, col, a = 0) {
    v.position.set(x, y, z);
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
function fieldGround(data, photo, grass) {
  const b = data.bounds,
    w = b.maxX - b.minX,
    h = b.maxZ - b.minZ;
  const g = new T.PlaneGeometry(w, h);
  g.rotateX(-Math.PI / 2);
  g.translate((b.maxX + b.minX) / 2, -0.018, (b.maxZ + b.minZ) / 2);
  return new T.Mesh(g, groundMaterial(photo, grass));
}
function parkSign(title, x, z, angle) {
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
    const m = new T.Mesh(new T.BoxGeometry(0.15, 1.08, 0.16), wood);
    m.position.set(dx, 0.54, 0);
    g.add(m);
  }
  const back = new T.Mesh(new T.BoxGeometry(3.8, 1.23, 0.12), wood);
  back.position.y = 1.65;
  g.add(back);
  for (const side of [-1, 1]) {
    const sign = new T.Mesh(
      new T.PlaneGeometry(3.78, 1.21),
      new T.MeshBasicMaterial({ map: t })
    );
    sign.position.set(0, 1.65, side * 0.065);
    sign.rotation.y = side < 0 ? Math.PI : 0;
    g.add(sign);
  }
  g.position.set(x, 0, z);
  g.rotation.y = angle;
  return g;
}
function water(scene, rings) {
  const positions = [];
  for (const r of rings) {
    const points = r.points.map((p) => new T.Vector2(...p));
    for (const tri of T.ShapeUtils.triangulateShape(points, []))
      for (const i of tri) positions.push(points[i].x, 0.036, points[i].y);
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
  const [photo, grass, maple, pine, sky, brick, civic, gold, bare] =
    await Promise.all([
      texture(data.orthophoto.url),
      texture('/scenery/grass.webp', true),
      texture('/scenery/maple.webp'),
      texture('/scenery/pine.webp'),
      texture('/scenery/sky.webp'),
      texture('/scenery/brick-facade.webp', true),
      texture('/scenery/civic-facade.webp', true),
      texture('/scenery/tree-2.webp'),
      texture('/scenery/tree-3.webp'),
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
  const structures = buildings(
    data.buildings,
    photo,
    data.bounds,
    () => 0,
    walls
  );
  scene.add(
    fieldGround(data, photo, grass),
    structures,
    forest(data.trees, { maple, pine, gold, bare })
  );
  scene.add(
    parkFloor(data, photo),
    pavement([...data.roads, ...data.paths], () => 0),
    parkSign('COMMUNITY PARK', -67, 26.8, 1.89),
    parkSign('POND OVERLOOK', 57.8, 68.7, 0.68)
  );
  parkFurniture(scene, data);
  water(scene, data.water);
  const solids = new Obstacles(data);
  return {
    walls: structures.children,
    solids,
    grass,
    treeImages: { maple, pine, gold, bare },
    wallMaterials: walls,
  };
}

export async function addRegion(scene, world) {
  const data = await regionData(),
    photo = await texture(data.orthophoto.url),
    b = data.bounds,
    e = data.elevation;
  function height(x, z) {
    if (!e || Math.max(Math.abs(x), Math.abs(z)) <= 680) return 0;
    const u = T.MathUtils.clamp(
      ((x - e.bounds.minX) / (e.bounds.maxX - e.bounds.minX)) * (e.columns - 1),
      0,
      e.columns - 1
    );
    const v = T.MathUtils.clamp(
      ((z - e.bounds.minZ) / (e.bounds.maxZ - e.bounds.minZ)) * (e.rows - 1),
      0,
      e.rows - 1
    );
    const i = Math.min(e.columns - 2, Math.floor(u)),
      j = Math.min(e.rows - 2, Math.floor(v));
    const h0 = T.MathUtils.lerp(
      e.values[j * e.columns + i],
      e.values[j * e.columns + i + 1],
      u - i
    );
    const h1 = T.MathUtils.lerp(
      e.values[(j + 1) * e.columns + i],
      e.values[(j + 1) * e.columns + i + 1],
      u - i
    );
    return (
      (T.MathUtils.lerp(h0, h1, v - j) - e.originMeters) *
      T.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), 680, 970)
    );
  }
  const ground = new T.PlaneGeometry(
    b.maxX - b.minX,
    b.maxZ - b.minZ,
    256,
    256
  );
  ground.rotateX(-Math.PI / 2);
  ground.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const a = ground.attributes.position;
  for (let i = 0; i < a.count; i++)
    a.setY(i, height(a.getX(i), a.getZ(i)) - 0.13);
  const plane = new T.Mesh(ground, groundMaterial(photo, world.grass));
  scene.add(plane, pavement(data.roads, height, true));
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
    cluster.add(forest(trees, world.treeImages));
    entry.solids = new Obstacles({
      buildings: buildingsList,
      trees,
      water: [],
      bounds: b,
    });
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
          scene.remove(old.mesh);
          old.mesh.traverse((m) => {
            if (m.isMesh) {
              if (m.geometry !== unitPlane) m.geometry.dispose();
              if (!world.wallMaterials.includes(m.material))
                m.material.dispose();
              if (m.isInstancedMesh) m.dispose();
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
