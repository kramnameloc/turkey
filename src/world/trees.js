import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSeed, treeShape } from '../maps/obstacles.js';
import oakForms from './oak-forms.json' with { type: 'json' };

const TAU = 2 * Math.PI;
const vector = (x, y, z) => new T.Vector3(x, y, z);
const up = vector(0, 1, 0);
const right = vector(1, 0, 0);
// Coniferous inventory sites retain the spruce needle and bark atlas.
function pineGeometry(detail) {
  const positions = [],
    colors = [],
    uvs = [],
    index = [];
  const random = randomSeed(3532);
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

export async function loadOaks() {
  const { scene } = await new GLTFLoader().loadAsync(
    '/models/november-oaks.glb'
  );
  return scene;
}

function oakLibrary(scene) {
  const levels = new Map();
  const surfaces = new Map();
  function material(source, detail, foliage) {
    const key = source.name + (foliage ? detail : '');
    if (!surfaces.has(key)) {
      const mat = new T.MeshLambertMaterial({
        map: source.map,
        side: foliage ? T.DoubleSide : T.FrontSide,
        // Fine November twigs cover fewer texels at distant mip levels.
        alphaTest: foliage ? [0.32, 0.22, 0.12][detail] : 0,
      });
      surfaces.set(key, mat);
    }
    return surfaces.get(key);
  }
  for (const { id } of Object.values(oakForms).flat()) {
    levels.set(
      id,
      [0, 1, 2].map((detail) => {
        const name = id + '_' + detail;
        const bark = scene.getObjectByName(name + '_bark');
        const leaves = scene.getObjectByName(name + '_leaves');
        const geometry = mergeGeometries(
          [bark.geometry, leaves.geometry],
          true
        );
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return {
          name,
          geometry,
          transforms: [],
          material: [
            material(bark.material, detail, false),
            material(leaves.material, detail, true),
          ],
        };
      })
    );
  }
  return levels;
}

// Leaf-on crowns keep the oak model's trunk and outer branches. The smaller
// interior sprays use leafy islands of the original atlas, folded about a midrib.
function leafOnGeometry(base, detail, seed) {
  const random = randomSeed(seed);
  const positions = [],
    normals = [],
    colors = [],
    uvs = [];
  const lobes = Array.from({ length: 29 }, (_, i) => {
    const angle = i * 2.39996,
      tier = (i + 0.5) / 29;
    const radius = 0.34 * Math.sqrt(1 - (tier * 2 - 1) ** 2);
    return [
      radius * Math.cos(angle),
      0.34 + 0.55 * tier,
      radius * Math.sin(angle),
    ];
  });
  const stride = [1, 3, 9][detail],
    scale = [1, 1.26, 1.83][detail];
  for (let i = 0; i < 1050; i++) {
    const center = lobes[i % lobes.length];
    const azimuth = random() * TAU,
      vertical = random() * 2 - 1;
    const r = Math.cbrt(random()) * 0.18,
      radial = Math.sqrt(1 - vertical * vertical);
    const x = center[0] + Math.cos(azimuth) * radial * r;
    const y = center[1] + vertical * r * 0.76;
    const z = center[2] + Math.sin(azimuth) * radial * r;
    const yaw = random() * TAU,
      roll = (random() - 0.5) * 1.2;
    const w = (0.083 + random() * 0.083) * scale,
      h = w * (0.62 + random() * 0.19);
    if (i % stride) continue;
    const dx = Math.cos(yaw),
      dz = Math.sin(yaw);
    const light =
      0.55 + 0.76 * y + 0.75 * Math.max(0, x - z) + 0.5 * radial * r;
    for (const [u, v] of [
      [0, 0],
      [0.5, 0],
      [0.5, 1],
      [0, 0],
      [0.5, 1],
      [0, 1],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0.5, 0],
      [1, 1],
      [0.5, 1],
    ]) {
      const across = (u - 0.5) * w * 2;
      const fold = (u === 0.5 ? 0.035 : 0) * scale;
      positions.push(
        x + dx * across - dz * fold,
        y + (v - 0.5) * h * 2 + roll * across,
        z + dz * across + dx * fold
      );
      normals.push(-dz * 0.45, 0.82, dx * 0.45);
      colors.push(light * 0.97, light, light * 0.94);
      uvs.push(u, 1 - v);
    }
  }
  const spray = new T.BufferGeometry();
  spray.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  spray.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  spray.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  spray.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const branches = base.index ? base.toNonIndexed() : base.clone();
  branches.setAttribute(
    'color',
    new T.BufferAttribute(
      new Float32Array(branches.attributes.position.count * 3).fill(1),
      3
    )
  );
  const full = mergeGeometries([branches, spray]);
  for (const { start, count, materialIndex } of base.groups)
    full.addGroup(start, count, materialIndex);
  full.addGroup(branches.attributes.position.count, positions.length / 3, 2);
  full.computeBoundingBox();
  full.computeBoundingSphere();
  return full;
}

