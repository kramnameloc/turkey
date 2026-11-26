import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const tau = Math.PI * 2;
const ball = new T.SphereGeometry(1, 16, 10);
const bead = new T.SphereGeometry(1, 9, 6);
const butterBlock = new RoundedBoxGeometry(1, 1, 1, 1, 0.14);
const origin = [0, 0, 0];
const unit = [1, 1, 1];

function add(parent, geometry, color, at = origin, scale = unit, rotation = origin, glossy = false) {
  // Only the two baked materials reach the renderer.
  const part = new T.Object3D();
  part.geometry = geometry;
  part.userData.color = color;
  part.userData.glossy = glossy;
  part.position.set(...at);
  part.scale.set(...scale);
  part.rotation.set(...rotation);
  parent.add(part);
}

function curve(parent, points, radius, color, glossy = false, segments = 12) {
  const path = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)));
  add(parent, new T.TubeGeometry(path, segments, radius, 6, false), color, origin, unit, origin, glossy);
}

function hoop(
  parent,
  at,
  radius,
  wire,
  color,
  scale = unit,
  rotation = [Math.PI / 2, 0, 0],
  glossy = false
) {
  add(parent, new T.TorusGeometry(radius, wire, 6, 32), color, at, scale, rotation, glossy);
}

function ringShell(levels, segments, point) {
  const xyz = [],
    indices = [];
  for (let j = 0; j < levels; j++) {
    for (let i = 0; i < segments; i++) {
      xyz.push(...point(j, (i * tau) / segments));
      if (j === levels - 1) continue;
      const a = j * segments + i,
        b = j * segments + ((i + 1) % segments);
      indices.push(a, a + segments, b, b, a + segments, b + segments);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bake(source, materials) {
  const result = new T.Group();
  source.updateMatrixWorld(true);
  for (const glossy of [false, true]) {
    const parts = [];
    source.traverse((part) => {
      if (!part.geometry || part.userData.glossy !== glossy) return;
      const geo = part.geometry.clone();
      for (const attr of Object.keys(geo.attributes)) {
        if (attr !== 'position' && attr !== 'normal' && attr !== 'color') geo.deleteAttribute(attr);
      }
      const n = geo.getAttribute('position').count;
      if (!geo.index) geo.setIndex(Array.from({ length: n }, (_, i) => i));
      if (!geo.hasAttribute('color')) {
        const tint = new T.Color(part.userData.color);
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) tint.toArray(colors, i * 3);
        geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      }
      geo.applyMatrix4(part.matrixWorld);
      parts.push(geo);
    });
    if (!parts.length) continue;
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    result.add(new T.Mesh(merged, glossy ? materials.gloss : materials.matte));
  }
  return result;
}

function dinnerRoll(g) {
  const loaf = new T.SphereGeometry(1, 48, 28);
  const p = loaf.attributes.position,
    colors = [];
  const pale = new T.Color('#eab770'),
    baked = new T.Color('#975028'),
    crumb = new T.Color('#ffe2a3'),
    tint = new T.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const bump = 1 + 0.037 * Math.cos(3 * x + z) * Math.sin(5 * z - x);
    p.setXYZ(
      i,
      x * 0.45 * bump,
      (y < -0.58 ? -0.58 + (y + 0.58) * 0.22 : y) * 0.34 - 0.05,
      z * 0.4 * bump
    );
    tint
      .copy(pale)
      .lerp(baked, Math.min(1, Math.max(0, y * 0.91 + Math.cos(9 * x + z) * Math.cos(5 * z) * 0.12)));
    // Scored seams follow the expanding crust, with pale crumb and a darker toasted lip.
    if (y > 0.12) {
      for (const seam of [-0.45, 0, 0.45]) {
        const u = x + z * 0.28;
        const d = z - 0.36 * x + 0.083 * x * x - seam;
        const falloff = Math.max(0, 1 - (u / (0.62 - Math.abs(seam) * 0.34)) ** 2);
        tint.lerp(crumb, Math.exp(-Math.pow(d / (0.075 * falloff + 0.0001), 2)) * falloff);
      }
    }
    colors.push(tint.r, tint.g, tint.b);
  }
  loaf.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  loaf.computeVertexNormals();
  add(g, loaf, '#eab770');
  // Coarse salt set into the crust.
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39,
      r = 0.43 + 0.22 * Math.sin(i * 4.3);
    const x = r * Math.cos(a),
      z = r * Math.sin(a);
    add(
      g,
      bead,
      i % 3 ? '#eee0bd' : '#c39758',
      [x * 0.45, Math.sqrt(1 - r * r) * 0.34 - 0.049, z * 0.4],
      [0.012, 0.009, 0.01],
      [0, a, 0]
    );
  }
}

