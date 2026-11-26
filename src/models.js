import * as T from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildDessert } from './desserts.js';

const ball = new T.SphereGeometry(1, 16, 10);
const smallBall = new T.SphereGeometry(1, 8, 6);
const box = new T.BoxGeometry(1, 1, 1);
const softCube = mergeVertices(new RoundedBoxGeometry(1, 1, 1, 1, 0.14));
const tau = Math.PI * 2;
const colors = new Map();

function mat(color, roughness = 0.74) {
  if (color.isMaterial) return color;
  const key = color + '/' + roughness;
  if (!colors.has(key)) colors.set(key, new T.MeshStandardMaterial({ color, roughness }));
  return colors.get(key);
}

function piece(parent, geo, color, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
  const mesh = new T.Mesh(geo, mat(color));
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  parent.add(mesh);
  return mesh;
}
function oval(parent, color, pos, scale, rot) {
  return piece(parent, ball, color, pos, scale, rot);
}
function tube(parent, color, points, radius, segments = 12) {
  const path = new T.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new T.Vector3(...p))));
  return piece(parent, new T.TubeGeometry(path, segments, radius, 6, false), color);
}
function rand(seed) {
  let n = seed;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

// One indexed batch per moving part. Glazed pottery, fruit, and baked crumbs
// keep distinct finishes even though they share a draw call.
const enamel = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.72,
});
const edible = new T.MeshStandardMaterial({ vertexColors: true });
function crumbGrain() {
  const size = 64,
    pixels = new Uint8Array(size * size * 4),
    random = rand(17741);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.round(255 * ((random() + random()) * 0.5));
    pixels.set([value, value, value, 255], i);
  }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
const grain = crumbGrain();
edible.onBeforeCompile = (shader) => {
  shader.uniforms.crumbGrain = { value: grain };
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nattribute float foodRoughness; varying float vFinish; varying vec2 vCrumb;'
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvFinish = foodRoughness; vCrumb = vec2(position.x + position.z * .51, position.y - position.z * .69);'
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform sampler2D crumbGrain; varying float vFinish; varying vec2 vCrumb;'
    )
    .replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 + (texture2D(crumbGrain, vCrumb * 1.7).r - .5) * .52 * smoothstep(.40,.95,vFinish);'
    )
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vFinish, .12, 1.0);'
    );
};

function bake(group, food = false) {
  group.updateMatrixWorld(true);
  const parts = [];
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    // Some sculpted parts arrive as extrusions or expanded triangle lists.
    // Normalize attributes before joining them to indexed primitives.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') geo.deleteAttribute(name);
    }
    const count = geo.attributes.position.count;
    if (!geo.index) geo.setIndex(Array.from({ length: count }, (_, i) => i));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(mesh.matrixWorld);
    const tint = new Float32Array(count * 3),
      swatch = mesh.material.color;
    const paint = geo.getAttribute('color');
    for (let i = 0; i < count; i++) {
      tint[i * 3] = swatch.r * (paint ? paint.getX(i) : 1);
      tint[i * 3 + 1] = swatch.g * (paint ? paint.getY(i) : 1);
      tint[i * 3 + 2] = swatch.b * (paint ? paint.getZ(i) : 1);
    }
    geo.setAttribute('color', new T.BufferAttribute(tint, 3));
    if (food)
      geo.setAttribute(
        'foodRoughness',
        new T.Float32BufferAttribute(new Float32Array(count).fill(mesh.material.roughness ?? 0.72), 1)
      );
    parts.push(geo);
  });
  const combined = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  combined.computeBoundingBox();
  return new T.Mesh(combined, food ? edible : enamel);
}

