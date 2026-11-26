export const SPAWN = { x: -44, z: 20 };
export const LIMIT = 300;
export const DISHES = [
  {
    id: 'corn',
    stop: 0,
    name: 'Corn on the cob',
    color: '#e7b149',
    x: -60,
    z: 16,
    spot: 'West lawn',
  },
  {
    id: 'mash',
    stop: 1,
    name: 'Mashed potatoes',
    color: '#e8d6a8',
    x: -112,
    z: -47,
    spot: 'Community Park',
  },
  {
    id: 'beans',
    stop: 2,
    name: 'Green beans',
    color: '#a5b870',
    x: -169,
    z: -94,
    spot: 'Northwest lawn',
  },
  {
    id: 'berries',
    stop: 3,
    name: 'Cranberry sauce',
    color: '#d57072',
    x: 134,
    z: -72,
    spot: 'East of the garden',
  },
  {
    id: 'stuffing',
    stop: 4,
    name: 'Herb stuffing',
    color: '#d29862',
    x: 206,
    z: 29,
    spot: 'Ballfields approach',
  },
  {
    id: 'yams',
    stop: 5,
    name: 'Candied yams',
    color: '#ea9452',
    x: 55,
    z: 76,
    spot: 'Pond overlook',
  },
  {
    id: 'pumpkinPie',
    name: 'Pumpkin pie',
    color: '#de8850',
    x: -90,
    z: 8,
    spot: 'West lawn',
    stop: 0,
    dessert: true,
  },
  {
    id: 'applePie',
    name: 'Lattice apple pie',
    color: '#daae70',
    x: -138,
    z: -43,
    spot: 'West trail',
    stop: 1,
    dessert: true,
  },
  {
    id: 'cookie',
    name: 'Chocolate chunk cookie',
    color: '#c99967',
    x: -103,
    z: -96,
    spot: 'North lawn',
    stop: 2,
    dessert: true,
  },
  {
    id: 'gingerbread',
    name: 'Gingerbread runner',
    color: '#c78658',
    x: 99,
    z: -54,
    spot: 'Garden trail',
    stop: 3,
    dessert: true,
  },
  {
    id: 'cupcake',
    name: 'Maple cupcake',
    color: '#e5ae86',
    x: 165,
    z: 20,
    spot: 'Ballfields approach',
    stop: 4,
    dessert: true,
  },
  {
    id: 'cinnamonRoll',
    name: 'Cinnamon roll',
    color: '#cc966d',
    x: 25,
    z: 60,
    spot: 'Pond overlook',
    stop: 5,
    dessert: true,
  },
];
export function dishSpawn(dish, mode) {
  if (mode !== 'city') return { x: dish.x, z: dish.z };
  const stop = TRAVEL[dish.stop];
  if (dish.dessert) return { x: stop.x - 7, z: stop.z + 19 };
  if (dish.stop === 0) return { x: dish.x, z: dish.z };
  return { x: stop.x - 13, z: stop.z };
}
export const formatTime = (seconds) =>
  Math.floor(seconds / 60) +
  ':' +
  String(Math.floor(seconds % 60)).padStart(2, '0');
