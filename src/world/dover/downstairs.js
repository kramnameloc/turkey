import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { randomSeed } from '../../maps/obstacles.js';
import { BODY_RADIUS } from '../../player/turkey-scale.js';

const width = 8.4, depth = 10.4, ceiling = 2.72;
const soffitBottom = 2.37;
export const downstairsHeadroom = soffitBottom - 0.12;

// These footprints drive the carpet contact shading, movement and floor plan.
const post = { x: -1.22, z: -1.25, w: 0.26, d: 0.26 };
const sofa = { x: -3.56, z: -0.95, w: 1.05, d: 2.62 };
const ottoman = { x: -2.12, z: 0.48, w: 1.24, d: 1.03 };
const media = { x: 3.89, z: 0.62, w: 0.51, d: 2.36 };
const footrest = { x: 1.22, z: 0.62, w: 0.71, d: 1.10 };
const gymBag = { x: -3.34, z: -4.79, w: 0.50, d: 0.50 };
const bench = { x: -2.25, z: -4.80, w: 0.74, d: 0.56 };
const cupboard = { x: 3.04, z: -4.75, w: 1.78, d: 0.87 };
const pedestal = { x: 0, z: -2.75, w: 1.31, d: 1.31 };
const furniture = [post, sofa, ottoman, media, footrest, gymBag, bench, cupboard, pedestal];

export function downstairsBlocked(x, z) {
  if (Math.abs(x) > width / 2 - BODY_RADIUS || Math.abs(z) > depth / 2 - BODY_RADIUS)
    return true;
  return furniture.some((item) => {
    const dx = Math.max(0, Math.abs(x - item.x) - item.w / 2);
    const dz = Math.max(0, Math.abs(z - item.z) - item.d / 2);
    return dx * dx + dz * dz < BODY_RADIUS * BODY_RADIUS;
  });
}

export function drawDownstairsPlan(ctx) {
  ctx.fillStyle = '#877764';
  ctx.fillRect(-width / 2, -depth / 2, width, depth);
  ctx.fillStyle = '#524b45';
  for (const { x, z, w, d } of furniture) ctx.fillRect(x - w / 2, z - d / 2, w, d);
}