function lathe(parent, profile, color, scale = [1, 1, 1], pos = [0, 0, 0]) {
  return piece(
    parent,
    new T.LatheGeometry(
      profile.map(([x, y]) => new T.Vector2(x, y)),
      40
    ),
    color,
    pos,
    scale
  );
}
function ring(parent, color, radius, thickness, y, depth = 1) {
  return piece(
    parent,
    new T.TorusGeometry(radius, thickness, 7, 40),
    color,
    [0, y, 0],
    [1, depth, 1],
    [Math.PI / 2, 0, 0]
  );
}
function crock(g, { color, trim, width, depth, bottom = 0.23, top = 0.63 }) {
  const body = lathe(
    g,
    [
      [0.05, bottom],
      [0.54, bottom],
      [0.65, bottom + 0.06],
      [0.92, top - 0.1],
      [1, top - 0.055],
      [1, top],
      [0.93, top + 0.015],
      [0.9, top - 0.04],
      [0.7, bottom + 0.14],
      [0, bottom + 0.14],
    ],
    mat(color, 0.34),
    [width, 1, depth]
  );
  ring(g, mat(trim, 0.3), width, 0.018, top, depth / width);
  ring(g, mat(trim, 0.33), width * 0.72, 0.012, bottom + 0.11, depth / width);
  return body;
}
function sideHandles(g, x, y, shade) {
  for (const s of [-1, 1])
    tube(
      g,
      mat(shade, 0.34),
      [
        [s * x, y - 0.04, -0.115],
        [s * (x + 0.19), y + 0.045, -0.12],
        [s * (x + 0.23), y + 0.06, 0.035],
        [s * (x + 0.15), y + 0.015, 0.13],
        [s * x, y - 0.045, 0.12],
      ],
      0.042,
      14
    );
}
function leaf(g, color, points, width) {
  // A folded leaf with two curled edges and a raised center rib.
  const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  const positions = [],
    indices = [],
    rows = 13;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows,
      p = path.getPoint(t),
      w = width * Math.pow(Math.sin(Math.PI * t), 0.7) + 0.002;
    positions.push(
      p.x - w,
      p.y - 0.014,
      p.z - 0.026,
      p.x,
      p.y + 0.015,
      p.z + 0.023,
      p.x + w,
      p.y - 0.014,
      p.z - 0.026
    );
    if (i < rows) {
      const j = i * 3;
      indices.push(j, j + 1, j + 3, j + 1, j + 4, j + 3, j + 1, j + 2, j + 4, j + 2, j + 5, j + 4);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // Double the thin blade so curled tips stay visible from either side.
  const back = geo.clone();
  const idx = back.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  back.computeVertexNormals();
  piece(g, geo, color);
  piece(g, back, color);
}
function buildCorn(g) {
  const random = rand(101),
    kernel = new T.SphereGeometry(1, 10, 7);
  const kp = kernel.attributes.position;
  const roundEdge = (v) => Math.sign(v) * Math.abs(v) ** 0.7;
  for (let i = 0; i < kp.count; i++) {
    const y = kp.getY(i);
    kp.setXYZ(i, roundEdge(kp.getX(i)) * (1 + 0.09 * y), roundEdge(y), roundEdge(kp.getZ(i)));
  }
  kernel.computeVertexNormals();
  const ear = new T.Group();
  g.add(ear);
  ear.rotation.z = -0.08;
  ear.position.set(0, 1, 0);
  oval(ear, '#cc9024', [0, 0, 0], [0.35, 0.79, 0.345]);
  for (let row = 0; row < 12; row++) {
    const y = (row - 5.5) * 0.121,
      frac = y / 0.82,
      rad = 0.337 * Math.sqrt(1 - frac * frac);
    for (let i = 0; i < 12; i++) {
      const a = (tau * (i + (row % 2) * 0.17)) / 12;
      const palette = ['#f6c545', '#ffdb6e', '#ecab29', '#ffd05a', '#f5bb32'];
      piece(
        ear,
        kernel,
        mat(palette[Math.floor(random() * palette.length)], 0.5),
        [rad * Math.sin(a), y, rad * Math.cos(a)],
        [rad * 0.27, 0.08, 0.06],
        [0, a, 0]
      );
    }
  }
  const blades = [
    [
      [-0.04, 0.27, 0.15],
      [-0.24, 0.38, 0.24],
      [-0.4, 0.71, 0.19],
      [-0.56, 1.03, 0.07],
      [-0.63, 1.25, 0.02],
    ],
    [
      [0.06, 0.27, 0.19],
      [0.21, 0.43, 0.32],
      [0.36, 0.64, 0.23],
      [0.48, 0.93, 0.17],
      [0.45, 1.14, 0.11],
    ],
    [
      [0.0, 0.25, -0.08],
      [0.11, 0.55, -0.32],
      [0.31, 0.93, -0.34],
      [0.44, 1.36, -0.2],
    ],
  ];
  blades.forEach((points, i) => {
    leaf(g, ['#5e8c37', '#84a642', '#699038'][i], points, i === 2 ? 0.1 : 0.135);
    tube(
      g,
      '#b5c276',
      points.map(([x, y, z]) => [x, y + 0.014, z + 0.027]),
      0.01,
      12
    );
    for (const side of [-1, 1]) {
      const veins = points.map(([x, y, z], j) => [
        x + side * 0.054 * Math.sin((Math.PI * j) / (points.length - 1)),
        y,
        z + 0.013,
      ]);
      tube(g, '#91ab57', veins, 0.005, 10);
    }
  });
  for (let i = 0; i < 4; i++)
    tube(
      ear,
      '#ba8234',
      [
        [i * 0.025 - 0.055, 0.72, 0],
        [i * 0.033 - 0.08, 0.79, 0.02],
        [i * 0.06 - 0.09, 0.81 - i * 0.018, 0.08],
        [i * 0.07 - 0.11, 0.76 - i * 0.025, 0.115],
      ],
      0.007,
      8
    );
  return {
    x: 0.022,
    y: 1.07,
    z: 0.374,
    spread: 0.165,
    size: 1.18,
    armX: 0.34,
    armY: 0.76,
  };
}
function buildMash(g) {
  crock(g, {
    color: '#307073',
    trim: '#eee0ac',
    width: 0.65,
    depth: 0.58,
    top: 0.69,
  });
  const random = rand(34);
  const geo = new T.LatheGeometry(
    [
      [0.03, 0.64],
      [0.41, 0.65],
      [0.55, 0.69],
      [0.59, 0.75],
      [0.56, 0.82],
      [0.52, 0.85],
      [0.545, 0.89],
      [0.48, 0.96],
      [0.38, 0.985],
      [0.395, 1.025],
      [0.32, 1.09],
      [0.205, 1.12],
      [0.22, 1.15],
      [0.1, 1.2],
      [0, 1.21],
    ].map(([r, y]) => new T.Vector2(r, y)),
    48
  );
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      a = Math.atan2(z, x),
      w = Math.hypot(x, z);
    const r = 1 + 0.035 * Math.sin(6 * a + y * 24) + 0.017 * Math.cos(9 * a - y * 13);
    pos.setXYZ(i, x * r + 0.03 * (y - 0.65), y + w * 0.025 * Math.cos(4 * a + 4 * y), z * r * 0.91);
  }
  geo.computeVertexNormals();
  piece(g, geo, mat('#f4dfb2', 0.74));
  oval(g, mat('#c18a4d', 0.29), [0.015, 1.174, 0.006], [0.2, 0.041, 0.14]);
  tube(
    g,
    mat('#bc8243', 0.3),
    [
      [0.14, 1.16, 0.05],
      [0.25, 1.1, 0.13],
      [0.32, 1.06, 0.17],
      [0.35, 1.035, 0.18],
    ],
    0.018,
    10
  );
  piece(
    g,
    softCube,
    mat('#ffd257', 0.4),
    [-0.025, 1.235, -0.01],
    [0.3, 0.083, 0.24],
    [0.1, -0.34, -0.07]
  );
  // Sprinkle chopped chives on the exposed surface of the whipped mound.
  const down = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0));
  g.updateMatrixWorld(true);
  const mound = g.children.find((child) => child.geometry === geo);
  for (let i = 0; i < 25; i++) {
    const a = random() * tau,
      r = 0.18 + random() * 0.33;
    const px = r * Math.cos(a),
      pz = r * 0.91 * Math.sin(a);
    down.ray.origin.set(px, 2, pz);
    const hit = down.intersectObject(mound, false)[0];
    if (!hit) continue;
    piece(g, box, '#50783d', [px, hit.point.y + 0.007, pz], [0.018, 0.016, 0.062], [0, a + 0.5, -0.08]);
  }
  return {
    y: 0.515,
    z: 0.535,
    spread: 0.182,
    size: 1.04,
    armX: 0.51,
    armY: 0.46,
  };
}
function buildBeans(g) {
  const random = rand(758);
  const specs = [
    [-0.27, -0.14, 1.23, -0.18],
    [-0.15, 0.045, 1.45, -0.11],
    [0, -0.13, 1.55, 0.1],
    [0.21, -0.13, 1.37, 0.16],
    [0.27, 0.06, 1.22, 0.18],
    [0.065, 0.11, 1.39, 0.01],
    [-0.08, 0.1, 1.25, -0.01],
  ];
  for (const [x, z, h, bend] of specs) {
    const points = [
      [x * 0.78, 0.27, z],
      [x * 0.9, 0.46, z + 0.018],
      [x, 0.75, z + 0.03],
      [x + bend * 0.35, 1.02, z + 0.04],
      [x + bend * 0.6, h - 0.13, z],
      [x + bend, h, z - 0.045],
    ];
    const center = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
    const tubeGeo = new T.TubeGeometry(center, 15, 0.097, 9, false);
    const p = tubeGeo.attributes.position;
    for (let row = 0; row <= 15; row++) {
      const t = row / 15,
        c = center.getPointAt(t),
        r = Math.pow(Math.max(0.025, Math.sin(Math.PI * t)), 0.32) * (0.94 + 0.055 * Math.cos(t * 31));
      for (let side = 0; side <= 9; side++) {
        const i = row * 10 + side;
        p.setXYZ(
          i,
          c.x + (p.getX(i) - c.x) * r,
          c.y + (p.getY(i) - c.y) * r,
          c.z + (p.getZ(i) - c.z) * r
        );
      }
    }
    tubeGeo.computeVertexNormals();
    piece(g, tubeGeo, mat(random() > 0.5 ? '#6f9c48' : '#82a947', 0.64));
    const seam = points.slice(1, -1).map(([a, b, c]) => [a - 0.022, b, c + 0.079]);
    tube(g, '#aac065', seam, 0.009, 12);
    tube(
      g,
      '#62783a',
      [points[5], [x + bend + 0.025, h + 0.024, z - 0.03], [x + bend + 0.045, h + 0.048, z - 0.016]],
      0.012,
      5
    );
  }
  lathe(
    g,
    [
      [0.87, 0.55],
      [1, 0.58],
      [1, 0.81],
      [0.92, 0.83],
    ],
    mat('#bb673b', 0.65),
    [0.38, 1, 0.235]
  );
  ring(g, '#f2c17b', 0.379, 0.012, 0.605, 0.62);
  ring(g, '#f2c17b', 0.379, 0.012, 0.78, 0.62);
  return {
    y: 0.75,
    z: 0.235,
    spread: 0.14,
    size: 1.01,
    armX: 0.32,
    armY: 0.62,
  };
}
function buildBerries(g) {
  crock(g, {
    color: '#f1dfbe',
    trim: '#849883',
    width: 0.67,
    depth: 0.6,
    top: 0.33,
    bottom: 0.22,
  });
  const profile = [
    [0.11, 0.31],
    [0.5, 0.34],
    [0.54, 0.39],
    [0.535, 0.45],
    [0.515, 0.48],
    [0.515, 0.89],
    [0.485, 1.08],
    [0.445, 1.13],
    [0.32, 1.17],
    [0.08, 1.17],
    [0, 1.16],
  ];
  const geo = new T.LatheGeometry(
      profile.map(([r, y]) => new T.Vector2(r, y)),
      72
    ),
    pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      a = Math.atan2(x, z),
      r = 1 + 0.058 * Math.cos(12 * a);
    pos.setXYZ(i, x * r, y, z * r * 0.94);
  }
  geo.computeVertexNormals();
  piece(g, geo, mat('#aa293f', 0.25));
  const fruit = [
    [0.12, 1.2, 0.06],
    [-0.055, 1.22, 0.09],
    [0.015, 1.24, -0.07],
    [-0.36, 0.4, 0.36],
    [-0.46, 0.39, 0.25],
  ];
  fruit.forEach(([x, y, z], i) => {
    oval(g, mat(i % 2 ? '#a7233a' : '#c9414d', 0.26), [x, y, z], [0.116, 0.108, 0.116]);
    piece(g, smallBall, '#662938', [x, y + 0.092, z + 0.01], [0.026, 0.011, 0.026]);
  });
  tube(
    g,
    mat('#ffa248', 0.48),
    [
      [0.1, 1.245, -0.09],
      [0.24, 1.32, -0.09],
      [0.31, 1.33, -0.015],
      [0.3, 1.27, 0.018],
      [0.23, 1.25, 0.05],
    ],
    0.023,
    13
  );
  leaf(
    g,
    '#628949',
    [
      [-0.01, 1.18, -0.05],
      [-0.15, 1.31, -0.12],
      [-0.25, 1.38, -0.15],
    ],
    0.093
  );
  return {
    y: 0.78,
    z: 0.49,
    spread: 0.179,
    size: 1.08,
    armX: 0.47,
    armY: 0.63,
  };
}
function buildStuffing(g) {
  const random = rand(167);
  // A small enamel roasting tin with a rolled lip and copper side handles.
  piece(g, softCube, mat('#486654', 0.38), [0, 0.48, 0], [1.18, 0.42, 0.89]);
  piece(g, softCube, mat('#d9b990', 0.36), [0, 0.674, 0], [1.24, 0.085, 0.95]);
  piece(g, softCube, mat('#533d29', 0.86), [0, 0.708, 0], [1.14, 0.058, 0.85]);
  sideHandles(g, 0.55, 0.55, '#b9905f');
  const toast = ['#bd854e', '#c48645', '#c99a62', '#ab723d', '#d8a668'];
  for (let i = 0; i < 25; i++) {
    const a = i * 2.39996,
      r = 0.46 * Math.sqrt(i / 25);
    const x = r * Math.cos(a) * 1.08,
      z = r * Math.sin(a) * 0.78;
    const size = 0.21 + random() * 0.12,
      group = new T.Group();
    group.position.set(x, 0.81 + (1 - r / 0.46) * 0.18 + random() * 0.06, z);
    group.rotation.set(random() * 0.46, random() * tau, random() * 0.52);
    g.add(group);
    piece(
      group,
      softCube,
      mat(toast[i % toast.length], 0.95),
      [0, 0, 0],
      [size, size * 0.8, size * 0.87]
    );
    // Pale porous cut face contrasts with the toasted crust.
    piece(
      group,
      softCube,
      mat('#e5bf87', 0.94),
      [0, size * 0.396, 0],
      [size * 0.86, 0.016, size * 0.73]
    );
    for (let j = 0; j < 3; j++)
      piece(
        group,
        smallBall,
        '#c39466',
        [(random() - 0.5) * size * 0.67, size * 0.406, (random() - 0.5) * size * 0.55],
        [0.012, 0.005, 0.008]
      );
  }
  for (let i = 0; i < 10; i++) {
    const a = random() * tau,
      r = 0.23 + random() * 0.24;
    piece(
      g,
      softCube,
      i % 2 ? '#8a9d54' : '#d8b77b',
      [r * Math.cos(a), 0.97, r * 0.71 * Math.sin(a)],
      [0.065, 0.055, 0.09],
      [0.3, a, 0.14]
    );
  }
  const sprig = [
    [0.05, 1.02, -0.08],
    [0.15, 1.15, -0.09],
    [0.31, 1.29, -0.1],
  ];
  tube(g, '#657b47', sprig, 0.012, 6);
  for (let i = 0; i < 4; i++)
    for (const side of [-1, 1]) {
      const x = 0.105 + i * 0.044,
        y = 1.1 + i * 0.042;
      oval(g, '#76965d', [x + side * 0.037, y, -0.09], [0.04, 0.081, 0.021], [0, 0, side * -0.83]);
    }
  return {
    y: 0.515,
    z: 0.443,
    spread: 0.19,
    size: 1.02,
    armX: 0.55,
    armY: 0.48,
  };
}
function buildYams(g) {
  crock(g, {
    color: '#b56844',
    trim: '#e5bd8c',
    width: 0.66,
    depth: 0.53,
    top: 0.64,
  });
  sideHandles(g, 0.605, 0.53, '#bb7951');
  const random = rand(3321);
  oval(g, mat('#bb6432', 0.48), [0, 0.645, 0], [0.59, 0.18, 0.45]);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.55) * 0.235 + row * 0.045,
        z = (row - 0.5) * 0.32;
      const slice = new T.Group();
      g.add(slice);
      slice.position.set(x, 0.79 + Math.cos(x * 3) * 0.043, z);
      slice.rotation.set(-0.14, 0.11, -0.58 + i * 0.06);
      const cut = lathe(
        slice,
        [
          [0.001, -0.07],
          [0.89, -0.07],
          [0.98, -0.048],
          [1, 0.025],
          [0.96, 0.064],
          [0.9, 0.071],
          [0.001, 0.071],
        ],
        mat('#a75b31', 0.54),
        [0.188, 1, 0.217]
      );
      cut.rotation.x = Math.PI / 2;
      oval(slice, mat(i % 2 ? '#ec983e' : '#e48938', 0.44), [0, 0, 0.07], [0.171, 0.203, 0.013]);
      for (let arc = 0; arc < 3; arc++) {
        const points = [],
          start = (i + arc) * 1.52;
        for (let j = 0; j < 5; j++) {
          const angle = start + 0.24 * j,
            r = 0.028 + arc * 0.041 + j * 0.002;
          points.push([Math.cos(angle) * r, Math.sin(angle) * r * 1.22, 0.083 - r * 0.018]);
        }
        tube(slice, mat(arc % 2 ? '#d78535' : '#f1ae5a', 0.48), points, 0.0045, 6);
      }
    }
  }
  for (const [x, z] of [
    [-0.31, -0.12],
    [-0.065, 0.08],
    [0.21, -0.1],
    [0.31, 0.18],
  ]) {
    const sweet = new T.Group();
    g.add(sweet);
    sweet.position.set(x, 1.06 + random() * 0.055, z);
    sweet.rotation.set(random() * 0.22, random() * 0.82, random() * 0.16 - 0.08);
    piece(sweet, softCube, mat('#ffebd1', 0.76), [0, 0, 0], [0.21, 0.15, 0.198]);
    oval(sweet, '#d79f69', [0.012, 0.074, -0.004], [0.078, 0.007, 0.065]);
  }
  return {
    y: 0.475,
    z: 0.48,
    spread: 0.185,
    size: 1.0,
    armX: 0.55,
    armY: 0.44,
  };
}

