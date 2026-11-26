import * as T from 'three';
import { randomSeed, treeShape } from './field.js';
const up = new T.Object3D();
// Pavement follows the surveyed centerlines. Join normals keep bends continuous.
export function pavement(lines, terrain, regional = false) {
  const random = randomSeed(954);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d'),
    pixels = ctx.createImageData(256, 256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 202 + random() * 49;
    pixels.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 8;
  const chunks = new Map();
  function chunkAt(x, z) {
    const key = regional
      ? Math.floor(x / 1000) + ',' + Math.floor(z / 1000)
      : 'park';
    if (!chunks.has(key))
      chunks.set(key, { positions: [], uvs: [], colors: [], paint: [] });
    return chunks.get(key);
  }
  for (const line of lines) {
    if (/Parking Lot|Bike Lane|Cross-walk/.test(line.type)) continue;
    const trail = /Sidewalk|Path|Trail/.test(line.type);
    const col = new T.Color(
      trail
        ? line.type === 'Soft Surface Trail'
          ? '#ad966e'
          : '#b5afa1'
        : '#666761'
    );
    const tint = [col.r, col.g, col.b].map((c) => Math.round(c * 255));
    const pts = [];
    for (let i = 0; i < line.points.length; i++) {
      const [x, z] = line.points[i];
      if (i) {
        const [ax, az] = line.points[i - 1],
          n = Math.ceil(Math.hypot(x - ax, z - az) / 40);
        for (let j = 1; j < n; j++)
          pts.push([ax + ((x - ax) * j) / n, az + ((z - az) * j) / n]);
      }
      pts.push([x, z]);
    }
    let prev = null,
      length = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i],
        before = pts[Math.max(0, i - 1)],
        after = pts[Math.min(pts.length - 1, i + 1)];
      const dx = after[0] - before[0],
        dz = after[1] - before[1],
        n = Math.hypot(dx, dz);
      if (!n) continue;
      const nx = -dz / n,
        nz = dx / n,
        half = line.width * 0.49;
      const point = (off) => [x + nx * off, z + nz * off];
      const row = [point(-half), point(half)];
      const stripe = [point(-0.075), point(0.075)];
      if (prev && !(regional && Math.abs(x) < 680 && Math.abs(z) < 680)) {
        const { positions, uvs, colors, paint } = chunkAt(x, z);
        const step = Math.hypot(x - prev.x, z - prev.z);
        const l0 = length / 2.4,
          l1 = (length + step) / 2.4,
          w = half / 1.2;
        const corners = [
          [...prev.row[0], 0, l0],
          [...prev.row[1], w, l0],
          [...row[1], w, l1],
          [...row[0], 0, l1],
        ];
        const fill = ([a, b, u, v], h) => {
          positions.push(a, h + (trail ? 0.035 : 0.008), b);
          uvs.push(u, v);
          colors.push(...tint);
        };
        terrain.drape([corners[0], corners[1], corners[2]], fill);
        terrain.drape([corners[0], corners[2], corners[3]], fill);
        if (line.type?.includes('Arterial')) {
          const mark = ([a, b], h) => paint.push(a, h + 0.045, b);
          terrain.drape([prev.stripe[0], prev.stripe[1], stripe[1]], mark);
          terrain.drape([prev.stripe[0], stripe[1], stripe[0]], mark);
        }
        length += step;
      }
      prev = { row, stripe, x, z };
    }
  }
  const group = new T.Group();
  const roadMaterial = new T.MeshBasicMaterial({
    map: tex,
    vertexColors: true,
    side: T.DoubleSide,
  });
  const stripeMaterial = new T.MeshBasicMaterial({
    color: '#c3ac69',
    side: T.DoubleSide,
  });
  for (const { positions, colors, uvs, paint } of chunks.values()) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new T.Uint8BufferAttribute(colors, 3, true));
    group.add(new T.Mesh(g, roadMaterial));
    if (paint.length) {
      const a = new T.BufferGeometry();
      a.setAttribute('position', new T.Float32BufferAttribute(paint, 3));
      group.add(new T.Mesh(a, stripeMaterial));
    }
  }
  return group;
}
export function parkFloor(data, photo, height) {
  const group = new T.Group(),
    random = randomSeed(1973),
    c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d'),
    g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, '#1b26177b');
  g.addColorStop(0.44, '#1b261753');
  g.addColorStop(1, '#1b261700');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const flat = new T.PlaneGeometry(1, 1);
  flat.rotateX(-Math.PI / 2);
  const trees = data.trees,
    shade = new T.InstancedMesh(
      flat,
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      }),
      trees.length
    );
  const leafG = new T.BufferGeometry();
  leafG.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [
        0, 0.06, -1, -0.42, 0, 0, 0, 0.14, 0.25, 0, 0.06, -1, 0, 0.14, 0.25,
        0.42, 0.02, -0.1, -0.42, 0, 0, 0, 0, 1, 0, 0.14, 0.25, 0, 0.14, 0.25, 0,
        0, 1, 0.42, 0.02, -0.1,
      ],
      3
    )
  );
  const leaves = new T.InstancedMesh(
    leafG,
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
    trees.length * 18
  );
  let count = 0;
  const leafColors = ['#a48843', '#8f632b', '#b1823f', '#c39447', '#8c7841'];
  trees.forEach((t, i) => {
    const { height: treeHeight, width } = treeShape(t);
    const x = t.x - treeHeight * 0.13,
      z = t.z;
    const slope = new T.Vector3(
      height(x - 1, z) - height(x + 1, z),
      2,
      height(x, z - 1) - height(x, z + 1)
    ).normalize();
    up.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), slope);
    up.rotateY(0.8);
    up.position.set(x, height(x, z) + 0.045, z);
    up.scale.set(width, 1, width * 0.65);
    up.updateMatrix();
    shade.setMatrixAt(i, up.matrix);
    if (t.type === 'Coniferous' || treeHeight < 2) return;
    for (let n = 0; n < 18; n++) {
      const radius = Math.sqrt(random()) * width * 0.57,
        angle = random() * 6.28;
      up.position.set(
        t.x + Math.cos(angle) * radius,
        0.051,
        t.z + Math.sin(angle) * radius
      );
      up.position.y += height(up.position.x, up.position.z);
      up.rotation.set((random() - 0.5) * 0.2, random() * 6.28, 0);
      const size = 0.09 + random() * 0.09;
      up.scale.set(size, 1 * size, size);
      up.updateMatrix();
      leaves.setMatrixAt(count, up.matrix);
      leaves.setColorAt(
        count,
        new T.Color(leafColors[Math.floor(random() * leafColors.length)])
      );
      count++;
    }
  });
  leaves.count = count;
  group.add(shade, leaves);
  const sampler = document.createElement('canvas');
  sampler.width = sampler.height = 512;
  const sc = sampler.getContext('2d', { willReadFrequently: true });
  sc.drawImage(photo.image, 0, 0, 512, 512);
  const samples = sc.getImageData(0, 0, 512, 512).data,
    b = data.bounds,
    tuftG = new T.BufferGeometry(),
    blade = [];
  for (let i = 0; i < 7; i++) {
    const x = (random() - 0.5) * 0.32,
      z = (random() - 0.5) * 0.32,
      h = 0.1 + random() * 0.13;
    blade.push(
      x,
      0,
      z,
      x + 0.017,
      0,
      z + 0.012,
      x + (random() - 0.5) * 0.13,
      h,
      z + 0.05
    );
  }
  tuftG.setAttribute('position', new T.Float32BufferAttribute(blade, 3));
  const tufts = new T.InstancedMesh(
    tuftG,
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
    18000
  );
  let t = 0;
  for (let i = 0; i < 18000; i++) {
    const x = (random() - 0.5) * 500,
      z = (random() - 0.5) * 420;
    const u = Math.floor(((x - b.minX) / (b.maxX - b.minX)) * 512),
      v = Math.floor(((z - b.minZ) / (b.maxZ - b.minZ)) * 512),
      j = (v * 512 + u) * 4;
    const [r, g, bl] = [samples[j], samples[j + 1], samples[j + 2]];
    if (g < r * 0.98 || g < bl * 1.16 || g < 53) continue;
    up.position.set(x, height(x, z) + 0.012, z);
    up.rotation.set(0, random() * 6.28, 0);
    up.scale.setScalar(0.4 + random() * 0.85);
    up.updateMatrix();
    tufts.setMatrixAt(t, up.matrix);
    tufts.setColorAt(
      t,
      new T.Color().setRGB(
        Math.min(1, (r / 255) * 1.17),
        Math.min(1, (g / 255) * 1.11),
        Math.min(1, (bl / 255) * 1.07),
        T.SRGBColorSpace
      )
    );
    t++;
  }
  tufts.count = t;
  group.add(tufts);
  return group;
}