function cranberryCan(g) {
  const radius = 0.315,
    silver = '#bec7be',
    bone = '#ffeab7';
  add(g, new T.CylinderGeometry(radius, radius, 0.53, 32), '#969e95', [0, -0.022, 0], unit, origin, true);
  add(g, new T.CylinderGeometry(radius + 0.005, radius + 0.005, 0.396, 32), '#80384a', [0, -0.021, 0]);
  add(g, new T.CylinderGeometry(radius + 0.008, radius + 0.008, 0.18, 32), bone, [0, -0.008, 0]);
  for (const y of [-0.286, -0.23, 0.185, 0.244])
    hoop(g, [0, y, 0], radius, 0.016, silver, unit, undefined, true);
  // Unmoulded jelly still holds the ridges of the tin.
  add(g, new T.CylinderGeometry(0.244, 0.272, 0.127, 28), '#a42646', [0, 0.292, 0], unit, origin, true);
  add(g, ball, '#bb3854', [0, 0.353, 0], [0.244, 0.055, 0.243], origin, true);
  for (const y of [0.277, 0.313]) hoop(g, [0, y, 0], 0.259, 0.011, '#ce5364', unit, undefined, true);
  const lid = new T.Group();
  g.add(lid);
  lid.position.set(0, 0.383, -0.328);
  lid.rotation.x = 0.89;
  add(lid, ball, '#bbc3bc', [0, 0, 0], [0.246, 0.013, 0.208], origin, true);
  hoop(lid, [0, 0.01, 0], 0.177, 0.006, '#86958c', [1, 1.15, 1], undefined, true);
  hoop(lid, [0, 0.026, -0.05], 0.062, 0.012, '#78877f', [0.67, 1.15, 1], undefined, true);
  const label = [
    '110 100 111 110',
    '101 100 101 101',
    '110 100 101 110',
    '100 100 101 100',
    '100 111 111 100',
  ];
  // PLOP is printed on opposite sides so it flashes into view as the can spins.
  const ink = [];
  for (const offset of [0, Math.PI]) {
    label.forEach((row, j) =>
      [...row].forEach((cell, i) => {
        if (cell !== '1') return;
        const a = (i - 7) * 0.072 + offset,
          y = (2 - j) * 0.024 - 0.008;
        for (const [u, v] of [
          [-0.036, -0.012],
          [-0.036, 0.012],
          [0.036, -0.012],
          [0.036, -0.012],
          [-0.036, 0.012],
          [0.036, 0.012],
        ])
          ink.push(0.328 * Math.sin(a + u), y + v, 0.328 * Math.cos(a + u));
      })
    );
  }
  const letters = new T.BufferGeometry();
  letters.setAttribute('position', new T.Float32BufferAttribute(ink, 3));
  // The right-handed cylinder front faces positive Z.
  const order = [];
  for (let i = 0; i < ink.length / 3; i += 3) order.push(i + 2, i + 1, i);
  letters.setIndex(order);
  letters.computeVertexNormals();
  add(g, letters, '#512f37');
}

