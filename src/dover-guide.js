// Join the nearest point on the marked walk. Looking ahead along the next
// few meters keeps the bearing stable when the player steps off the route.
export function doverLeg(p, route) {
  let index = 0,
    join,
    gap = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)
      )
    );
    const x = a.x + t * dx,
      z = a.z + t * dz,
      d = Math.hypot(p.x - x, p.z - z);
    if (d < gap) {
      gap = d;
      join = { x, z };
      index = i;
    }
  }
  const points = [p, join, ...route.slice(index)];
  let remaining = 0,
    next = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length && !next && remaining + length >= 18) {
      const t = (18 - remaining) / length;
      next = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining += length;
  }
  return { next: next || route.at(-1), distance: remaining, points };
}
