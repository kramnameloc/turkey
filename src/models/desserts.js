import * as T from 'three';

const TAU = Math.PI * 2;
const pebble = new T.SphereGeometry(1, 9, 6);

function finish(color, roughness) {
  return new T.MeshStandardMaterial({ color, roughness });
}

const cream = finish('#fff0cf', 0.4);
const fondant = finish('#fff4da', 0.33);
const syrup = finish('#a74918', 0.24);
const compote = finish('#aa4b27', 0.3);
const chocolate = finish('#48271f', 0.48);

function turn(profile, segments = 36) {
  return new T.LatheGeometry(
    profile.map(([r, y]) => new T.Vector2(r, y)),
    segments
  );
}

function fluted(profile, flutes, amount) {
  const mesh = turn(profile, flutes * 4);
  const p = mesh.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    const scale = 1 + amount * Math.cos(flutes * Math.atan2(x, z));
    p.setXYZ(i, x * scale, p.getY(i), z * scale);
  }
  mesh.computeVertexNormals();
  return mesh;
}

// Swept icing and pastry strands. A tapered, ridged cross section keeps a
// single ribbon continuous through bends and finishes in a piped point.
function strand(points, radiusAt, sides = 10, grooves = 0) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  const n = Math.max(16, points.length * 2);
  const frames = curve.computeFrenetFrames(n, false);
  const vertices = [],
    indices = [];
  const vertex = new T.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      center = curve.getPointAt(t),
      radius = radiusAt(t);
    for (let j = 0; j < sides; j++) {
      const a = (j * TAU) / sides;
      const r = radius * (1 + (grooves ? 0.11 * Math.cos(grooves * a) : 0));
      vertex
        .copy(center)
        .addScaledVector(frames.normals[i], r * Math.cos(a))
        .addScaledVector(frames.binormals[i], r * Math.sin(a));
      vertices.push(vertex.x, vertex.y, vertex.z);
      if (i === n) continue;
      const k = i * sides + j,
        next = i * sides + ((j + 1) % sides);
      indices.push(k, next, k + sides, next, next + sides, k + sides);
    }
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}

function whipped(g, kit, x, y, z, width, height) {
  // Connected ripples keep the whipped peak solid even against the bright sky.
  const vertices = [],
    indices = [],
    levels = 48,
    around = 56;
  for (let i = 0; i <= levels; i++) {
    const u = i / levels,
      curl = T.MathUtils.smoothstep(u, 0.67, 1);
    const dome = (1 - u) ** 0.7 * (0.89 + 0.11 * Math.min(u / 0.075, 1));
    for (let j = 0; j < around; j++) {
      const a = (TAU * j) / around,
        wave = TAU * 2.56 * u - a;
      const rib =
        0.13 * Math.cos(wave) -
        0.036 * Math.cos(2 * wave) +
        0.013 * Math.cos(6 * a + 0.8 * wave);
      const r = width * (dome * (1 + rib) + 0.0001);
      vertices.push(
        x + r * Math.cos(a) + width * 0.2 * curl * curl,
        y + height * (u + 0.025 * Math.sin(wave) * Math.sin(Math.PI * u)),
        z + r * Math.sin(a) - width * 0.03 * curl
      );
      if (i === levels) continue;
      const k = i * around + j,
        next = i * around + ((j + 1) % around);
      indices.push(k, k + around, next, next, k + around, next + around);
    }
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  kit.piece(g, mesh, cream);
}

function prism(shape, depth, bevel) {
  return new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 9,
  });
}

function wedgeShape(k) {
  const shape = new T.Shape();
  shape.moveTo(-0.62 * k, -0.39 * k);
  for (let i = 0; i <= 15; i++) {
    const a = (i / 15) * 1.01;
    shape.lineTo(
      k * (-0.62 + 1.26 * Math.cos(a)),
      k * (-0.39 + 1.26 * Math.sin(a))
    );
  }
  shape.closePath();
  return shape;
}