function brusselsSprout(g) {
  add(g, ball, '#87aa50', [0, 0.01, 0], [0.246, 0.286, 0.245]);
  const shades = ['#558448', '#608642', '#739647', '#81a853', '#96b259', '#6e974c'];
  for (let i = 0; i < 6; i++) {
    const a = (i * tau) / 6 + 0.18,
      radial = [Math.cos(a), Math.sin(a)],
      tangent = [-Math.sin(a), Math.cos(a)];
    const pt = (t, s) => {
      const w = 0.227 * Math.pow(Math.sin(Math.PI * t), 0.71);
      const r = 0.14 + 0.197 * Math.sin(Math.PI * t) - s * s * 0.081 * Math.sin(Math.PI * t) - 0.039 * t;
      const offset = s * w + 0.044 * Math.sin((t * Math.PI) / 1.15);
      return [
        radial[0] * r + tangent[0] * offset,
        -0.263 + t * (0.55 + 0.047 * Math.sin(i * 3.2)) - 0.039 * Math.abs(s) * Math.sin(t * Math.PI),
        radial[1] * r + tangent[1] * offset,
      ];
    };
    const verts = [],
      idx = [];
    for (let j = 0; j <= 8; j++)
      for (let k = 0; k <= 6; k++) {
        verts.push(...pt(j / 8, (k - 3) / 3));
        if (j < 8 && k < 6) {
          const n = j * 7 + k;
          idx.push(n, n + 7, n + 1, n + 1, n + 7, n + 8);
        }
      }
    const patch = new T.BufferGeometry();
    patch.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    patch.setIndex(idx);
    patch.computeVertexNormals();
    add(g, patch, shades[i]);
    const vein = (t, s) => {
      const p = pt(t, s);
      p[0] += 0.007 * radial[0];
      p[2] += 0.007 * radial[1];
      return p;
    };
    curve(g, [vein(0.08, 0), vein(0.35, 0), vein(0.58, 0), vein(0.78, 0)], 0.008, '#aec876', false, 7);
    for (const s of [-1, 1])
      curve(g, [vein(0.29, 0), vein(0.39, s * 0.42), vein(0.51, s * 0.79)], 0.0045, '#a7bc6b', false, 5);
  }
  add(g, bead, '#cace8a', [0, -0.276, 0], [0.095, 0.048, 0.094]);
  // Crooked, opaque cartoon stink lines retain their silhouette against sky and grass.
  for (const side of [-1, 1])
    curve(
      g,
      [
        [side * 0.08, 0.27, 0],
        [side * 0.145, 0.34, 0.005],
        [side * 0.11, 0.405, 0.012],
        [side * 0.16, 0.475, 0.022],
      ],
      0.012,
      side < 0 ? '#a7d259' : '#d5cb76',
      false,
      9
    );
}

function gravyBoat(g) {
  const ivory = '#f4ead4',
    mint = '#2b7875',
    rim = '#e7b76d';
  const profile = [
    [0.025, 0.18],
    [0.41, 0.18],
    [0.64, 0.24],
    [0.86, 0.37],
    [1, 0.59],
    [0.99, 0.635],
    [0.92, 0.618],
    [0.81, 0.43],
    [0.32, 0.255],
    [0.015, 0.25],
  ];
  const contour = (r, y, a) => {
    const spout = Math.pow(Math.max(0, -Math.cos(a)), 8) * Math.max(0, (y - 0.32) / 0.315);
    return [
      0.62 * r * Math.cos(a) - 0.205 * spout,
      y + 0.172 * spout,
      0.346 * r * Math.sin(a) * (1 - 0.36 * spout),
    ];
  };
  const section = (j, a) => contour(...profile[j], a);
  add(g, ringShell(profile.length, 40, section), ivory, origin, unit, origin, true);
  for (const [y, r, wire, c] of [
    [0.622, 1, 0.019, rim],
    [0.572, 0.983, 0.012, mint],
  ]) {
    const pts = Array.from({ length: 49 }, (_, i) => contour(r, y, (tau * i) / 48));
    curve(g, pts, wire, c, true, 48);
  }
  const sauce = [
    [0.015, 0.547],
    [0.88, 0.547],
    [0.86, 0.554],
    [0.015, 0.554],
  ];
  add(
    g,
    ringShell(sauce.length, 36, (j, a) => contour(...sauce[j], a)),
    '#8b4728',
    origin,
    unit,
    origin,
    true
  );
  add(g, ball, ivory, [0, 0.125, 0], [0.395, 0.109, 0.245], origin, true);
  add(g, ball, mint, [0, 0.067, 0], [0.45, 0.054, 0.265], origin, true);
  add(g, ball, ivory, [0, 0.038, 0], [0.475, 0.038, 0.28], origin, true);
  curve(
    g,
    [
      [0.5, 0.6, 0],
      [0.68, 0.687, 0],
      [0.825, 0.619, 0],
      [0.836, 0.472, 0],
      [0.707, 0.354, 0],
      [0.49, 0.343, 0],
    ],
    0.055,
    ivory,
    true,
    19
  );
  for (const side of [-1, 1]) {
    add(g, ball, mint, [-0.058, 0.445, side * 0.312], [0.149, 0.132, 0.036], origin, true);
    add(g, butterBlock, '#fff4dc', [-0.058, 0.45, side * 0.348], [0.13, 0.049, 0.018], origin, true);
    add(g, butterBlock, '#fff4dc', [-0.058, 0.45, side * 0.349], [0.048, 0.133, 0.018], origin, true);
  }
  for (const [x, z, a] of [
    [0.15, 0.06, 0.6],
    [-0.22, -0.025, -0.45],
    [-0.055, 0.12, 0.27],
  ])
    add(g, bead, '#91a361', [x, 0.558, z], [0.039, 0.006, 0.013], [0, a, 0]);
}