let request;
export function fieldData() {
  request ??= fetch('/geo/broomfield.json')
    .then((r) => {
      if (!r.ok) throw Error('The Broomfield field map could not load.');
      return r.json();
    })
    .catch((e) => {
      request = null;
      throw e;
    });
  return request;
}
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
// Surveyed trunk location, crown spread and low boughs define both the 3D trees and their collision footprint.
const TREES = {
  pine: { aspect: 0.49, lowBranches: 0, crown: 0.44 },
  maple: { aspect: 0.92, lowBranches: 0.19, crown: 0.45 },
  gold: { aspect: 1.11, lowBranches: 0.065, crown: 0.45 },
  bare: { aspect: 0.857, lowBranches: 0.2, crown: 0.39 },
};
export function treeShape(tree) {
  const species = (tree.species || '').toLowerCase();
  const seed = Math.abs(Math.floor(tree.x * 3.7 + tree.z * 5.3)) % 10;
  let variety = 'maple';
  if (tree.type === 'Coniferous') variety = 'pine';
  else if (species.includes('cottonwood') || species.includes('aspen'))
    variety = 'gold';
  else if (species.includes('oak') || seed === 1 || seed === 3)
    variety = 'bare';
  else if (seed < 6) variety = 'gold';
  const { aspect, lowBranches, crown } = TREES[variety];
  const height =
    (tree.height || 8) * (0.88 + 0.24 * Math.abs(Math.sin(tree.x + tree.z)));
  const width = height * aspect;
  // Intersect low boughs at turkey height. Tall, high-crowned trees only block at the trunk.
  const fullness =
    variety === 'pine'
      ? 1
      : Math.max(0, Math.min(1, (2.1 / height - lowBranches) / 0.15));
  return {
    variety,
    height,
    width,
    radius: Math.max(0.25, width * (0.075 + (crown - 0.075) * fullness)),
  };
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
export const BODY_RADIUS = 0.62;
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
    const add = (feature, minX, maxX, minZ, maxZ) => {
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
    };
    for (const { points } of [
      ...data.buildings,
      ...data.water,
      ...signs.map(signFootprint),
    ]) {
      const xs = points.map((p) => p[0]),
        zs = points.map((p) => p[1]);
      add(
        { points },
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...zs),
        Math.max(...zs)
      );
    }
    for (const tree of data.trees || []) {
      const { radius } = treeShape(tree);
      add(
        { x: tree.x, z: tree.z, radius },
        tree.x - radius,
        tree.x + radius,
        tree.z - radius,
        tree.z + radius
      );
    }
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
const atlases = new WeakMap();
function atlas(data) {
  if (atlases.has(data)) return atlases.get(data);
  const a = document.createElement('canvas'),
    b = data.bounds;
  a.width = a.height = data.tiles ? 2600 : 1700;
  const c = a.getContext('2d'),
    sx = a.width / (b.maxX - b.minX),
    sy = a.height / (b.maxZ - b.minZ);
  c.fillStyle = '#2b3529';
  c.fillRect(0, 0, a.width, a.height);
  function path(points) {
    c.beginPath();
    points.forEach(([x, z], i) =>
      i
        ? c.lineTo((x - b.minX) * sx, (z - b.minZ) * sy)
        : c.moveTo((x - b.minX) * sx, (z - b.minZ) * sy)
    );
  }
  for (const b of data.buildings || []) {
    path(b.points);
    c.fillStyle = '#545b49';
    c.fill();
  }
  for (const p of data.water || []) {
    path(p.points);
    c.fillStyle = '#4e726d';
    c.fill();
  }
  for (const [lines, col] of [
    [data.roads, '#878b72'],
    [data.paths || [], '#797f68'],
  ]) {
    c.strokeStyle = col;
    for (const p of lines) {
      path(p.points);
      c.lineWidth = Math.max(0.75, p.width * sx * 0.8);
      c.stroke();
    }
  }
  atlases.set(data, a);
  return a;
}
export function drawMap(
  canvas,
  data,
  {
    x = 0,
    z = 0,
    width = 550,
    targets = DISHES,
    pickups = [],
    player = SPAWN,
    yaw = Math.PI / 2,
    labels = false,
    places = [],
    selected = -1,
  } = {}
) {
  const c = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    s = w / width;
  const px = (a) => (a - x) * s + w / 2,
    py = (b) => (b - z) * s + h / 2;
  c.fillStyle = '#262e24';
  c.fillRect(0, 0, w, h);
  const b = data.bounds;
  c.drawImage(
    atlas(data),
    px(b.minX),
    py(b.minZ),
    (b.maxX - b.minX) * s,
    (b.maxZ - b.minZ) * s
  );
  c.strokeStyle = '#9ba48724';
  c.lineWidth = 1;
  const grid = (width > 3000 ? 1000 : 50) * s;
  for (let a = px(0) % grid; a < w; a += grid) {
    c.beginPath();
    c.moveTo(a, 0);
    c.lineTo(a, h);
    c.stroke();
  }
  for (let b = py(0) % grid; b < h; b += grid) {
    c.beginPath();
    c.moveTo(0, b);
    c.lineTo(w, b);
    c.stroke();
  }
  if (labels && !data.tiles) {
    c.font = '500 12px "IBM Plex Mono", monospace';
    c.fillStyle = '#c2c7b6';
    c.shadowColor = '#171c16';
    c.shadowBlur = 4;
    for (const [name, a, b] of [
      ['Community Park', -189, -29],
      ['Library', -32, 106],
      ['Civic Center', -48, -179],
      ['Community Park Pond', 19, 33],
      ['The Bay', 240, -90],
    ])
      c.fillText(name, px(a), py(b));
    c.shadowBlur = 0;
  }
  c.font = '500 13px "IBM Plex Mono", monospace';
  const labelOffsets = [18, -11, 26, -11, -25, -9];
  places.forEach((p, i) => {
    const x = px(p.x),
      y = py(p.z);
    if (i === selected) {
      c.strokeStyle = '#ffbd70';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = '#dce0c9';
    c.fillRect(x - 2, y - 2, 4, 4);
    const name = p.name
      .replace('Broomfield County Commons Park', 'County Commons')
      .replace('Paul Derda Recreation Center', 'Paul Derda Center');
    const textX = Math.max(
        5,
        Math.min(x + 7, w - c.measureText(name).width - 6)
      ),
      textY = y + labelOffsets[i];
    c.lineWidth = 3;
    c.strokeStyle = '#293327';
    c.strokeText(name, textX, textY);
    c.fillText(name, textX, textY);
  });
  for (const item of pickups) {
    const x = px(item.x),
      y = py(item.z);
    c.fillStyle = '#70f0b2';
    c.fillRect(x - 2, y - 5, 4, 10);
    c.fillRect(x - 5, y - 2, 10, 4);
  }
  for (const t of targets.filter((t) => !t.caught)) {
    const pos = t.model?.position ?? t;
    c.save();
    c.translate(px(pos.x), py(pos.z));
    c.rotate(Math.PI / 4);
    c.fillStyle = '#ffad58';
    c.strokeStyle = '#33271b';
    c.lineWidth = 1.5;
    c.fillRect(-4, -4, 8, 8);
    c.strokeRect(-4, -4, 8, 8);
    c.restore();
  }
  c.save();
  c.translate(px(player.x), py(player.z));
  c.rotate(-yaw);
  c.fillStyle = '#f5f3e1';
  c.strokeStyle = '#20261c';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -9);
  c.lineTo(6, 7);
  c.lineTo(0, 4);
  c.lineTo(-6, 7);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  c.font = 'bold 11px monospace';
  c.fillStyle = '#e6e7ce';
  c.fillText('N', w - 19, 18);
}

export const TRAVEL = [
  { name: 'Community Park', ...SPAWN },
  { name: 'Brunner Farmhouse', x: -77, z: -828 },
  { name: 'Broomfield County Commons Park', x: 1527, z: -1842 },
  { name: 'FlatIron Crossing', x: -5500, z: -1420 },
  { name: 'Northmoor Park', x: 876, z: -2127 },
  { name: 'Paul Derda Recreation Center', x: 2710, z: -1727 },
];
let regionRequest;
export function regionData() {
  regionRequest ??= fetch('/geo/region.json')
    .then((r) => {
      if (!r.ok) throw Error('The regional map could not load.');
      return r.json();
    })
    .catch((e) => {
      regionRequest = null;
      throw e;
    });
  return regionRequest;
}
