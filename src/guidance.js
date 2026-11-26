import * as T from 'three';
import { doverLeg } from './dover-guide.js';
import { DOVER_ROUTE } from './dover-route.js';
import { TRAVEL } from './field.js';
import {
  clearTrail,
  walkingTrail,
  relativeBearing,
  TRACK_DELAY,
  TRAVEL_HINT_DISTANCE,
} from './trail.js';

function groundArrows() {
  const chevron = new T.Shape();
  chevron.moveTo(0, 0.72);
  chevron.lineTo(0.58, 0.08);
  chevron.lineTo(0.58, -0.28);
  chevron.lineTo(0, 0.25);
  chevron.lineTo(-0.58, -0.28);
  chevron.lineTo(-0.58, 0.08);
  chevron.closePath();
  const geo = new T.ShapeGeometry(chevron);
  geo.rotateX(-Math.PI / 2);
  const mesh = new T.InstancedMesh(
    geo,
    new T.MeshBasicMaterial({
      color: 0xffaf4f,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
    4
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

export class DishGuide {
  constructor(scene) {
    this.panel = document.querySelector('#trail-hint');
    this.needle = this.panel.querySelector('.trail-needle');
    this.name = this.panel.querySelector('strong');
    this.detail = this.panel.querySelector('small');
    this.trigger = document.querySelector('#compass');
    this.arrows = groundArrows();
    scene.add(this.arrows);
    this.dot = new T.Object3D();
    this.view = new T.Vector3();
    this.reset(0);
  }
  reset(time) {
    this.manual = false;
    this.lastSight = time;
    this.nextRoute = 0;
    this.target = null;
    this.route = [];
    this.hide();
  }
  hide() {
    this.panel.hidden = true;
    this.arrows.count = 0;
    this.suggestedStop = null;
    this.trigger.setAttribute('aria-pressed', 'false');
  }
  toggle(time) {
    this.manual = this.panel.hidden;
    this.lastSight = time;
    this.nextRoute = 0;
    if (!this.manual) this.hide();
  }
  update(hunt, aimedTarget) {
    if (hunt.trackingDover) {
      this.trackDover(hunt);
      return;
    }
    if (hunt.house.inside || hunt.mode === 'roam') {
      this.hide();
      return;
    }
    const p = hunt.camera.position;
    let nearest = null,
      best = Infinity,
      seen = !!aimedTarget;
    for (const dish of hunt.targets) {
      if (dish.caught) continue;
      const q = dish.model.position,
        distance = Math.hypot(q.x - p.x, q.z - p.z);
      if (distance < best) {
        best = distance;
        nearest = dish;
      }
      if (seen || distance > 35) continue;
      this.view.copy(q);
      this.view.y += dish.model.userData.aimHeight;
      this.view.project(hunt.viewCamera);
      if (
        this.view.z > 0 &&
        this.view.z < 1 &&
        Math.abs(this.view.x) < 0.84 &&
        Math.abs(this.view.y) < 0.8
      ) {
        seen = clearTrail(p, q, hunt.isBlocked);
      }
    }
    if (seen) this.lastSight = hunt.elapsed;
    if (
      !nearest ||
      (!this.manual && hunt.elapsed - this.lastSight < TRACK_DELAY)
    ) {
      this.hide();
      return;
    }
    const dest = nearest.model.position,
      travel = hunt.mode === 'city' && best > TRAVEL_HINT_DISTANCE;
    this.panel.hidden = false;
    this.trigger.setAttribute('aria-pressed', 'true');
    this.suggestedStop = travel ? nearest.stop : null;
    if (this.target !== nearest) {
      this.target = nearest;
      this.nextRoute = 0;
      this.route = [];
    }
    if (travel) this.route = [];
    else if (
      hunt.elapsed >= this.nextRoute ||
      (this.route.length && !clearTrail(p, this.route[0], hunt.isBlocked))
    ) {
      this.route = walkingTrail(p, dest, hunt.isBlocked);
      this.nextRoute = hunt.elapsed + 2.2;
    }
    while (
      this.route.length > 1 &&
      Math.hypot(this.route[0].x - p.x, this.route[0].z - p.z) < 2.2 &&
      clearTrail(p, this.route[1], hunt.isBlocked)
    )
      this.route.shift();
    const next = this.route[0] || dest;
    const bearing = relativeBearing(p, next, hunt.yaw);
    this.needle.style.transform = 'rotate(' + bearing + 'rad)';
    this.name.textContent = nearest.name;
    const meters =
      best >= 1000 ? (best / 1000).toFixed(1) + ' km' : Math.round(best) + ' m';
    this.detail.textContent = travel
      ? meters + ' · Map to ' + TRAVEL[nearest.stop].name
      : meters + (this.route.length ? ' · Follow arrows' : ' · Check hunt map');
    this.placeArrows(hunt, p, this.route);
  }
  trackDover(hunt) {
    const p = hunt.camera.position,
      inside = hunt.house.inside;
    const leg = inside
      ? { next: { x: 0, z: -1.45 }, distance: Math.hypot(p.x, p.z + 2.75) }
      : doverLeg(p, DOVER_ROUTE);
    if (hunt.elapsed >= this.nextRoute || inside !== this.wasInside) {
      this.route = walkingTrail(p, leg.next, hunt.isBlocked);
      this.nextRoute = hunt.elapsed + 0.85;
      this.wasInside = inside;
    }
    while (
      this.route.length > 1 &&
      Math.hypot(this.route[0].x - p.x, this.route[0].z - p.z) < 2
    )
      this.route.shift();
    const bearing = relativeBearing(p, this.route[0] || leg.next, hunt.yaw);
    this.panel.hidden = false;
    this.name.textContent = inside ? 'The display pedestal' : '735 Dover St';
    this.detail.textContent = inside
      ? 'Inspect the prize'
      : leg.distance < 4
        ? 'Use the cottage door'
        : (leg.distance > 999
            ? (leg.distance / 1000).toFixed(1) + ' km'
            : Math.round(leg.distance) + ' m') + ' · Follow the gold trail';
    this.needle.style.transform = 'rotate(' + bearing + 'rad)';
    if (inside) this.arrows.count = 0;
    else this.placeArrows(hunt, p, this.route);
  }
  placeArrows(hunt, player, route) {
    let from = player,
      along = 2.5,
      count = 0;
    for (const to of route) {
      const dx = to.x - from.x,
        dz = to.z - from.z,
        length = Math.hypot(dx, dz);
      while (along < length && count < 4) {
        const x = from.x + (dx * along) / length,
          z = from.z + (dz * along) / length;
        this.dot.position.set(x, hunt.height(x, z) + 0.1, z);
        this.dot.rotation.y = Math.atan2(-dx, -dz);
        this.dot.updateMatrix();
        this.arrows.setMatrixAt(count++, this.dot.matrix);
        along += 2.75;
      }
      if (count === 4) break;
      along -= length;
      from = to;
    }
    this.arrows.count = count;
    this.arrows.instanceMatrix.needsUpdate = true;
  }
}