function pumpkinPie(g, kit) {
  const { piece, rand } = kit;
  const random = rand(1352);
  const layer = (y, depth, bevel, color, k = 1) =>
    piece(
      g,
      prism(wedgeShape(k), depth, bevel),
      color,
      [0, y, 0],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0]
    );
  layer(0.3, 0.1, 0.036, '#bd7840');
  layer(0.415, 0.055, 0.012, '#e5aa62');
  layer(0.47, 0.405, 0.025, '#d77b39');
  layer(0.866, 0.036, 0.018, finish('#c46b2a', 0.39));
  // The curved edge is the raised pie shell. Both straight sides expose filling.
  const crustProfile = [
    [1.18, 0.31],
    [1.256, 0.34],
    [1.287, 0.44],
    [1.289, 0.76],
    [1.304, 0.87],
    [1.282, 0.935],
    [1.238, 0.936],
    [1.227, 0.85],
  ].map(([radius, height]) => new T.Vector2(radius, height));
  piece(
    g,
    new T.LatheGeometry(crustProfile, 28, Math.PI / 2, 1.01),
    '#dca261',
    [-0.62, 0, 0.39]
  );
  const rim = [];
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * 1.01;
    rim.push([-0.62 + 1.26 * Math.cos(a), 0.905, 0.39 - 1.26 * Math.sin(a)]);
  }
  kit.tube(g, '#c98546', rim, 0.075, 36);
  for (let i = 0; i <= 11; i++) {
    const a = ((i + 0.14) / 11.4) * 1.01;
    piece(
      g,
      pebble,
      i % 3 === 0 ? '#db995a' : '#e7af6b',
      [-0.62 + 1.26 * Math.cos(a), 0.95, 0.39 - 1.26 * Math.sin(a)],
      [0.095, 0.09, 0.073],
      [0, a + 0.45, 0.25]
    );
  }
  for (let i = 0; i < 28; i++) {
    const x = -0.55 + random() * 1.12,
      y = 0.5 + random() * 0.31;
    if (Math.abs(x) < 0.35 && y > 0.56) continue;
    const size = 0.009 + random() * 0.013;
    piece(
      g,
      pebble,
      i % 3 ? '#bd662f' : '#e39959',
      [x, y, 0.411],
      [size, size * 0.48, 0.005]
    );
  }
  whipped(g, kit, 0.135, 0.92, -0.105, 0.26, 0.34);
  for (let i = 0; i < 9; i++) {
    const x = -0.2 + 0.24 * random(),
      z = 0.21 + 0.1 * random();
    piece(g, pebble, '#ae632f', [x, 0.914, z], [0.012, 0.005, 0.009]);
  }
  return { y: 0.685, z: 0.418, spread: 0.17, size: 0.94 };
}

