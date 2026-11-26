import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { caster } from './models.js';

// Paired rows of barbs branch from the shaft. A mipmapped tile lets those
// strokes resolve into a soft sheen when the bird gets small on a phone.
function featherGrain() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const across = Math.abs(2 * x / (size - 1) - 1), along = y / size;
    const vein = along * 28 - across * (2.5 + 1.2 * along) + 0.10 * Math.sin(19 * along + 4 * across);
    const fine = Math.cos(vein * Math.PI * 2);
    const shade = (x < 4 && y < 4) ? 255 : 244 - 30 * Math.max(0, fine) ** 6 + 9 * fine;
    pixels.set([shade, shade, shade, 255], 4 * (y * size + x));
  }
  const map = new T.DataTexture(pixels, size, size);
  map.magFilter = T.LinearFilter;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}
const plumage = new T.MeshStandardMaterial({
  map: featherGrain(), vertexColors: true, roughness: 0.64, side: T.DoubleSide,
});
const sphere = new T.SphereGeometry(1, 14, 9);
const identity = [0, 0, 0];
const unit = [1, 1, 1];
const rigs = new WeakMap();
const v = (xyz) => new T.Vector3(...xyz);

// Bake each independently animated part once. Individual feather vanes, caruncles
// and toes then cost the same number of draw calls as a simple jointed figure.
function colored(parts, source, color, at = identity, scale = unit, rotation = identity) {
  const geometry = source.clone();
  geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
  const rgb = new T.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.scale(...scale);
  const turn = new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation));
  geometry.applyMatrix4(turn);
  geometry.translate(...at);
  parts.push(geometry);
}

function oval(parts, color, at, size, rotation) {
  colored(parts, sphere, color, at, size, rotation);
}

function tube(parts, color, points, radius, segments = 9) {
  const line = new T.CatmullRomCurve3(points.map(v));
  colored(parts, new T.TubeGeometry(line, segments, radius, 7, false), color);
}

function mesh(parts) {
  const baked = mergeGeometries(parts);
  const result = new T.Mesh(baked, plumage);
  result.castShadow = true;
  return result;
}

// Last row of each band, then its color. Tail bars are spaced closer near the
// root and end in the broad charcoal subterminal bar and pale Merriam-style tip.
const tailBars = [
  [0.20, '#413024'], [0.28, '#885335'], [0.32, '#4d352b'], [0.40, '#96623e'],
  [0.44, '#5a3d31'], [0.53, '#a16a43'], [0.57, '#674432'], [0.66, '#a6754c'],
  [0.70, '#684432'], [0.77, '#b17d52'], [0.87, '#3a302d'], [0.96, '#efce9d'], [1, '#f6dfbb'],
];
const flightBars = [
  [0.27, '#44372d'], [0.34, '#ceaa85'], [0.44, '#534238'], [0.52, '#dcc5a4'],
  [0.62, '#574437'], [0.70, '#e2ccaa'], [0.80, '#574538'], [0.88, '#e2c9a7'], [1, '#514437'],
];
const bronze = [[0.44, '#4b3530'], [0.70, '#915a37'], [0.83, '#b98754'], [0.94, '#344342'], [1, '#292c2b']];
const mantle = [[0.48, '#3a4038'], [0.71, '#766544'], [0.84, '#b58d59'], [0.94, '#815533'], [1, '#322e30']];
const chest = [[0.40, '#403133'], [0.69, '#68514c'], [0.81, '#52615c'], [0.91, '#91734f'], [1, '#302b2e']];

