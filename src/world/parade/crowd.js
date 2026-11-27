import * as T from 'three';
import { spectator } from '../people-model.js';
import { randomSeed, segmentDistanceSq } from '../../maps/obstacles.js';

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
  const families = [];
  for (const side of [-1, 1]) {
    for (let d = 3 + random() * 6; d < route.length; d += 12 + random() * 18) {
      const family = 2 + Math.floor(random() * 3);
      const members = [];
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
          maxHealth: 40,
          health: 40,
          isParadeParticipant: true,
          model: obj,
          radius: 0.29 * scale,
          height,
          home: obj.position.clone(),
          homeYaw: obj.rotation.y,
          alongYaw: p.yaw,
          groundOffset: onWalk ? 0.08 : 0.006,
          shadowIndex: people.length,
        };
        people.push(person);
        members.push(person);
        outfits[Math.floor(random() * outfits.length)].push(person);
      }
      if (members.length) families.push(members);
    }
  }
  // Families walk together to a second viewing spot, watch a float, then
  // come back. Reserve clear curb space between neighboring groups.
  for (const [i, family] of families.entries()) {
    const front = family.at(-1);
    const others = people.filter((p) => !family.includes(p) && p.home.distanceToSquared(front.home) < 15 ** 2);
    const nearCrossings = crossings.filter(({ a, b, clearance }) =>
      segmentDistanceSq(front.home.x, front.home.z, ...a, ...b) < (15 + Math.sqrt(clearance)) ** 2);
    let reach = 0;
    for (let d = 0.35; d <= 4.8 + i % 3; d += 0.35) {
      if (family.some((p) => {
        const x = p.home.x + Math.sin(p.alongYaw) * d, z = p.home.z + Math.cos(p.alongYaw) * d;
        return world.solids.occupied(x, z) ||
          others.some((q) => (q.home.x - x) ** 2 + (q.home.z - z) ** 2 < 1.1) ||
          nearCrossings.some(({ a, b, clearance }) => segmentDistanceSq(x, z, ...a, ...b) < clearance);
      })) break;
      reach = d;
    }
    const outing = { reach: reach > 1 ? reach : 0, wait: (4 + i * 7.37) % 23, watch: 7 + i % 7 };
    for (const [j, p] of family.entries()) {
      p.outing = outing;
      p.companion = family[j ? j - 1 : 1];
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
      person.health = person.maxHealth;
      person.model.position.copy(person.home);
      person.model.rotation.y = person.homeYaw;
      person.stride = 0;
      person.model.updateMatrix();
      updateShadow(person);
    }
    dirty = true;
    shadows.instanceMatrix.needsUpdate = true;
    nextStroll = 0;
  }
  let nextStroll = 0;
  function update(time, viewer, chasers, floats) {
    waveTime.value = time;
    const stroll = time >= nextStroll || nextStroll - time > 0.1;
    if (stroll) nextStroll = time + 1 / 30;
    for (const person of people) {
      if (person.caught) continue;
      if (!chasers?.has(person)) {
        if (!stroll || (person.home.x - viewer.x) ** 2 + (person.home.z - viewer.z) ** 2 > 230 ** 2) continue;
        const { reach, wait, watch } = person.outing;
        const leg = reach / 0.92, cycle = leg * 2 + watch + 13;
        const t = Math.max(0, time - wait) % cycle;
        const returning = t > leg + watch && t < 2 * leg + watch;
        const walking = time > wait && (t < leg || returning);
        const d = 0.92 * Math.min(t, leg, Math.max(0, 2 * leg + watch - t));
        const x = person.home.x + Math.sin(person.alongYaw) * d;
        const z = person.home.z + Math.cos(person.alongYaw) * d;
        person.model.position.set(x, d ? world.height(x, z) + person.groundOffset : person.home.y, z);
        const outing = person.outing;
        if (outing.viewTime !== time) {
          outing.viewTime = time;
          outing.balloon = null;
          let closest = 28 ** 2;
          for (const float of floats) {
            const p = float.balloon.position;
            const gap = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (!float.release && gap < closest) {
              closest = gap;
              outing.balloon = p;
            }
          }
        }
        const subject = outing.balloon ?? (t % 11 < 4 ? person.companion?.home : null);
        const gaze = subject ? Math.atan2(subject.x - x, subject.z - z) :
          person.homeYaw + 0.15 * Math.sin(time * 0.72 + person.shadowIndex);
        const heading = walking ? person.alongYaw + (returning ? Math.PI : 0) : gaze;
        const turn = heading - person.model.rotation.y;
        person.model.rotation.y += 0.33 * Math.atan2(Math.sin(turn), Math.cos(turn));
        // A half-step eases the feet back together at either viewing spot.
        person.stride = walking ? Math.round(reach * 5 / Math.PI) * Math.PI * d / reach : 0;
      }
      person.model.updateMatrix();
      updateShadow(person);
      person.model.matrix.elements[13] += Math.abs(Math.sin(person.stride || 0)) * 0.04;
      dirty = true;
      shadows.instanceMatrix.needsUpdate = true;
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
