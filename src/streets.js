import * as T from 'three';

const SIDEWALK = 1,
  TRAIL = 2,
  PATH = 3,
  CROSSWALK = 4;
const LOCAL = 5,
  TWO_WAY = 6,
  DIVIDED = 7,
  UNMARKED = 8;
const inPark = (x, z) => Math.abs(x) < 680 && Math.abs(z) < 680;
const nodeKey = ([x, z]) => Math.round(x) + ',' + Math.round(z);

function surfaceType(line) {
  if (line.type.includes('Sidewalk')) return SIDEWALK;
  if (line.type.includes('Soft Surface')) return TRAIL;
  if (line.type.includes('Path')) return PATH;
  if (line.type === 'Cross-walk') return CROSSWALK;
  if (/Parking Lot|Bike Lane/.test(line.type)) return 0;
  if (/Arterial|Connector/.test(line.type))
    return line.oneWay ? (line.width >= 11 ? DIVIDED : LOCAL) : TWO_WAY;
  return line.type === 'Local' ? LOCAL : UNMARKED;
}

// Each arm points out of its junction. Survey lines often split mid-block as well.
export function streetJunctions(roads) {
  const nodes = new Map();
  for (const line of roads) {
    if (line.type === 'Parking Lot' || line.points.length < 2) continue;
    for (const end of [0, line.points.length - 1]) {
      const point = line.points[end],
        step = end ? -1 : 1;
      let n = end + step;
      while (
        line.points[n] &&
        Math.hypot(line.points[n][0] - point[0], line.points[n][1] - point[1]) <
          1
      )
        n += step;
      if (!line.points[n]) continue;
      const dx = line.points[n][0] - point[0],
        dz = line.points[n][1] - point[1],
        length = Math.hypot(dx, dz);
      const key = nodeKey(point);
      if (!nodes.has(key)) nodes.set(key, { point, arms: [], radius: 0 });
      const node = nodes.get(key);
      node.arms.push({ line, dx: dx / length, dz: dz / length });
      if (node.arms.length >= 3)
        node.radius = Math.max(...node.arms.map((a) => a.line.width)) * 0.5 + 1;
    }
  }
  return nodes;
}