function feather(parts, start, end, across, outward, halfWidth, bars, tint = 1) {
  const origin = v(start), shaft = v(end).sub(origin), axis = shaft.clone().normalize();
  const side = v(across);
  side.addScaledVector(axis, -side.dot(axis)).normalize();
  const normal = axis.clone().cross(side);
  const reverse = normal.dot(v(outward)) < 0;
  if (reverse) normal.negate();
  const xyz = [], rgb = [], uv = [], indices = [];
  const columns = [-1, -0.045, 0, 0.045, 1];
  function row(t, color) {
    const width = halfWidth * (0.12 + 0.88 * Math.sin(0.64 * Math.PI * t)) *
      Math.sqrt(Math.max(0.07, 1 - Math.pow(t, 13)));
    for (const u of columns) {
      const edge = Math.abs(u), bell = Math.sin(t * Math.PI);
      const pos = origin.clone().addScaledVector(shaft, t + bell * edge * 0.041)
        .addScaledVector(side, u * width)
        .addScaledVector(normal, halfWidth * (0.05 + 0.32 * bell + 0.22 * (1 - edge * edge)));
      xyz.push(pos.x, pos.y, pos.z);
      uv.push((u + 1) * 0.5, t);
      const c = new T.Color(color).multiplyScalar(tint * (0.88 + 0.13 * (1 - edge) + u * 0.05));
      if (u === 0) c.lerp(new T.Color('#ead0a9'), (1 - t) * 0.52);
      rgb.push(c.r, c.g, c.b);
    }
  }
  let prev = 0;
  for (const [t, color] of bars) {
    const startIndex = xyz.length / 3;
    row(prev, color);
    if (t - prev > 0.22) row((prev + t) * 0.5, color);
    if (prev < 0.97 && t === 1) row(0.975, color);
    row(t, color);
    const strips = (xyz.length / 3 - startIndex) / columns.length - 1;
    for (let y = 0; y < strips; y++) for (let x = 0; x < columns.length - 1; x++) {
      const i = startIndex + y * columns.length + x, j = i + columns.length;
      if (!reverse) indices.push(i, j, i + 1, j, j + 1, i + 1);
      else indices.push(i, i + 1, j, j, i + 1, j + 1);
    }
    prev = t;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(rgb, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  parts.push(geometry);
}

function torso() {
  const parts = [];
  oval(parts, '#453932', [0, 0.45, 0], [0.217, 0.245, 0.345]);
  const surface = (a, p, r) => [r * 0.217 * Math.sin(p) * Math.sin(a), 0.45 + r * 0.245 * Math.cos(p), -r * 0.345 * Math.sin(p) * Math.cos(a)];
  for (let row = 0; row < 4; row++) {
    const count = 11 + row * 2, p = 0.36 + row * 0.38;
    for (let i = 0; i < count; i++) {
      const a = (i + (row % 2) * 0.5) * 2 * Math.PI / count;
      const out = [Math.sin(p) * Math.sin(a), Math.cos(p), -Math.sin(p) * Math.cos(a)];
      feather(parts, surface(a, p, 1.015), surface(a, p + 0.65, 1.08), [Math.cos(a), 0, Math.sin(a)], out,
        0.062 + row * 0.003, Math.cos(a) > 0.40 ? chest : row % 2 ? mantle : bronze, 0.94 + 0.08 * Math.cos(a * 3));
    }
  }
  // The dark hair-like breast beard is specific to a tom.
  for (let i = -2; i <= 2; i++) {
    tube(parts, i % 2 ? '#403739' : '#28282b', [[i * 0.006, 0.49, -0.334], [i * 0.008, 0.40, -0.346], [i * 0.009, 0.31 + 0.006 * Math.abs(i), -0.334]], 0.005);
  }
  return mesh(parts);
}

function tail() {
  const parts = [];
  for (let i = -8; i <= 8; i++) {
    const a = i * 0.150, s = Math.sin(a), c = Math.cos(a);
    const len = 0.58 + 0.022 * c;
    feather(parts, [s * 0.021, 0, 0], [s * len, c * len * 0.90, 0.15 + c * 0.12], [c, -s, 0], [0, 0, 1], 0.064, tailBars, 0.90 + (i + 8) % 3 * 0.046);
  }
  for (let i = -6; i <= 6; i++) {
    const a = i * 0.19, s = Math.sin(a), c = Math.cos(a);
    feather(parts, [s * 0.018, 0, 0.024], [s * 0.33, c * 0.29, 0.15 + c * 0.056], [c, -s, 0], [0, 0, 1], 0.055, bronze);
  }
  return mesh(parts);
}

function wing(sign) {
  const parts = [], out = [sign, 0.33, 0];
  oval(parts, '#534038', [sign * 0.011, -0.071, 0.071], [0.063, 0.110, 0.205], [-0.28, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    feather(parts, [sign * 0.022, -0.045 + 0.057 * f, 0.003 + f * 0.022],
      [sign * (0.036 + 0.032 * f), -0.19 + 0.12 * f, 0.20 + 0.17 * f], [0, 1, 0], out, 0.037, flightBars, 0.91 + f * 0.1);
  }
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    feather(parts, [sign * 0.035, 0.03, -0.066 + f * 0.17],
      [sign * (0.065 + 0.017 * Math.sin(f * Math.PI)), -0.15 + f * 0.13, 0.034 + f * 0.22], [0, 0, 1], out, 0.043, i % 2 ? bronze : mantle);
  }
  return mesh(parts);
}

function head() {
  const parts = [];
  // Neck and head in one continuous tapered profile, with a curled dewlap below the chin.
  const rings = [
    [-0.126, 0.048, 0.097, 0.111, '#42322e'], [-0.060, 0.026, 0.098, 0.106, '#5e3a32'],
    [0, 0, 0.082, 0.088, '#87443a'], [0.065, -0.028, 0.063, 0.075, '#ab4941'],
    [0.13, -0.046, 0.056, 0.065, '#c95049'], [0.192, -0.048, 0.048, 0.054, '#c85856'],
    [0.244, -0.047, 0.048, 0.056, '#9b7877'], [0.275, -0.052, 0.052, 0.062, '#79aaa9'],
    [0.30, -0.066, 0.054, 0.072, '#9acaca'],
  ];
  const xyz = [], rgb = [], indices = [], n = 18;
  for (const [j, [y, z, rx, rz, color]] of rings.entries()) {
    for (let i = 0; i < n; i++) {
      const a = i * 2 * Math.PI / n;
      xyz.push(Math.sin(a) * rx, y, z + Math.cos(a) * rz);
      const c = new T.Color(color).multiplyScalar(0.84 + 0.14 * Math.sin(a) ** 2 + 0.05 * Math.cos(a * 7 + j * 1.5));
      rgb.push(c.r, c.g, c.b);
      if (!j) continue;
      const k = j * n + i, l = j * n + (i + 1) % n;
      indices.push(k - n, l - n, k, l - n, l, k);
    }
  }
  const neck = new T.BufferGeometry();
  neck.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
  neck.setAttribute('color', new T.Float32BufferAttribute(rgb, 3));
  neck.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array((xyz.length / 3) * 2), 2));
  neck.setIndex(indices);
  neck.computeVertexNormals();
  parts.push(neck);
  for (let i = 0; i < 13; i++) {
    const a = i * Math.PI * 2 / 13, x = Math.sin(a), z = Math.cos(a);
    feather(parts, [x * 0.067, 0.007, z * 0.071], [x * 0.116, -0.11, 0.043 + z * 0.131],
      [z, 0, -x], [x, 0, z], 0.034, mantle, 0.91 + 0.08 * Math.cos(a));
  }
  oval(parts, '#a4c5bf', [0, 0.321, -0.075], [0.063, 0.068, 0.084], [0.13, 0, 0]);
  oval(parts, '#bbcfc4', [0, 0.356, -0.072], [0.056, 0.037, 0.061]);
  oval(parts, '#b83c39', [0, 0.180, -0.110], [0.037, 0.096, 0.028], [-0.10, 0, 0]);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      oval(parts, i % 2 ? '#c64945' : '#d7574d', [sign * (0.037 + 0.006 * Math.sin(i)), 0.096 + i * 0.024, -0.095 + 0.004 * i], [0.018, 0.024, 0.020]);
    }
    oval(parts, '#739b9b', [sign * 0.053, 0.331, -0.103], [0.015, 0.029, 0.030]);
    oval(parts, '#3c2926', [sign * 0.064, 0.338, -0.105], [0.009, 0.018, 0.018]);
    oval(parts, '#c18445', [sign * 0.069, 0.338, -0.107], [0.008, 0.014, 0.013]);
    oval(parts, '#171c20', [sign * 0.074, 0.339, -0.108], [0.006, 0.011, 0.009]);
    oval(parts, '#fff4de', [sign * 0.078, 0.345, -0.112], [0.0025, 0.0035, 0.0035]);
  }
  // The upper bill hooks down over the shorter lower mandible.
  oval(parts, '#a87745', [0, 0.298, -0.148], [0.034, 0.019, 0.047], [-0.09, 0, 0]);
  const beak = new T.ConeGeometry(1, 1, 12);
  colored(parts, beak, '#deba79', [0, 0.310, -0.170], [0.037, 0.096, 0.029], [-1.74, 0, 0]);
  tube(parts, '#bb4542', [[0.006, 0.369, -0.111], [0.003, 0.351, -0.141], [0.014, 0.320, -0.161], [0.022, 0.292, -0.162]], 0.012);
  oval(parts, '#c04a46', [0.022, 0.288, -0.162], [0.013, 0.019, 0.013]);
  return mesh(parts);
}

