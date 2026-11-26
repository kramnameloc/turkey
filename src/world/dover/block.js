import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PORCH } from './location.js';
import { randomSeed } from '../../maps/obstacles.js';

// Blades run parallel to the street they name. The northern pair sits above
// the stop facing players approaching East 9th from Dover.
export const doverSigns = [
  { x: 1169.7, z: -1130.3, cross: 'E 9th Ave', stop: true },
  { x: 1169.3, z: -1066.7, cross: 'E 7th Avenue Cir' },
  { x: 1169.5, z: -957.0, cross: 'E 7th Avenue Cir' },
].map(({ x, z, stop, cross }) => ({
  x,
  z,
  stop,
  arms: [
    { line: { name: cross }, dx: 1, dz: 0 },
    { line: { name: 'Dover St' }, dx: 0, dz: 1 },
  ],
}));

function sidewalkLeaves(paths, height) {
  const random = randomSeed(735);
  // A folded blade has a ridge and a lobed outline, visible at turkey height.
  const rib = [0.002, 0.006, 0.009, 0.012, 0.011, 0.006, 0.002];
  const widths = [0.001, 0.021, 0.013, 0.029, 0.018, 0.024, 0];
  const vertices = [],
    indices = [];
  for (let i = 0; i < widths.length; i++) {
    const z = i * 0.019 - 0.054,
      w = widths[i];
    vertices.push(-w, 0, z, 0, rib[i], z, w * 0.86, 0.001, z);
    if (i === widths.length - 1) break;
    const k = i * 3;
    indices.push(
      k,
      k + 3,
      k + 1,
      k + 1,
      k + 3,
      k + 4,
      k + 1,
      k + 4,
      k + 2,
      k + 2,
      k + 4,
      k + 5
    );
  }
  const blade = new T.BufferGeometry();
  blade.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  blade.setIndex(indices);
  blade.computeVertexNormals();
  const palette = ['#92643e', '#ba8448', '#d8aa60', '#936a49', '#a35b3a'];
  const leaves = [];
  const pose = new T.Object3D(),
    up = new T.Vector3(0, 1, 0),
    normal = new T.Vector3();
  for (const path of paths) {
    if (path.name !== 'Dover block' || path.type !== 'Attached Sidewalk')
      continue;
    for (let i = 1; i < path.points.length; i++) {
      const [ax, az] = path.points[i - 1],
        [bx, bz] = path.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / length,
        dz = (bz - az) / length;
      for (let d = 3 + random() * 6; d < length - 2; d += 9 + random() * 11) {
        const side = random() < 0.5 ? -1 : 1;
        const count = 10 + Math.floor(random() * 13);
        for (let j = 0; j < count; j++) {
          const along = d + (random() - random()) * 1.8;
          const offset = side * (0.6 - random() ** 2 * 0.9);
          const x = ax + dx * along - dz * offset,
            z = az + dz * along + dx * offset;
          pose.position.set(x, height(x, z) + 0.083, z);
          normal.set(
            height(x - 0.1, z) - height(x + 0.1, z),
            0.2,
            height(x, z - 0.1) - height(x, z + 0.1)
          );
          pose.quaternion.setFromUnitVectors(up, normal.normalize());
          pose.rotateY(random() * Math.PI * 2);
          pose.scale.setScalar(0.72 + 0.58 * random());
          pose.updateMatrix();
          leaves.push([
            pose.matrix.clone(),
            palette[Math.floor(random() * palette.length)]
          ]);
        }
      }
    }
  }
  const mesh = new T.InstancedMesh(
    blade,
    new T.MeshLambertMaterial(),
    leaves.length
  );
  const color = new T.Color();
  leaves.forEach(([matrix, tint], i) => {
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, color.set(tint));
  });
  mesh.name = 'Leaves along the Dover sidewalks';
  return mesh;
}