export async function streetMaterials(texture) {
  const [asphalt, concrete, iron] = await Promise.all([
    texture('/scenery/street-asphalt.webp', true),
    texture('/scenery/street-concrete.webp', true),
    texture('/scenery/street-ironwork.webp'),
  ]);
  const surface = new T.MeshBasicMaterial({ map: asphalt, side: T.DoubleSide });
  surface.onBeforeCompile = (shader) => {
    shader.uniforms.concreteMap = { value: concrete };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 street;
        varying vec4 vStreet;
        varying vec2 vGround;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vStreet = street;
        vGround = position.xz;`
      );
    // Lateral/longitudinal UVs are in meters; ground coordinates keep the
    // asphalt aggregate continuous where separately surveyed streets intersect.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D concreteMap;
        varying vec4 vStreet;
        varying vec2 vGround;
        float band(float distanceToCenter, float halfWidth, float aa) {
          return 1.0 - smoothstep(halfWidth-aa, halfWidth+aa, distanceToCenter);
        }`
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 road = vMapUv;
        float kind = floor(vStreet.x + .5), halfWidth = vStreet.y;
        vec3 bitumen = texture2D(map, vGround * .38).rgb;
        vec3 slab = texture2D(concreteMap, vGround * .51).rgb;
        float patina = texture2D(map, vGround * .073).r;
        bitumen *= .82 + patina * 2.2;
        float aa = clamp(fwidth(road.x)*.5, .001, .2);
        float ay = clamp(fwidth(road.y)*.5, .001, .2);
        float wear = clamp(.63 + bitumen.r * 2.0, .62, .93);
        vec3 color = bitumen;
        if (kind == ${SIDEWALK}.) {
          float joint = band(abs(fract(road.y / 1.6 + .5)-.5)*1.6, .009, ay);
          color = slab * (1.0 - .52 * joint);
          color *= mix(.68, 1.0, smoothstep(.015,.065,halfWidth-abs(road.x)));
        } else if (kind == ${TRAIL}.) {
          color = slab * vec3(.92,.73,.50) * (.77 + 2.8 * bitumen.r);
        } else if (kind == ${PATH}.) {
          color = bitumen * 1.28;
        } else if (kind == ${CROSSWALK}.) {
          color = mix(bitumen,vec3(.79,.77,.69),wear);
        } else {
          float beforeCorner = min(road.y-vStreet.z,vStreet.w-road.y);
          float clear = smoothstep(0.,.35,beforeCorner);
          if (kind != ${UNMARKED}.) {
            float edge = halfWidth - abs(road.x);
            float gutter = 1.0-smoothstep(.32-aa,.32+aa,edge);
            float seam = band(abs(edge-.33),.018,aa);
            color = mix(color,slab*.73,gutter*clear);
            color *= 1.0 - .47*seam*clear;
          }
          if (kind == ${TWO_WAY}. || kind == ${DIVIDED}.) {
            float wheel = (abs(abs(road.x)-halfWidth*.5)-.76)/.31;
            float tracks = exp(-wheel*wheel);
            color *= 1.0 - tracks*.14*clear;
            float stripe = band(abs(abs(road.x)-.12),.057,aa);
            vec3 pigment = vec3(.86,.53,.105);
            if (kind == ${DIVIDED}.) {
              stripe = band(abs(road.x),.065,aa) * band(abs(fract(road.y/10.)-.5)*10.,1.5,ay);
              pigment = vec3(.79,.77,.69);
            }
            color = mix(color,pigment,stripe*wear*smoothstep(4.9,5.0,beforeCorner));
          }
        }
        diffuseColor.rgb *= color;`
      );
  };
  return {
    surface,
    iron: new T.MeshBasicMaterial({
      map: iron,
      alphaTest: 0.42,
      side: T.DoubleSide,
    }),
  };
}

function buffer() {
  return { positions: [], uvs: [], styles: [] };
}
function meshFrom(data, material, name) {
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(data.uvs, 2));
  if (data.styles.length)
    geo.setAttribute('street', new T.Float32BufferAttribute(data.styles, 4));
  const mesh = new T.Mesh(geo, material);
  mesh.name = name;
  return mesh;
}
function quad(terrain, corners, write) {
  terrain.drape([corners[0], corners[1], corners[2]], write);
  terrain.drape([corners[0], corners[2], corners[3]], write);
}

function rowsFor(points, splitAtPark = false) {
  const path = [];
  let length = 0;
  for (const [x, z] of points) {
    const prev = path.at(-1);
    if (prev && x === prev.x && z === prev.z) continue;
    if (prev) {
      const dx = x - prev.x,
        dz = z - prev.z,
        step = Math.hypot(dx, dz);
      const count = Math.ceil(step / 40),
        cuts = [];
      for (let j = 1; j < count; j++) cuts.push(j / count);
      if (splitAtPark) {
        for (const edge of [-680, 680]) {
          for (const t of [(edge - prev.x) / dx, (edge - prev.z) / dz]) {
            if (t > 0 && t < 1) cuts.push(t);
          }
        }
      }
      for (const t of [...new Set(cuts)].sort((a, b) => a - b))
        path.push({
          x: prev.x + dx * t,
          z: prev.z + dz * t,
          length: length + step * t,
        });
      length += step;
    }
    path.push({ x, z, length });
  }
  for (let i = 0; i < path.length; i++) {
    const row = path[i],
      before = path[i - 1],
      after = path[i + 1];
    const normal = (a, b) => {
      const d = b.length - a.length;
      return [-(b.z - a.z) / d, (b.x - a.x) / d];
    };
    const a = before && normal(before, row),
      b = after && normal(row, after);
    const left = a || b || [0, 0],
      right = b || left;
    const divisor = Math.max(0.55, 1 + left[0] * right[0] + left[1] * right[1]);
    row.nx = (left[0] + right[0]) / divisor;
    row.nz = (left[1] + right[1]) / divisor;
  }
  return path;
}
function along(a, b, d) {
  const t = (d - a.length) / (b.length - a.length);
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    nx: a.nx + (b.nx - a.nx) * t,
    nz: a.nz + (b.nz - a.nz) * t,
    length: d,
  };
}

export function pavement(
  lines,
  terrain,
  materials,
  junctions,
  { regional = false, crossingRoads = [] } = {}
) {
  const intersections = new Set();
  const chunks = new Map(),
    group = new T.Group();
  function chunk(x, z) {
    const key = regional
      ? Math.floor(x / 1000) + ',' + Math.floor(z / 1000)
      : 'park';
    if (!chunks.has(key)) chunks.set(key, buffer());
    return chunks.get(key);
  }
  // The survey connects sidewalk endpoints. Keep crossing paint on the part
  // that actually overlaps a carriageway, including median and corner gaps.
  function onRoad(x, z) {
    return crossingRoads.some(
      (line) =>
        line.type !== 'Parking Lot' &&
        line.points.some(([bx, bz], i) => {
          if (!i) return false;
          const [ax, az] = line.points[i - 1],
            dx = bx - ax,
            dz = bz - az;
          const t = T.MathUtils.clamp(
            ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1),
            0,
            1
          );
          return (
            Math.hypot(x - ax - dx * t, z - az - dz * t) <
            line.width * 0.49 - 0.2
          );
        })
    );
  }
  for (const line of lines) {
    const kind = surfaceType(line);
    if (!kind || !line.width) continue;
    const path = rowsFor(line.points, regional && kind <= CROSSWALK);
    if (path.length < 2) continue;
    const length = path.at(-1).length,
      half = line.width * 0.49;
    const first = junctions.get(nodeKey(line.points[0])),
      last = junctions.get(nodeKey(line.points.at(-1)));
    if (kind >= LOCAL) {
      if (first?.radius) intersections.add(first);
      if (last?.radius) intersections.add(last);
    }
    const start = first?.radius || -20;
    const end = length - (last?.radius || -20);
    const strip = (a, b, left, right, h0, h1) => {
      if (regional && inPark((a.x + b.x) / 2, (a.z + b.z) / 2)) return;
      const target = chunk((a.x + b.x) / 2, (a.z + b.z) / 2);
      const corner = (r, w, h) => [
        r.x + r.nx * w,
        r.z + r.nz * w,
        w,
        r.length,
        h,
      ];
      quad(
        terrain,
        [
          corner(a, left, h0),
          corner(a, right, h1),
          corner(b, right, h1),
          corner(b, left, h0),
        ],
        ([x, z, u, v, h], ground) => {
          target.positions.push(x, ground + h, z);
          target.uvs.push(u, v);
          target.styles.push(kind, half, start, end);
        }
      );
    };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (kind === CROSSWALK) {
        for (
          let d = Math.floor(a.length / 0.95) * 0.95;
          d < b.length;
          d += 0.95
        ) {
          const lo = Math.max(a.length, d),
            hi = Math.min(b.length, d + 0.45);
          if (hi <= lo) continue;
          const mid = along(a, b, (lo + hi) / 2);
          if (onRoad(mid.x, mid.z))
            strip(along(a, b, lo), along(a, b, hi), -half, half, 0.042, 0.042);
        }
      } else if (kind === SIDEWALK) {
        strip(a, b, -half, -half + 0.065, 0.012, 0.077);
        strip(a, b, -half + 0.065, half - 0.065, 0.077, 0.077);
        strip(a, b, half - 0.065, half, 0.077, 0.012);
      } else {
        const lift = kind === PATH || kind === TRAIL ? 0.034 : 0.013;
        strip(a, b, -half, half, lift, lift);
      }
    }
  }
  // Cap the gaps between angled approaches below the road ribbons. This leaves
  // a continuous asphalt apron while preserving the markings on each approach.
  for (const { point, arms, radius } of intersections) {
    const [x, z] = point;
    const rim = arms.flatMap(({ line, dx, dz }) =>
      [-0.49, 0.49].map((side) => [
        x + dx * radius - dz * side * line.width,
        z + dz * radius + dx * side * line.width,
      ])
    );
    rim.sort(
      (a, b) => Math.atan2(a[1] - z, a[0] - x) - Math.atan2(b[1] - z, b[0] - x)
    );
    const target = chunk(x, z);
    for (let i = 0; i < rim.length; i++) {
      terrain.drape(
        [point, rim[i], rim[(i + 1) % rim.length]],
        ([px, pz], h) => {
          target.positions.push(px, h + 0.009, pz);
          target.uvs.push(0, 0);
          target.styles.push(UNMARKED, 0, 0, 0);
        }
      );
    }
  }
  for (const data of chunks.values())
    group.add(meshFrom(data, materials.surface, 'Surveyed pavement'));
  return group;
}

function signCorners(junctions, contains) {
  const signs = [];
  for (const {
    point: [x, z],
    arms,
    radius,
  } of junctions.values()) {
    if (!radius || !contains(x, z)) continue;
    const ordered = [...arms].sort(
      (a, b) => Math.atan2(a.dz, a.dx) - Math.atan2(b.dz, b.dx)
    );
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i],
        b = ordered[(i + 1) % ordered.length];
      if (!a.line.name || !b.line.name || a.line.name === b.line.name) continue;
      if (
        [a, b].some(
          ({ line }) =>
            /Private|Driveway|Freeway|Alley/.test(line.type) ||
            /^(Ramp|Unnamed Street)$/i.test(line.name)
        )
      )
        continue;
      const sine = a.dx * b.dz - a.dz * b.dx,
        cosine = a.dx * b.dx + a.dz * b.dz;
      if (sine < 0.7 || cosine > 0.48) continue;
      // Intersect the two curb offsets inside this corner's wedge.
      const offsetA = a.line.width * 0.49 + 1.45,
        offsetB = b.line.width * 0.49 + 1.45;
      const px = x + (a.dx * offsetB + b.dx * offsetA) / sine;
      const pz = z + (a.dz * offsetB + b.dz * offsetA) / sine;
      signs.push({ x: px, z: pz, arms: [a, b] });
      break;
    }
  }
  return signs;
}

function streetSigns(signs, height) {
  const group = new T.Group();
  if (!signs.length) return group;
  const names = [
    ...new Set(signs.flatMap((s) => s.arms.map((a) => a.line.name))),
  ];
  // Give each street one atlas cell. Both faces carry the name in reading order.
  const cellW = 320,
    cellH = 64,
    cols = Math.ceil(Math.sqrt((names.length * cellH) / cellW)),
    rows = Math.ceil(names.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d'),
    labels = new Map();
  ctx.font = '600 39px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  names.forEach((raw, i) => {
    const name = raw.replace(
      /(\d)(St|Nd|Rd|Th)\b/g,
      (_, n, s) => n + s.toLowerCase()
    );
    const x = (i % cols) * cellW + 3,
      y = Math.floor(i / cols) * cellH + 3,
      h = cellH - 6;
    const w = Math.min(cellW - 6, Math.ceil(ctx.measureText(name).width) + 30);
    ctx.fillStyle = '#1b5140';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d3e2d6';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = '#fffdf1';
    ctx.fillText(name, x + w / 2, y + h / 2 + 1, w - 24);
    labels.set(raw, {
      width: (w / h) * 0.235,
      u0: x / canvas.width,
      u1: (x + w) / canvas.width,
      v0: 1 - (y + h) / canvas.height,
      v1: 1 - y / canvas.height,
    });
  });
  const atlas = new T.CanvasTexture(canvas);
  atlas.colorSpace = T.SRGBColorSpace;
  atlas.anisotropy = 8;
  const faces = buffer(),
    posts = new T.InstancedMesh(
      new T.CylinderGeometry(0.032, 0.042, 2.19, 8),
      new T.MeshLambertMaterial({ color: '#89918a' }),
      signs.length
    );
  const matrix = new T.Matrix4();
  signs.forEach(({ x, z, arms }, i) => {
    const y = height(x, z);
    posts.setMatrixAt(i, matrix.makeTranslation(x, y + 2.19 / 2, z));
    arms.forEach(({ line, dx, dz }, j) => {
      const l = labels.get(line.name),
        bottom = y + 2.18 + j * 0.235;
      for (const side of [-1, 1]) {
        const points = [
          [-1, 0, l.u0, l.v0],
          [1, 0, l.u1, l.v0],
          [1, 1, l.u1, l.v1],
          [-1, 1, l.u0, l.v1],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [s, t, u, v] = points[k],
            along = (s * side * l.width) / 2;
          faces.positions.push(
            x + dx * along - dz * side * 0.004,
            bottom + t * 0.235,
            z + dz * along + dx * side * 0.004
          );
          faces.uvs.push(u, v);
        }
      }
    });
  });
  group.add(
    posts,
    meshFrom(
      faces,
      new T.MeshBasicMaterial({ map: atlas }),
      'Street name blades'
    )
  );
  return group;
}

// Small hardware is only built for the park and the detailed neighborhood maps.
export function streetDetails(
  roads,
  junctions,
  terrain,
  materials,
  contains = () => true
) {
  const group = streetSigns(signCorners(junctions, contains), terrain.height),
    iron = buffer();
  for (const line of roads) {
    if (!/Local|Connector|Minor Arterial/.test(line.type) || !line.name)
      continue;
    const path = rowsFor(line.points);
    if (path.length < 2) continue;
    const start = path[0],
      length = path.at(-1).length;
    const seed = Math.abs(
      Math.imul(Math.round(start.x * 10), 73856093) ^
        Math.imul(Math.round(start.z * 10), 19349663)
    );
    for (const cover of [true, false]) {
      const spacing = (cover ? 89 : 66) + (seed % 17);
      let d = 12 + (seed % (spacing - 10));
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i];
        for (; d < b.length && d < length - 9; d += spacing) {
          const row = along(a, b, d),
            n = Math.hypot(row.nx, row.nz) || 1;
          const nx = row.nx / n,
            nz = row.nz / n;
          const side = (seed + Math.floor(d / spacing)) % 2 ? -1 : 1;
          const off =
            side * (cover ? line.width * 0.24 : line.width * 0.49 - 0.24);
          const x = row.x + nx * off,
            z = row.z + nz * off;
          if (!contains(x, z)) continue;
          const width = cover ? 0.67 : 0.32,
            depth = cover ? 0.67 : 0.76;
          const uv0 = cover ? 4 / 128 : 68 / 128,
            uv1 = uv0 + 56 / 128;
          const corner = (u, v) => [
            x + (u - 0.5) * width * nx + (v - 0.5) * depth * nz,
            z + (u - 0.5) * width * nz - (v - 0.5) * depth * nx,
            uv0 + (uv1 - uv0) * (cover ? u : v),
            (4 + 56 * (cover ? v : u)) / 64,
          ];
          quad(
            terrain,
            [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
            ([px, pz, u, v], h) => {
              iron.positions.push(px, h + 0.024, pz);
              iron.uvs.push(u, v);
            }
          );
        }
      }
    }
  }
  if (iron.positions.length)
    group.add(meshFrom(iron, materials.iron, 'Street ironwork'));
  return group;
}
