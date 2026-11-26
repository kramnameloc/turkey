import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { paradeRoute } from './parade-route.js';
import { paradeCrowd } from './parade-crowd.js';

const characters = [
  ['Jett', 'Jett from Super Wings'],
  ['Elf', 'The Elf on the Shelf'],
  ['Thomas', 'Thomas the Tank Engine'],
  ['Chase', 'Chase from PAW Patrol'],
  ['Goku', 'Goku'],
  ['CharlieBrown', 'Charlie Brown'],
  ['Scrat', 'Scrat and his Acorn'],
  ['Sonic', 'Sonic (1993)'],
];
const spacing = 26,
  marchSpeed = 0.74,
  startDistance = 207;
const up = new T.Vector3(0, 1, 0);
const anchor = new T.Vector3(),
  beak = new T.Vector3(),
  mid = new T.Vector3(),
  previous = new T.Vector3();
const delta = new T.Vector3(),
  ropePiece = new T.Object3D();
const crew = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const ropeSteps = 4;

function riggingPoints(balloon) {
  const geometry = balloon.geometry,
    vertices = geometry.attributes.position;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox,
    size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3());
  return crew.map(([side, fore]) => {
    const ideal = new T.Vector3(
      center.x + side * 0.31 * size.x,
      box.min.y + size.y * 0.21,
      center.z + fore * 0.29 * size.z
    );
    const point = new T.Vector3();
    let best = Infinity;
    for (let i = 0; i < vertices.count; i++) {
      anchor.fromBufferAttribute(vertices, i);
      const d = ideal.distanceToSquared(anchor);
      if (d < best) {
        best = d;
        point.copy(anchor);
      }
    }
    return point;
  });
}

function turkeyHandler(avatar, phase) {
  const body = clone(avatar.body);
  body.getObjectByName(avatar.gear.name).removeFromParent();
  // SkeletonUtils copies the player's half-turn as a quaternion. Clear all
  // axes before applying the street heading to the source rig's +Z beak.
  body.quaternion.identity();
  const mixer = new T.AnimationMixer(body);
  const walk = mixer.clipAction(avatar.walkClip);
  walk.play();
  mixer.setTime(phase);
  body.updateMatrixWorld(true);
  const skin = body.getObjectByProperty('isSkinnedMesh', true);
  const head = skin.skeleton.bones.findIndex((bone) => bone.name === 'Head');
  let beakIndex = 0,
    front = -Infinity;
  for (let i = 0; i < skin.geometry.attributes.position.count; i++) {
    if (skin.geometry.attributes.skinIndex.getX(i) !== head) continue;
    skin.getVertexPosition(i, beak).applyMatrix4(skin.matrixWorld);
    if (beak.z > front) {
      front = beak.z;
      beakIndex = i;
    }
  }
  return { body, mixer, phase, skin, beakIndex };
}

