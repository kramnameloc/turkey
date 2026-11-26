import oakForms from '../world/oak-forms.json' with { type: 'json' };
import { BODY_RADIUS, TURKEY_HEIGHT } from '../player/turkey-scale.js';

export function contains(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[i],
      [bx, bz] = points[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}
export function randomSeed(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function siteRandom(x, z) {
  const seed =
    Math.imul(Math.round(x * 100), 73856093) ^
    Math.imul(Math.round(z * 100), 19349663);
  return randomSeed(seed);
}
export function treeShape(tree) {
  const height = tree.surveyHeight || tree.height || 8;
  const random = siteRandom(tree.x, tree.z);
  const rotation = random() * Math.PI * 2;
  const shade = 0.86 + random() * 0.14;
  if (tree.type === 'Coniferous') {
    const width = height * 0.49;
    return {
      variety: 'pine',
      rotation,
      shade,
      height,
      width,
      radius: Math.max(0.25, width * 0.44),
    };
  }
  // Overlap age classes around inventory height bands. The actual height stays
  // in meters and the selected model's native spread determines the crown.
  const age = height * (0.9 + random() * 0.2);
  const forms =
    age < 2.6
      ? oakForms.sapling
      : age < 7.2
        ? oakForms.small
        : age < 14.5
          ? oakForms.medium
          : oakForms.mature;
  const form = forms[Math.floor(random() * forms.length)];
  const width = height * form.aspect * (0.93 + 0.14 * random());
  const lowBoughs = Math.max(
    0,
    Math.min(1, (TURKEY_HEIGHT / height - form.low) / 0.15)
  );
  const radius = Math.max(
    0.04,
    width * (form.trunk + (0.42 - form.trunk) * lowBoughs)
  );
  return { variety: form.id, rotation, shade, height, width, radius };
}
export const PARK_SIGNS = [
  { title: 'COMMUNITY PARK', x: -67, z: 26.8, angle: 1.89 },
  { title: 'POND OVERLOOK', x: 57.8, z: 68.7, angle: 0.68 },
];
export const SIGN_WIDTH = 3.8,
  SIGN_DEPTH = 0.16;
function signFootprint({ x, z, angle }) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const points = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => {
    const along = (u * SIGN_WIDTH) / 2,
      across = (v * SIGN_DEPTH) / 2;
    return [x + along * c + across * s, z - along * s + across * c];
  });
  return { points };
}
// Add occasional young oaks under mapped park oaks, clear of pavement and
// existing obstacles. A parent's coordinates determine its offset on every visit.
export function plantParkSaplings(data, solids) {
  const saplings = [];
  const pavement = [...data.paths, ...data.roads];
  for (const parent of data.trees) {
    if (
      !/oak/i.test(parent.species) ||
      (parent.surveyHeight || parent.height) < 7
    )
      continue;
    const random = siteRandom(parent.z, parent.x);
    if (random() > 0.32) continue;
    const angle = random() * 2 * Math.PI;
    const distance = treeShape(parent).width * (0.28 + random() * 0.2);
    const x = parent.x + Math.cos(angle) * distance;
    const z = parent.z + Math.sin(angle) * distance;
    if (solids.blocked(x, z)) continue;
    // Leave space for the benches and lamps that line the park paths.
    const onPath = pavement.some(({ points, width }) =>
      points.some(
        ([bx, bz], i) =>
          i > 0 &&
          segmentDistanceSq(x, z, ...points[i - 1], bx, bz) <
            (width / 2 + 3.5) ** 2
      )
    );
    if (onPath) continue;
    const sapling = { x, z, height: 0.8 + random() * 0.8, species: 'Oak' };
    solids.addTree(sapling);
    saplings.push(sapling);
  }
  return saplings;
}
export function segmentDistanceSq(x, z, ax, az, bx, bz) {
  const dx = bx - ax,
    dz = bz - az;
  const along = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))
  );
  return (ax + along * dx - x) ** 2 + (az + along * dz - z) ** 2;
}
export class Obstacles {
  constructor(data, signs = []) {
    this.cells = new Map();
    this.bounds = data.bounds;
    for (const { points } of [
      ...data.buildings,
      ...data.water,
      ...signs.map(signFootprint),
    ]) {
      const xs = points.map((p) => p[0]),
        zs = points.map((p) => p[1]);
      this.indexFeature(
        { points },
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...zs),
        Math.max(...zs)
      );
    }
    for (const tree of data.trees || []) this.addTree(tree);
  }
  indexFeature(feature, minX, maxX, minZ, maxZ) {
    for (
      let i = Math.floor((minX - BODY_RADIUS) / 30);
      i <= Math.floor((maxX + BODY_RADIUS) / 30);
      i++
    ) {
      for (
        let j = Math.floor((minZ - BODY_RADIUS) / 30);
        j <= Math.floor((maxZ + BODY_RADIUS) / 30);
        j++
      ) {
        const key = i + ',' + j;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(feature);
      }
    }
  }
  addTree(tree) {
    const { radius } = treeShape(tree);
    this.indexFeature(
      { x: tree.x, z: tree.z, radius },
      tree.x - radius,
      tree.x + radius,
      tree.z - radius,
      tree.z + radius
    );
  }
  occupied(x, z) {
    const features = this.cells.get(
      Math.floor(x / 30) + ',' + Math.floor(z / 30)
    );
    if (!features) return false;
    for (const f of features) {
      if (f.points) {
        if (contains(f.points, x, z)) return true;
        for (let i = 0, j = f.points.length - 1; i < f.points.length; j = i++) {
          const a = f.points[i],
            b = f.points[j];
          if (
            segmentDistanceSq(x, z, a[0], a[1], b[0], b[1]) <=
            BODY_RADIUS ** 2
          )
            return true;
        }
      } else if (
        (f.x - x) ** 2 + (f.z - z) ** 2 <=
        (f.radius + BODY_RADIUS) ** 2
      )
        return true;
    }
    return false;
  }
  blocked(x, z) {
    const b = this.bounds;
    return (
      x < b.minX + BODY_RADIUS ||
      z < b.minZ + BODY_RADIUS ||
      x > b.maxX - BODY_RADIUS ||
      z > b.maxZ - BODY_RADIUS ||
      this.occupied(x, z)
    );
  }
}
// Resolve axes independently to allow sliding along a wall. Substeps are
// narrower than the body so even a single facade edge stops a sprint.
export function slideMove(position, dx, dz, blocked) {
  const steps = Math.ceil(Math.hypot(dx, dz) / 0.4);
  for (let i = 0; i < steps; i++) {
    const x = position.x + dx / steps,
      z = position.z + dz / steps;
    if (!blocked(x, position.z)) position.x = x;
    if (!blocked(position.x, z)) position.z = z;
  }
}
