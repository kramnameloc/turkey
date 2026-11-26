import * as T from 'three';
import { SIGN_DEPTH, SIGN_WIDTH } from './field.js';

// Representative board locations on the verge of a surveyed trail or sidewalk.
export const siteSigns = {
  brunner: { title: 'Brunner Farmhouse', x: -106.14, z: -822.27, angle: 4.91 },
  commons: { title: 'County Commons', x: 1525.88, z: -1919.42, angle: 2.722 },
  flatiron: {
    title: 'FlatIron Crossing',
    x: -5500.24,
    z: -1326.61,
    angle: -0.003,
  },
  northmoor: { title: 'Northmoor Park', x: 874.22, z: -2228.56, angle: -3.124 },
  derda: {
    title: 'Paul Derda Recreation Center',
    lines: ['Paul Derda', 'Recreation Center'],
    x: 2719.18,
    z: -1729.92,
    angle: 5.02,
  },
};

function vicinityMap(c, data, photo, x, z) {
  const w = 420,
    h = 248,
    pixelsPerMeter = 1.1;
  c.save();
  c.translate(592, 15);
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  c.fillStyle = '#d8d9b9';
  c.fillRect(0, 0, w, h);
  const { minX, maxX, minZ, maxZ } = data.bounds;
  const px = (u) => (u - x) * pixelsPerMeter + w / 2;
  const py = (v) => (v - z) * pixelsPerMeter + h / 2;
  c.globalAlpha = 0.31;
  c.drawImage(
    photo,
    px(minX),
    py(minZ),
    (maxX - minX) * pixelsPerMeter,
    (maxZ - minZ) * pixelsPerMeter
  );
  c.globalAlpha = 1;
  c.lineCap = c.lineJoin = 'round';
  function trace(points) {
    c.beginPath();
    points.forEach(([u, v], i) => {
      if (i) c.lineTo(px(u), py(v));
      else c.moveTo(px(u), py(v));
    });
  }
  for (const pond of data.water ?? []) {
    trace(pond.points);
    c.fillStyle = '#6b9b9b';
    c.fill();
  }
  for (const [lines, color] of [
    [data.roads, '#626960'],
    [data.paths, '#fff1c6'],
  ]) {
    c.strokeStyle = color;
    for (const line of lines) {
      if (line.type.includes('Bike Lane')) continue;
      trace(line.points);
      c.lineWidth = Math.max(2, line.width * pixelsPerMeter * 0.84);
      c.stroke();
    }
  }
  c.fillStyle = '#ae492d';
  c.strokeStyle = '#fff8e1';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(w / 2, h / 2, 7, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#233d39';
  c.beginPath();
  c.moveTo(w - 22, 12);
  c.lineTo(w - 28, 30);
  c.lineTo(w - 22, 27);
  c.lineTo(w - 16, 30);
  c.fill();
  c.font = 'bold 16px sans-serif';
  c.textAlign = 'center';
  c.fillText('N', w - 22, 47);
  c.restore();
}

function enamelPanel({ title, lines = [title], x, z }, data, photo) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 328;
  const c = canvas.getContext('2d');
  c.fillStyle = '#203f3b';
  c.fillRect(0, 0, 1024, 328);
  // A three-ink mountain illustration runs below the lettering on each board.
  c.fillStyle = '#dd9c55';
  c.beginPath();
  c.arc(464, 218, 36, 0, Math.PI * 2);
  c.fill();
  for (const [ink, ridge] of [
    [
      '#739487',
      '0 233 82 202 126 207 194 172 222 183 278 148 346 195 391 180 490 225 582 201',
    ],
    [
      '#496e61',
      '0 261 95 224 149 236 221 183 196 223 279 152 248 212 292 182 270 218 345 198 434 249 517 229 582 246',
    ],
    ['#34564c', '0 294 95 254 161 259 241 233 322 253 418 227 523 259 582 253'],
  ]) {
    c.fillStyle = ink;
    c.fill(new Path2D('M0 328 L' + ridge + ' V328 Z'));
  }
  c.fillStyle = '#edc682';
  c.font = '600 23px "Barlow", sans-serif';
  c.fillText('BROOMFIELD   /   COLORADO', 31, 52);
  c.fillStyle = '#fff5d9';
  c.font = '700 72px "Barlow Condensed", sans-serif';
  lines.forEach((line, i) =>
    c.fillText(line.toUpperCase(), 28, 135 + i * 61, 524)
  );

  c.fillStyle = '#ece6cd';
  c.fillRect(579, 0, 445, 328);
  vicinityMap(c, data, photo, x, z);
  c.fillStyle = '#ae492d';
  c.beginPath();
  c.arc(608, 296, 6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#294139';
  c.font = '700 22px "Barlow Condensed", sans-serif';
  c.fillText('YOU ARE HERE', 625, 303);
  c.font = '600 19px "Barlow", sans-serif';
  c.fillText('50 m', 903, 289);
  c.fillRect(903, 296, 55, 4); // 50 metres at the printed map scale
  for (const u of [10, 1014])
    for (const v of [10, 318]) {
      c.fillStyle = '#666a57';
      c.beginPath();
      c.arc(u, v, 3.1, 0, Math.PI * 2);
      c.fill();
    }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const timber = new T.BoxGeometry(1, 1, 1);
const frameFinish = new T.MeshLambertMaterial();
const panel = new T.PlaneGeometry(SIGN_WIDTH - 0.11, 1.17);

export function trailSign(site, data, photo, height) {
  const { x, z, angle } = site;
  const base = height(x, z);
  const group = new T.Group();
  group.name = site.title + ' trail map';
  group.position.set(x, base, z);
  group.rotation.y = angle;
  const parts = [];
  for (const dx of [-1.62, 1.62]) {
    const foot =
      height(x + dx * Math.cos(angle), z - dx * Math.sin(angle)) - base - 0.08;
    const shoulder = 0.82;
    parts.push([
      dx,
      (shoulder + foot) / 2,
      0.18,
      shoulder - foot,
      0.14,
      '#8e7151',
    ]);
    parts.push([dx, foot + 0.18, 0.195, 0.36, SIGN_DEPTH, '#47534d']);
  }
  parts.push([0, 1.43, SIGN_WIDTH, 1.25, 0.13, '#665441']);
  parts.push([0, 2.06, SIGN_WIDTH, 0.04, SIGN_DEPTH, '#4a554b']);
  parts.push([0, 0.811, SIGN_WIDTH, 0.047, SIGN_DEPTH, '#a18158']);
  const frame = new T.InstancedMesh(timber, frameFinish, parts.length);
  const transform = new T.Matrix4();
  parts.forEach(([dx, y, w, h, d, finish], i) => {
    frame.setMatrixAt(i, transform.makeScale(w, h, d).setPosition(dx, y, 0));
    frame.setColorAt(i, new T.Color(finish));
  });
  group.add(frame);
  const enamel = new T.MeshLambertMaterial({
    map: enamelPanel(site, data, photo),
  });
  for (const side of [-1, 1]) {
    const face = new T.Mesh(panel, enamel);
    face.position.set(0, 1.43, side * 0.069);
    face.rotation.y = side < 0 ? Math.PI : 0;
    group.add(face);
  }
  return group;
}