export class Parade {
  static async load(data, world, avatar, shadowMap) {
    const { scene } = await new GLTFLoader().loadAsync(
      '/models/parade-balloons.glb'
    );
    return new Parade(scene, data, world, avatar, shadowMap);
  }
  constructor(pack, data, world, avatar, shadowMap) {
    this.route = paradeRoute(data.roads);
    this.group = new T.Group();
    this.group.name = 'Main Street balloon parade';
    this.height = world.height;
    const shade = new T.MeshBasicMaterial({
      map: shadowMap,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    });
    this.crowd = paradeCrowd(this.route, data, world, shade);
    this.group.add(this.crowd.group);
    const shadowShape = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.floats = characters.map(([name, label], i) => {
      const balloon = pack.getObjectByName(name);
      const anchors = riggingPoints(balloon);
      const size = balloon.geometry.boundingBox.getSize(new T.Vector3());
      const shadow = new T.Mesh(shadowShape, shade);
      shadow.scale.set(size.x * 1.1, 1, size.z * 1.1);
      const handlers = crew.map((_, j) =>
        turkeyHandler(avatar, (i * 4 + j) * 0.28)
      );
      for (const h of handlers) {
        h.shadow = new T.Mesh(shadowShape, shade);
        h.shadow.scale.set(0.95, 1, 1.05);
        this.group.add(h.body, h.shadow);
      }
      this.group.add(balloon, shadow);
      return { label, balloon, anchors, handlers, shadow };
    });
    this.ropes = new T.InstancedMesh(
      new T.CylinderGeometry(0.022, 0.022, 1, 5),
      new T.MeshStandardMaterial({ color: 0xe1c29d, roughness: 0.99 }),
      characters.length * crew.length * ropeSteps
    );
    this.ropes.name = 'Balloon tethers';
    this.ropes.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.ropes.frustumCulled = false;
    this.group.add(this.ropes);
  }
  get leader() {
    return this.floats[0].balloon.position;
  }
  get headDistance() {
    return startDistance + this.time * marchSpeed;
  }
  viewpoint(index = 0) {
    const distance = this.headDistance - index * spacing;
    const viewer = this.route.sample(distance + 19, 10);
    return { viewer, subject: this.route.sample(distance - 5) };
  }
  update(time, viewer) {
    this.time = time;
    this.crowd.update(time, viewer || this.viewpoint().viewer);
    let segment = 0;
    this.floats.forEach(({ balloon, anchors, handlers, shadow }, i) => {
      const distance = this.headDistance - i * spacing,
        phase = time * 0.77 + i * 1.94;
      const center = this.route.sample(distance, Math.sin(phase * 0.64) * 0.24);
      const floor = this.height(center.x, center.z);
      balloon.position.set(
        center.x,
        floor + 3.45 + Math.sin(phase) * 0.24,
        center.z
      );
      balloon.rotation.set(
        Math.cos(phase * 0.52) * 0.021,
        center.yaw + Math.sin(phase * 0.41) * 0.037,
        Math.sin(phase * 0.63) * 0.033,
        'YXZ'
      );
      balloon.updateMatrixWorld(true);
      shadow.position.set(center.x, floor + 0.06, center.z);
      // Match the ground slope under the large, soft balloon shadow.
      const slopeX =
        (this.height(center.x + 2, center.z) -
          this.height(center.x - 2, center.z)) /
        4;
      const slopeZ =
        (this.height(center.x, center.z + 2) -
          this.height(center.x, center.z - 2)) /
        4;
      shadow.quaternion.setFromUnitVectors(
        up,
        delta.set(-slopeX, 1, -slopeZ).normalize()
      );
      shadow.rotateY(center.yaw);
      // The balloons remain visible down the street. At this distance a bird
      // occupies only a few pixels, so omit its rig and tethers until closer.
      const crewInView =
        !viewer || Math.hypot(viewer.x - center.x, viewer.z - center.z) < 155;
      handlers.forEach(
        ({ body, mixer, phase, skin, beakIndex, shadow: footShadow }, j) => {
          body.visible = footShadow.visible = crewInView;
          if (!crewInView) return;
          const [side, fore] = crew[j],
            p = this.route.sample(distance + fore * 4.8, side * 2.4);
          body.position.set(p.x, this.height(p.x, p.z) + 0.023, p.z);
          const behind = this.route.sample(
            distance + fore * 4.8 - 0.12,
            side * 2.4
          );
          const ahead = this.route.sample(
            distance + fore * 4.8 + 0.12,
            side * 2.4
          );
          body.rotation.y = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
          footShadow.position.copy(body.position);
          footShadow.position.y += 0.018;
          // The planted foot travels about 0.32 m backwards per second of the
          // authored walk at game scale. Match that speed to forward travel.
          mixer.setTime(time * (marchSpeed / 0.32) + phase);
          body.updateMatrixWorld(true);
          skin
            .getVertexPosition(beakIndex, beak)
            .applyMatrix4(skin.matrixWorld);
          anchor.copy(anchors[j]).applyMatrix4(balloon.matrixWorld);
          previous.copy(beak);
          for (let s = 1; s <= ropeSteps; s++) {
            const t = s / ropeSteps;
            const next = mid.lerpVectors(beak, anchor, t);
            next.y -= 0.55 * t * (1 - t);
            delta.subVectors(next, previous);
            ropePiece.position.copy(previous).lerp(next, 0.5);
            ropePiece.scale.set(1, delta.length(), 1);
            ropePiece.quaternion.setFromUnitVectors(up, delta.normalize());
            ropePiece.updateMatrix();
            this.ropes.setMatrixAt(segment++, ropePiece.matrix);
            previous.copy(next);
          }
        }
      );
    });
    this.ropes.count = segment;
    this.ropes.instanceMatrix.needsUpdate = true;
  }
}
