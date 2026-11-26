// A moving dish only needs a local walking route. Cross-town travel uses the hunt map.
export const TRACK_DELAY = 7;
export const TRAVEL_HINT_DISTANCE = 450;

export function clearTrail(from, to, blocked) {
  const dx = to.x - from.x,
    dz = to.z - from.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.65));
  for (let i = 1; i <= steps; i++) {
    if (blocked(from.x + (dx * i) / steps, from.z + (dz * i) / steps))
      return false;
  }
  return true;
}

class Frontier {
  items = [];
  push(node) {
    const a = this.items;
    let i = a.length;
    a.push(node);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].score <= node.score) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = node;
  }
  pop() {
    const a = this.items,
      first = a[0],
      end = a.pop();
    if (!a.length) return first;
    let i = 0;
    while (2 * i + 1 < a.length) {
      let child = 2 * i + 1;
      if (child + 1 < a.length && a[child + 1].score < a[child].score) child++;
      if (a[child].score >= end.score) break;
      a[i] = a[child];
      i = child;
    }
    a[i] = end;
    return first;
  }
}
const directions = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

export function walkingTrail(start, target, blocked) {
  const goal = { x: target.x, z: target.z };
  if (clearTrail(start, goal, blocked)) return [goal];
  const step = 3,
    margin = 72,
    visited = new Map(),
    queue = new Frontier();
  const lowX = Math.min(start.x, goal.x) - margin,
    highX = Math.max(start.x, goal.x) + margin;
  const lowZ = Math.min(start.z, goal.z) - margin,
    highZ = Math.max(start.z, goal.z) + margin;
  const first = {
    x: start.x,
    z: start.z,
    i: 0,
    j: 0,
    cost: 0,
    score: 0,
    parent: null,
  };
  queue.push(first);
  visited.set('0,0', first);
  while (queue.items.length && visited.size < 7800) {
    const node = queue.pop();
    if (visited.get(node.i + ',' + node.j) !== node) continue;
    if (
      Math.hypot(node.x - goal.x, node.z - goal.z) <= step * 1.6 &&
      clearTrail(node, goal, blocked)
    ) {
      const path = [goal];
      for (let n = node; n.parent; n = n.parent) path.push({ x: n.x, z: n.z });
      path.reverse();
      // Keep the turning points, so the needle stays steady on long, open stretches.
      let anchor = start;
      const turns = [];
      for (let i = 0; i < path.length; i++) {
        if (i + 1 < path.length && clearTrail(anchor, path[i + 1], blocked))
          continue;
        turns.push(path[i]);
        anchor = path[i];
      }
      return turns;
    }
    for (const [di, dj] of directions) {
      const i = node.i + di,
        j = node.j + dj,
        x = start.x + i * step,
        z = start.z + j * step;
      if (x < lowX || x > highX || z < lowZ || z > highZ) continue;
      const cost = node.cost + (di && dj ? Math.SQRT2 : 1) * step,
        key = i + ',' + j;
      if ((visited.get(key)?.cost ?? Infinity) <= cost) continue;
      const next = {
        x,
        z,
        i,
        j,
        cost,
        score: cost + Math.hypot(x - goal.x, z - goal.z),
        parent: node,
      };
      if (!clearTrail(node, next, blocked)) continue;
      visited.set(key, next);
      queue.push(next);
    }
  }
  return [];
}

export function relativeBearing(player, point, yaw) {
  const dx = point.x - player.x,
    dz = point.z - player.z;
  return Math.atan2(
    dx * Math.cos(yaw) - dz * Math.sin(yaw),
    -dx * Math.sin(yaw) - dz * Math.cos(yaw)
  );
}