const savory = {
  corn: buildCorn,
  mash: buildMash,
  beans: buildBeans,
  berries: buildBerries,
  stuffing: buildStuffing,
  yams: buildYams,
};
const kit = { piece, oval, ball, box, rand, tube };
const characterScale = 1.85;

function eyesAndExpression(body, face, phase) {
  const eyes = new T.Group(),
    x = face.x ?? 0,
    y = face.y,
    z = face.z,
    spread = face.spread ?? 0.167,
    size = face.size ?? 1;
  const cream = mat('#fff7e5', 0.29),
    iris = mat(['#7d5834', '#447d74', '#716745', '#87593a'][Math.floor(phase) % 4], 0.28),
    pupil = mat('#281d1c', 0.19);
  for (const side of [-1, 1]) {
    const ex = side * spread,
      shift = 0.009 * Math.cos(phase);
    oval(
      eyes,
      cream,
      [ex, 0, 0],
      [0.126 * size, 0.146 * size, 0.077 * size],
      [0, side * 0.12, side * 0.07]
    );
    oval(eyes, iris, [ex + shift, 0.001, 0.057 * size], [0.084 * size, 0.099 * size, 0.035 * size]);
    oval(eyes, pupil, [ex + shift, 0.003, 0.079 * size], [0.058 * size, 0.076 * size, 0.018 * size]);
    oval(
      eyes,
      '#fffdf3',
      [ex + shift - 0.024 * size, 0.044 * size, 0.091 * size],
      [0.022 * size, 0.026 * size, 0.011 * size]
    );
    const browY = y + 0.168 * size,
      outer = x + ex + side * 0.09 * size,
      inner = x + ex - side * 0.072 * size;
    tube(
      body,
      mat('#574030', 0.69),
      [
        [outer, browY - 0.01, z + 0.002],
        [x + ex, browY + 0.025 + side * Math.sin(phase) * 0.018, z + 0.022],
        [inner, browY + 0.014, z + 0.037],
      ],
      0.021 * size,
      7
    );
  }
  const mouthWidth = spread * 0.5,
    my = y - 0.15 * size;
  body.updateMatrixWorld(true);
  const ray = new T.Raycaster(new T.Vector3(x, my, 3), new T.Vector3(0, 0, -1));
  const surface = ray.intersectObject(body, true)[0];
  const mz = surface ? surface.point.z + 0.015 : z + 0.018;
  if (Math.floor(phase * 10) % 4 === 0) {
    oval(body, '#68352b', [x, my, mz], [mouthWidth * 0.8, 0.045 * size, 0.018]);
    oval(
      body,
      '#d37c69',
      [x + 0.008, my - 0.019 * size, mz + 0.012],
      [mouthWidth * 0.47, 0.018 * size, 0.009]
    );
  } else {
    tube(
      body,
      '#603c30',
      [
        [x - mouthWidth, my + 0.012, mz],
        [x - 0.028, my - 0.018, mz + 0.01],
        [x + 0.018, my - 0.018, mz + 0.012],
        [x + mouthWidth, my + 0.02, mz],
      ],
      0.014 * size,
      9
    );
  }
  const eyeMesh = bake(eyes, true);
  eyeMesh.position.set(x, y, z + 0.025);
  return eyeMesh;
}

