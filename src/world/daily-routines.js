import { clearTrail, walkingTrail } from '../gameplay/trail.js';
import { SPAWN } from '../maps/field-data.js';

// Stops are in scene meters. The last value is the direction the person faces
// during their errand (+Z is zero). Unmarked stops are corners of the walk.
const errands = {
  airport: [
    ['case', [-10, 17, 'read', -1.6], [-5.8, 14], [2, 4, 'look', 0], [6, -18, 'greet', 1.5]],
    ['cup', [-10.5, -6.2, 'lunch', 1.57], [-6, -3], [-6, 8, 'greet', -1.57], [-8, 5, 'sip', 1.57]],
    ['phone', [2.6, 18, 'read', -0.6], [3, 7, 'look', Math.PI], [5.5, -5, 'read', 1.57]],
    ['cup', [-10.4, -20, 'sip', 1.5], [-6.4, -22], [0, -23, 'look', 1.57]],
  ],
  ice: [
    ['phone', [-3, 16, 'photo', -1.5], [-2, 4, 'look', -1.6], [-2, -13, 'photo', -0.7]],
    ['cup', [3, 19, 'sip', -1], [2, 5, 'look', 1.6], [2, -7, 'greet', -1.5]],
    ['phone', [0, -17, 'photo', 1.7], [6, -16, 'look', 2.6], [6, -6, 'read', 0.6]],
  ],
  springs: [
    ['phone', [-4, 5, 'photo', Math.PI], [-8, 1], [-8, -8, 'look', 1.57], [-7, 1]],
    ['cup', [3, 5, 'sip', Math.PI], [6, 15, 'greet', -1], [-3, 18, 'lunch', -1.57]],
    ['phone', [-13, 13, 'greet', -1.57], [-10, 11, 'read', 2], [-6, 14, 'photo', -0.65]],
  ],
  pearl: [
    ['phone', [-34, -2, 'read', 3], [-27, -6.7, 'look', Math.PI], [-15, -6.8, 'photo', Math.PI]],
    ['cup', [-32, 6.9, 'sip', 0], [-22, 4.2, 'greet', -1], [-10, 7.4, 'look', 0]],
    ['phone', [9, -5, 'read', 0], [18, -10, 'photo', Math.PI], [29, -8, 'look', Math.PI]],
    ['cup', [6, 52, 'look', -1.5], [9, 49, 'greet', 1.57], [14, 49], [16.6, 51.6, 'lunch', 1.57], [16.5, 47.2, 'sip', 1.57], [14, 49]],
  ],
  dover: [
    // Coffee outside the house, mail on the way out, a visit and lunch,
    // then back along the west sidewalk to the driveway.
    ['cup', [1145.8, -984, 'sip', 1.57], [1152, -983.6], [1151.7, -978.7, 'mail', -1.5],
      [1152.2, -968.8, 'greet', -1.57], [1151.5, -971.2, 'lunch', -1.57], [1152, -983.6]],
    ['cup', [1166.7, -986.8, 'greet', -1.57], [1166.7, -1006, 'sip', -1.57], [1166.6, -1020, 'look', 1.57]],
    ['parcel', [1152.2, -1004, 'collect', 1.57], [1152.2, -983.5], [1145.5, -983.5, 'deliver', -1.57], [1152.2, -983.5]],
    ['phone', [1166.8, -950, 'read', 1.57], [1166.9, -933, 'greet', 1.57], [1172, -927.5, 'photo', -0.3]],
  ],
};

const dwell = { read: 5.5, photo: 6, sip: 8, greet: 3.5, mail: 4, look: 5, lunch: 14, collect: 3, deliver: 3.5 };
const angle = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const floors = { airport: 0.022, ice: 0.004, pearl: 0.048, springs: 0.03 };

// Some travel stops open on a playing field or parking plaza, well away from
// the mapped trails. Include the people using the space at the landing itself.
const arrivals = {
  commons: [
    ['bottle', [1514, -1834, 'sip', Math.PI], [1538, -1834, 'look', Math.PI], [1557, -1834, 'greet', -1.57]],
    ['phone', [1520, -1826, 'photo', Math.PI], [1502, -1826, 'read', 0.2]],
  ],
  flatiron: [
    ['phone', [-5514, -1420, 'read', 1.57], [-5490, -1420], [-5457, -1420, 'greet', 1.57]],
    ['cup', [-5481, -1418, 'sip', -1.57], [-5502, -1418, 'greet', Math.PI]],
  ],
  northmoor: [
    ['bottle', [865, -2138, 'sip', 1.6], [887, -2152, 'look', -1.4], [902, -2138, 'greet', 0]],
    ['phone', [868, -2118, 'photo', -0.5], [883, -2106, 'lunch', 0.9]],
  ],
};