export function doverFurniture(models, height, solids, paths) {
  const group = new T.Group();
  group.name = 'Dover street furniture';
  group.add(sidewalkLeaves(paths, height));
  const pole = (x, z, r) =>
    solids.indexFeature({ x, z, radius: r }, x - r, x + r, z - r, z + r);
  for (const [name, x, z, yaw] of [
    ['StopSign', doverSigns[0].x, doverSigns[0].z, 0],
    ['Streetlamp', 1150.3, -1129.2, Math.PI / 2],
    ['PathLamp', 1162.1, -899.7, 0],
  ]) {
    for (const part of models.get(name)) {
      const mesh = new T.Mesh(part.geometry, part.material);
      mesh.name = name;
      mesh.rotation.y = yaw;
      mesh.position.set(x, height(x, z), z);
      group.add(mesh);
    }
    pole(x, z, 0.13);
  }
  for (const sign of doverSigns.slice(1)) pole(sign.x, sign.z, 0.05);

  const timbers = [],
    timberColors = [],
    bodies = [],
    mailboxColors = [],
    caps = [],
    flags = [];
  const pose = new T.Object3D();
  function piece(batch, x, y, z, w, h, d, yaw = 0, pitch = 0) {
    pose.position.set(x, y, z);
    pose.scale.set(w, h, d);
    pose.rotation.set(0, yaw, pitch, 'YXZ');
    pose.updateMatrix();
    batch.push(pose.matrix.clone());
  }
  function timber(...args) {
    piece(timbers, ...args);
    timberColors.push(
      new T.Color().setScalar(0.76 + 0.07 * (timbers.length % 4))
    );
  }
  // Leave the surveyed greenbelt path open between the two fence runs.
  for (const [a, b] of [
    [
      [1136.8, -909.4],
      [1153.1, -904.7],
    ],
    [
      [1153.1, -904.7],
      [1157.2, -902.3],
    ],
    [
      [1162.6, -899.5],
      [1174.3, -898.2],
    ],
  ]) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const count = Math.ceil(length / 2.65),
      yaw = Math.atan2(-dz, dx);
    for (let i = 0; i <= count; i++) {
      const x = a[0] + (dx * i) / count,
        z = a[1] + (dz * i) / count,
        y = height(x, z);
      if (i || x !== 1153.1) timber(x, y + 0.47, z, 0.14, 0.97, 0.14, yaw);
      if (i === count) break;
      const rise = height(x + dx / count, z + dz / count) - y;
      for (const h of [0.35, 0.72])
        timber(
          x + dx / count / 2,
          y + h + rise / 2,
          z + dz / count / 2,
          Math.hypot(length / count, rise),
          0.1,
          0.12,
          yaw,
          Math.atan2(rise, length / count)
        );
    }
    solids.indexFeature(
      { points: [a, b] },
      Math.min(a[0], b[0]),
      Math.max(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[1], b[1])
    );
  }
  // Representative individual boxes sit on the lawn side of the concrete walk.
  for (const [i, apron] of paths
    .filter((p) => p.type === 'Concrete Apron')
    .entries()) {
    if (i % 2) continue;
    const [[ax, az], [bx, bz]] = apron.points;
    const length = Math.hypot(bx - ax, bz - az),
      dx = (bx - ax) / length,
      dz = (bz - az) / length;
    const paired = Math.hypot(ax - PORCH.x, az - PORCH.z) < apron.width / 2;
    const offset = apron.width / 2 + (paired ? 0.16 : 0.6);
    const x = bx - dx * 2.1 - dz * offset;
    const z = bz - dz * 2.1 + dx * offset;
    if (solids.occupied(x, z)) continue;
    const y = height(x, z),
      yaw = Math.atan2(dx, dz);
    timber(x, y + 0.55, z, 0.11, 1.1, 0.11, yaw);
    if (paired) timber(x, y + 0.99, z, 0.66, 0.07, 0.36, yaw);
    for (const shift of paired ? [-0.17, 0.17] : [0]) {
      const mx = x + dz * shift,
        mz = z - dx * shift;
      piece(bodies, mx, y + 1.11, mz, 0.27, 0.19, 0.52, yaw);
      piece(caps, mx, y + 1.2, mz, 0.27, 0.27, 0.52, yaw);
      mailboxColors.push(
        new T.Color(paired ? (shift < 0 ? '#9da8aa' : '#c3c9c8') : '#535b54')
      );
      piece(
        flags,
        mx + 0.14 * dz,
        y + 1.16,
        mz - 0.14 * dx,
        0.015,
        0.052,
        0.15,
        yaw
      );
    }
    pole(x, z, 0.1);
  }
  function batch(transforms, geometry, color, colors) {
    const mesh = new T.InstancedMesh(
      geometry,
      new T.MeshLambertMaterial({ color }),
      transforms.length
    );
    transforms.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, colors[i]);
    });
    group.add(mesh);
  }
  const box = new T.BoxGeometry();
  batch(timbers, box, '#8f785a', timberColors);
  batch(bodies, box, '#ffffff', mailboxColors);
  // A semicircular extrusion closes the rounded top at both ends.
  const arch = new T.Shape();
  arch.absarc(0, 0, 0.5, 0, Math.PI, false);
  arch.closePath();
  const top = new T.ExtrudeGeometry(arch, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 5,
  });
  top.translate(0, 0, -0.5);
  batch(caps, top, '#ffffff', mailboxColors);
  batch(flags, box, '#b55a43');
  return group;
}