function runningLeg(side) {
  const leg = new T.Group();
  tube(
    leg,
    '#86583a',
    [
      [0, 0, 0],
      [side * 0.022, -0.115, -0.022],
      [side * 0.029, -0.21, 0.01],
    ],
    0.049,
    7
  );
  oval(
    leg,
    mat('#ab7644', 0.55),
    [side * 0.03, -0.211, 0.076],
    [0.103, 0.065, 0.165],
    [0.04, side * 0.13, 0]
  );
  oval(leg, '#754e33', [side * 0.031, -0.249, 0.083], [0.104, 0.029, 0.158]);
  return bake(leg, true);
}
function runningArm(side) {
  const arm = new T.Group();
  tube(
    arm,
    '#996641',
    [
      [0, 0, 0],
      [side * 0.087, -0.067, -0.024],
      [side * 0.112, -0.154, -0.005],
      [side * 0.119, -0.169, 0.088],
    ],
    0.043,
    8
  );
  oval(arm, '#c18c54', [side * 0.122, -0.164, 0.11], [0.064, 0.07, 0.073], [0.1, 0, side * -0.26]);
  return bake(arm, true);
}
export function foodModel(id, environment = null) {
  if (environment && edible.envMap !== environment) {
    edible.envMap = environment;
    edible.envMapIntensity = 0.35;
    edible.needsUpdate = true;
  }
  const root = new T.Group(),
    body = new T.Group(),
    pivot = new T.Group();
  const phase = [...id].reduce((n, c) => n + c.charCodeAt(0) * 0.071, 0);
  const face = savory[id] ? savory[id](body) : buildDessert(id, body, kit);
  if (!face) throw new Error('Unknown food model ' + id);
  const eyes = eyesAndExpression(body, face, phase),
    skin = bake(body, true);
  pivot.add(skin, eyes);
  root.add(pivot);
  const bounds = skin.geometry.boundingBox;
  const halfWidth = (bounds.max.x - bounds.min.x) * 0.5;
  const arms = [],
    legs = [];
  for (const side of [-1, 1]) {
    if (!face.noArms) {
      const arm = runningArm(side);
      arm.position.set(
        (face.x ?? 0) + side * (face.armX ?? halfWidth * 0.83),
        face.armY ?? face.y - 0.09,
        0.015
      );
      pivot.add(arm);
      arms.push(arm);
    }
    if (!face.noLegs) {
      const leg = runningLeg(side);
      const hipY = { corn: 0.37, cookie: 0.35, cinnamonRoll: 0.38 }[id] ?? 0.294;
      const hipWidth = id === 'corn' ? 0.125 : Math.min(0.21, halfWidth * 0.38);
      leg.position.set(side * hipWidth, hipY, 0.045);
      leg.scale.y = hipY / 0.294;
      pivot.add(leg);
      legs.push(leg);
    }
  }
  root.name = id;
  root.scale.setScalar(characterScale);
  root.userData.rig = { pivot, eyes, arms, legs, phase };
  root.userData.aimHeight = characterScale * (bounds.min.y + bounds.max.y) * 0.5;
  root.userData.labelHeight = characterScale * bounds.max.y + 0.38;
  return root;
}
export function animateFood(model, time, speed, phase = 0) {
  const { pivot, eyes, arms, legs, phase: offset } = model.userData.rig;
  const effort = T.MathUtils.clamp(speed / 2.8, 0, 1),
    step = time * 7.3 + phase + offset;
  const breath = Math.sin(time * 2.5 + offset),
    bounce = Math.cos(step * 2);
  const stretch = 0.014 * breath + 0.041 * effort * bounce;
  pivot.scale.set(1 - stretch * 0.55, 1 + stretch, 1 - stretch * 0.42);
  pivot.rotation.z = Math.sin(step) * (0.018 + 0.046 * effort);
  const sinceBlink = (time + phase * 0.31 + offset) % (3.15 + Math.abs(Math.sin(offset)) * 0.75);
  eyes.scale.y = sinceBlink < 0.17 ? Math.max(0.065, Math.abs(sinceBlink - 0.085) / 0.085) : 1;
  legs.forEach((leg, i) => {
    const swing = Math.sin(step + i * Math.PI);
    leg.rotation.x = swing * (0.14 + 0.77 * effort);
    leg.rotation.z = (i ? 1 : -1) * (0.04 + 0.07 * effort * Math.max(swing, 0));
  });
  arms.forEach((arm, i) => {
    const swing = Math.sin(step + i * Math.PI);
    arm.rotation.x = -swing * (0.17 + 0.74 * effort);
    arm.rotation.z = (i ? 1 : -1) * (0.15 + 0.17 * effort + 0.05 * breath);
  });
}