// Bake the nap and the soft shadows into the one visible floor surface.
function carpet() {
  const canvas = document.createElement('canvas');
  canvas.width = 840;
  canvas.height = 1040;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  const rng = randomSeed(735);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const nap = (rng() + rng() - 1) * 28;
    pixels.data[i] = 179 + nap;
    pixels.data[i + 1] = 148 + nap;
    pixels.data[i + 2] = 118 + nap;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(100, 100);
  for (const { x, z, w, d } of furniture) {
    ctx.save();
    ctx.translate(x, z);
    ctx.scale(w * 0.77 + 0.12, d * 0.77 + 0.12);
    const shade = ctx.createRadialGradient(0, 0, 0.25, 0, 0, 1);
    shade.addColorStop(0, '#44342bbb');
    shade.addColorStop(1, '#44342b00');
    ctx.fillStyle = shade;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return new T.MeshStandardMaterial({ map, roughness: 1 });
}

// A softly edged shaft from the high window. The blind breaks up the top
// of the beam as it crosses the upholstery and carpet.
function windowLight(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = '#fff';
  ctx.fillRect(19, 44, 90, 40);
  ctx.fillStyle = '#444';
  for (let y = 46; y < 64; y += 5) ctx.fillRect(17, y, 94, 2.4);
  const sun = new T.SpotLight('#fff0d5', 42, 16, 0.38, 0.45, 1);
  sun.map = new T.CanvasTexture(canvas);
  sun.position.set(-7.8, 3.35, 2.85);
  sun.target.position.set(-0.5, 0.32, -2.28);
  scene.add(sun, sun.target);
}

function stipple() {
  const size = 64;
  const grain = new Uint8Array(size * size);
  const rng = randomSeed(119);
  for (let i = 0; i < grain.length; i++) grain[i] = rng() * 255;
  const texture = new T.DataTexture(grain, size, size, T.RedFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(12, 6);
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const paint = (color) => new T.MeshStandardMaterial({ color, roughness: 0.86 });
const cube = new T.BoxGeometry();
function part(parent, geometry, material, x, y, z) {
  const object = new T.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
function box(parent, material, x, y, z, w, h, d) {
  const object = part(parent, cube, material, x, y, z);
  object.scale.set(w, h, d);
  return object;
}
function cushion(parent, material, x, y, z, w, h, d, radius) {
  return part(parent, new RoundedBoxGeometry(w, h, d, 2, radius), material, x, y, z);
}

function panelDoor(scene, x, z, heading, ajar, c) {
  const frame = new T.Group();
  frame.position.set(x, 0, z);
  frame.rotation.y = heading;
  scene.add(frame);
  for (const side of [-1, 1]) box(frame, c.trim, side * 0.478, 1.025, 0.025, 0.086, 2.05, 0.08);
  box(frame, c.trim, 0, 2.095, 0.025, 1.042, 0.09, 0.08);
  // Recess the lining behind the opening to give the ajar door a real reveal.
  box(frame, c.recess, 0, 1.025, -0.82, 0.96, 2.05, 0.08);
  for (const side of [-1, 1])
    box(frame, c.panel, side * 0.455, 1.025, -0.39, 0.04, 2.05, 0.78);
  box(frame, c.recess, 0, -0.02, -0.4, 0.87, 0.04, 0.80);
  box(frame, c.panel, 0, 2.075, -0.4, 0.87, 0.05, 0.80);
  const hinge = new T.Group();
  hinge.position.set(-0.435, 0, -0.055);
  hinge.rotation.y = ajar;
  frame.add(hinge);
  box(hinge, c.door, 0.43, 1.018, 0, 0.86, 2.014, 0.045);
  for (const [y, h] of [[0.5, 0.61], [1.32, 0.70], [1.81, 0.17]]) {
    for (const x of [0.225, 0.635]) {
      box(hinge, c.panel, x, y, 0.029, 0.292, h, 0.022);
      box(hinge, c.door, x, y, 0.047, 0.25, h - 0.045, 0.018);
    }
  }
  part(hinge, new T.SphereGeometry(0.039, 12, 8), c.hardware, 0.775, 0.94, 0.087);
}

function consoleTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function oakBoardMap() {
  return consoleTexture(512, 128, (ctx) => {
    const rng = randomSeed(918);
    ctx.fillStyle = '#a79a89';
    ctx.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 440; i++) {
      const x = rng() * 560 - 90, y = rng() * 128;
      const length = 18 + rng() * 280;
      ctx.strokeStyle = i % 3 ? '#47393121' : '#fff2d22c';
      ctx.lineWidth = 0.35 + rng() * 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length * 0.4, y - 3, x + length * 0.64, y + rng() * 4, x + length, y);
      ctx.stroke();
    }
  });
}

function tvGlass() {
  const map = consoleTexture(512, 288, ctx => {
    const sky = ctx.createLinearGradient(0, 0, 160, 288);
    sky.addColorStop(0, '#222931');
    sky.addColorStop(0.55, '#11151c');
    sky.addColorStop(1, '#24262b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 288);
    ctx.save();
    ctx.filter = 'blur(13px)';
    ctx.fillStyle = '#a0b0c010';
    ctx.fillRect(390, 110, 68, 60);
    ctx.fillStyle = '#b8a99712';
    ctx.fillRect(65, 226, 232, 28);
    ctx.restore();
    for (const [x, y] of [[160, 80], [412, 43]]) {
      const reflection = ctx.createRadialGradient(x, y, 0, x, y, 19);
      reflection.addColorStop(0, '#e5d9ba85');
      reflection.addColorStop(0.25, '#c6bcb041');
      reflection.addColorStop(1, '#adadab00');
      ctx.fillStyle = reflection;
      ctx.fillRect(x - 19, y - 19, 38, 38);
    }
  });
  return new T.MeshBasicMaterial({ map });
}

function mediaWall(parent, c) {
  const unit = new T.Group();
  unit.name = 'Downstairs TV and fireplace';
  unit.position.set(media.x, 0, media.z);
  unit.rotation.y = -Math.PI / 2; // Screen faces the sofa across the room.
  parent.add(unit);
  const oak = new T.MeshStandardMaterial({ map: oakBoardMap(), roughness: 0.8 });
  const glass = new T.MeshStandardMaterial({ color: '#737b92', transparent: true, opacity: 0.48, roughness: 0.28, depthWrite: false });
  const blueEdge = new T.MeshBasicMaterial({ color: '#579bff' });
  const backMap = consoleTexture(16, 128, ctx => {
    const wash = ctx.createLinearGradient(0, 0, 0, 128);
    wash.addColorStop(0, '#302d33');
    wash.addColorStop(0.24, '#293580');
    wash.addColorStop(0.48, '#254bee');
    wash.addColorStop(0.53, '#243c9c');
    wash.addColorStop(1, '#494759');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 16, 128);
  });
  const litBack = new T.MeshBasicMaterial({ map: backMap });
  box(unit, c.recess, 0, 0.034, 0, 2.21, 0.068, 0.43);
  box(unit, oak, 0, 0.09, 0, 2.32, 0.044, 0.48);
  box(unit, oak, 0, 0.718, 0, media.d, 0.05, media.w);
  for (const side of [-1, 1]) {
    for (const x of [0.435, 1.135])
      box(unit, oak, x * side, 0.403, 0, 0.582, 0.05, 0.48).rotation.z = Math.PI / 2;
    const x = side * 0.785;
    box(unit, litBack, x, 0.403, -0.222, 0.65, 0.582, 0.024);
    box(unit, glass, x, 0.381, 0.005, 0.65, 0.013, 0.41);
    box(unit, blueEdge, x, 0.381, 0.213, 0.65, 0.009, 0.006);
    const shelfLight = new T.PointLight('#365dff', 0.74, 0.78);
    shelfLight.position.set(x, 0.49, -0.12);
    unit.add(shelfLight);
  }
  // The firebox uses only the photographed insert, rectified into its own frame.
  box(unit, c.black, 0, 0.403, 0.019, 0.818, 0.58, 0.39);
  const logs = new T.TextureLoader().load('/scenery/dover-firebox.jpg');
  logs.colorSpace = T.SRGBColorSpace;
  logs.anisotropy = 4;
  part(unit, new T.PlaneGeometry(0.765, 0.453), new T.MeshBasicMaterial({ map: logs }), 0, 0.368, 0.218);
  for (let i = 0; i < 4; i++)
    box(unit, c.recess, 0, 0.622 + i * 0.015, 0.22, 0.64, 0.0055, 0.009);

  // The pedestal, screen and tabletop electronics sit at distinct depths.
  cushion(unit, c.black, 0, 0.756, 0.016, 0.47, 0.024, 0.20, 0.009);
  box(unit, c.black, 0, 0.811, -0.034, 0.13, 0.09, 0.075);
  cushion(unit, c.black, 0, 1.208, -0.04, 1.23, 0.707, 0.056, 0.012);
  part(unit, new T.PlaneGeometry(1.19, 0.662), tvGlass(), 0, 1.214, -0.009);
  cushion(unit, c.black, -0.99, 0.856, 0, 0.115, 0.224, 0.12, 0.018);
  box(unit, c.recess, -0.99, 0.855, 0.064, 0.088, 0.172, 0.009);
  const remote = cushion(unit, c.black, -0.73, 0.758, 0.082, 0.064, 0.024, 0.128, 0.008);
  remote.rotation.y = -0.28;
  cushion(unit, c.black, 0.876, 0.801, 0, 0.41, 0.114, 0.31, 0.012);
  box(unit, c.recess, 0.86, 0.812, 0.159, 0.31, 0.009, 0.007);
  cushion(unit, c.black, 0.885, 0.894, -0.002, 0.16, 0.066, 0.10, 0.03);
  for (const side of [-1, 1]) {
    cushion(unit, c.black, 0.885 + side * 0.065, 0.877, 0.031, 0.055, 0.051, 0.10, 0.024).rotation.y = -side * 0.29;
    part(unit, new T.CylinderGeometry(0.012, 0.009, 0.013, 10), c.recess, 0.885 + side * 0.039, 0.928, -0.002);
  }

  // Storage on the lit glass shelves.
  for (let i = 0; i < 3; i++)
    cushion(unit, i === 1 ? c.panel : c.recess, -0.78, 0.134 + i * 0.039, 0.02, 0.46 - i * 0.02, 0.039, 0.32, 0.009).rotation.y = i * 0.04;
  const jar = new T.CylinderGeometry(0.056, 0.051, 0.145, 20);
  const rim = new T.CylinderGeometry(0.055, 0.055, 0.013, 20);
  for (const [i, tint] of ['#783a49', '#a85443', '#9d817e', '#dac0a8'].entries()) {
    const x = 0.545 + i * 0.153;
    part(unit, jar, paint(tint), x, 0.46, 0.06);
    part(unit, rim, c.hardware, x, 0.539, 0.06);
    box(unit, c.door, x, 0.459, 0.115, 0.055, 0.053, 0.003);
  }
  part(unit, new T.SphereGeometry(0.098, 24, 16), paint('#c8c7dc'), 0.88, 0.21, 0.075);

  // White access panel, wall plates and the cord descending behind the TV.
  box(unit, c.trim, -0.76, 1.03, -0.289, 0.81, 0.64, 0.027);
  box(unit, c.door, -0.76, 1.03, -0.268, 0.75, 0.58, 0.018);
  for (const x of [0.29, 0.425]) box(unit, c.trim, x, 1.76, -0.289, 0.077, 0.125, 0.022);
  box(unit, c.black, 0.425, 1.758, -0.263, 0.036, 0.056, 0.045);
  const cord = new T.CatmullRomCurve3([
    new T.Vector3(0.425, 1.735, -0.253), new T.Vector3(0.427, 1.63, -0.244),
    new T.Vector3(0.458, 1.455, -0.23), new T.Vector3(0.39, 0.749, -0.16),
  ]);
  part(unit, new T.TubeGeometry(cord, 14, 0.005, 6, false), c.black, 0, 0, 0);
}

function quilt(parent, fabric) {
  // The throw lies over the top, rounds the front lip and hangs in soft folds.
  const across = 48, along = 40;
  const cloth = new T.PlaneGeometry(1, 1, across, along);
  const vertices = cloth.attributes.position;
  for (let j = 0; j <= along; j++) {
    const length = j / along * 1.37;
    const bend = Math.min(Math.PI / 2, Math.max(0, (length - 0.91) / 0.08));
    const drop = Math.max(0, length - 0.91 - 0.08 * Math.PI / 2);
    for (let i = 0; i <= across; i++) {
      const u = i / across;
      const fold = Math.cos(u * 31 + length * 1.7) * 0.008 + Math.sin(u * 52 - length) * 0.004;
      const hem = drop * (0.045 * Math.sin(u * 20) + 0.09 * (u - 0.5));
      const x = (u - 0.5) * 1.13 + length * 0.025;
      const y = 0.575 - 0.08 * (1 - Math.cos(bend)) - drop + hem + fold * Math.cos(bend);
      const z = -0.46 + Math.min(length, 0.91) + 0.08 * Math.sin(bend) + (0.016 + fold + drop * 0.08) * Math.sin(bend);
      vertices.setXYZ(j * (across + 1) + i, x, y, z);
    }
  }
  cloth.computeVertexNormals();
  fabric.side = T.DoubleSide;
  part(parent, cloth, fabric, ottoman.x, 0, ottoman.z);
}

function stringLights(scene, c) {
  const points = [];
  // Follow the face of the bulkhead, then wind down the square post.
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    points.push(new T.Vector3(-4.15 + 2.93 * t, 2.59 - 0.115 * Math.abs(Math.sin(t * Math.PI * 2)), -1.015));
  }
  for (let i = 1; i <= 85; i++) {
    const t = i / 85, angle = t * 5 * Math.PI;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    const reach = 0.153 / Math.max(Math.abs(dx), Math.abs(dz));
    points.push(new T.Vector3(post.x + dx * reach, 2.59 - 2.46 * t, post.z + dz * reach));
  }
  const path = new T.CurvePath();
  for (let i = 1; i < points.length; i++) path.add(new T.LineCurve3(points[i - 1], points[i]));
  part(scene, new T.TubeGeometry(path, 165, 0.005, 5, false), c.cord, 0, 0, 0);
  const bulbs = new T.InstancedMesh(new T.SphereGeometry(1, 8, 8), c.bulb, 32);
  const stamp = new T.Object3D();
  stamp.scale.set(0.014, 0.026, 0.014);
  for (let i = 0; i < bulbs.count; i++) {
    path.getPoint((i + 0.5) / bulbs.count, stamp.position);
    stamp.position.y -= 0.022;
    stamp.updateMatrix();
    bulbs.setMatrixAt(i, stamp.matrix);
  }
  scene.add(bulbs);
}

export function furnishDownstairs(scene) {
  const c = {
    wall: paint('#a1b6c2'), ceiling: paint('#eeebe6'), trim: paint('#eeeae0'),
    door: paint('#dcdcd4'), panel: paint('#bebfb7'), recess: paint('#383c40'),
    hardware: paint('#77736a'), linen: paint('#b5a590'), seat: paint('#c9b9a2'),
    red: paint('#ad3747'), seam: paint('#923142'), wood: paint('#826445'),
    black: paint('#202228'), stripe: paint('#626d6b'),
    cord: paint('#887d71'), bulb: new T.MeshBasicMaterial({color: '#fff2ce'}),
  };
  const grain = stipple();
  for (const finish of [c.ceiling, c.wall, c.linen, c.seat, c.red]) {
    finish.bumpMap = grain;
    finish.bumpScale = 0.0016;
  }
  scene.background = new T.Color('#34383a');
  scene.add(new T.HemisphereLight('#fff8f0', '#d6cdc0', 1.66));
  const daylight = new T.DirectionalLight('#f0f7ff', 1.05);
  daylight.position.set(-4.5, 5, 2.7);
  daylight.castShadow = true;
  Object.assign(daylight.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, far: 18 });
  daylight.shadow.camera.updateProjectionMatrix();
  daylight.shadow.mapSize.set(1024, 1024);
  daylight.shadow.normalBias = 0.014;
  // The architecture and furniture casting this window light are stationary.
  daylight.shadow.autoUpdate = false;
  daylight.shadow.needsUpdate = true;
  windowLight(scene);
  const bounce = new T.PointLight('#e9f4ff', 6, 9);
  bounce.position.set(-3.4, 1.55, 0.6);
  scene.add(bounce);
  const fill = new T.PointLight('#ffebd3', 4, 7);
  fill.position.set(2.5, 1.35, -3.25);
  scene.add(fill);
  scene.add(daylight);
  part(scene, new T.PlaneGeometry(width, depth).rotateX(-Math.PI / 2), carpet(), 0, 0, 0).receiveShadow = true;
  box(scene, c.ceiling, 0, ceiling + 0.06, 0, width, 0.12, depth);
  for (const side of [-1, 1]) {
    box(scene, c.wall, side * 4.26, ceiling / 2, 0, 0.12, ceiling, depth);
    box(scene, c.trim, side * 4.18, 0.057, 0, 0.04, 0.114, depth);
  }
  // Build the end walls between the jambs so an open leaf reveals actual depth.
  for (const [z, doors] of [[-5.2, [-1.27, 0.64]], [5.2, [0]]]) {
    let left = -4.2;
    for (const right of [...doors.map(x => x - 0.435), 4.2]) {
      const x = (left + right) / 2, w = right - left;
      box(scene, c.wall, x, ceiling / 2, z + Math.sign(z) * 0.06, w, ceiling, 0.12);
      box(scene, c.trim, x, 0.057, z - Math.sign(z) * 0.021, w, 0.114, 0.042);
      left = right + 0.87;
    }
    for (const x of doors) {
      box(scene, c.wall, x, (ceiling + 2.05) / 2, z + Math.sign(z) * 0.06, 0.87, ceiling - 2.05, 0.12);
      panelDoor(scene, x, z, z > 0 ? Math.PI : 0, x === 0.64 ? 0.86 : 0, c);
    }
  }
  const soffitHeight = ceiling - soffitBottom;
  box(scene, c.wall, 0, ceiling - soffitHeight / 2, post.z, width, soffitHeight, 0.44);
  box(scene, c.trim, post.x, soffitBottom / 2, post.z, 0.20, soffitBottom, 0.20);
  box(scene, c.trim, post.x, 0.058, post.z, post.w, 0.116, post.d);
  stringLights(scene, c);

  const bezel = new T.CylinderGeometry(0.112, 0.112, 0.017, 28);
  const lens = new T.CylinderGeometry(0.085, 0.085, 0.01, 28);
  for (const [x, z] of [[-2.6, 1.1], [1.9, 2.1], [1.7, -3.2]]) {
    part(scene, bezel, c.trim, x, ceiling - 0.009, z);
    part(scene, lens, c.bulb, x, ceiling - 0.022, z);
    const light = new T.SpotLight('#ffe6c7', 9, 8, 1.22, 0.8);
    light.position.set(x, ceiling - 0.03, z);
    light.target.position.set(x, 0, z);
    scene.add(light, light.target);
  }

  // High daylight window with a deep sill and half-raised slatted blind.
  box(scene, c.trim, -4.17, 1.85, 0.3, 0.09, 0.86, 1.78);
  box(scene, new T.MeshBasicMaterial({ color: '#d7e7e9' }), -4.11, 1.85, 0.3, 0.045, 0.70, 1.63);
  for (let i = 0; i < 5; i++)
    box(scene, c.door, -4.066, 2.17 - i * 0.062, 0.3, 0.047, 0.034, 1.66).rotation.z = 0.27;
  box(scene, c.trim, -4.10, 1.40, 0.3, 0.20, 0.06, 1.86);

  const furnishings = new T.Group();
  scene.add(furnishings);
  const couch = new T.Group();
  couch.position.set(sofa.x, 0, sofa.z);
  couch.rotation.y = Math.PI / 2;
  furnishings.add(couch);
  box(couch, c.wood, 0, 0.1, 0, 2.34, 0.20, 0.78);
  cushion(couch, c.linen, 0, 0.28, 0, 2.54, 0.30, 0.95, 0.09);
  for (const x of [-0.55, 0.55]) {
    cushion(couch, c.seat, x, 0.47, 0.085, 1.08, 0.20, 0.83, 0.08);
    cushion(couch, c.linen, x, 0.79, -0.34, 1.09, 0.69, 0.26, 0.10).rotation.x = -0.12;
  }
  for (const x of [-1.19, 1.19]) cushion(couch, c.linen, x, 0.54, 0, 0.24, 0.56, 1.04, 0.11);
  cushion(couch, c.stripe, 0.79, 0.72, -0.06, 0.49, 0.46, 0.18, 0.08).rotation.set(-0.2, -0.25, -0.2);
  // A cranberry throw over the upholstered footstool.
  box(furnishings, c.wood, ottoman.x, 0.08, ottoman.z, 1.04, 0.16, 0.83);
  cushion(furnishings, c.seam, ottoman.x, 0.30, ottoman.z, ottoman.w, 0.50, ottoman.d, 0.075);
  quilt(furnishings, c.red);

  mediaWall(furnishings, c);
  box(furnishings, c.wood, footrest.x, 0.06, footrest.z, 0.56, 0.12, 0.94);
  cushion(furnishings, c.seat, footrest.x, 0.29, footrest.z, footrest.w, 0.41, footrest.d, 0.09);

  part(furnishings, new T.CylinderGeometry(0.22, 0.25, 0.30, 24), c.black, gymBag.x, 0.15, gymBag.z);
  part(furnishings, new T.CylinderGeometry(0.073, 0.09, 0.36, 16), c.recess, gymBag.x, 0.48, gymBag.z);
  part(furnishings, new T.CapsuleGeometry(0.19, 0.69, 5, 24), c.red, gymBag.x, 1.12, gymBag.z);
  box(furnishings, c.trim, bench.x, 0.245, bench.z, bench.w, 0.49, bench.d);
  cushion(furnishings, c.seat, bench.x, 0.525, bench.z, bench.w, 0.075, bench.d, 0.032);
  for (let i = -2; i <= 2; i++)
    box(furnishings, c.stripe, bench.x + i * 0.138, 0.564, bench.z, 0.052, 0.008, bench.d - 0.06);

  box(furnishings, c.wood, cupboard.x, 0.39, cupboard.z, cupboard.w, 0.78, cupboard.d);
  box(furnishings, c.trim, cupboard.x, 0.81, cupboard.z, cupboard.w + 0.045, 0.06, cupboard.d + 0.035);
  for (const side of [-1, 1]) {
    const x = cupboard.x + side * 0.437;
    box(furnishings, c.door, x, 0.40, -4.30, 0.85, 0.69, 0.04);
    box(furnishings, c.hardware, x - side * 0.31, 0.58, -4.255, 0.045, 0.11, 0.05);
  }
  furnishings.traverse((item) => {
    if (item.isMesh) item.castShadow = item.receiveShadow = true;
  });
}