// Local aerials give the parking orientation. Vehicle models and paint are representative.
const dimensions = {
  sedan: { width: 1.85, height: 1.46, length: 4.58 },
  suv: { width: 1.93, height: 1.73, length: 4.64 },
};
export const doverParking = [
  ['sedan', 1154.8, -1043.7, 0, '#ac4437'],
  ['suv', 1165.25, -1113.6, Math.PI, '#dad8cd'],
  ['sedan', 1154.8, -921.8, 0, '#6e899a'],
  ['sedan', 1148.6, -1068.8, -Math.PI / 2, '#c3c2b4'],
  ['suv', 1171.7, -1029.2, Math.PI / 2, '#556251'],
  ['sedan', 1170.9, -1006, Math.PI / 2, '#527082'],
  ['suv', 1148.8, -969.7, -Math.PI / 2, '#ada699'],
].map(([name, x, z, yaw, color]) => {
  const { width, length } = dimensions[name],
    dx = Math.sin(yaw),
    dz = Math.cos(yaw);
  const points = [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([s, t]) => [
    x + dz * s * width * 0.5 + dx * t * length * 0.5,
    z - dx * s * width * 0.5 + dz * t * length * 0.5,
  ]);
  return { name, x, z, yaw, color, points };
});

export async function doverVehicles(height) {
  const group = new T.Group();
  group.name = 'Parked Dover vehicles';
  await Promise.all(
    ['sedan', 'suv'].map(async (name) => {
      const { scene } = await new GLTFLoader().loadAsync(
        '/models/dover-' + name + '.glb'
      );
      scene.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(scene),
        size = bounds.getSize(new T.Vector3());
      const center = bounds.getCenter(new T.Vector3());
      const dim = dimensions[name];
      const scale = new T.Matrix4().makeScale(
        dim.width / size.x,
        dim.height / size.y,
        dim.length / size.z
      );
      scale.multiply(
        new T.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z)
      );
      const cars = doverParking.filter((p) => p.name === name);
      const transforms = cars.map(({ x, z, yaw }) => {
        const dx = Math.sin(yaw),
          dz = Math.cos(yaw);
        const front = height(x + dx, z + dz),
          rear = height(x - dx, z - dz);
        return new T.Matrix4()
          .makeRotationY(yaw)
          .multiply(new T.Matrix4().makeRotationX(-Math.atan2(front - rear, 2)))
          .setPosition(x, height(x, z) + 0.055, z)
          .multiply(scale);
      });
      scene.traverse((part) => {
        if (!part.isMesh) return;
        const mat = part.material.clone();
        // Only the saturated body paint takes the per-instance color. Keep tires,
        // glass, bumpers and lamps in Kenney's original palette.
        mat.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
          #ifdef USE_COLOR
            vec3 paint = diffuseColor.rgb;
            float red = min(paint.r-paint.g, paint.r-paint.b);
            float green = min(paint.g-paint.r, paint.g-paint.b);
            diffuseColor.rgb = mix(paint,vColor.rgb * (.75 + .4*max(paint.r,paint.g)),smoothstep(.07,.22,max(red,green)));
          #endif`
          );
        };
        const mesh = new T.InstancedMesh(part.geometry, mat, cars.length);
        transforms.forEach((m, i) => {
          mesh.setMatrixAt(
            i,
            new T.Matrix4().multiplyMatrices(m, part.matrixWorld)
          );
          mesh.setColorAt(i, new T.Color(cars[i].color));
        });
        mesh.name = 'Parked ' + name;
        group.add(mesh);
      });
    })
  );
  return group;
}