function leg() {
  const parts = [];
  oval(parts, '#514038', [0, -0.003, 0], [0.050, 0.085, 0.054]);
  tube(parts, '#a46659', [[0, -0.005, 0], [0, -0.105, 0.030], [0, -0.191, 0.019], [0, -0.256, -0.006]], 0.013);
  for (let i = 0; i < 4; i++) {
    oval(parts, '#bc8472', [0, -0.134 - i * 0.023, 0.027 - i * 0.007], [0.0152, 0.007, 0.014]);
  }
  for (const [x, z] of [[-0.052,-0.073], [0,-0.108], [0.055,-0.069], [0.010,0.040]]) {
    tube(parts, '#ab7665', [[0, -0.245, -0.004], [x * 0.43, -0.263, z * 0.43], [x * 0.87, -0.264, z * 0.87]], 0.0085, 5);
    tube(parts, '#766352', [[x * 0.83, -0.264, z * 0.83], [x * 0.94, -0.264, z * 0.94], [x, -0.267, z]], 0.0045, 4);
  }
  return mesh(parts);
}

export function createTurkeyAvatar() {
  const root = new T.Group(), body = new T.Group();
  const neck = head(), fan = tail(), wings = [], legs = [];
  root.name = 'Wild turkey';
  root.add(body);
  body.add(torso(), neck, fan);
  neck.position.set(0, 0.664, -0.243);
  fan.position.set(0, 0.373, 0.194);
  for (const side of [-1, 1]) {
    const folded = wing(side), foot = leg();
    folded.position.set(side * 0.195, 0.544, -0.111);
    foot.position.set(side * 0.091, 0.273, 0.015);
    body.add(folded);
    root.add(foot);
    wings.push(folded);
    legs.push(foot);
  }
  const net = caster();
  net.position.set(0.254, 0.428, -0.140);
  net.scale.setScalar(0.75);
  body.add(net);
  rigs.set(root, { body, neck, fan, wings, legs, net, phase: 0, lastTime: null });
  return root;
}

