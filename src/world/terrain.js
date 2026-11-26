import * as T from 'three';

function sample(grid, x, z) {
  const { bounds: b, columns, rows, values } = grid;
  const u = T.MathUtils.clamp(
    ((x - b.minX) * (columns - 1)) / (b.maxX - b.minX),
    0,
    columns - 1
  );
  const v = T.MathUtils.clamp(
    ((z - b.minZ) * (rows - 1)) / (b.maxZ - b.minZ),
    0,
    rows - 1
  );
  const i = Math.min(columns - 2, Math.floor(u)),
    j = Math.min(rows - 2, Math.floor(v));
  const p = j * columns + i;
  return T.MathUtils.lerp(
    T.MathUtils.lerp(values[p], values[p + 1], u - i),
    T.MathUtils.lerp(values[p + columns], values[p + columns + 1], u - i),
    v - j
  );
}

function coordinates(fine, coarse, min, max, size) {
  const values = new Set();
  for (const grid of [fine, coarse]) {
    for (let i = 0; i < grid[size]; i++)
      values.add(
        grid.bounds[min] +
          ((grid.bounds[max] - grid.bounds[min]) * i) / (grid[size] - 1)
      );
  }
  return [...values].sort((a, b) => a - b);
}

function interval(coords, point) {
  let low = 0,
    high = coords.length - 1;
  while (high - low > 1) {
    const mid = (high + low) >> 1;
    if (coords[mid] <= point) low = mid;
    else high = mid;
  }
  return low;
}