function shoes(g) {
  for (const side of [-1, 1]) {
    const shoe = new T.Group();
    g.add(shoe);
    shoe.position.set(side * 0.25, 0, side * 0.095);
    shoe.rotation.y = side * 0.22;
    const shape = (radius, y, a) => {
      const z = Math.cos(a);
      return [-radius * 0.213 * Math.sin(a) * (1 + 0.16 * z), y, radius * 0.505 * z + 0.006];
    };
    const sole = [
      [0.03, 0.036],
      [0.89, 0.03],
      [1.03, 0.055],
      [1.05, 0.139],
      [0.99, 0.159],
      [0.015, 0.155],
    ];
    add(
      shoe,
      ringShell(sole.length, 32, (j, a) => shape(...sole[j], a)),
      '#f4e2b7'
    );
    const upper = [
      [0.9, 0.146],
      [1, 0.159],
      [0.986, 0.202],
      [0.84, 0.275],
      [0.53, 0.32],
      [0.01, 0.33],
    ];
    add(
      shoe,
      ringShell(upper.length, 32, (j, a) => {
        const p = shape(...upper[j], a);
        p[1] += (1 - Math.cos(a)) * 0.085 * (j / 5);
        return p;
      }),
      '#30736e'
    );
    add(shoe, ball, '#183e40', [0, 0.351, -0.19], [0.129, 0.067, 0.166]);
    add(shoe, butterBlock, '#f1ae40', [0, 0.364, 0.05], [0.182, 0.08, 0.285], [-0.24, 0, 0], true);
    add(shoe, butterBlock, '#ffe389', [0, 0.403, 0.039], [0.173, 0.041, 0.26], [-0.24, 0, 0], true);
    for (let j = 0; j < 3; j++) {
      const z = 0.064 + j * 0.089;
      curve(
        shoe,
        [
          [-0.11, 0.377 - j * 0.018, z],
          [0, 0.44 - j * 0.044, z - 0.022],
          [0.118, 0.374 - j * 0.018, z + 0.016],
        ],
        0.014,
        '#f8eed3',
        false,
        6
      );
    }
    for (const flank of [-1, 1]) {
      const pts = [
        [flank * 0.182, 0.24, -0.22],
        [flank * 0.204, 0.212, -0.08],
        [flank * 0.214, 0.207, 0.045],
        [flank * 0.195, 0.25, 0.21],
      ];
      curve(shoe, pts, 0.022, '#e5b447', false, 8);
    }
    // Little butter drips down the heel counter.
    add(shoe, bead, '#f8cd65', [side * 0.173, 0.257, -0.189], [0.046, 0.067, 0.037], origin, true);
    add(shoe, bead, '#f7cf6b', [side * 0.19, 0.194, -0.175], [0.026, 0.049, 0.026], origin, true);
    for (let j = 0; j < 4; j++)
      add(shoe, butterBlock, '#42615b', [0, 0.025, -0.31 + j * 0.217], [0.31, 0.05, 0.052]);
    curve(
      shoe,
      [
        [-0.05, 0.322, -0.423],
        [-0.048, 0.457, -0.463],
        [0.048, 0.453, -0.462],
        [0.049, 0.323, -0.41],
      ],
      0.022,
      '#dda641',
      false,
      8
    );
  }
  g.scale.setScalar(1.27);
}

