import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sphere = new T.SphereGeometry(1, 10, 8);
const farSphere = new T.SphereGeometry(1, 6, 4);
const taper = new T.CylinderGeometry(0.83, 1, 1, 10);
const boot = new T.BoxGeometry(1, 1, 1);
const up = new T.Vector3(0, 1, 0);
// Duplicate the cloth's back so both sides have outward-facing normals.
function pennantPanel(points, front) {
  const panel = new T.BufferGeometry();
  panel.setAttribute(
    'position',
    new T.Float32BufferAttribute([...points, ...points].flat(), 3)
  );
  panel.setIndex([
    ...front,
    ...front.map((i) => i + points.length).reverse()
  ]);
  panel.computeVertexNormals();
  return panel;
}
const cuffTop = [0.035, -0.009, 0.004],
  cuffBottom = [0.016, -0.147, 0.006];
const pennantStripe = pennantPanel(
  [[0, 0, 0], [-0.03, -0.155, 0.002], cuffTop, cuffBottom],
  [0, 1, 2, 1, 3, 2]
);
const pennantCloth = pennantPanel(
  [
    cuffTop,
    cuffBottom,
    [0.142, -0.032, -0.016],
    [0.13, -0.104, -0.014],
    [0.285, -0.083, 0.034]
  ],
  [0, 1, 2, 1, 3, 2, 2, 3, 4]
);
const coats = [
  0x933533, 0x35645c, 0xd3a048, 0x486989, 0x886687, 0xa75e38, 0xd2c7a6,
  0x344a59,
];
const scarves = [0xe1b557, 0xbd5842, 0x53625a, 0xefe3cf, 0x6b343c];
const skins = [0xc78360, 0xe5b18e, 0x895d48, 0xb77952, 0xe1a57c, 0x674737];
const hair = [0x48312b, 0x2f2524, 0x9b7952, 0x66544a, 0xb4a598];
const trousers = [0x323e50, 0x51443c, 0x4e5147];

