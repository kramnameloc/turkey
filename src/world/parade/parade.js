import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { paradeRoute } from './route.js';
import { paradeCrowd } from './crowd.js';
import { BODY_RADIUS, TURKEY_HEIGHT } from '../../player/turkey-scale.js';
import { clearTrail, walkingTrail } from '../../gameplay/trail.js';
import { dealDamage, WEAPONS } from '../../gameplay/weapons.js';
import { overlapsBody } from '../../gameplay/body-collision.js';

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
  body.userData.aimHeight = TURKEY_HEIGHT * 0.57;
  body.userData.labelHeight = TURKEY_HEIGHT + 0.18;
  return {
    name: 'Balloon handler',
    maxHealth: 48,
    health: 48,
    isParadeParticipant: true,
    model: body,
    radius: BODY_RADIUS,
    height: TURKEY_HEIGHT,
    body,
    mixer,
    phase,
    skin,
    beakIndex,
  };
}

let balloonPack;

export class Parade {
  static async load(data, world, avatar, shadowMap, options) {
    balloonPack ??= new GLTFLoader()
      .loadAsync('/models/parade-balloons.glb')
      .catch((error) => {
        balloonPack = null;
        throw error;
      });
    const { scene } = await balloonPack;
    return new Parade(scene.clone(), data, world, avatar, shadowMap, options);
  }
  constructor(pack, data, world, avatar, shadowMap, options = {}) {
    this.route = paradeRoute(data.roads, options.corners);
    this.startDistance = options.startDistance ?? startDistance;
    this.group = new T.Group();
    this.group.name = options.name ?? 'Main Street balloon parade';
    this.height = world.height;
    this.occupied = (x, z) => world.solids.occupied(x, z);
    this.time = 0;
    this.chasers = new Set();
    this.nearbyActors = [];
    this.signalCrossing = world.paradeSignal;
    const shade = new T.MeshBasicMaterial({
      map: shadowMap,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    });
    this.crowd = paradeCrowd(this.route, data, world, shade);
    this.group.add(this.crowd.group);
    const shadowShape = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const balloons = [...pack.children].sort(
      (a, b) => a.userData.paradeOrder - b.userData.paradeOrder
    );
    this.floats = balloons
      .slice(0, options.count ?? balloons.length)
      .map((balloon, i) => {
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
        const float = {
          label: balloon.userData.paradeLabel,
          balloon,
          anchors,
          handlers,
          shadow,
          shadowSize: shadow.scale.clone(),
        };
        for (const h of handlers) h.float = float;
        return float;
      });
    this.ropes = new T.InstancedMesh(
      new T.CylinderGeometry(0.022, 0.022, 1, 5),
      new T.MeshStandardMaterial({ color: 0xe1c29d, roughness: 0.99 }),
      this.floats.length * crew.length * ropeSteps
    );
    this.ropes.name = 'Balloon tethers';
    this.ropes.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.ropes.frustumCulled = false;
    this.group.add(this.ropes);
  }
  get leader() {
    const first = this.floats[0];
    if (!first.release) return first.balloon.position;
    const center = this.route.sample(this.headDistance);
    return new T.Vector3(center.x, this.height(center.x, center.z), center.z);
  }
  get headDistance() {
    return this.startDistance + this.time * marchSpeed;
  }
  viewpoint(index = 0) {
    const distance = this.headDistance - index * spacing;
    const viewer = this.route.sample(distance + 19, 10);
    return { viewer, subject: this.route.sample(distance - 5) };
  }
  reset() {
    this.threat = null;
    this.chasers.clear();
    this.nearbyActors.length = 0;
    this.crowd.reset();
    for (const f of this.floats) {
      f.release = null;
      for (const h of f.handlers) {
        h.caught = false;
        h.health = h.maxHealth;
        h.body.rotation.x = 0;
      }
      f.balloon.visible = f.shadow.visible = true;
      f.shadow.scale.copy(f.shadowSize);
    }
    this.time = 0;
  }
  hit(actor, damage = WEAPONS[0].damage) {
    if (actor.caught) return '';
    const chasing = this.chasers.has(actor);
    const notice = chasing ? '' : this.startChase(actor);
    const dealt = dealDamage(actor, damage);
    if (actor.health > 0)
      return (notice || actor.name) + ' −' + dealt + ' HP';
    this.chasers.delete(actor);
    actor.caught = true;
    if (actor.float) actor.body.visible = actor.shadow.visible = false;
    else this.crowd.capture(actor);
    if (this.threat === actor) this.threat = null;
    return actor.name + ' netted!';
  }
  startChase(actor) {
    this.chasers.add(actor);
    actor.attackAt = null;
    actor.nextPath = 0;
    actor.path = [];
    actor.stride = 0;
    const f = actor.float;
    if (f && !f.release) {
      f.release = {
        time: this.time,
        position: f.balloon.position.clone(),
        rotation: f.balloon.rotation.clone(),
      };
      return f.label + ' is floating away! Its handler is chasing you.';
    }
    return actor.name + ' is chasing you!';
  }
  blocks(x, z, radius = BODY_RADIUS, except = null, feet = null) {
    return this.nearbyActors.some(
      (actor) => actor !== except && overlapsBody(actor, x, z, feet, radius)
    );
  }
  contactAttack(player, feet) {
    this.threat = null;
    let attacker = null;
    for (const actor of this.chasers) {
      if (!overlapsBody(actor, player.x, player.z, feet, BODY_RADIUS + 0.4)) {
        actor.attackAt = null;
        continue;
      }
      actor.attackAt ??= this.time + 0.55;
      const until = actor.attackAt - this.time;
      if (until <= 0 && !attacker) {
        attacker = actor;
        actor.attackAt = this.time + 1.8;
      } else if (until < 0.55) this.threat = actor;
    }
    return attacker;
  }
  pursue(actor, player, dt) {
    const body = actor.model,
      p = body.position;
    const distance = Math.hypot(player.x - p.x, player.z - p.z);
    const contact = actor.radius + BODY_RADIUS + 0.06;
    if (distance > 85 || !dt) return;
    const face = Math.atan2(player.x - p.x, player.z - p.z);
    body.rotation.y = face;
    if (distance <= contact) return;
    if (this.time >= actor.nextPath) {
      actor.path = clearTrail(p, player, this.occupied)
        ? []
        : walkingTrail(p, player, this.occupied);
      actor.nextPath = this.time + 0.85;
    }
    while (
      actor.path.length &&
      Math.hypot(actor.path[0].x - p.x, actor.path[0].z - p.z) < 0.55
    )
      actor.path.shift();
    const goal = actor.path[0] || player;
    const heading = Math.atan2(goal.x - p.x, goal.z - p.z);
    const step = Math.min(distance - contact, (actor.float ? 4.7 : 3.5) * dt);
    for (const turn of [0, 0.45, -0.45, 0.92, -0.92, 1.48, -1.48]) {
      const angle = heading + turn,
        x = p.x + Math.sin(angle) * step,
        z = p.z + Math.cos(angle) * step;
      if (
        this.occupied(x, z) ||
        this.blocks(x, z, actor.radius, actor) ||
        Math.hypot(player.x - x, player.z - z) < contact - 0.001
      )
        continue;
      p.set(x, this.height(x, z) + (actor.float ? 0.023 : 0.055), z);
      body.rotation.y = angle;
      actor.stride += step * (actor.float ? 1 / 0.32 : 5);
      break;
    }
  }
  update(time, viewer) {
    const dt = Math.min(0.06, Math.max(0, time - this.time));
    this.time = time;
    if (viewer)
      for (const actor of this.chasers) this.pursue(actor, viewer, dt);
    this.crowd.update(time, viewer || this.viewpoint().viewer, this.chasers);
    this.nearbyActors.length = 0;
    const nearby = (p) =>
      !viewer || (p.x - viewer.x) ** 2 + (p.z - viewer.z) ** 2 < 65 ** 2;
    for (const person of this.crowd.people)
      if (!person.caught && nearby(person.model.position))
        this.nearbyActors.push(person);
    let segment = 0;
    this.floats.forEach(
      ({ balloon, anchors, handlers, shadow, shadowSize, release }, i) => {
        const distance = this.headDistance - i * spacing,
          phase = time * 0.77 + i * 1.94;
        const center = this.route.sample(
          distance,
          Math.sin(phase * 0.64) * 0.24
        );
        const floor = this.height(center.x, center.z);
        // Raise the balloon before the lead edge reaches the mast arms. Its crew
        // stays on the road while the four tethers lengthen through the crossing.
        const lift = this.signalCrossing
          ? 6.4 *
            (1 -
              T.MathUtils.smoothstep(
                Math.hypot(
                  center.x - this.signalCrossing.x,
                  center.z - this.signalCrossing.z
                ),
                23,
                48
              ))
          : 0;
        balloon.position.set(
          center.x,
          floor + 3.45 + lift + Math.sin(phase) * 0.24,
          center.z
        );
        balloon.rotation.set(
          Math.cos(phase * 0.52) * 0.021,
          center.yaw + Math.sin(phase * 0.41) * 0.037,
          Math.sin(phase * 0.63) * 0.033,
          'YXZ'
        );
        if (release) {
          const age = Math.max(0, time - release.time);
          const drift = age - 1 + Math.exp(-age);
          balloon.position.copy(release.position);
          balloon.position.x += drift * 1.15;
          balloon.position.z -= drift * 0.68;
          balloon.position.y += drift * 2.9;
          balloon.rotation.copy(release.rotation);
          balloon.rotation.y += Math.sin(age * 0.28) * 0.24;
          balloon.rotation.z += Math.sin(age * 0.47) * 0.08;
          balloon.visible = age < 65;
          shadow.visible = age < 13;
          shadow.scale
            .copy(shadowSize)
            .multiplyScalar(Math.max(0, 1 - age / 13));
        }
        balloon.updateMatrixWorld(true);
        shadow.position.set(center.x, floor + 0.06, center.z);
        if (release && shadow.visible) {
          const { x, z } = balloon.position;
          shadow.position.set(x, this.height(x, z) + 0.06, z);
        }
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
        handlers.forEach((handler, j) => {
          const {
            body,
            mixer,
            phase,
            skin,
            beakIndex,
            shadow: footShadow,
          } = handler;
          if (handler.caught) {
            body.visible = footShadow.visible = false;
            return;
          }
          const chasing = this.chasers.has(handler);
          body.rotation.x =
            chasing && handler.attackAt != null
              ? 0.17 * Math.max(0, 1 - Math.abs(handler.attackAt - time) / 0.35)
              : 0;
          body.visible = footShadow.visible = chasing
            ? !viewer ||
              Math.hypot(
                body.position.x - viewer.x,
                body.position.z - viewer.z
              ) < 155
            : crewInView;
          if (!body.visible) return;
          if (!chasing) {
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
            body.rotation.y = Math.atan2(
              ahead.x - behind.x,
              ahead.z - behind.z
            );
          }
          if (nearby(body.position)) this.nearbyActors.push(handler);
          footShadow.position.copy(body.position);
          footShadow.position.y += 0.018;
          // The planted foot travels about 0.32 m backwards per second of the
          // authored walk at game scale. Match that speed to forward travel.
          mixer.setTime(
            (chasing ? handler.stride : time * (marchSpeed / 0.32)) + phase
          );
          body.updateMatrixWorld(true);
          if (release) return;
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
        });
      }
    );
    this.ropes.count = segment;
    this.ropes.instanceMatrix.needsUpdate = true;
  }
}