function wishbone(g) {
  const cream = '#f1d79d',
    teal = '#57d5bf',
    gold = '#d99a4a';
  // A real Y silhouette, with rounded bone knuckles and a burgundy kitchen grip.
  curve(
    g,
    [
      [0, 0, 0.245],
      [0, 0, 0.08],
      [0, 0.002, -0.12],
      [0, 0.001, -0.208],
    ],
    0.037,
    '#853f43',
    false,
    10
  );
  add(g, ball, '#d69856', [0, 0, 0.243], [0.04, 0.04, 0.015], origin, true);
  for (let i = 0; i < 6; i++) hoop(g, [0, 0, 0.15 - i * 0.043], 0.039, 0.0054, '#d28b79', unit, origin);
  for (const z of [0.194, -0.125]) hoop(g, [0, 0, z], 0.04, 0.01, gold, unit, origin, true);
  for (const side of [-1, 1]) {
    curve(
      g,
      [
        [0, 0, -0.16],
        [side * 0.044, -0.007, -0.233],
        [side * 0.13, -0.018, -0.324],
        [side * 0.209, 0.001, -0.411],
        [side * 0.26, 0.067, -0.495],
      ],
      0.025,
      cream,
      true,
      16
    );
    add(g, ball, '#fae8bd', [side * 0.26, 0.067, -0.495], [0.039, 0.046, 0.04], origin, true);
    hoop(
      g,
      [side * 0.239, 0.039, -0.463],
      0.026,
      0.009,
      gold,
      unit,
      [0, side * -0.58, side * -0.55],
      true
    );
  }
  const muzzle = (t, r = 1) => [Math.sin(t) * 0.252 * r, 0.048 + Math.cos(t) * 0.126 * r, -0.502];
  const lips = Array.from({ length: 41 }, (_, i) => muzzle((i * tau) / 40));
  curve(g, lips, 0.012, '#147d76', true, 40);
  const knot = [0, -0.012, -0.26];
  const inner = (a, t) => {
    const p = muzzle(a);
    return [
      p[0] * t,
      p[1] * t + knot[1] * (1 - t) - 0.018 * Math.sin(Math.PI * t),
      knot[2] + (p[2] - knot[2]) * t * t,
    ];
  };
  for (let j = 0; j < 12; j++) {
    const a = (j * tau) / 12;
    curve(g, [inner(a, 0.07), inner(a + 0.11, 0.34), inner(a, 0.68), muzzle(a)], 0.0035, teal, true, 8);
  }
  for (const r of [0.38, 0.68, 0.88]) {
    const weave = Array.from({ length: 25 }, (_, i) => inner((tau * i) / 24, r + (i % 2) * 0.018));
    curve(g, weave, 0.0035, '#9cebd2', true, 24);
  }
}

function cranberryPopper(g) {
  const tin = new T.Group();
  g.add(tin);
  tin.rotation.x = -Math.PI / 2;
  tin.position.z = -0.29;
  tin.scale.setScalar(0.58);
  cranberryCan(tin);
  add(g, butterBlock, '#884d38', [0, -0.04, 0.02], [0.078, 0.085, 0.36]);
  hoop(g, [0, 0, -0.14], 0.13, 0.018, '#d5a25c', unit, origin, true);
}

