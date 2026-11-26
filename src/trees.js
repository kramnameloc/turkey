import * as T from 'three';
import { treeShape } from './field.js';

const TAU = 2 * Math.PI;
const vector = (x, y, z) => new T.Vector3(x, y, z);
const up = vector(0, 1, 0);
const right = vector(1, 0, 0);
const varieties = ['maple', 'gold', 'bare', 'pine'];

function randomSeed(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Each atlas strip contains either bark, maple leaves, cottonwood leaves or spruce needles.
function treeGeometry(kind, detail) {
  const positions = [],
    colors = [],
    uvs = [],
    index = [];
  // Keep the same main limbs and crown placement when changing detail.
  const random = randomSeed(739 + varieties.indexOf(kind) * 931);
  const surfaceNoise = randomSeed(2079 + varieties.indexOf(kind) * 349);
  function vertex(p, light, tile, u, v) {
    // Drooping spruce boughs flatten as their tips brush the ground.
    const y =
      tile === 3 && p.y < 0.135
        ? 0.03 + 0.105 * Math.exp((p.y - 0.135) / 0.105)
        : Math.max(0, p.y);
    positions.push(p.x, y, p.z);
    colors.push(light, light, light);
    // Inset UVs prevent adjacent atlas strips bleeding into distant mip levels.
    uvs.push((tile + 0.02 + 0.96 * u) / 4, 0.02 + 0.96 * v);
    return positions.length / 3 - 1;
  }
  function limb(a, b, r0, r1, sides) {
    const axis = b.clone().sub(a).normalize();
    const u = axis
      .clone()
      .cross(Math.abs(axis.y) > 0.9 ? right : up)
      .normalize();
    const v = axis.clone().cross(u);
    const start = positions.length / 3;
    for (let j = 0; j <= sides; j++) {
      const rad = (TAU * j) / sides;
      const n = u
        .clone()
        .multiplyScalar(Math.cos(rad))
        .addScaledVector(v, Math.sin(rad));
      vertex(a.clone().addScaledVector(n, r0), 0.65, 0, j / sides, 0);
      vertex(b.clone().addScaledVector(n, r1), 0.88, 0, j / sides, 1);
      if (j) {
        const i = start + 2 * j;
        index.push(i - 2, i, i - 1, i, i + 1, i - 1);
      }
    }
  }
  // A folded, arching spray of foliage grows out of each twig. The center ridge
  // and drooping edges give each spray depth even when seen along the branch.
  function spray(p, delta, width, roll, tile, light) {
    const tangent = delta.clone().normalize();
    const side = tangent
      .clone()
      .cross(Math.abs(tangent.y) > 0.96 ? right : up)
      .normalize()
      .applyAxisAngle(tangent, roll);
    const normal = side.clone().cross(tangent).normalize();
    const start = positions.length / 3;
    const rows = detail === 2 ? 1 : 2;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const center = p.clone().addScaledVector(delta, t);
      center.y -= Math.sin(t * Math.PI) * delta.length() * 0.21;
      const edge = center.clone().addScaledVector(normal, -width * 0.42);
      const ridge = center.clone().addScaledVector(normal, width * 0.18);
      vertex(
        edge.clone().addScaledVector(side, -width),
        light * (0.77 + 0.18 * t),
        tile,
        0,
        t
      );
      vertex(ridge, light * (0.87 + 0.17 * t), tile, 0.5, t);
      vertex(
        edge.clone().addScaledVector(side, width),
        light * (0.75 + 0.19 * t),
        tile,
        1,
        t
      );
      if (j) {
        const n = start + j * 3;
        index.push(
          n - 3,
          n - 2,
          n,
          n - 2,
          n + 1,
          n,
          n - 2,
          n - 1,
          n + 1,
          n - 1,
          n + 2,
          n + 1
        );
      }
    }
  }
  function deciduous() {
    const tile = kind === 'maple' ? 1 : 2,
      sides = [7, 4, 3][detail];
    const base = vector(0, 0, 0),
      crotch = vector(0.009, 0.29, 0.01),
      upper = vector(-0.023, 0.67, -0.016);
    limb(base, crotch, 0.043, 0.031, sides);
    limb(crotch, upper, 0.032, 0.016, sides);
    limb(upper, vector(-0.014, 0.94, -0.016), 0.017, 0.001, sides);
    for (let i = 0; i < 13; i++) {
      const layer = i / 13,
        turn = i * 2.4 + random() * 0.61;
      const startY = 0.185 + 0.63 * layer,
        y = startY + 0.12 + random() * 0.075;
      const reach =
        (0.2 + 0.185 * Math.sin(Math.PI * (0.14 + layer * 0.86))) *
        (0.88 + random() * 0.16);
      const root = vector(0.011 * Math.sin(i), startY, -0.016 * layer);
      const elbow = vector(
        Math.cos(turn - 0.17) * reach * 0.48,
        y - 0.055,
        Math.sin(turn - 0.17) * reach * 0.48
      );
      const tip = vector(
        Math.cos(turn + 0.1) * reach,
        y + 0.065,
        Math.sin(turn + 0.1) * reach
      );
      const draw = detail < 2 || i % 2 === 0;
      if (draw) {
        limb(root, elbow, 0.023 - 0.011 * layer, 0.013 - 0.005 * layer, sides);
        limb(elbow, tip, 0.014 - 0.005 * layer, 0.003, sides);
      }
      for (let k = 0; k < 3; k++) {
        const a = turn + (k - 1) * 1.14 + random() * 0.4;
        const origin = elbow.clone().lerp(tip, 0.44 + 0.25 * k);
        const end = origin
          .clone()
          .add(
            vector(
              Math.cos(a) * 0.088,
              0.08 + random() * 0.09,
              Math.sin(a) * 0.088
            )
          );
        if (!draw || (detail === 2 && k !== 1)) continue;
        if (detail === 0) limb(origin, end, 0.008, 0.0016, 4);
        const sprays = [8, 5, 4][detail],
          size = [1, 1.22, 2.0][detail];
        for (let j = 0; j < sprays; j++) {
          const phase = a + j * 2.4 + surfaceNoise() * 0.45,
            lift = surfaceNoise() * 0.2 - 0.075;
          const rr = (0.077 + 0.093 * surfaceNoise()) * size;
          const delta = vector(
            Math.cos(phase) * rr,
            (lift + (kind === 'gold' ? 0.022 : 0)) * size,
            Math.sin(phase) * rr
          );
          const from = origin.clone().lerp(end, 0.35 + 0.65 * surfaceNoise());
          spray(
            from,
            delta,
            (0.045 + 0.035 * surfaceNoise()) * size,
            (surfaceNoise() - 0.5) * 2.55,
            tile,
            0.82 + surfaceNoise() * 0.3
          );
        }
      }
    }
  }
  function winterOak() {
    const sides = [7, 4, 3][detail];
    const base = vector(0, 0, 0),
      fork = vector(-0.011, 0.24, 0.017),
      spine = vector(0.018, 0.53, -0.021);
    limb(base, fork, 0.052, 0.038, sides);
    limb(fork, spine, 0.039, 0.024, sides);
    function grow(p, heading, reach, rise, radius, depth, seed) {
      const random = randomSeed(seed);
      const bend = (random() - 0.5) * 0.92,
        knee = p
          .clone()
          .add(
            vector(
              Math.cos(heading) * reach * 0.42,
              rise * (0.32 + 0.17 * random()),
              Math.sin(heading) * reach * 0.42
            )
          );
      const tip = knee
        .clone()
        .add(
          vector(
            Math.cos(heading + bend) * reach * 0.58,
            rise * 0.55,
            Math.sin(heading + bend) * reach * 0.58
          )
        );
      const radiusEnd = radius * 0.53;
      const sides = radius > 0.014 ? [7, 4, 3][detail] : 3;
      if (depth > 0 && detail < 2) {
        limb(p, knee, radius, radius * 0.71, sides);
        limb(knee, tip, radius * 0.72, radiusEnd, sides);
      } else limb(p, tip, radius, depth > 0 ? radiusEnd : 0.00065, sides);
      if (depth <= 0) return;
      const offset = 0.39 + random() * 0.66;
      grow(
        tip,
        heading + bend - offset,
        reach * (0.52 + random() * 0.25),
        rise * (0.6 + random() * 0.25),
        radiusEnd,
        depth - 1,
        seed * 3 + 1
      );
      grow(
        knee.clone().lerp(tip, 0.57),
        heading + bend + offset,
        reach * (0.48 + random() * 0.29),
        rise * (0.53 + random() * 0.3),
        radius * 0.39,
        depth - 1,
        seed * 3 + 2
      );
      if (detail === 0 && depth > 1)
        grow(
          tip,
          heading + bend + 2.36,
          reach * 0.45,
          rise * 0.66,
          radius * 0.32,
          depth - 2,
          seed * 3 + 3
        );
    }
    for (let i = 0; i < 9; i++) {
      const layer = i / 9;
      const p = fork.clone().lerp(spine, layer);
      if (detail === 2 && i % 2) continue;
      grow(
        p,
        i * 2.4 + random() * 0.55,
        0.15 + 0.085 * random() - 0.055 * layer,
        0.12 + 0.1 * layer + random() * 0.065,
        0.027 - 0.012 * layer,
        [4, 2, 1][detail],
        63 + i * 242
      );
    }
  }
  function evergreen() {
    const sides = [7, 4, 3][detail],
      levels = [12, 9, 6][detail],
      arms = [11, 9, 6][detail];
    limb(vector(0, 0, 0), vector(0, 1, 0), 0.055, 0.001, sides);
    for (let j = 0; j < 5; j++) {
      const angle = (j * TAU) / 5;
      spray(
        vector(0, 0.914, 0),
        vector(Math.cos(angle) * 0.029, 0.092, Math.sin(angle) * 0.029),
        0.016,
        0.28,
        3,
        1.05
      );
    }
    for (let i = 0; i < levels; i++) {
      const t = i / levels,
        y = 0.115 + 0.88 * t;
      for (let j = 0; j < arms; j++) {
        const a = (j * TAU) / arms + i * 2.4 + (random() - 0.5) * 0.43;
        const reach = 0.5 * Math.pow(1 - t, 0.85) * (0.75 + 0.25 * random());
        const rise = (random() * 0.063 - 0.065) * (1 - t) + 0.012;
        const delta = vector(Math.cos(a) * reach, rise, Math.sin(a) * reach);
        const start = vector(
          0.008 * Math.cos(i),
          y + (random() - 0.5) * 0.043,
          0.008 * Math.sin(i)
        );
        spray(
          start,
          delta,
          reach * (0.3 + 0.1 * random()),
          (random() - 0.5) * 1.15,
          3,
          0.81 + 0.32 * random()
        );
        if (detail === 0) {
          // Needle tips overlap the whorl below, giving an evergreen a ragged lower edge.
          const angle = a + (j % 2 ? 0.42 : -0.45);
          const small = vector(
            Math.cos(angle) * reach * 0.59,
            -0.042 * (1 - t),
            Math.sin(angle) * reach * 0.59
          );
          spray(
            start.clone().addScaledVector(delta, 0.44),
            small,
            reach * 0.21,
            (random() - 0.5) * 1.8,
            3,
            0.93
          );
        }
      }
    }
  }
  if (kind === 'pine') evergreen();
  else if (kind === 'bare') winterOak();
  else deciduous();
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const radius = Math.max(Math.abs(min.x), Math.abs(min.z), max.x, max.z);
  geometry.scale(0.5 / radius, 1 / max.y, 0.5 / radius);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// All loaded GIS tiles share three detail levels. Only instance transforms change as the
// player crosses distance bands; the meshes and their photographed surfaces stay on the GPU.
export class TreeStand {
  constructor(scene, texture) {
    this.material = new T.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
      alphaTest: 0.43,
      side: T.DoubleSide,
    });
    this.group = new T.Group();
    this.group.name = 'Surveyed 3D trees';
    scene.add(this.group);
    this.tiles = new Map();
    this.batches = varieties.flatMap((kind) =>
      [0, 1, 2].map((detail) => ({
        geometry: treeGeometry(kind, detail),
        mesh: null,
        transforms: [],
      }))
    );
    this.frustum = new T.Frustum();
    this.viewProjection = new T.Matrix4();
    this.orientation = new T.Quaternion();
    this.aspect = 0;
    this.ball = new T.Sphere();
    this.x = Infinity;
    this.z = Infinity;
    this.dirty = true;
  }
  add(key, trees) {
    const dummy = new T.Object3D();
    this.tiles.set(
      key,
      trees.map((t) => {
        const s = treeShape(t);
        const noise = Math.abs(Math.sin(t.x * 17.3 + t.z * 42.7));
        dummy.position.set(t.x, t.ground || 0, t.z);
        dummy.rotation.y = noise * TAU;
        dummy.scale.set(s.width, s.height, s.width);
        dummy.updateMatrix();
        return {
          x: t.x,
          height: s.height,
          ground: t.ground || 0,
          z: t.z,
          batch: 3 * varieties.indexOf(s.variety),
          matrix: dummy.matrix.clone(),
          color: new T.Color().setRGB(
            0.77 + noise * 0.23,
            0.77 + 0.2 * noise,
            0.75 + 0.17 * (1 - noise)
          ),
        };
      })
    );
    this.dirty = true;
  }
  remove(key) {
    if (this.tiles.delete(key)) this.dirty = true;
  }
  update(x, z, camera) {
    const turned =
      camera &&
      (camera.aspect !== this.aspect ||
        camera.quaternion.angleTo(this.orientation) > 0.095);
    if (
      !this.dirty &&
      !turned &&
      (x - this.x) ** 2 + (z - this.z) ** 2 < 7 ** 2
    )
      return;
    if (camera) {
      this.viewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.frustum.setFromProjectionMatrix(
        this.viewProjection,
        camera.coordinateSystem
      );
      this.orientation.copy(camera.quaternion);
      this.aspect = camera.aspect;
    }
    this.dirty = false;
    this.x = x;
    this.z = z;
    for (const batch of this.batches) batch.transforms.length = 0;
    for (const tile of this.tiles.values()) {
      for (const tree of tile) {
        const d = (x - tree.x) ** 2 + (z - tree.z) ** 2;
        if (d > 850 ** 2) continue;
        if (camera) {
          // A margin accounts for turning and walking between batch updates.
          this.ball.center.set(
            tree.x,
            tree.ground + tree.height * 0.52,
            tree.z
          );
          this.ball.radius = tree.height * 0.85 + 9 + Math.sqrt(d) * 0.125;
          if (!this.frustum.intersectsSphere(this.ball)) continue;
        }
        const detail = d < 45 ** 2 ? 0 : d < 145 ** 2 ? 1 : 2;
        this.batches[tree.batch + detail].transforms.push(tree);
      }
    }
    for (const b of this.batches) {
      const n = b.transforms.length;
      if (n && (!b.mesh || n > b.mesh.instanceMatrix.count)) {
        if (b.mesh) {
          this.group.remove(b.mesh);
          b.mesh.dispose();
        }
        b.mesh = new T.InstancedMesh(
          b.geometry,
          this.material,
          2 ** Math.ceil(Math.log2(n))
        );
        b.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.group.add(b.mesh);
      }
      if (!b.mesh) continue;
      b.mesh.visible = n > 0;
      b.mesh.count = n;
      for (let i = 0; i < n; i++) {
        b.mesh.setMatrixAt(i, b.transforms[i].matrix);
        b.mesh.setColorAt(i, b.transforms[i].color);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      b.mesh.computeBoundingSphere();
    }
  }
}
