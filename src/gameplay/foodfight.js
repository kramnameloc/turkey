import * as T from 'three';
import { BODY_RADIUS, TURKEY_EYE, TURKEY_HEIGHT } from '../player/turkey-scale.js';
import { createFoodFightArt } from '../models/foodfight-art.js';
import {
  captureBonus,
  MAX_HEALTH,
  GRAVY_HEAL,
  SPEED_SECONDS,
  THROWS,
  WIDE_CASTS,
} from './courses.js';
import { clearTrail, relativeBearing } from './trail.js';
import { sound } from '../player/audio.js';

const kinds = Object.keys(THROWS);
const crumbColors = {
  roll: new T.Color('#e8bb7c'),
  can: new T.Color('#b53959'),
  sprout: new T.Color('#a7c86d'),
};
const previous = new T.Vector3(),
  point = new T.Vector3();
const throwOrder = (list) => list[Math.floor(Math.random() * list.length)];
const ringGeometry = new T.RingGeometry(0.74, 0.86, 32).rotateX(-Math.PI / 2);
const ringMaterial = new T.MeshBasicMaterial({
  color: 0x8affc1,
  side: T.DoubleSide,
  transparent: true,
  opacity: 0.86,
  depthWrite: false,
});

export class FoodFight {
  constructor(hunt) {
    this.hunt = hunt;
    this.art = createFoodFightArt();
    this.group = new T.Group();
    // A short trail of crumbs, cranberry drops or green puffs makes a throw readable from the side.
    this.trails = new T.InstancedMesh(
      new T.IcosahedronGeometry(1),
      new T.MeshBasicMaterial({
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
      32
    );
    this.trails.frustumCulled = false;
    this.trailDot = new T.Object3D();
    hunt.scene.add(this.group, this.trails);
    this.reset();
  }
  reset(state = {}) {
    this.clearField();
    this.health = state.health ?? MAX_HEALTH;
    this.speed = state.speed ?? 0;
    this.wide = state.wide ?? 0;
    this.misses = state.misses ?? 0;
    this.taken = new Set();
    this.hitFlash = 0;
    this.invulnerable = 0;
  }
  checkpoint() {
    return {
      health: this.health,
      speed: this.speed,
      wide: this.wide,
      misses: this.misses,
    };
  }
  clearField() {
    this.group.clear();
    this.trails.count = 0;
    this.attack = null;
    this.tosses = [];
    this.pickups = [];
    this.rewards = [];
    this.lull = 3;
  }
  stock(points) {
    const pickups = [];
    for (const p of points) {
      const key = p.x + ',' + p.z;
      if (this.taken.has(key)) continue;
      const open = this.hunt.openSpot(p);
      const obj = new T.Group(),
        model = this.art.pickup('health');
      const halo = new T.Mesh(ringGeometry, ringMaterial);
      halo.position.y = 0.07;
      obj.add(halo, model);
      obj.position.set(open.x, this.hunt.fieldHeight(open.x, open.z), open.z);
      pickups.push({ key, obj, model, x: open.x, z: open.z });
    }
    // Keep the old field playable if a destination has no room for its pickups.
    this.clearField();
    for (const pickup of pickups) this.group.add(pickup.obj);
    this.pickups = pickups;
  }
  reward(dish) {
    const kind = captureBonus(this.misses);
    this.misses = kind ? 0 : this.misses + 1;
    if (!kind) return '';
    if (kind === 'speed') this.speed = SPEED_SECONDS;
    else this.wide = WIDE_CASTS;
    const model = this.art.pickup(kind);
    const start = dish.model.position.clone();
    start.y += dish.model.userData.aimHeight;
    model.position.copy(start);
    this.group.add(model);
    this.rewards.push({ model, start, age: 0 });
    sound('bonus');
    return kind === 'speed'
      ? 'Buttered boots! Speed up for 20s.'
      : 'Wishbone bonus! Four wide casts.';
  }
  // The dish commits to a spot when the windup starts. It cannot steer the throw.
  windUp(dish, kind) {
    const g = this.hunt,
      target = g.camera.position.clone(),
      obj = this.art.projectile(kind);
    target.y = g.height(target.x, target.z) + TURKEY_EYE;
    obj.position.copy(dish.model.position);
    obj.position.y += dish.model.userData.labelHeight + 0.3;
    obj.scale.multiplyScalar(1.3);
    this.group.add(obj);
    this.attack = { dish, kind, obj, target, wind: 1.05 };
    sound('windup');
  }
  interrupt(dish) {
    if (this.attack?.dish !== dish) return false;
    this.group.remove(this.attack.obj);
    this.attack = null;
    this.lull = 1.8;
    return true;
  }
  release(a) {
    const start = a.obj.position.clone();
    this.tosses.push({
      ...a,
      start,
      age: 0,
      duration: T.MathUtils.clamp(start.distanceTo(a.target) / 12, 0.84, 2.35),
    });
    this.attack = null;
    this.lull = Math.max(1.7, 3.9 - this.hunt.level * 0.55) + Math.random() * 2;
    sound(a.kind === 'sprout' ? 'toot' : 'toss');
  }
  tickDamage(dt) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);
  }
  takeHit(damage) {
    if (this.invulnerable > 0) return false;
    this.health = Math.max(0, this.health - damage);
    this.invulnerable = 1.1;
    this.hitFlash = 1;
    return true;
  }
  update(dt, elapsed = dt) {
    const g = this.hunt,
      p = g.camera.position;
    this.speed = Math.max(0, this.speed - elapsed);
    this.tickDamage(dt);
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      if (Math.hypot(item.x - p.x, item.z - p.z) > 125) continue;
      item.model.position.y = 0.22 + Math.sin(g.elapsed * 2.6 + i) * 0.12;
      item.model.rotation.y = g.elapsed * 0.8 + i;
      if (
        this.health >= MAX_HEALTH ||
        Math.hypot(item.x - p.x, item.z - p.z) > 2.4 ||
        !clearTrail(p, item, g.isBlocked)
      )
        continue;
      const healed = Math.min(MAX_HEALTH - this.health, GRAVY_HEAL);
      this.health += healed;
      this.taken.add(item.key);
      this.group.remove(item.obj);
      this.pickups.splice(i, 1);
      g.toast('Emergency gravy! +' + healed + ' health. Doctor’s pour.', 2.8);
      sound('heal');
    }
    for (let i = this.rewards.length - 1; i >= 0; i--) {
      const r = this.rewards[i];
      r.age += dt;
      const f = Math.min(1, r.age / 0.85);
      r.model.position.lerpVectors(r.start, p, f * f);
      r.model.position.y += Math.sin(f * Math.PI) * 1.7;
      r.model.rotation.y += dt * 4;
      r.model.scale.setScalar(1 - f * 0.9);
      if (f === 1) {
        this.group.remove(r.model);
        this.rewards.splice(i, 1);
      }
    }
    if (this.attack) {
      const a = this.attack;
      if (a.dish.caught) {
        this.interrupt(a.dish);
      } else {
        a.wind -= dt;
        a.obj.position.copy(a.dish.model.position);
        a.obj.position.y +=
          a.dish.model.userData.labelHeight +
          0.38 +
          Math.sin(a.wind * 19) * 0.16;
        a.obj.rotation.z = Math.sin(a.wind * 26) * 0.26;
        if (a.wind <= 0) this.release(a);
      }
    } else if ((this.lull -= dt) <= 0) {
      const candidates = g.targets.filter(
        (t) =>
          !t.caught &&
          t.model.position.distanceToSquared(p) < 38 * 38 &&
          clearTrail(t.model.position, p, g.isBlocked)
      );
      if (candidates.length)
        this.windUp(throwOrder(candidates), throwOrder(kinds));
      else this.lull = 0.45;
    }
    for (let i = this.tosses.length - 1; i >= 0; i--) {
      const a = this.tosses[i];
      previous.copy(a.obj.position);
      a.age += dt;
      const f = a.age / a.duration;
      this.throwPosition(a, f, a.obj.position);
      a.obj.rotation.x += dt * 5;
      a.obj.rotation.z += dt * 3;
      const steps = Math.max(
        1,
        Math.ceil(previous.distanceTo(a.obj.position) / 0.32)
      );
      let done = f > 1.75;
      for (let j = 1; j <= steps && !done; j++) {
        point.lerpVectors(previous, a.obj.position, j / steps);
        if (
          g.isBlocked(point.x, point.z) ||
          point.y <= g.height(point.x, point.z) + 0.1
        ) {
          done = true;
          break;
        }
        if (
          Math.hypot(point.x - p.x, point.z - p.z) < BODY_RADIUS + 0.3 &&
          point.y > p.y - TURKEY_EYE + 0.035 &&
          point.y < p.y - TURKEY_EYE + TURKEY_HEIGHT + 0.2
        ) {
          done = true;
          if (this.takeHit(THROWS[a.kind].damage)) {
            sound(a.kind === 'sprout' ? 'toot' : 'splat');
            g.toast(
              THROWS[a.kind].hit + ' −' + THROWS[a.kind].damage + ' HP',
              2.7
            );
          }
        }
      }
      if (done) {
        this.group.remove(a.obj);
        this.tosses.splice(i, 1);
      }
    }
    this.drawTrails();
  }
  throwPosition(toss, fraction, position) {
    position.lerpVectors(toss.start, toss.target, fraction);
    position.y +=
      4 * fraction * (1 - fraction) * Math.min(2.8, 1.4 + toss.duration * 0.65);
  }
  drawTrails() {
    let count = 0;
    const dot = this.trailDot;
    for (const toss of this.tosses) {
      const gas = toss.kind === 'sprout';
      for (let i = 1; i <= 6 && count < this.trails.instanceMatrix.count; i++) {
        const age = toss.age - i * 0.035;
        if (age < 0) break;
        this.throwPosition(toss, age / toss.duration, dot.position);
        dot.position.y += gas ? i * 0.047 : -i * 0.023;
        dot.position.x += Math.sin(age * 9 + i) * i * 0.017;
        const size = gas ? 0.18 + i * 0.016 : 0.16 - i * 0.016;
        dot.scale.set(size, gas ? size * 0.78 : size, size);
        dot.updateMatrix();
        this.trails.setMatrixAt(count, dot.matrix);
        this.trails.setColorAt(count++, crumbColors[toss.kind]);
      }
    }
    this.trails.count = count;
    if (count) {
      this.trails.instanceMatrix.needsUpdate = true;
      this.trails.instanceColor.needsUpdate = true;
    }
  }
  warning() {
    const a = this.attack || this.tosses[0];
    if (!a) return '';
    const g = this.hunt,
      dir = relativeBearing(
        g.camera.position,
        this.attack ? a.dish.model.position : a.obj.position,
        g.yaw
      );
    const side =
      Math.abs(dir) > 2.35
        ? 'behind'
        : Math.abs(dir) < 0.78
          ? 'ahead'
          : dir < 0
            ? 'left'
            : 'right';
    return THROWS[a.kind].name + ' ' + side + ' · Dodge!';
  }
  dispose() {
    this.clearField();
    this.group.removeFromParent();
    this.trails.removeFromParent();
    this.trails.geometry.dispose();
    this.trails.material.dispose();
    this.trails.dispose();
    this.art.dispose();
  }
}