function butteredRollSling(g) {
  curve(g, [[0, 0, 0.23], [0, 0, -0.06], [0, 0.02, -0.22], [0, 0.04, -0.38]], 0.038, '#945c37');
  add(g, ball, '#c58b52', [0, 0.025, -0.4], [0.19, 0.065, 0.2]);
  const bun = new T.Group();
  g.add(bun);
  bun.scale.setScalar(0.44);
  bun.position.set(0, 0.14, -0.4);
  dinnerRoll(bun);
  add(g, butterBlock, '#ffda70', [0, 0.275, -0.4], [0.11, 0.029, 0.082], [0, 0.3, 0]);
}

function cornucopia(g) {
  // The taper curls up at the tip. Raised bands follow the wicker bell.
  const rings = [
    [0.014, 0.13, 0.20], [0.035, 0.057, 0.22], [0.065, 0, 0.15],
    [0.095, -0.012, 0.02], [0.135, 0.005, -0.13],
    [0.18, 0.04, -0.28], [0.23, 0.09, -0.43],
  ];
  add(g, ringShell(rings.length, 36, (i, a) => {
    const [r, y, z] = rings[i];
    return [r * Math.cos(a), y + r * Math.sin(a), z];
  }), '#aa622d');
  for (const [r, y, z] of rings)
    hoop(g, [0, y, z], r, 0.013, '#efb955', unit, origin, true);
  add(g, ball, '#583528', [0, 0.09, -0.419], [0.223, 0.223, 0.012]);
  for (let i = 0; i < 10; i++) {
    const a = tau * i / 10;
    curve(g, rings.map(([r, y, z]) =>
      [r * Math.cos(a + z), y + r * Math.sin(a + z), z]), 0.006, '#d89444');
  }
}

function harvest(g) {
  for (let i = 0; i < 8; i++) {
    const a = i * tau / 8;
    add(g, ball, i % 2 ? '#ef9835' : '#eead44',
      [0.18 * Math.cos(a), 0, 0.18 * Math.sin(a)], [0.22, 0.31, 0.22], origin, true);
  }
  curve(g, [[0, 0.23, 0], [0, 0.34, 0], [0.06, 0.39, 0]], 0.044, '#755334');
  add(g, ball, '#739741', [-0.082, 0.31, 0], [0.13, 0.018, 0.062], [0.1, 0.25, -0.22]);
  hoop(g, origin, 0.48, 0.014, '#ffdb79', unit, [0.9, 0.42, 0.3], true);
}

function cranberry(g) {
  add(g, ball, '#a72347', origin, [0.2, 0.23, 0.2], origin, true);
  add(g, bead, '#623d37', [0, 0.224, 0], [0.039, 0.017, 0.039]);
}

function widePickup(g) {
  const relic = new T.Group();
  g.add(relic);
  wishbone(relic);
  relic.scale.setScalar(2.66);
  relic.rotation.set(0.96, 0, -0.23);
  const box = new T.Box3(),
    vertex = new T.Vector3();
  relic.updateMatrixWorld(true);
  relic.traverse((p) => {
    if (!p.geometry) return;
    const positions = p.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      box.expandByPoint(vertex.fromBufferAttribute(positions, i).applyMatrix4(p.matrixWorld));
  });
  relic.position.y = -box.min.y;
  relic.position.z = -(box.min.z + box.max.z) / 2;
}

export function createFoodFightArt() {
  const materials = {
    matte: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
    gloss: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.31, metalness: 0.08 }),
  };
  const makers = {
    roll: dinnerRoll,
    can: cranberryCan,
    sprout: brusselsSprout,
    health: gravyBoat,
    speed: shoes,
    wide: widePickup,
    caster: wishbone,
    popper: cranberryPopper,
    sling: butteredRollSling,
    berry: cranberry,
    cornucopia,
    harvest,
  };
  const templates = new Map();
  function instance(kind) {
    if (!templates.has(kind)) {
      const source = new T.Group();
      makers[kind](source);
      const template = bake(source, materials);
      template.name = kind;
      templates.set(kind, template);
    }
    return templates.get(kind).clone();
  }
  return {
    projectile: instance,
    pickup: instance,
    tool: instance,
    dispose() {
      for (const template of templates.values()) template.children.forEach((m) => m.geometry.dispose());
      templates.clear();
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
