import { DISHES, SPAWN } from './field-data.js';

const atlases = new WeakMap();
const mapImages = new WeakMap();
export function loadMapImage(data) {
  if (!mapImages.has(data)) {
    const image = new Image();
    const ready = new Promise((resolve, reject) => {
      image.onload = () => {
        data.mapImage = image;
        atlases.delete(data);
        resolve(image);
      };
      image.onerror = () => {
        mapImages.delete(data);
        reject(Error('Unable to load map photography.'));
      };
    });
    mapImages.set(data, ready);
    image.src = data.orthophoto.url;
  }
  return mapImages.get(data);
}
function atlas(data) {
  const cached = atlases.get(data);
  if (cached && cached.revision === data.mapRevision) return cached.image;
  const a = document.createElement('canvas'),
    b = data.bounds;
  a.width = a.height = data.tiles ? 2304 : data.id ? 1024 : 1500;
  const c = a.getContext('2d'),
    sx = a.width / (b.maxX - b.minX),
    sy = a.height / (b.maxZ - b.minZ);
  c.fillStyle = '#2b3529';
  c.fillRect(0, 0, a.width, a.height);
  if (data.mapImage) {
    c.globalAlpha = 0.82;
    c.drawImage(data.mapImage, 0, 0, a.width, a.height);
    c.globalAlpha = 1;
  }
  for (const { rect: [x, z, w, d], color } of data.surfaces || []) {
    c.fillStyle = color;
    c.fillRect((x - b.minX) * sx, (z - b.minZ) * sy, w * sx, d * sy);
  }
  for (const t of data.trees || []) {
    c.fillStyle = data.surfaces ? '#4f644b' : '#394b3388';
    c.beginPath();
    c.arc(
      (t.x - b.minX) * sx,
      (t.z - b.minZ) * sy,
      Math.max(1, Math.min(data.surfaces ? 28 : 5, t.height * 0.22 * sx)),
      0,
      Math.PI * 2
    );
    c.fill();
  }
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
    c.fillStyle = '#a29d82aa';
    c.fill();
    c.strokeStyle = '#504d3c';
    c.lineWidth = 1;
    c.stroke();
  }
  for (const p of data.water || []) {
    path(p.points);
    c.fillStyle = '#4e726d';
    c.fill();
  }
  if (data.markings) {
    c.beginPath();
    for (let i = 0; i < data.markings.length; i += 6) {
      const a = data.markings;
      c.moveTo((a[i] - b.minX) * sx, (a[i + 2] - b.minZ) * sy);
      c.lineTo((a[i + 3] - b.minX) * sx, (a[i + 5] - b.minZ) * sy);
    }
    c.strokeStyle = '#e1e3c4be';
    c.lineWidth = 1.55;
    c.stroke();
  }
  for (const [lines, col] of [
    [data.roads, '#d3c5a4'],
    [data.paths || [], '#d6d2a3'],
  ]) {
    c.strokeStyle = col;
    for (const p of lines) {
      path(p.points);
      c.lineWidth = Math.max(0.75, p.width * sx * 0.8);
      c.stroke();
    }
  }
  atlases.set(data, { image: a, revision: data.mapRevision });
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
    route = [],
    destination = null,
    drawLandmarks,
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
  // Crop in source pixels before drawing. Large city atlases can exceed mobile
  // canvas limits when scaled to a 300 m neighborhood in a single draw call.
  function layer(map) {
    const b = map.bounds,
      left = Math.max(b.minX, x - width / 2),
      right = Math.min(b.maxX, x + width / 2);
    const top = Math.max(b.minZ, z - h / (2 * s)),
      bottom = Math.min(b.maxZ, z + h / (2 * s));
    if (left >= right || top >= bottom) return;
    const a = atlas(map),
      sx = a.width / (b.maxX - b.minX),
      sz = a.height / (b.maxZ - b.minZ);
    c.drawImage(
      a,
      (left - b.minX) * sx,
      (top - b.minZ) * sz,
      (right - left) * sx,
      (bottom - top) * sz,
      px(left),
      py(top),
      (right - left) * s,
      (bottom - top) * s
    );
  }
  layer(data);
  if (width < 3200) {
    for (const site of data.detailMaps || []) if (site.mapImage) layer(site);
  }
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
  if (labels && !data.tiles && !data.id) {
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
      textY = Math.max(
        14,
        Math.min(h - 5, y + labelOffsets[i % labelOffsets.length])
      );
    c.lineWidth = 3;
    c.strokeStyle = '#293327';
    c.strokeText(name, textX, textY);
    c.fillText(name, textX, textY);
  });
  if (labels && data.detailMaps && width < 3200) {
    const used = places.map((p) => [px(p.x), py(p.z)]);
    c.font = '500 11px monospace';
    c.lineWidth = 3;
    for (const site of data.detailMaps)
      for (const place of site.landmarks || []) {
        let x = px(place.x),
          y = py(place.z);
        if (
          x < 6 ||
          x > w - 12 ||
          y < 17 ||
          y > h - 9 ||
          used.some(([a, b]) => Math.abs(a - x) < 94 && Math.abs(b - y) < 18)
        )
          continue;
        const label = place.name
          .replace(/ public art by .*/, '')
          .replace(/^The Field Trailhead Parking$/, 'Trailhead');
        const labelX = Math.max(
          3,
          Math.min(x + 5, w - c.measureText(label).width - 4)
        );
        c.fillStyle = '#e5e7d6';
        c.fillRect(x - 1.5, y - 1.5, 3, 3);
        c.strokeStyle = '#343d31';
        c.strokeText(label, labelX, y - 4);
        c.fillText(label, labelX, y - 4);
        used.push([x, y]);
      }
  }
  if (drawLandmarks) {
    c.save();
    drawLandmarks(c, px, py);
    c.restore();
  }
  if (route.length > 1) {
    c.save();
    c.beginPath();
    route.forEach((p, i) =>
      i ? c.lineTo(px(p.x), py(p.z)) : c.moveTo(px(p.x), py(p.z))
    );
    c.strokeStyle = '#342717';
    c.lineWidth = 5;
    c.stroke();
    c.strokeStyle = '#ffd077';
    c.lineWidth = 2.5;
    c.setLineDash([6, 4]);
    c.stroke();
    c.restore();
  }
  if (destination) {
    c.save();
    c.translate(px(destination.x), py(destination.z));
    c.fillStyle = '#ffd077';
    c.strokeStyle = '#372819';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2,
        r = i % 2 ? 4 : 9;
      const dx = Math.cos(angle) * r,
        dy = Math.sin(angle) * r;
      if (i) c.lineTo(dx, dy);
      else c.moveTo(dx, dy);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
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
