import * as T from 'three';
import { dailyRoutines, sampleRoutine } from './daily-routines.js';
import { residentFigure } from './people-model.js';

const turn = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class Residents {
  constructor(shadowMap) {
    this.group = new T.Group();
    this.group.name = 'Local residents';
    this.routines = new WeakMap();
    this.figures = new Map();
    this.nearby = [];
    this.shadowShape = new T.PlaneGeometry(0.9, 0.66).rotateX(-Math.PI / 2);
    this.shade = new T.MeshBasicMaterial({ map: shadowMap, transparent: true, opacity: 0.68, depthWrite: false });
    this.reset();
  }
  reset() {
    this.area = null;
    this.people = [];
    this.nearby.length = 0;
    this.group.clear();
  }
  enter(area, blocked) {
    this.reset();
    this.area = area;
    if (!area) return;
    this.blocked = blocked;
    if (!this.routines.has(area)) this.routines.set(area, dailyRoutines(area, blocked));
    this.people = this.routines.get(area).map((routine, i) => {
      const key = i + '/' + routine.item;
      if (!this.figures.has(key)) this.figures.set(key, residentFigure(i + 1, routine.item));
      const figure = this.figures.get(key), shadow = new T.Mesh(this.shadowShape, this.shade);
      const scale = [1, 0.94, 1.07, 0.97, 1.02][i];
      figure.model.scale.setScalar(scale);
      this.group.add(figure.model, shadow);
      return { ...figure, routine, shadow, delay: 0, state: {}, placed: false,
        offsetX: 0, offsetZ: 0, radius: 0.28 * scale, height: 1.74 * scale };
    });
  }
  update(time, dt, viewer, height, paradePeople) {
    this.nearby.length = 0;
    let localCue = null, cueRange = 15;
    for (const person of this.people) {
      const { model, routine, state, shadow } = person;
      sampleRoutine(routine, time - person.delay, state);
      const dx = viewer.x - state.x, dz = viewer.z - state.z;
      const distance = Math.hypot(dx, dz);
      model.visible = shadow.visible = distance < 145;
      if (!model.visible) {
        person.placed = false;
        continue;
      }
      // Give the turkey room when it stands in the next footfall. A walker
      // can always move away from someone who approaches from behind.
      const previous = model.position;
      const yieldWay = person.placed && state.activity === 'walk' && distance < 1.05 &&
        Math.abs(viewer.y - previous.y) < person.height + 0.2 &&
        dx * (state.x - previous.x) + dz * (state.z - previous.z) > 0;
      if (yieldWay) {
        person.delay += dt;
        sampleRoutine(routine, time - person.delay, state);
        state.activity = 'greet';
        state.progress = 0.5;
      }
      const walking = state.activity === 'walk';
      const blend = person.placed ? 1 - Math.exp(-dt * 7) : 1;
      const forwardX = Math.sin(state.yaw), forwardZ = Math.cos(state.yaw);
      const inPath = ({ model: other }) => {
        const x = other.position.x - state.x, z = other.position.z - state.z;
        const ahead = x * forwardX + z * forwardZ;
        return ahead > -0.48 && ahead < 1.65 && Math.abs(x * forwardZ - z * forwardX) < 0.66;
      };
      let side = 0;
      if (walking && (this.people.some((q) => q !== person && q.placed && inPath(q)) || paradePeople?.some(inPath))) {
        side = this.blocked(state.x + forwardZ * 0.75, state.z - forwardX * 0.75) ? -0.75 : 0.75;
      }
      person.offsetX = T.MathUtils.lerp(person.offsetX, side * forwardZ, blend);
      person.offsetZ = T.MathUtils.lerp(person.offsetZ, -side * forwardX, blend);
      let x = state.x + person.offsetX, z = state.z + person.offsetZ;
      if (this.blocked(x, z)) {
        x = state.x;
        z = state.z;
      }
      model.position.set(x, height(x, z) + routine.floorOffset, z);
      shadow.position.copy(model.position);
      shadow.position.y += 0.012;
      model.rotation.y += turn(state.yaw - model.rotation.y) * blend;
      shadow.rotation.y = model.rotation.y;
      const watch = distance < 4 && (walking || state.activity === 'greet')
        ? T.MathUtils.clamp(turn(Math.atan2(dx, dz) - model.rotation.y), -0.68, 0.68) : 0;
      const glance = watch || Math.sin(time * 0.83 + routine.offset) * (walking ? 0.11 : 0.28);
      person.walkWeight = T.MathUtils.lerp(person.walkWeight ?? 0, Number(walking), blend);
      person.pose(time, state, person.walkWeight, glance);
      const beat = Math.floor(state.stride / Math.PI);
      const shutter = state.activity === 'photo' && state.progress >= 0.5;
      if (person.placed && distance < cueRange && (
        (walking && person.beat !== beat) || (shutter && !person.shutter)
      )) {
        cueRange = distance;
        localCue = { point: model.position, shutter };
      }
      person.placed = true;
      person.beat = beat;
      person.shutter = shutter;
      if (distance < 8) this.nearby.push(person);
    }
    return localCue;
  }
  dispose() {
    this.reset();
    for (const { model } of this.figures.values()) {
      model.geometry.dispose();
      model.skeleton.dispose();
    }
    this.figures.clear();
    this.shadowShape.dispose();
    this.shade.dispose();
  }
}