// Take separate walks along actual sidewalk or trail segments near each park
// entrance. Clip to the furnished, walkable part of the mapped pavement.
function trailErrands(data, blocked) {
  const b = data.bounds;
  const center = data.id
    ? { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }
    : SPAWN;
  const choices = [];
  for (const { points, type } of data.paths) {
    if (!/Sidewalk|Multi-Use Path|Soft Surface Trail/.test(type)) continue;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 9) continue;
      const dx = (bx - ax) / length, dz = (bz - az) / length;
      const half = Math.min(17, length / 2 - 0.7);
      const along = Math.max(half, Math.min(length - half, (center.x - ax) * dx + (center.z - az) * dz));
      const x = ax + along * dx, z = az + along * dz;
      choices.push({ x, z, dx, dz, half, distance: Math.hypot(x - center.x, z - center.z) });
    }
  }
  const chosen = [], walks = [...(arrivals[data.id] ?? [])];
  for (const p of choices.sort((a, b) => a.distance - b.distance)) {
    if (chosen.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 23)) continue;
    const { x, z, dx, dz, half } = p;
    const a = { x: x - half * dx, z: z - half * dz }, b = { x: x + half * dx, z: z + half * dz };
    if (blocked(a.x, a.z) || !clearTrail(a, b, blocked)) continue;
    const i = walks.length, yaw = Math.atan2(dz, -dx);
    walks.push([i % 2 ? 'cup' : 'phone', [a.x, a.z, 'greet', yaw], [x, z, i % 2 ? 'sip' : 'photo', yaw], [b.x, b.z, i % 2 ? 'lunch' : 'read', yaw + Math.PI]]);
    chosen.push(p);
    if (walks.length === 5) break;
  }
  return walks;
}

// Compile the complete round trip once. Each segment stores its start time
// and odometer so the same foot stays planted across corners and pauses.
export function dailyRoutines(data, blocked) {
  const plans = errands[data.id] ?? trailErrands(data, blocked);
  const routines = [];
  for (const [i, [item, ...stops]] of plans.entries()) {
    const speed = item === 'bottle' ? 2.35 : [1.18, 0.98, 1.38, 1.08, 1.24][i];
    const places = stops.map(([x, z, activity, yaw]) => ({ x, z, activity, yaw }));
    if (places.some((p) => blocked(p.x, p.z))) continue;
    const legs = [];
    let duration = 0, meters = 0, carrying = false;
    for (const [j, stop] of places.entries()) {
      const next = places[(j + 1) % places.length];
      if (stop.activity) {
        const hold = dwell[stop.activity];
        legs.push({ from: stop, to: stop, duration: hold, start: duration, meters, yaw: stop.yaw, activity: stop.activity, carrying });
        duration += hold;
        if (stop.activity === 'collect') carrying = true;
        if (stop.activity === 'deliver') carrying = false;
      }
      const route = walkingTrail(stop, next, blocked);
      if (!route.length) {
        legs.length = 0;
        break;
      }
      let from = stop;
      for (const to of route) {
        const distance = Math.hypot(to.x - from.x, to.z - from.z);
        if (distance > 0) {
          const travel = distance / speed;
          legs.push({ from, to, duration: travel, start: duration, meters, yaw: angle(from, to), activity: 'walk', carrying });
          meters += distance;
          duration += travel;
        }
        from = to;
      }
    }
    if (legs.length) {
      const onLawn = i < (arrivals[data.id]?.length ?? 0);
      const floorOffset = floors[data.id] ?? (onLawn ? 0.008 : 0.082);
      routines.push({ item, legs, duration, speed, floorOffset, offset: (8 + i * 15.1) % duration });
    }
  }
  return routines;
}

export function sampleRoutine(routine, time, out) {
  const t = (time + routine.offset) % routine.duration;
  const leg = routine.legs.find((leg) => t < leg.start + leg.duration) ?? routine.legs.at(-1);
  const age = t - leg.start, f = age / leg.duration;
  out.x = leg.from.x + (leg.to.x - leg.from.x) * f;
  out.z = leg.from.z + (leg.to.z - leg.from.z) * f;
  out.activity = leg.activity;
  out.progress = f;
  out.yaw = leg.yaw;
  out.carrying = f > 0.5 && leg.activity === 'collect' ? true :
    f > 0.5 && leg.activity === 'deliver' ? false : leg.carrying;
  out.stride = (leg.meters + (leg.activity === 'walk' ? age * routine.speed : 0)) * 5.2;
  return out;
}