function latticeBand(axis, index, spacing, radius) {
  const offset = index * spacing,
    extent = Math.sqrt(radius ** 2 - offset ** 2);
  const geometry = new T.BufferGeometry(),
    vertices = [],
    indices = [];
  const cross = [
    [-0.053, -0.012],
    [-0.057, 0.005],
    [-0.043, 0.021],
    [0, 0.027],
    [0.043, 0.021],
    [0.057, 0.005],
    [0.053, -0.012],
  ];
  const rotateX = (a, b) => (a - b) * Math.SQRT1_2,
    rotateZ = (a, b) => (a + b) * Math.SQRT1_2;
  const count = 26;
  for (let i = 0; i <= count; i++) {
    const u = ((2 * i) / count - 1) * extent;
    for (let j = 0; j < cross.length; j++) {
      const [crossWidth, rise] = cross[j];
      const a = axis ? offset + crossWidth : u,
        b = axis ? u : offset + crossWidth;
      const bowl = 0.133 * (1 - (a * a + b * b) / (radius * radius));
      const weave =
        (axis ? -1 : 1) * 0.019 * Math.cos(Math.PI * (u / spacing + index));
      vertices.push(rotateX(a, b), 0.13 + bowl + weave + rise, rotateZ(a, b));
      if (i === count || j === cross.length - 1) continue;
      const k = i * cross.length + j,
        row = cross.length;
      if (axis) indices.push(k, k + row, k + 1, k + 1, k + row, k + row + 1);
      else indices.push(k, k + 1, k + row, k + 1, k + row + 1, k + row);
    }
  }
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function applePie(g, kit) {
  const p = new T.Group();
  p.position.set(0, 0.755, -0.018);
  p.rotation.x = 0.3;
  g.add(p);
  kit.piece(
    p,
    fluted(
      [
        [0.001, -0.46],
        [0.417, -0.46],
        [0.461, -0.4],
        [0.642, 0.065],
        [0.65, 0.1],
        [0.6, 0.12],
      ],
      24,
      0.021
    ),
    '#bc7841'
  );
  kit.piece(
    p,
    turn([
      [0.001, 0.04],
      [0.58, 0.04],
      [0.635, 0.11],
      [0.54, 0.19],
      [0.32, 0.22],
      [0.001, 0.24],
    ]),
    compote
  );
  const random = kit.rand(2854);
  for (let i = 0; i < 15; i++) {
    const a = i * 2.4,
      r = 0.53 * Math.sqrt(i / 15);
    kit.piece(
      p,
      pebble,
      ['#e6a044', '#d67434', '#b84926'][i % 3],
      [r * Math.cos(a), 0.129 + 0.1 * (1 - (r * r) / 0.4), r * Math.sin(a)],
      [0.13, 0.044, 0.081],
      [0.1, random() * 6, 0.29]
    );
  }
  for (let axis = 0; axis < 2; axis++)
    for (let band = -2; band <= 2; band++) {
      kit.piece(
        p,
        latticeBand(axis, band, 0.227, 0.6),
        ['#e6a459', '#efb56b', '#d89a51'][Math.abs(band + axis) % 3]
      );
    }
  const scallopVertices = [],
    scallopIndices = [],
    ridges = 25,
    around = ridges * 6,
    cross = 10;
  for (let i = 0; i < around; i++) {
    const a = (i * TAU) / around,
      crimp = Math.cos(ridges * a);
    for (let j = 0; j < cross; j++) {
      const b = (j * TAU) / cross,
        r = 0.606 + 0.018 * crimp + (0.073 + 0.009 * crimp) * Math.cos(b);
      scallopVertices.push(
        r * Math.cos(a),
        0.13 + 0.027 * crimp + (0.065 + 0.007 * crimp) * Math.sin(b),
        r * Math.sin(a)
      );
      const k = i * cross + j,
        next = ((i + 1) % around) * cross + j,
        bp = i * cross + ((j + 1) % cross),
        np = ((i + 1) % around) * cross + ((j + 1) % cross);
      scallopIndices.push(k, bp, next, bp, np, next);
    }
  }
  const rim = new T.BufferGeometry();
  rim.setAttribute(
    'position',
    new T.Float32BufferAttribute(scallopVertices, 3)
  );
  rim.setIndex(scallopIndices);
  rim.computeVertexNormals();
  kit.piece(p, rim, '#e6a55d');
  return {
    y: 0.58,
    z: 0.643,
    spread: 0.163,
    size: 0.89,
    armX: 0.49,
    armY: 0.59,
  };
}

function cookie(g, kit) {
  const shape = new T.Shape(),
    random = kit.rand(5),
    outline = [];
  // A connected three-scallop bite interrupts the uneven baked edge.
  const bites = [
    [0.44, 0.49, 0.19],
    [0.6, 0.33, 0.19],
    [0.67, 0.53, 0.2],
  ];
  for (let i = 0; i < 112; i++) {
    const a = (TAU * i) / 112,
      cs = Math.cos(a),
      sn = Math.sin(a);
    let radius =
      0.615 +
      0.017 * Math.sin(5 * a + 0.2) +
      0.012 * Math.cos(9 * a) +
      0.008 * Math.sin(13 * a - 0.4);
    for (const [bx, by, r] of bites) {
      const along = bx * cs + by * sn,
        across = bx * sn - by * cs;
      if (Math.abs(across) >= r) continue;
      const half = Math.sqrt(r * r - across * across);
      if (along - half < radius && along + half > radius - 0.06)
        radius = Math.max(0.36, Math.min(radius, along - half));
    }
    outline.push([radius * cs, radius * sn]);
    if (i === 0) shape.moveTo(radius * cs, radius * sn);
    else shape.lineTo(radius * cs, radius * sn);
  }
  shape.closePath();
  const cy = 0.925;
  kit.piece(g, prism(shape, 0.175, 0.057), '#c4864c', [0, cy, -0.11]);
  kit.piece(
    g,
    prism(shape, 0.023, 0.032),
    '#dea764',
    [0, cy, 0.075],
    [0.98, 0.98, 1]
  );
  const chip = turn(
    [
      [0.002, 0],
      [0.076, 0],
      [0.093, 0.026],
      [0.085, 0.065],
      [0.043, 0.091],
      [0.012, 0.118],
      [0.002, 0.12],
    ],
    8
  );
  const chips = [
    [-0.35, 0.32],
    [-0.06, 0.43],
    [0.16, 0.29],
    [-0.47, 0.01],
    [-0.34, -0.25],
    [0.29, -0.25],
    [0.43, -0.06],
    [0.04, -0.39],
    [0.18, -0.5],
    [0.05, 0.18],
    [-0.24, -0.43],
  ];
  for (const [x, y] of chips) {
    const scale = 0.57 + random() * 0.61;
    kit.piece(
      g,
      chip,
      chocolate,
      [x, cy + y, 0.101],
      [scale, scale, scale],
      [0.94 + random() * 0.38, random() * 3, (random() - 0.5) * 0.58]
    );
  }
  const cracks = [
    [
      [-0.49, 0.25],
      [-0.4, 0.2],
      [-0.42, 0.14],
      [-0.38, 0.115],
    ],
    [
      [0.42, -0.32],
      [0.35, -0.35],
      [0.32, -0.31],
      [0.25, -0.34],
    ],
    [
      [-0.15, -0.48],
      [-0.13, -0.4],
      [-0.17, -0.36],
    ],
  ];
  for (const points of cracks)
    kit.tube(
      g,
      '#b17a46',
      points.map(([x, y]) => [x, cy + y, 0.131]),
      0.009,
      9
    );
  for (let i = 0; i < 50; i++) {
    const a = random() * TAU,
      r = Math.sqrt(random()),
      idx = Math.floor((a / TAU) * outline.length);
    const [dx, dy] = outline[idx],
      x = dx * r * 0.9,
      y = dy * r * 0.9;
    if (Math.abs(x) < 0.265 && Math.abs(y) < 0.16) continue;
    const size = 0.009 + random() * 0.014;
    kit.piece(
      g,
      pebble,
      i % 3 ? '#ba834b' : '#eac18b',
      [x, cy + y, 0.13],
      [size, size * 0.7, 0.006],
      [0, 0, a]
    );
  }
  return { y: cy - 0.035, z: 0.15, spread: 0.17, size: 1 };
}

function gingerbread(g, kit) {
  const shape = new T.Shape();
  shape.moveTo(0, 1.62);
  shape.bezierCurveTo(0.19, 1.62, 0.3, 1.48, 0.292, 1.34);
  shape.quadraticCurveTo(0.285, 1.2, 0.18, 1.15);
  shape.bezierCurveTo(0.31, 1.13, 0.48, 1.28, 0.56, 1.23);
  shape.bezierCurveTo(0.67, 1.18, 0.67, 1.09, 0.57, 1.015);
  shape.quadraticCurveTo(0.43, 0.915, 0.29, 0.9);
  shape.quadraticCurveTo(0.24, 0.88, 0.24, 0.8);
  shape.bezierCurveTo(0.24, 0.7, 0.38, 0.52, 0.39, 0.435);
  shape.bezierCurveTo(0.41, 0.302, 0.28, 0.245, 0.188, 0.299);
  shape.quadraticCurveTo(0.096, 0.37, 0.029, 0.518);
  shape.quadraticCurveTo(0, 0.569, -0.029, 0.518);
  shape.quadraticCurveTo(-0.096, 0.37, -0.188, 0.299);
  shape.bezierCurveTo(-0.29, 0.242, -0.408, 0.306, -0.39, 0.435);
  shape.bezierCurveTo(-0.375, 0.55, -0.255, 0.72, -0.242, 0.8);
  shape.quadraticCurveTo(-0.24, 0.88, -0.29, 0.9);
  shape.quadraticCurveTo(-0.43, 0.915, -0.57, 1.015);
  shape.bezierCurveTo(-0.67, 1.09, -0.67, 1.18, -0.56, 1.23);
  shape.bezierCurveTo(-0.48, 1.28, -0.31, 1.13, -0.18, 1.15);
  shape.bezierCurveTo(-0.37, 1.28, -0.3, 1.62, 0, 1.62);
  shape.closePath();
  kit.piece(g, prism(shape, 0.165, 0.045), '#b97744', [0, 0, -0.11]);
  const front = 0.106;
  for (const sign of [-1, 1]) {
    const cuff = [
      [0.505, 1.035],
      [0.49, 1.072],
      [0.516, 1.1],
      [0.51, 1.143],
      [0.544, 1.163],
    ];
    kit.tube(
      g,
      fondant,
      cuff.map(([x, y]) => [x * sign, y, front]),
      0.02,
      12
    );
    const ankle = [
      [0.163, 0.365],
      [0.205, 0.397],
      [0.244, 0.385],
      [0.273, 0.42],
      [0.328, 0.409],
      [0.362, 0.438],
    ];
    kit.tube(
      g,
      fondant,
      ankle.map(([x, y]) => [x * sign, y, front]),
      0.018,
      16
    );
    kit.piece(
      g,
      pebble,
      '#9c302e',
      [0.099 * sign, 1.09, front + 0.015],
      [0.115, 0.042, 0.069],
      [0, 0, 0.28 * sign]
    );
  }
  kit.piece(
    g,
    pebble,
    '#cd4f3a',
    [0, 1.09, front + 0.045],
    [0.055, 0.056, 0.038]
  );
  kit.tube(
    g,
    fondant,
    [
      [-0.169, 1.523, front],
      [-0.104, 1.539, front],
      [-0.052, 1.516, front],
      [0.012, 1.548, front],
      [0.07, 1.528, front],
      [0.139, 1.545, front],
    ],
    0.014,
    16
  );
  const buttons = [
    [0.946, '#f4c14c'],
    [0.804, '#478e73'],
    [0.671, '#c85847'],
  ];
  for (const [y, color] of buttons) {
    kit.piece(g, pebble, color, [0, y, front + 0.023], [0.052, 0.056, 0.036]);
    kit.piece(
      g,
      pebble,
      '#eed9a5',
      [-0.016, y + 0.014, front + 0.052],
      [0.012, 0.01, 0.004]
    );
  }
  for (const part of g.children) part.position.y -= 0.23;
  return {
    y: 1.135,
    z: 0.111,
    spread: 0.119,
    size: 0.76,
    noArms: true,
    noLegs: true,
  };
}

function mapleTopper(g, kit) {
  const points = [
    [0, 0.19],
    [0.039, 0.094],
    [0.078, 0.11],
    [0.068, 0.022],
    [0.149, 0.081],
    [0.142, 0.031],
    [0.19, 0.023],
    [0.104, -0.047],
    [0.118, -0.077],
    [0.025, -0.061],
    [0.011, -0.122],
    [-0.011, -0.122],
    [-0.018, -0.063],
    [-0.12, -0.08],
    [-0.104, -0.047],
    [-0.19, 0.023],
    [-0.142, 0.031],
    [-0.149, 0.081],
    [-0.069, 0.022],
    [-0.078, 0.11],
    [-0.039, 0.094],
  ];
  const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
  const leaf = new T.Group();
  g.add(leaf);
  leaf.position.set(0.088, 1.43, -0.03);
  leaf.rotation.set(-0.21, 0.09, -0.29);
  kit.piece(leaf, prism(shape, 0.018, 0.004), '#cf7436');
  kit.tube(
    leaf,
    '#99542c',
    [
      [0, -0.08, 0.023],
      [0, -0.017, 0.023],
      [0.001, 0.047, 0.023],
      [0, 0.122, 0.023],
    ],
    0.006,
    8
  );
}

function cupcake(g, kit) {
  const profile = [
    [0.001, 0.3],
    [0.335, 0.3],
    [0.367, 0.345],
    [0.499, 0.773],
    [0.509, 0.8],
    [0.468, 0.821],
  ];
  kit.piece(g, fluted(profile, 27, 0.032), '#5d9d96');
  kit.piece(
    g,
    fluted(
      [
        [0.349, 0.325],
        [0.369, 0.342],
        [0.372, 0.357],
        [0.36, 0.367],
      ],
      27,
      0.028
    ),
    '#a8c4ae'
  );
  kit.piece(
    g,
    turn([
      [0.001, 0.75],
      [0.47, 0.754],
      [0.52, 0.8],
      [0.535, 0.858],
      [0.483, 0.926],
      [0.31, 0.97],
      [0.001, 0.97],
    ]),
    '#c58a4b'
  );
  whipped(g, kit, 0, 0.879, 0, 0.491, 0.6);
  const random = kit.rand(57);
  for (let i = 0; i < 14; i++) {
    const a = (TAU * i) / 14,
      r = 0.34 + random() * 0.08;
    kit.piece(
      g,
      pebble,
      i % 3 ? '#b76e42' : '#e1aa72',
      [r * Math.cos(a), 1.03 + random() * 0.034, r * Math.sin(a)],
      [0.036, 0.018, 0.027],
      [0, a, 0.2]
    );
  }
  for (let i = 0; i < 3; i++) {
    const a = 0.18 + i * 1.95;
    kit.tube(
      g,
      syrup,
      [
        [0.32 * Math.sin(a), 1.13, 0.32 * Math.cos(a)],
        [0.424 * Math.sin(a + 0.03), 1.076, 0.424 * Math.cos(a + 0.03)],
        [0.474 * Math.sin(a + 0.08), 1.01, 0.474 * Math.cos(a + 0.08)],
        [0.462 * Math.sin(a + 0.1), 0.951, 0.462 * Math.cos(a + 0.1)],
      ],
      0.015,
      13
    );
  }
  mapleTopper(g, kit);
  return { y: 0.606, z: 0.439, spread: 0.157, size: 0.91 };
}

function cinnamonRoll(g, kit) {
  const roll = new T.Group();
  roll.position.set(0, 0.9, 0);
  roll.rotation.x = Math.PI / 2 - 0.09;
  g.add(roll);
  kit.piece(
    roll,
    turn([
      [0.001, -0.195],
      [0.47, -0.195],
      [0.572, -0.156],
      [0.612, -0.06],
      [0.62, 0.06],
      [0.587, 0.138],
      [0.513, 0.165],
      [0.001, 0.164],
    ]),
    '#ce8d4e'
  );
  const spiral = [];
  for (let i = 0; i <= 72; i++) {
    const t = i / 72,
      r = 0.015 + 0.524 * t,
      a = TAU * (2.14 * t - 0.09);
    spiral.push([
      r * Math.cos(a),
      0.167 + 0.013 * Math.sin(2 * a),
      r * Math.sin(a),
    ]);
  }
  kit.piece(
    roll,
    strand(
      spiral,
      (t) => 0.058 + 0.049 * Math.sin((t * Math.PI) / 2) ** 0.65,
      10
    ),
    '#965231'
  );
  const dough = spiral.map(([x, y, z]) => [x, y + 0.033, z]);
  kit.piece(
    roll,
    strand(
      dough,
      (t) => 0.046 + 0.04 * Math.sin((t * Math.PI) / 2) ** 0.65,
      12
    ),
    '#e5ab6d'
  );
  const toppings = [
    [
      [-0.54, -0.1],
      [-0.47, -0.23],
      [-0.34, -0.29],
      [-0.25, -0.382],
      [-0.18, -0.43],
      [-0.105, -0.41],
      [-0.034, -0.3],
      [0.038, -0.236],
      [0.113, -0.234],
      [0.214, -0.342],
      [0.28, -0.36],
      [0.343, -0.304],
      [0.395, -0.213],
      [0.493, -0.155],
      [0.535, -0.18],
    ],
    [
      [0.39, 0.235],
      [0.442, 0.195],
      [0.474, 0.123],
      [0.502, 0.1],
    ],
    [
      [-0.319, 0.375],
      [-0.27, 0.385],
      [-0.199, 0.414],
      [-0.139, 0.418],
    ],
  ];
  function topAt(x, z) {
    let h = 0.165;
    spiral.forEach(([sx, sy, sz], i) => {
      const r = 0.046 + 0.04 * Math.sin(((i / 72) * Math.PI) / 2) ** 0.65,
        d2 = (sx - x) ** 2 + (sz - z) ** 2;
      if (d2 < r * r) h = Math.max(h, sy + 0.033 + Math.sqrt(r * r - d2));
    });
    return h;
  }
  for (const line of toppings) {
    const path = line.map(([x, z]) => [x, topAt(x, z) + 0.013, z]);
    kit.piece(
      roll,
      strand(path, (t) => 0.012 + 0.022 * Math.sin(Math.PI * t) ** 0.38, 9),
      fondant
    );
  }
  return {
    y: 0.807,
    z: 0.305,
    spread: 0.17,
    size: 0.96,
    armX: 0.54,
    armY: 0.88,
  };
}

const recipes = {
  pumpkinPie,
  applePie,
  cookie,
  gingerbread,
  cupcake,
  cinnamonRoll,
};
export function buildDessert(id, group, kit) {
  return recipes[id]?.(group, kit);
}