// One set of geometry and materials serves both the park and streamed GIS tiles.
export class TreeStand {
  constructor(scene, texture, oaks) {
    const pineMaterial = new T.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
      alphaTest: 0.43,
      side: T.DoubleSide,
    });
    this.levels = oakLibrary(oaks);
    this.levels.set(
      'pine',
      [0, 1, 2].map((detail) => ({
        name: 'pine_' + detail,
        geometry: pineGeometry(detail),
        material: pineMaterial,
        transforms: [],
      }))
    );
    this.batches = [...this.levels.values()].flat();
    this.group = new T.Group();
    this.group.name = 'Park and regional trees';
    scene.add(this.group);
    this.tiles = new Map();
    this.frustum = new T.Frustum();
    this.viewProjection = new T.Matrix4();
    this.orientation = new T.Quaternion();
    this.aspect = 0;
    this.ball = new T.Sphere();
    this.x = Infinity;
    this.z = Infinity;
    this.dirty = true;
  }
  async prepare(trees) {
    const forms = new Set(
      trees.filter((t) => t.fullLeaf).map((t) => treeShape(t).variety)
    );
    if (!forms.size) return;
    this.fullLeafMaps ??= Promise.all(
      ['dover-leaves', 'dover-spray'].map(async (name) => {
        const texture = await new T.TextureLoader().loadAsync(
          '/scenery/' + name + '.webp'
        );
        texture.colorSpace = T.SRGBColorSpace;
        texture.flipY = false;
        texture.anisotropy = 8;
        return texture;
      })
    ).catch((error) => {
      this.fullLeafMaps = null;
      throw error;
    });
    const [map, sprigs] = await this.fullLeafMaps;
    for (const form of forms) {
      const key = form + '_full';
      if (this.levels.has(key)) continue;
      const levels = this.levels
        .get(form)
        .map(({ name, geometry, material }, detail) => {
          const leaves = material[1].clone();
          leaves.map = map;
          return {
            name: name + '_full',
            geometry: leafOnGeometry(
              geometry,
              detail,
              735 + form.charCodeAt(form.length - 1)
            ),
            material: [
              material[0],
              leaves,
              new T.MeshBasicMaterial({
                map: sprigs,
                alphaTest: [0.32, 0.22, 0.14][detail],
                vertexColors: true,
                side: T.DoubleSide,
              }),
            ],
            transforms: [],
          };
        });
      this.levels.set(key, levels);
      this.batches.push(...levels);
    }
  }
  add(key, trees) {
    const dummy = new T.Object3D();
    this.tiles.set(
      key,
      trees.map((t) => {
        const s = treeShape(t);
        dummy.position.set(t.x, t.ground || 0, t.z);
        dummy.rotation.y = s.rotation;
        dummy.scale.set(s.width, s.height, s.width);
        dummy.updateMatrix();
        return {
          x: t.x,
          height: s.height,
          ground: t.ground || 0,
          z: t.z,
          levels: this.levels.get(t.fullLeaf ? s.variety + '_full' : s.variety),
          matrix: dummy.matrix.clone(),
          color: new T.Color().setRGB(s.shade, s.shade, s.shade),
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
        tree.levels[detail].transforms.push(tree);
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
          b.material,
          2 ** Math.ceil(Math.log2(n))
        );
        b.mesh.name = b.name;
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