// Both photographic ground meshes share their boundary vertices. Walkers,
// trees, and pavement interpolate the exact triangles that the renderer draws.
export function makeTerrain(fine, coarse, park) {
  const xs = coordinates(fine, coarse, 'minX', 'maxX', 'columns');
  const zs = coordinates(fine, coarse, 'minZ', 'maxZ', 'rows');
  const heights = new Float32Array(xs.length * zs.length);
  for (const [j, z] of zs.entries()) {
    for (const [i, x] of xs.entries()) {
      const edge = Math.min(
        x - fine.bounds.minX,
        fine.bounds.maxX - x,
        z - fine.bounds.minZ,
        fine.bounds.maxZ - z
      );
      const weight = T.MathUtils.smoothstep(edge, 0, 120);
      const regional = sample(coarse, x, z);
      heights[j * xs.length + i] =
        (weight === 0
          ? regional
          : T.MathUtils.lerp(regional, sample(fine, x, z), weight)) -
        coarse.originMeters;
    }
  }
  function height(x, z) {
    const i = interval(xs, x),
      j = interval(zs, z);
    const u = T.MathUtils.clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1);
    const v = T.MathUtils.clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1);
    const p = j * xs.length + i,
      n = xs.length;
    if (u + v <= 1)
      return heights[p] * (1 - u - v) + heights[p + 1] * u + heights[p + n] * v;
    return (
      heights[p + n + 1] * (u + v - 1) +
      heights[p + n] * (1 - u) +
      heights[p + 1] * (1 - v)
    );
  }
  function ground(bounds, imageBounds) {
    const firstX = xs.indexOf(bounds.minX),
      lastX = xs.indexOf(bounds.maxX);
    const firstZ = zs.indexOf(bounds.minZ),
      lastZ = zs.indexOf(bounds.maxZ);
    const positions = [],
      uvs = [],
      faces = [],
      columns = lastX - firstX + 1;
    for (let j = firstZ; j <= lastZ; j++) {
      for (let i = firstX; i <= lastX; i++) {
        const x = xs[i],
          z = zs[j];
        positions.push(x, heights[j * xs.length + i], z);
        uvs.push(
          (x - imageBounds.minX) / (imageBounds.maxX - imageBounds.minX),
          (imageBounds.maxZ - z) / (imageBounds.maxZ - imageBounds.minZ)
        );
        if (i < lastX && j < lastZ) {
          const a = (j - firstZ) * columns + i - firstX;
          faces.push(
            a,
            a + columns,
            a + 1,
            a + 1,
            a + columns,
            a + columns + 1
          );
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geo.setIndex(faces);
    return geo;
  }
  // Clip a surveyed ribbon triangle against the grid and its diagonal. All
  // components after x/z (such as UVs) interpolate along the clipped edges.
  function drape(triangle, visit) {
    const x = triangle.map((p) => p[0]),
      z = triangle.map((p) => p[1]);
    const firstX = interval(xs, Math.min(...x)),
      lastX = interval(xs, Math.max(...x));
    const firstZ = interval(zs, Math.min(...z)),
      lastZ = interval(zs, Math.max(...z));
    function cut(poly, distance) {
      const result = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k],
          b = poly[(k + 1) % poly.length];
        const da = distance(a),
          db = distance(b);
        if (da >= 0) result.push(a);
        if (da * db < 0) {
          const t = da / (da - db);
          result.push(a.map((value, n) => value + t * (b[n] - value)));
        }
      }
      return result;
    }
    for (let j = firstZ; j <= lastZ; j++) {
      for (let i = firstX; i <= lastX; i++) {
        let polygon = triangle;
        if (i > firstX) polygon = cut(polygon, (p) => p[0] - xs[i]);
        if (i < lastX) polygon = cut(polygon, (p) => xs[i + 1] - p[0]);
        if (j > firstZ) polygon = cut(polygon, (p) => p[1] - zs[j]);
        if (j < lastZ) polygon = cut(polygon, (p) => zs[j + 1] - p[1]);
        if (polygon.length < 3) continue;
        const width = xs[i + 1] - xs[i],
          depth = zs[j + 1] - zs[j];
        const diag = (p) => (p[0] - xs[i]) / width + (p[1] - zs[j]) / depth - 1;
        for (const direction of [-1, 1]) {
          const face = cut(polygon, (p) => direction * diag(p));
          for (let k = 1; k < face.length - 1; k++) {
            for (const point of [face[0], face[k], face[k + 1]])
              visit(point, height(point[0], point[1]));
          }
        }
      }
    }
  }
  function groundPatch(bounds) {
    const { minX, maxX, minZ, maxZ } = bounds;
    const nw = [minX, minZ, 0, 1],
      ne = [maxX, minZ, 1, 1];
    const sw = [minX, maxZ, 0, 0],
      se = [maxX, maxZ, 1, 0];
    const positions = [],
      uvs = [];
    const write = ([x, z, u, v], h) => {
      positions.push(x, h, z);
      uvs.push(u, v);
    };
    drape([nw, sw, ne], write);
    drape([ne, sw, se], write);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    return geo;
  }
  function chunks(box, imageBounds) {
    const list = [],
      maxI = xs.indexOf(box.maxX),
      maxJ = zs.indexOf(box.maxZ);
    for (let j = zs.indexOf(box.minZ); j < maxJ; j += 52) {
      for (let i = xs.indexOf(box.minX); i < maxI; i += 52) {
        list.push(
          ground(
            {
              minX: xs[i],
              maxX: xs[Math.min(i + 52, maxI)],
              minZ: zs[j],
              maxZ: zs[Math.min(j + 52, maxJ)],
            },
            imageBounds
          )
        );
      }
    }
    return list;
  }
  const b = coarse.bounds;
  return {
    height,
    groundPatch,
    drape,
    parkGround: () => ground(park, park),
    regionGround: () =>
      [
        { ...b, maxZ: park.minZ },
        { ...b, minZ: park.maxZ },
        { ...b, maxX: park.minX, minZ: park.minZ, maxZ: park.maxZ },
        { ...b, minX: park.maxX, minZ: park.minZ, maxZ: park.maxZ },
      ].flatMap((box) => chunks(box, b)),
  };
}