// Build each outfit once. The head, coat, boots and mittens share one draw per crowd variant.
export function spectator(index, detailed, rig) {
  const parts = [];
  let waving = false;
  let joint = 0;
  function pivot(name, at, parent = 0) {
    if (!rig) return 0;
    const bone = new T.Bone();
    bone.name = name;
    bone.position.set(...at).sub(rig.origins[parent]);
    rig.bones[parent].add(bone);
    rig.origins.push(new T.Vector3(...at));
    joint = rig.bones.push(bone) - 1;
    return joint;
  }
  function part(shape, color, position, scale, rotation) {
    const geometry = shape.clone();
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(
      new T.Matrix4().compose(position, rotation || new T.Quaternion(), scale)
    );
    const rgb = new T.Color(color),
      colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    const count = geometry.attributes.position.count;
    if (rig) {
      const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
      for (let i = 0; i < count * 4; i += 4) {
        indices[i] = joint;
        weights[i] = 1;
      }
      geometry.setAttribute('skinIndex', new T.BufferAttribute(indices, 4));
      geometry.setAttribute('skinWeight', new T.BufferAttribute(weights, 4));
    } else {
      geometry.setAttribute('waving', new T.Float32BufferAttribute(new Float32Array(count).fill(Number(waving)), 1));
    }
    parts.push(geometry);
  }
  const v = (x, y, z) => new T.Vector3(x, y, z);
  // Near the curb a felt pennant turns with the same elbow as its mitten.
  // The bent tip and contrasting hoist stripe read from either side.
  function pennant(wrist, field) {
    const [x, y, z] = wrist;
    limb(
      0x976d42,
      [x - 0.017, y - 0.09, z + 0.02],
      [x + 0.071, y + 0.375, z + 0.02],
      0.009
    );
    const tip = v(x + 0.067, y + 0.357, z + 0.022);
    part(pennantStripe, 0xf2d7a0, tip, v(1, 1, 1));
    part(pennantCloth, field, tip, v(1, 1, 1));
  }
  function oval(c, x, y, z, w, h, d) {
    part(detailed ? sphere : farSphere, c, v(x, y, z), v(w, h, d));
  }
  function limb(c, a, b, r, depth = 1) {
    const first = v(...a),
      last = v(...b),
      dir = last.clone().sub(first);
    part(
      taper,
      c,
      first.clone().lerp(last, 0.5),
      v(r, dir.length(), r * depth),
      new T.Quaternion().setFromUnitVectors(up, dir.normalize())
    );
  }
  const coat = coats[index % coats.length],
    scarf = scarves[index % scarves.length],
    skin = skins[index % skins.length],
    pants = trousers[index % 3];
  for (const sign of [-1, 1]) {
    const x = 0.114 * sign,
      footZ = rig ? 0 : 0.045 * sign;
    const side = sign === 1 ? 'R' : 'L';
    if (rig) {
      const hip = pivot('hip' + side, [x * 0.82, 0.84, 0]);
      limb(pants, [x, 0.46, 0.015], [x * 0.82, 0.84, 0], 0.097);
      pivot('knee' + side, [x, 0.46, 0.015], hip);
      oval(pants, x, 0.46, 0.015, 0.085, 0.083, 0.086);
      limb(pants, [x, 0.12, 0], [x, 0.46, 0.015], 0.087);
    } else limb(pants, [x, 0.12, footZ], [x * 0.82, 0.84, 0], 0.095);
    oval(0x3a312f, x, 0.078, footZ + 0.048, 0.085, 0.079, 0.145);
    // A mitten at the end of each sleeve, with some spectators raising one arm.
    const waves = !rig && sign === 1 && index % 3 !== 0;
    const elbow = [sign * (waves ? 0.34 : 0.28), waves ? 1.27 : 1.02, 0.04];
    const wrist = [
      sign * (waves ? 0.43 : 0.22),
      waves ? 1.52 : 0.88,
      waves ? 0.092 : 0.15,
    ];
    const shoulder = [sign * 0.19, 1.28, 0];
    const upper = pivot('arm' + side, shoulder);
    if (rig) oval(coat, ...shoulder, 0.092, 0.09, 0.096);
    limb(coat, shoulder, elbow, 0.084);
    const lower = pivot('elbow' + side, elbow, upper);
    if (rig) oval(coat, ...elbow, 0.075, 0.078, 0.073);
    waving = waves;
    limb(coat, elbow, wrist, 0.071);
    oval(scarf, ...wrist, 0.064, 0.082, 0.055);
    if (waves && detailed) pennant(wrist, index % 2 ? 0x903f27 : 0xc69032);
    if (rig && sign === 1) {
      pivot('hand', wrist, lower);
      if (rig.item === 'cup') {
        part(taper, 0xc18a63, v(0.22, 0.92, 0.215), v(0.046, 0.12, 0.046));
        part(taper, 0xf6e6c8, v(0.22, 0.986, 0.215), v(0.046, 0.016, 0.046));
      } else if (rig.item === 'bottle') {
        oval(0x55959a, 0.22, 0.92, 0.217, 0.042, 0.098, 0.042);
        part(taper, 0xeedcc0, v(0.22, 1.023, 0.217), v(0.026, 0.026, 0.026));
      } else if (rig.item !== 'parcel') {
        part(boot, 0x2b3240, v(0.22, 0.94, 0.19), v(0.081, 0.154, 0.014));
        part(boot, 0x94cad1, v(0.22, 0.94, 0.181), v(0.067, 0.129, 0.005));
        oval(0x111822, 0.244, 0.998, 0.2, 0.009, 0.009, 0.003);
      }
    }
    waving = false;
  }
  joint = 0;
  if (rig?.item === 'parcel') {
    pivot('parcel', [0, 1.08, 0.3]);
    part(boot, 0xbc8856, v(0, 1.08, 0.31), v(0.4, 0.25, 0.3));
    part(boot, 0xe1bf86, v(0, 1.083, 0.31), v(0.066, 0.252, 0.303));
    part(boot, 0xf6e7c7, v(-0.11, 1.208, 0.32), v(0.095, 0.005, 0.064));
    joint = 0;
  }
  if (rig && rig.item !== 'parcel') {
    const leftElbow = rig.bones.findIndex((bone) => bone.name === 'elbowL');
    pivot('sandwich', [-0.22, 0.9, 0.18], leftElbow);
    oval(0xdba863, -0.22, 0.92, 0.215, 0.079, 0.033, 0.07);
    oval(0x68814a, -0.22, 0.945, 0.215, 0.078, 0.014, 0.071);
    oval(0xe4b77a, -0.22, 0.97, 0.215, 0.08, 0.027, 0.071);
    joint = 0;
  }
  if (rig?.item === 'case') {
    pivot('luggage', [0, 0, 0]);
    // A telescoping handle connects the traveler's trailing hand to the wheeled case.
    for (const x of [-0.31, -0.22]) {
      limb(0xc5bac0, [x, 0.48, -0.24], [x, 0.88, 0.13], 0.012);
      oval(0x342d37, x, 0.06, -0.42, 0.045, 0.057, 0.054);
    }
    part(boot, 0x9a4b36, v(-0.27, 0.29, -0.33), v(0.28, 0.45, 0.23));
    for (const x of [-0.35, -0.26, -0.18])
      part(boot, 0xc37d58, v(x, 0.29, -0.449), v(0.015, 0.36, 0.012));
    joint = 0;
  }
  part(taper, coat, v(0, 1.04, 0), v(0.256, 0.54, 0.163));
  oval(coat, 0, 1.285, 0, 0.228, 0.106, 0.145);
  oval(scarf, 0, 1.347, 0.004, 0.139, 0.075, 0.12);
  part(boot, scarf, v(-0.081, 1.217, 0.144), v(0.075, 0.214, 0.028));
  if (detailed)
    for (const y of [0.91, 1.02, 1.13])
      oval(0x443b32, 0, y, 0.156, 0.014, 0.013, 0.009);
  pivot('head', [0, 1.35, 0]);
  oval(skin, 0, 1.507, 0.005, 0.122, 0.16, 0.113);
  if (detailed) oval(skin, 0, 1.488, 0.112, 0.031, 0.04, 0.031);
  const hairColor = hair[index % hair.length];
  oval(hairColor, 0, 1.565, -0.025, 0.127, 0.111, 0.11);
  if (rig) {
    oval(0x915c50, 0, 1.447, 0.108, 0.033, 0.007, 0.005);
    for (const side of [-1, 1])
      oval(hairColor, side * 0.05, 1.55, 0.104, 0.026, 0.006, 0.006);
  }
  if (detailed)
    for (const sign of [-1, 1]) {
      oval(skin, sign * 0.119, 1.498, 0.004, 0.025, 0.041, 0.025);
      oval(0x3d302c, sign * 0.05, 1.531, 0.104, 0.013, 0.012, 0.008);
    }
  if (index % 4 !== 3) {
    oval(scarf, 0, 1.606, -0.004, 0.135, 0.104, 0.124);
    part(taper, scarf, v(0, 1.583, 0), v(0.138, 0.052, 0.127));
    if (index % 2 === 0) oval(scarf, 0, 1.715, -0.013, 0.046, 0.045, 0.047);
  }
  const joined = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return joined;
}

