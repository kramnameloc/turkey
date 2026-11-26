import { contains, segmentDistanceSq } from './field.js';

export function streetDisplayName(raw) {
  if (!raw || /^(Ramp|Unnamed Street)$/i.test(raw)) return '';
  return raw.replace(/(\d)(st|nd|rd|th)\b/gi, (suffix) => suffix.toLowerCase());
}

// Sidewalks can be set back from the curb. Only use that extra range when the
// player is standing on an actual sidewalk from the map.
const setback = 8;
const cellSize = 64;
const cellKey = (i, j) => i + ',' + j;

export function streetLocator(map) {
  const cells = new Map();
  function index(line, sidewalk) {
    const half = line.width / 2;
    const reach = sidewalk ? half : half + setback;
    const name = streetDisplayName(line.name);
    for (let n = 1; n < line.points.length; n++) {
      const [ax, az] = line.points[n - 1],
        [bx, bz] = line.points[n];
      const segment = { ax, az, bx, bz, half, name, sidewalk };
      for (
        let i = Math.floor((Math.min(ax, bx) - reach) / cellSize);
        i <= Math.floor((Math.max(ax, bx) + reach) / cellSize);
        i++
      ) {
        for (
          let j = Math.floor((Math.min(az, bz) - reach) / cellSize);
          j <= Math.floor((Math.max(az, bz) + reach) / cellSize);
          j++
        ) {
          const key = cellKey(i, j);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(segment);
        }
      }
    }
  }
  for (const road of map.roads) {
    if (road.type !== 'Parking Lot') index(road, false);
  }
  for (const area of [map, ...(map.detailMaps ?? [])]) {
    for (const path of area.paths ?? []) {
      if (path.type.includes('Sidewalk')) index(path, true);
    }
  }

  const bulbs = [];
  function streetAt(x, z, previous = '') {
    const nearby = cells.get(
      cellKey(Math.floor(x / cellSize), Math.floor(z / cellSize))
    );
    let closest = Infinity,
      street = '',
      nearestCurb = setback,
      beside = '',
      onWalk = false;
    for (const segment of nearby ?? []) {
      const { ax, az, bx, bz, half, name, sidewalk } = segment;
      const distance = Math.sqrt(segmentDistanceSq(x, z, ax, az, bx, bz));
      if (sidewalk) {
        if (distance <= half) onWalk = true;
      } else if (distance <= half) {
        // Keep the street the player entered until they clear the junction.
        if (previous && name === previous) return name;
        if (distance < closest) {
          closest = distance;
          street = name;
        }
      } else if (distance - half < nearestCurb) {
        nearestCurb = distance - half;
        beside = name;
      }
    }
    if (closest < Infinity) return street;
    for (const bulb of bulbs) {
      if (contains(bulb.points, x, z)) return bulb.name;
    }
    return onWalk ? beside : '';
  }
  for (const area of map.detailMaps ?? []) {
    if (!area.turningHead?.length) continue;
    // The first edge joins the circular pavement to the approach road.
    const [[ax, az], [bx, bz]] = area.turningHead;
    bulbs.push({
      name: streetAt((ax + bx) / 2, (az + bz) / 2),
      points: area.turningHead,
    });
  }
  return streetAt;
}
