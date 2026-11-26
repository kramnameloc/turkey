import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { segmentDistanceSq } from './field.js';

export async function loadStreetscape() {
  const { scene } = await new GLTFLoader().loadAsync('/models/streetscape.glb');
  const models = new Map();
  for (const root of scene.children) {
    const parts = [];
    root.traverse((node) => {
      if (!node.isMesh) return;
      const mat = node.material;
      if (mat.name === 'Brunch_material') {
        mat.transparent = false;
        mat.alphaTest = 0.44;
        mat.side = T.DoubleSide;
      }
      parts.push(node);
    });
    models.set(root.name, parts);
  }
  return models;
}

function matrix(x, y, z, yaw, sx = 1, sy = sx, sz = sx) {
  return new T.Matrix4()
    .makeRotationY(yaw)
    .scale(new T.Vector3(sx, sy, sz))
    .setPosition(x, y, z);
}

function instances(group, parts, transforms, name) {
  if (!transforms.length) return;
  for (const part of parts) {
    const mesh = new T.InstancedMesh(
      part.geometry,
      part.material,
      transforms.length
    );
    mesh.name = name;
    transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

export function streetSegments(lines) {
  return lines.flatMap(({ points, width }) =>
    points.slice(1).map(([bx, bz], i) => {
      const [ax, az] = points[i];
      return { ax, az, bx, bz, half: width / 2 };
    })
  );
}

function closestStreet(x, z, roads) {
  let best = Infinity,
    result;
  for (const { ax, az, bx, bz } of roads) {
    const dx = bx - ax,
      dz = bz - az;
    const t = T.MathUtils.clamp(
      ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1),
      0,
      1
    );
    const rx = ax + t * dx - x,
      rz = az + t * dz - z,
      distance = rx * rx + rz * rz;
    if (distance < best) {
      best = distance;
      result = { rx, rz };
    }
  }
  return result;
}

// Fit a single-story model only to compact, nearly rectangular detached homes.
// Keep civic buildings, irregular footprints and taller houses in the GIS mesh.
function ranchSite(b, streets) {
  if (b.type !== 'Single Family' || b.points.length < 4) return;
  const ring = b.points;
  let longest = 0,
    ux,
    uz,
    twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, z] = ring[i],
      [nx, nz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(nx - x, nz - z);
    if (len > longest) {
      longest = len;
      ux = (nx - x) / len;
      uz = (nz - z) / len;
    }
    twiceArea += x * nz - z * nx;
  }
  if (!longest) return;
  const a = ring.map(([x, z]) => x * ux + z * uz);
  const bAxis = ring.map(([x, z]) => -x * uz + z * ux);
  const alo = Math.min(...a),
    ahi = Math.max(...a),
    blo = Math.min(...bAxis),
    bhi = Math.max(...bAxis);
  let width = ahi - alo,
    depth = bhi - blo,
    h = b.roofHeight ?? 4.8;
  const x = (ux * (ahi + alo)) / 2 - (uz * (bhi + blo)) / 2,
    z = (uz * (ahi + alo)) / 2 + (ux * (bhi + blo)) / 2;
  // July 2026 Street View shows a row of one-story ranches on the west side
  // of Main between First and Second. Two tall lidar returns sit under crowns.
  const mainRow = x > -303 && x < -275 && z > 23 && z < 267;
  if (mainRow) {
    if (h > 7) h = 4;
    if (Math.abs(uz) < Math.abs(ux)) {
      [ux, uz] = [-uz, ux];
      [width, depth] = [depth, width];
    }
  }
  if (
    width < 11 ||
    width > 24 ||
    depth < 7 ||
    depth > (mainRow ? 20 : 15) ||
    width / depth < (mainRow ? 0.78 : 1.15) ||
    width / depth > 2.45 ||
    h < 3.25 ||
    h > 6.2 ||
    Math.abs(twiceArea) / (2 * width * depth) < (mainRow ? 0.73 : 0.89)
  )
    return;
  const front = closestStreet(x, z, streets);
  if (!front) return;
  const facing = -uz * front.rx + ux * front.rz;
  if (Math.abs(facing) < 0.65 * Math.hypot(front.rx, front.rz)) return;
  const sign = Math.sign(facing),
    fx = -uz * sign,
    fz = ux * sign;
  return { x, z, fx, fz, yaw: Math.atan2(fx, fz), width, depth, h, mainRow };
}

