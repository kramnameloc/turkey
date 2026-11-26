// Survey junctions around the Main Street and Community Park block, in marching order.
const parkCorners = [
  [-256.6, 15],
  [-255.4, 279.6],
  [-33.1, 280.1],
  [-32.5, 229.4],
  [-32.3, 168.5],
  [-147, 51.1],
  [-221, 21],
];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const mix = (a, b, t) => a + (b - a) * t;
const between = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The neighborhood procession follows the mapped Dover / E 7th Avenue Circle block.
export const doverCorners = [
  [1160, -1056],
  [1160, -967],
  [1198, -967],
  [1195, -1056],
];

export function paradeRoute(roads, corners = parkCorners) {
  const vertices = [];
  for (const [i, start] of corners.entries()) {
    const end = corners[(i + 1) % corners.length];
    const road = roads.find(
      ({ points }) =>
        (same(points[0], start) && same(points.at(-1), end)) ||
        (same(points[0], end) && same(points.at(-1), start))
    );
    if (!road) throw Error('Missing parade street at ' + start.join(', '));
    const path = same(road.points[0], start)
      ? road.points
      : [...road.points].reverse();
    for (const point of path.slice(0, -1))
      vertices.push({ point, width: road.width });
  }
  const points = [];
  let length = 0;
  function add([x, z], width) {
    const prev = points.at(-1);
    if (prev) length += Math.hypot(x - prev.x, z - prev.z);
    points.push({ x, z, width, distance: length });
  }
  // A short quadratic arc lets the handlers follow the bend within the asphalt.
  for (const [i, { point, width }] of vertices.entries()) {
    const prev = vertices.at(i - 1).point,
      next = vertices[(i + 1) % vertices.length].point;
    const before = distance(prev, point),
      after = distance(next, point);
    if (before === 0 || after === 0) continue;
    const trim = Math.min(4, before * 0.24, after * 0.24);
    const a = between(point, prev, trim / before),
      b = between(point, next, trim / after);
    for (let step = 0; step <= 24; step++) {
      const t = step / 24;
      add(between(between(a, point, t), between(point, b, t), t), width);
    }
  }
  add([points[0].x, points[0].z], points[0].width);
  function centerline(meters) {
    const d = ((meters % length) + length) % length;
    let lo = 0,
      hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (hi + lo) >>> 1;
      if (points[mid].distance > d) hi = mid;
      else lo = mid;
    }
    const a = points[lo],
      b = points[hi],
      span = b.distance - a.distance,
      t = (d - a.distance) / span;
    return { x: mix(a.x, b.x, t), z: mix(a.z, b.z, t), width: a.width };
  }
  function sample(meters, side = 0) {
    const p = centerline(meters);
    // A continuous street normal keeps inside handlers from stepping backward
    // when they cross from one short survey segment onto the next.
    const behind = centerline(meters - 4),
      ahead = centerline(meters + 4);
    const yaw = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    return {
      x: p.x + side * Math.cos(yaw),
      z: p.z - side * Math.sin(yaw),
      yaw,
      width: p.width,
    };
  }
  return { points, length, sample };
}