// The game sets root pose and ground height. speed and lift are in meters per
// second and meters respectively; cast is the 0–1 capture recoil envelope.
export function animateTurkeyAvatar(group, { time = 0, speed = 0, lift = 0, cast = 0 } = {}) {
  const rig = rigs.get(group);
  if (!rig) return;
  const { body, neck, fan, wings, legs, net } = rig;
  const dt = rig.lastTime === null ? 0 : T.MathUtils.clamp(time - rig.lastTime, 0, 0.08);
  rig.lastTime = time;
  const gait = T.MathUtils.clamp(speed / 7.2, 0, 1);
  rig.phase += dt * Math.min(18, 4 + speed * 0.85);
  const stride = Math.sin(rig.phase), breath = Math.sin(time * 2.2);
  const air = T.MathUtils.smoothstep(lift, 0, 0.65), recoil = T.MathUtils.clamp(cast, 0, 1);
  const step = gait * (1 - air);
  body.position.y = Math.abs(stride) * step * 0.029 + 0.003 * breath;
  body.rotation.set(-0.047 * gait + 0.036 * recoil, 0, 0.033 * step * stride);
  neck.rotation.set(-0.065 * stride * step + 0.022 * breath + 0.131 * recoil, 0.24 * Math.sin(time * 0.90) * (1 - gait), 0);
  fan.rotation.set(0.10 * gait + 0.024 * breath - 0.07 * recoil, 0.033 * stride * step, -0.038 * stride * step);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1, swing = side * stride;
    legs[i].rotation.x = -0.60 * swing * step - 0.56 * air;
    legs[i].position.y = 0.273 + 0.033 * Math.max(0, swing) * step;
    wings[i].rotation.z = side * (0.038 + 0.015 * breath + 0.09 * gait + air * (0.83 + 0.5 * Math.sin(time * 14)));
    wings[i].rotation.y = side * air * 0.98;
    wings[i].rotation.x = -0.055 * swing * step - 0.10 * recoil;
  }
  net.position.z = -0.14 + recoil * 0.09;
  net.rotation.x = -0.10 + 0.03 * stride * step + recoil * 0.33;
}