export function ranchHouses(buildings, roads, models, height, plant) {
  const mainFronts = [];
  const houses = new Set(),
    houseMatrices = { RanchHouse: [], BrickRanch: [] };
  const size = new T.Box3();
  for (const p of models.get('RanchHouse')) {
    p.geometry.computeBoundingBox();
    size.union(p.geometry.boundingBox);
  }
  const houseSize = size.getSize(new T.Vector3());
  for (const b of buildings) {
    const h = ranchSite(b, roads);
    if (!h) continue;
    const base = b.points.map(([x, z]) => height(x, z)).sort((a, b) => a - b);
    // Use the lowest corner for the foundation and match the measured roof at the lot center.
    const bottom = base[0] - 0.07;
    const style =
      h.mainRow || Math.abs(Math.round(h.x + h.z)) % 3 === 0
        ? 'BrickRanch'
        : 'RanchHouse';
    houseMatrices[style].push(
      matrix(
        h.x,
        bottom,
        h.z,
        h.yaw,
        h.width / houseSize.x,
        (h.h + base[Math.floor(base.length / 2)] - bottom) / houseSize.y,
        h.depth / houseSize.z
      )
    );
    houses.add(b);
    if (h.mainRow) mainFronts.push(h);
    if (!plant) continue;
    for (const side of [-1, 1]) {
      const offset = side * h.width * 0.31;
      const x = h.x + h.fx * (h.depth / 2 + 1.35) + h.fz * offset;
      const z = h.z + h.fz * (h.depth / 2 + 1.35) - h.fx * offset;
      const seed = Math.abs(Math.round(x * 9 + z * 13));
      if (seed % 4)
        plant(
          seed % 2 ? 'LowShrub' : 'RoundShrub',
          x,
          z,
          seed * 0.71,
          0.32,
          0.8 + (seed % 6) * 0.08
        );
    }
  }
  const homes = new T.Group();
  for (const [name, transforms] of Object.entries(houseMatrices))
    instances(homes, models.get(name), transforms, name);
  return { homes, houses, mainFronts };
}