const cloth = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });

export function residentFigure(index, item) {
  const root = new T.Bone();
  const rig = { bones: [root], origins: [new T.Vector3()], item };
  const model = new T.SkinnedMesh(spectator(index, true, rig), cloth);
  model.add(root);
  model.bind(new T.Skeleton(rig.bones));
  model.boundingSphere = new T.Sphere(new T.Vector3(0, 0.86, 0), 1.12);
  const joints = Object.fromEntries(rig.bones.map((bone) => [bone.name, bone]));
  function pose(time, { stride, activity, progress, carrying }, walking, glance) {
    const step = Math.sin(stride) * walking;
    const breath = Math.sin(time * 2.1 + index);
    const lift = Math.min(1, progress * 7, (1 - progress) * 7);
    const sip = activity === 'sip' ? lift * (0.5 - 0.5 * Math.cos(progress * 4 * Math.PI)) : 0;
    const photo = activity === 'photo' ? lift : 0;
    const read = activity === 'read' ? lift : 0;
    const wave = activity === 'greet' ? lift : 0;
    const reach = activity === 'mail' ? lift * Math.sin(progress * Math.PI) : 0;
    const lunch = activity === 'lunch' ? lift : 0;
    const bite = lunch * (0.5 - 0.5 * Math.cos(progress * 4 * Math.PI));
    const handoff = activity === 'deliver' || activity === 'collect' ? Math.sin(progress * Math.PI) : 0;
    joints.hipL.rotation.x = 0.49 * step;
    joints.hipR.rotation.x = -0.49 * step;
    joints.kneeL.rotation.x = Math.max(0, -Math.cos(stride)) * walking * 0.6;
    joints.kneeR.rotation.x = Math.max(0, Math.cos(stride)) * walking * 0.6;
    joints.armL.rotation.x = item === 'case' ? 0 : -0.36 * step - photo * 1.33 - reach * 1.47;
    const leftWave = item === 'case' ? 0 : wave;
    joints.elbowL.rotation.x = -0.1 - photo * 1.28 - leftWave * 1.42;
    joints.armL.rotation.z = -leftWave * (1.55 + 0.14 * Math.sin(time * 6));
    joints.armL.rotation.y = photo * 0.68;
    joints.armR.rotation.x = 0.32 * step - photo * 1.28 - sip * 1.15 - read * 0.57;
    joints.armR.rotation.y = -0.55 * (photo + sip + read);
    joints.elbowR.rotation.x = -0.12 - photo * 1.06 - sip * 1.6 - read * 1.18;
    if (item === 'case') {
      joints.armR.rotation.z = wave * (1.38 + 0.12 * Math.sin(time * 5));
      joints.elbowR.rotation.x -= wave * 1.22;
    }
    joints.armL.rotation.x -= lunch * 0.65 + bite * 0.73;
    joints.elbowL.rotation.x -= lunch * 0.7 + bite * 0.88;
    joints.armL.rotation.y += bite * 0.45;
    if (joints.sandwich) joints.sandwich.scale.setScalar(lunch);
    if (joints.parcel) {
      const hold = Number(carrying);
      joints.parcel.scale.setScalar(hold);
      joints.parcel.position.z = 0.3 + handoff * 0.12;
      joints.armR.rotation.x = joints.armL.rotation.x = -0.42 * hold - handoff * 0.4;
      joints.elbowR.rotation.x = joints.elbowL.rotation.x = -0.7 * hold;
    }
    joints.hand.rotation.x = -(joints.armR.rotation.x + joints.elbowR.rotation.x) - sip * 0.5 + read * 0.34;
    joints.head.rotation.set(0.31 * read + 0.2 * reach - 0.15 * sip + breath * 0.018, glance, 0.035 * wave);
    // The supporting knee is straight. Lower the pelvis as that leg extends
    // fore or aft so the shoe continues to meet the pavement.
    root.position.y = -0.76 * (1 - Math.cos(0.49 * step));
    if (joints.luggage) joints.luggage.position.y = -root.position.y;
  }
  return { model, pose };
}