export function caster() {
  const g = new T.Group(),
    brass = '#bd9259',
    dark = '#524937';
  function ring(radius, thickness, z, color) {
    piece(g, new T.TorusGeometry(radius, thickness, 8, 40), color, [0, 0, z]);
  }
  function rod(a, b, r, color) {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      v = to.clone().sub(from);
    const m = piece(
      g,
      new T.CylinderGeometry(r, r, v.length(), 7),
      color,
      from.add(to).multiplyScalar(0.5).toArray()
    );
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
  }
  const end = 0.205,
    rim = -0.53;
  rod([0, 0, 0.24], [0, 0, -0.23], 0.038, '#826347');
  for (let i = 0; i < 8; i++) ring(0.041, 0.008, 0.07 - i * 0.025, i % 2 ? '#604a36' : '#745d44');
  ring(0.055, 0.014, -0.22, brass);
  ring(end, 0.014, rim, brass);
  ring(end - 0.012, 0.006, rim + 0.015, '#6c6149');
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.45;
    rod(
      [0.045 * Math.cos(a), 0.045 * Math.sin(a), -0.21],
      [end * Math.cos(a), end * Math.sin(a), rim],
      0.009,
      dark
    );
  }
  const point = (j, i) => {
    const t = j / 5,
      r = 0.034 + end * 0.85 * t,
      a = ((i + (j % 2) * 0.5) * Math.PI) / 8;
    return [Math.cos(a) * r, Math.sin(a) * r, -0.23 + t * (rim + 0.23)];
  };
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 16; i++) {
      rod(point(j, i), point(j + 1, i), 0.0026, '#dbbb86');
      rod(point(j, i), point(j + 1, i + (j % 2 ? 1 : -1)), 0.0026, '#c7a575');
    }
  return bake(g);
}
