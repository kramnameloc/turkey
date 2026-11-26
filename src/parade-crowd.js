import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSeed, segmentDistanceSq } from './field.js';

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
const material = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
});
const waveTime = { value: 0 };
material.onBeforeCompile = (shader) => {
  shader.uniforms.waveTime = waveTime;
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float waveTime;
      attribute float waving;
    `
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      float phase = dot(instanceMatrix[3].xz, vec2(.58,.76));
      float swing = waving * (.09 + .17*sin(waveTime*2.7 + phase));
      mat2 waveRotation = mat2(cos(swing), sin(swing), -sin(swing), cos(swing));
      objectNormal.xy = waveRotation * objectNormal.xy;
    `
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec2 elbow = vec2(.34,1.27);
      transformed.xy = elbow + waveRotation*(transformed.xy-elbow);
    `
    );
};
// The imported spectators are posed meshes. Weight their stride from hip to
// ankle so each foot can travel independently while the torso stays upright.
function walkingMaterial(source) {
  const walking = source.clone();
  walking.onBeforeCompile = (shader, renderer) => {
    source.onBeforeCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float stepSwing;'
      )
      .replace(
        '#include <project_vertex>',
        `
        float foot = 1.0 - smoothstep(0.03, 0.84, position.y);
        float legSwing = stepSwing * clamp(position.x / 0.085, -1.0, 1.0);
        transformed.z += legSwing * foot * 0.29;
        transformed.y += max(0.0, legSwing) * foot * 0.13;
        #include <project_vertex>
      `
      );
  };
  walking.customProgramCacheKey = () =>
    'spectator stride ' + source.customProgramCacheKey();
  return walking;
}

const coats = [
  0x933533, 0x35645c, 0xd3a048, 0x486989, 0x886687, 0xa75e38, 0xd2c7a6,
  0x344a59,
];
const scarves = [0xe1b557, 0xbd5842, 0x53625a, 0xefe3cf, 0x6b343c];
const skins = [0xc78360, 0xe5b18e, 0x895d48, 0xb77952, 0xe1a57c, 0x674737];
const hair = [0x48312b, 0x2f2524, 0x9b7952, 0x66544a, 0xb4a598];
const trousers = [0x323e50, 0x51443c, 0x4e5147];

// Build each outfit once. The head, coat, boots and mittens share one draw per crowd variant.
function spectator(index, detailed) {
  const parts = [];
  let waving = false;
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
    geometry.setAttribute(
      'waving',
      new T.Float32BufferAttribute(
        new Float32Array(colors.length / 3).fill(Number(waving)),
        1
      )
    );
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
      footZ = 0.045 * sign;
    oval(0x3a312f, x, 0.078, footZ + 0.048, 0.085, 0.079, 0.145);
    limb(pants, [x, 0.12, footZ], [x * 0.82, 0.84, 0], 0.095);
    // A mitten at the end of each sleeve, with some spectators raising one arm.
    const waves = sign === 1 && index % 3 !== 0;
    const elbow = [sign * (waves ? 0.34 : 0.28), waves ? 1.27 : 1.02, 0.04];
    const wrist = [
      sign * (waves ? 0.43 : 0.22),
      waves ? 1.52 : 0.88,
      waves ? 0.092 : 0.15,
    ];
    limb(coat, [sign * 0.19, 1.28, 0], elbow, 0.084);
    waving = waves;
    limb(coat, elbow, wrist, 0.071);
    oval(scarf, ...wrist, 0.064, 0.082, 0.055);
    if (waves && detailed) pennant(wrist, index % 2 ? 0x903f27 : 0xc69032);
    waving = false;
  }
  part(taper, coat, v(0, 1.04, 0), v(0.256, 0.54, 0.163));
  oval(coat, 0, 1.285, 0, 0.228, 0.106, 0.145);
  oval(scarf, 0, 1.347, 0.004, 0.139, 0.075, 0.12);
  part(boot, scarf, v(-0.081, 1.217, 0.144), v(0.075, 0.214, 0.028));
  oval(skin, 0, 1.507, 0.005, 0.122, 0.16, 0.113);
  if (detailed) {
    oval(skin, 0, 1.488, 0.112, 0.031, 0.04, 0.031);
    for (const y of [0.91, 1.02, 1.13])
      oval(0x443b32, 0, y, 0.156, 0.014, 0.013, 0.009);
  }
  const hairColor = hair[index % hair.length];
  oval(hairColor, 0, 1.565, -0.025, 0.127, 0.111, 0.11);
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

export function paradeCrowd(route, data, world, shade) {
  const crowd = new T.Group();
  crowd.name = 'Parade spectators';
  const random = randomSeed(41826),
    outfits = Array.from({ length: 10 }, () => []);
  const crossings = [
    ...data.roads.filter((r) => r.type !== 'Parking Lot'),
    ...data.paths.filter((r) => r.type === 'Cross-walk'),
  ].flatMap(({ points, width }) =>
    points.slice(1).map((b, i) => ({
      a: points[i],
      b,
      clearance: (width * 0.5 + 0.36) ** 2,
    }))
  );
  const sidewalks = [...data.paths, ...(world.frontWalks ?? [])].filter((p) =>
    p.type.includes('Sidewalk')
  );
  const people = [];
  for (const side of [-1, 1]) {
    for (let d = 3 + random() * 6; d < route.length; d += 12 + random() * 18) {
      const family = 2 + Math.floor(random() * 3);
      for (let i = 0; i < family; i++) {
        const along = d + i * (0.95 + random() * 0.27),
          center = route.sample(along);
        const p = route.sample(
          along,
          side * (center.width * 0.5 + 0.82 + random() * 1.05)
        );
        if (
          world.solids.occupied(p.x, p.z) ||
          crossings.some(
            ({ a, b, clearance }) =>
              segmentDistanceSq(p.x, p.z, ...a, ...b) < clearance
          )
        )
          continue;
        if (
          people.some(
            ({ model }) =>
              Math.hypot(p.x - model.position.x, p.z - model.position.z) < 0.72
          )
        )
          continue;
        const child = i === 1 && family > 2,
          scale = child ? 0.66 + random() * 0.14 : 0.91 + random() * 0.16;
        const obj = new T.Object3D();
        const onWalk = sidewalks.some(({ points, width }) =>
          points.some(
            (b, i) =>
              i &&
              segmentDistanceSq(p.x, p.z, ...points[i - 1], ...b) <
                (width * 0.49) ** 2
          )
        );
        obj.position.set(
          p.x,
          world.height(p.x, p.z) + (onWalk ? 0.08 : 0.006),
          p.z
        );
        obj.rotation.y = p.yaw - (side * Math.PI) / 2 + (random() - 0.5) * 0.65;
        obj.scale.set(scale * (0.93 + random() * 0.16), scale, scale);
        obj.updateMatrix();
        const height = scale * 1.7;
        obj.userData = { aimHeight: height * 0.55, labelHeight: height + 0.15 };
        const person = {
          name: 'Parade spectator',
          isParadeParticipant: true,
          model: obj,
          radius: 0.29 * scale,
          height,
          home: obj.position.clone(),
          homeYaw: obj.rotation.y,
          shadowIndex: people.length,
        };
        people.push(person);
        outfits[Math.floor(random() * outfits.length)].push(person);
      }
    }
  }
  const walking = walkingMaterial(material);
  const walkingPoses = new Map();
  const layers = outfits.map((outfit, i) => {
    // Six standing poses share the sidewalk with the original waving families.
    const person = world.streetModels?.get('Onlooker' + (i + 1))?.[0];
    if (person && !walkingPoses.has(person.material))
      walkingPoses.set(person.material, walkingMaterial(person.material));
    const near = new T.InstancedMesh(
      person ? person.geometry.clone() : spectator(i, true),
      person ? walkingPoses.get(person.material) : walking,
      outfit.length
    );
    const far = new T.InstancedMesh(
      spectator(i, false),
      walking,
      outfit.length
    );
    if (person) near.name = 'Street spectator ' + (i + 1);
    for (const people of [near, far]) {
      people.geometry.setAttribute(
        'stepSwing',
        new T.InstancedBufferAttribute(
          new Float32Array(outfit.length),
          1
        ).setUsage(T.DynamicDrawUsage)
      );
      people.count = 0;
      people.frustumCulled = false;
      people.instanceMatrix.setUsage(T.DynamicDrawUsage);
      crowd.add(people);
    }
    return { near, far, outfit };
  });
  const shadows = new T.InstancedMesh(
    new T.PlaneGeometry(0.92, 0.68).rotateX(-Math.PI / 2),
    shade,
    people.length
  );
  const shadowMatrix = new T.Matrix4();
  function updateShadow(person) {
    shadowMatrix.copy(person.model.matrix);
    shadowMatrix.elements[13] = person.model.position.y + 0.018;
    shadows.setMatrixAt(person.shadowIndex, shadowMatrix);
  }
  for (const person of people) updateShadow(person);
  shadows.name = 'Spectator shadows';
  shadows.frustumCulled = false;
  crowd.add(shadows);
  let lastX = Infinity,
    lastZ = Infinity,
    dirty = true;
  function capture(person) {
    shadows.setMatrixAt(person.shadowIndex, shadowMatrix.makeScale(0, 0, 0));
    shadows.instanceMatrix.needsUpdate = true;
    dirty = true;
  }
  function reset() {
    for (const person of people) {
      person.caught = false;
      person.model.position.copy(person.home);
      person.model.rotation.y = person.homeYaw;
      person.stride = 0;
      person.lastStride = null;
      person.model.updateMatrix();
      updateShadow(person);
    }
    dirty = true;
    shadows.instanceMatrix.needsUpdate = true;
  }
  function update(time, viewer, moving) {
    waveTime.value = time;
    if (moving) {
      for (const person of moving) {
        if (
          !person.home ||
          (person.lastStride === person.stride &&
            person.lastYaw === person.model.rotation.y)
        )
          continue;
        person.lastStride = person.stride;
        person.lastYaw = person.model.rotation.y;
        person.model.updateMatrix();
        updateShadow(person);
        person.model.matrix.elements[13] +=
          Math.abs(Math.sin(person.stride)) * 0.055;
        dirty = true;
        shadows.instanceMatrix.needsUpdate = true;
      }
    }
    if (!dirty && Math.hypot(viewer.x - lastX, viewer.z - lastZ) < 5) return;
    dirty = false;
    lastX = viewer.x;
    lastZ = viewer.z;
    for (const { near, far, outfit } of layers) {
      near.count = far.count = 0;
      for (const person of outfit) {
        if (person.caught) continue;
        const m = person.model.matrix;
        const d = (m.elements[12] - lastX) ** 2 + (m.elements[14] - lastZ) ** 2;
        if (d > 220 ** 2) continue;
        const mesh = d < 48 ** 2 ? near : far;
        mesh.geometry.attributes.stepSwing.setX(
          mesh.count,
          Math.sin(person.stride || 0)
        );
        mesh.setMatrixAt(mesh.count++, m);
      }
      for (const mesh of [near, far]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.geometry.attributes.stepSwing.needsUpdate = true;
      }
    }
  }
  return { group: crowd, people, update, reset, capture };
}