export function streetScenery(
  data,
  junctions,
  models,
  height,
  solids,
  owns = () => true
) {
  const group = new T.Group();
  group.name = 'Broomfield streetscape';
  const positions = new Map();
  const signals = [];
  let signalCrossing;
  const roads = streetSegments(
    data.roads.filter((r) => r.type !== 'Parking Lot')
  );
  const paths = streetSegments(data.paths);
  const touches = (x, z, lines, r) =>
    lines.some(
      (s) => segmentDistanceSq(x, z, s.ax, s.az, s.bx, s.bz) < (s.half + r) ** 2
    );
  function prop(name, x, z, yaw, r, scale = 1) {
    if (
      !owns(x, z) ||
      solids.occupied(x, z) ||
      touches(x, z, roads, r) ||
      touches(x, z, paths, r)
    )
      return false;
    if (!positions.has(name)) positions.set(name, []);
    positions.get(name).push(matrix(x, height(x, z), z, yaw, scale));
    solids.indexFeature({ x, z, radius: r }, x - r, x + r, z - r, z + r);
    return true;
  }
  const { homes, houses, mainFronts } = ranchHouses(
    data.buildings,
    roads,
    models,
    height,
    prop
  );
  const frontWalks = [];
  const sidewalks = streetSegments(
    data.paths.filter((p) => p.type.includes('Sidewalk'))
  );
  // The west walk is visible in the Main Street panorama; the park trail
  // inventory contains its crossing endpoint at First but omits this block.
  const westWalk = {
    type: 'Detached Sidewalk',
    width: 1.65,
    points: [
      [-267.4, 22],
      [-266.1, 270.9],
    ],
  };
  if (mainFronts.length && !touches(-266.75, 146.5, sidewalks, 1.5)) {
    frontWalks.push(westWalk);
    sidewalks.push(...streetSegments([westWalk]));
  }
  for (const h of mainFronts) {
    const x = h.x + h.fx * h.depth * 0.5 + h.fz * h.width * 0.22,
      z = h.z + h.fz * h.depth * 0.5 - h.fx * h.width * 0.22;
    const end = closestStreet(x, z, sidewalks);
    if (!end) continue;
    const length = Math.hypot(end.rx, end.rz);
    if (
      length < 1 ||
      length > 25 ||
      end.rx * h.fx + end.rz * h.fz < length * 0.8
    )
      continue;
    let open = true;
    for (let d = 1; d < length; d += 0.6) {
      if (
        solids.occupied(x + (end.rx * d) / length, z + (end.rz * d) / length)
      ) {
        open = false;
        break;
      }
    }
    if (open)
      frontWalks.push({
        type: 'Detached Sidewalk',
        width: 1.15,
        points: [
          [x, z],
          [x + end.rx, z + end.rz],
        ],
      });
  }
  paths.push(...streetSegments(frontWalks));
  for (const {
    point: [x, z],
    arms,
    radius,
  } of junctions.values()) {
    if (!radius || !owns(x, z)) continue;
    const names = new Set(arms.map((a) => a.line.name));
    const signal = names.has('Main St') && names.has('E 1St Ave');
    if (signal) signalCrossing = { x, z };
    for (const a of arms) {
      const { dx, dz, line } = a;
      const minor =
        line.type === 'Local' &&
        line.name &&
        line.name !== 'Unnamed Street' &&
        arms.some(
          (b) =>
            b.line.name !== line.name && /Arterial|Connector/.test(b.line.type)
        );
      if (!signal && !minor) continue;
      const setback = signal ? -(radius + 3.3) : radius + 3.5;
      // A near-side stop sign faces approaching traffic. At Main and First the
      // signal mast sits on the far corner, with its arm over the incoming lane.
      placement: for (const shift of signal ? [0, -1.5, -3] : [0]) {
        for (const extra of [1.1, 2.8, 4.5]) {
          const lateral = line.width * 0.5 + extra;
          if (
            prop(
              signal
                ? Math.abs(dz) > 0.7
                  ? 'SignalNS'
                  : 'SignalEW'
                : 'StopSign',
              x + dx * (setback + shift) + dz * lateral,
              z + dz * (setback + shift) - dx * lateral,
              signal ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz),
              0.16
            )
          )
            break placement;
        }
      }
    }
  }
  const furniture = [];
  for (const path of data.paths.filter((p) => p.type === 'Multi-Use Path')) {
    for (let i = 1; i < path.points.length; i++) {
      const [ax, az] = path.points[i - 1],
        [bx, bz] = path.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 6) continue;
      const x = (ax + bx) / 2,
        z = (az + bz) / 2;
      if (
        !owns(x, z) ||
        furniture.some((p) => Math.hypot(x - p.x, z - p.z) < 44)
      )
        continue;
      const dx = (bx - ax) / len,
        dz = (bz - az) / len,
        off = path.width / 2 + 1.1,
        yaw = Math.atan2(-dz, dx);
      if (!prop('Bench', x + dz * off, z - dx * off, yaw, 0.85)) continue;
      furniture.push({ x, z });
      if (furniture.length % 2) {
        prop(
          'RoundShrub',
          x + dz * (off + 2.5) - dx * 2,
          z - dx * (off + 2.5) - dz * 2,
          yaw,
          0.38
        );
        prop(
          'LowShrub',
          x + dz * (off + 2.1) - dx * 2.9,
          z - dx * (off + 2.1) - dz * 2.9,
          yaw + 1.2,
          0.32
        );
      }
      prop('PathLamp', x - dz * off, z + dx * off, yaw, 0.14);
      prop(
        furniture.length % 3 ? 'LitterBin' : 'RecyclingBin',
        x + dz * off + dx * 2,
        z - dx * off + dz * 2,
        yaw,
        0.49
      );
      break;
    }
  }
  for (const line of data.roads.filter(
    (r) => r.name && /Local|Minor Arterial|Connector/.test(r.type)
  )) {
    let along = 0,
      next = 24;
    for (let i = 1; i < line.points.length; i++) {
      const [ax, az] = line.points[i - 1],
        [bx, bz] = line.points[i],
        len = Math.hypot(bx - ax, bz - az);
      if (!len) continue;
      const dx = (bx - ax) / len,
        dz = (bz - az) / len;
      for (; next < along + len; next += 95) {
        const x = ax + dx * (next - along),
          z = az + dz * (next - along);
        const off = line.width / 2 + 0.8;
        prop('Hydrant', x + dz * off, z - dx * off, Math.atan2(-dz, dx), 0.25);
        if (/Arterial|Connector/.test(line.type))
          prop(
            'Streetlamp',
            x - dz * (off + 0.45),
            z + dx * (off + 0.45),
            Math.atan2(-dx, -dz) + Math.PI,
            0.18
          );
      }
      along += len;
    }
  }
  for (const [name, transforms] of positions) {
    if (name === 'SignalNS' || name === 'SignalEW') {
      const parts = models.get('Signal').map((part) => {
        const lens = /^Traffic_Light_(Red|Yellow|Green)$/.exec(
          part.material.name
        );
        if (!lens) return part;
        const material = part.material.clone();
        material.metalness = 0.1;
        const light = lens[1];
        material.emissive.setHex(
          { Red: 0xff2311, Yellow: 0xffac12, Green: 0x1de67d }[light]
        );
        material.color.copy(material.emissive).multiplyScalar(0.1);
        signals.push({ material, light, northSouth: name === 'SignalNS' });
        return { geometry: part.geometry, material };
      });
      instances(group, parts, transforms, 'Signal');
    } else {
      instances(group, models.get(name), transforms, name);
    }
  }
  let lastSecond = -1;
  function updateSignals(time) {
    const second = Math.floor(time) % 32;
    if (second === lastSecond) return;
    lastSecond = second;
    for (const { material, light, northSouth } of signals) {
      const phase = (second + (northSouth ? 0 : 16)) % 32;
      const active = phase < 12 ? 'Green' : phase < 15 ? 'Yellow' : 'Red';
      material.emissiveIntensity = light === active ? 1.25 : 0;
    }
  }
  updateSignals(0);
  return { group, homes, houses, frontWalks, updateSignals, signalCrossing };
}
