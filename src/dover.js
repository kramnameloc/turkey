import * as T from 'three';
import { PORCH, PORCH_LANTERN, RELIC, hasGrail, collectGrail, hasRecipe, collectRecipe } from './dover-location.js';

const recipeSpot = { x: 3.43, z: -4.17 };
const crate = new T.BoxGeometry(1, 1, 1);
const paint = (color, props = {}) =>
  new T.MeshStandardMaterial({ color, ...props });
const colors = {
  timber: paint('#533424'),
  oak: paint('#ac7446'),
  trim: paint('#e7cfa4'),
  blue: paint('#32655f'),
  dark: paint('#153b38'),
  red: paint('#a8472d'),
  tile: paint('#d4b996'),
  metal: paint('#d69b39', { metalness: 0.52, roughness: 0.28 }),
  pane: paint('#93c3c8', { emissive: '#779fa2', emissiveIntensity: 0.5 }),
  lamp: paint('#ffe3a5', { emissive: '#ffb94d', emissiveIntensity: 0.9 }),
};
function mesh(parent, geo, mat, x, y, z) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function box(p, mat, x, y, z, w, h, d) {
  const m = mesh(p, crate, mat, x, y, z);
  m.scale.set(w, h, d);
  return m;
}
function plaque(p, lines, x, y, z, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round((768 * h) / w);
  const g = canvas.getContext('2d');
  g.fillStyle = '#273d33';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#d6af6b';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 752, canvas.height - 16);
  g.fillStyle = '#fff0c7';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    g.font =
      'bold ' +
      Math.floor((canvas.height / (lines.length + 1)) * 0.84) +
      'px Georgia';
    g.fillText(line, 384, ((i + 0.5) * canvas.height) / lines.length, 710);
  });
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  return mesh(
    p,
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({ map }),
    x,
    y,
    z
  );
}
function door(parent) {
  const { trim, blue, dark, metal } = colors;
  box(parent, trim, 0, 1.17, 0, 1.52, 2.34, 0.18);
  box(parent, blue, 0, 1.11, 0.12, 1.28, 2.18, 0.1);
  for (const y of [0.54, 1.52])
    box(parent, dark, 0, y, 0.18, 0.94, 0.61, 0.045);
  mesh(parent, new T.SphereGeometry(0.065, 10, 8), metal, 0.46, 1, 0.24);
}
// The collectible uses a small game emblem at the garage. The visible exterior
// comes from the regional building model, which also supplies the wall collision.
function makeQuestEmblem() {
  const group = new T.Group();
  group.position.set(PORCH.x, 0, PORCH.z);
  group.rotation.y = Math.PI / 2;
  // The brick pier beside the twin doors carries the house number and the
  // lantern players can pick out from the shuttle stop.
  const pier = PORCH_LANTERN.across;
  box(group, colors.timber, pier, 1.54, -0.105, 0.59, 0.29, 0.1);
  plaque(group, ['735'], pier, 1.54, -0.052, 0.55, 0.25);
  box(group, colors.dark, pier, 2.04, -0.11, 0.17, 0.34, 0.13);
  box(group, colors.dark, pier, 1.98, 0.055, 0.07, 0.07, 0.25);
  const lantern = new T.Group();
  lantern.position.set(pier, PORCH_LANTERN.up, PORCH_LANTERN.out);
  group.add(lantern);
  mesh(
    lantern,
    new T.CylinderGeometry(0.15, 0.11, 0.29, 4),
    colors.lamp,
    0,
    0,
    0
  );
  mesh(
    lantern,
    new T.CylinderGeometry(0.048, 0.2, 0.12, 4),
    colors.dark,
    0,
    0.19,
    0
  );
  mesh(
    lantern,
    new T.CylinderGeometry(0.13, 0.054, 0.09, 4),
    colors.dark,
    0,
    -0.18,
    0
  );
  for (let i = 0; i < 4; i++) {
    const frame = mesh(lantern, crate, colors.dark, 0, 0, 0);
    frame.scale.set(0.018, 0.31, 0.018);
    const angle = (i * Math.PI) / 2;
    frame.position.set(Math.sin(angle) * 0.13, 0, Math.cos(angle) * 0.13);
    frame.rotation.order = 'YXZ';
    frame.rotation.set(0.137, angle, 0);
  }
  return group;
}

function wovenRunner() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8e4432';
  g.fillRect(0, 0, 256, 512);
  function diamond(x, y, w, h, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + w, y);
    g.lineTo(x, y + h);
    g.lineTo(x - w, y);
    g.closePath();
    g.fill();
  }
  for (const x of [9, 239]) {
    g.fillStyle = '#d2ac74';
    g.fillRect(x, 0, 8, 512);
    for (let y = 0; y < 512; y += 16) diamond(x + 4, y + 8, 4, 6, '#723e31');
  }
  for (const y of [64, 192, 320, 448]) {
    diamond(128, y, 78, 56, '#c59a63');
    diamond(128, y, 68, 48, '#35544c');
    diamond(128, y, 43, 30, '#c59a63');
    diamond(128, y, 30, 19, '#974d34');
    for (const x of [42, 214]) diamond(x, y, 8, 7, '#ddc08a');
  }
  g.fillStyle = '#30211d24';
  for (let y = 0; y < 512; y += 3) g.fillRect(0, y, 256, 1);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return new T.MeshLambertMaterial({ map });
}
function makeRoom() {
  const scene = new T.Scene(),
    c = colors;
  scene.background = new T.Color('#30231c');
  scene.add(new T.HemisphereLight('#fff1cf', '#b9987a', 1.95));
  const sun = new T.DirectionalLight('#fff1cf', 2.15);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  box(scene, c.timber, 0, -0.09, 0, 8.6, 0.18, 10.6);
  for (let i = 0; i < 19; i++) {
    const mat = paint(
      i % 3 === 0 ? '#ac8058' : i % 3 === 1 ? '#986c49' : '#b78c65'
    );
    box(scene, mat, -4.05 + i * 0.45, -0.012, 0, 0.435, 0.024, 10.5);
  }
  for (const side of [-1, 1]) {
    box(scene, c.tile, 4.2 * side, 1.82, 0, 0.18, 3.64, 10.6);
    box(scene, c.blue, 4.08 * side, 0.6, 0, 0.12, 1.2, 10.6);
    box(scene, c.trim, 3.99 * side, 1.2, 0, 0.12, 0.09, 10.6);
    box(scene, c.tile, 0, 1.82, 5.2 * side, 8.45, 3.64, 0.18);
  }
  box(scene, c.trim, 0, 3.7, 0, 8.5, 0.16, 10.6);
  for (const z of [-3.6, 0, 3.6])
    box(scene, c.timber, 0, 3.52, z, 8.45, 0.19, 0.18);
  const exit = new T.Group();
  exit.position.z = 5.05;
  exit.rotation.y = Math.PI;
  scene.add(exit);
  door(exit);
  plaque(exit, ['DOVER ST'], 0, 2.56, 0.14, 1.3, 0.35);
  for (const x of [-2.86, 2.86]) {
    box(scene, c.trim, x, 2.05, -5.05, 1.8, 1.52, 0.12);
    box(scene, c.pane, x, 2.05, -4.96, 1.57, 1.28, 0.08);
    box(scene, c.trim, x, 2.05, -4.9, 0.065, 1.28, 0.06);
    box(scene, c.trim, x, 2.05, -4.9, 1.6, 0.08, 0.06);
    box(scene, c.blue, x, 0.48, -4.69, 2.42, 0.96, 0.85);
    box(scene, c.oak, x, 1, -4.69, 2.55, 0.12, 0.95);
    for (const dx of [-0.57, 0.57]) {
      box(scene, c.dark, x + dx, 0.48, -4.23, 0.96, 0.75, 0.04);
      box(scene, c.metal, x + dx, 0.68, -4.17, 0.24, 0.045, 0.06);
    }
  }
  const recipe = plaque(scene, ['FAMILY RECIPE', 'Unfold before supper'], recipeSpot.x, 0.47, recipeSpot.z, 0.50, 0.26);
  recipe.rotation.z = -0.12;
  plaque(scene, ['Save room for seconds.', 'Check the cupboards.'], -2.86, 1.25, -4.83, 0.95, 0.31);
  plaque(scene, ['THANKSGIVING', 'HALL OF GRAVY'], 0, 3.0, -5.02, 2.72, 0.80);
  box(scene, c.red, 0, 0.015, 0.64, 2.54, 0.024, 5.46);
  const rug = new T.PlaneGeometry(2.54, 5.46).rotateX(-Math.PI / 2);
  mesh(scene, rug, wovenRunner(), 0, 0.028, 0.64);
  box(scene, c.timber, 0, 0.49, -2.75, 1.12, 0.96, 1.12);
  box(scene, c.metal, 0, 1.02, -2.75, 1.31, 0.11, 1.31);
  plaque(scene, ['GOLDEN GRAVY GRAIL'], 0, 0.64, -2.175, 0.94, 0.24);
  const grail = new T.Group();
  const profile = [
    [0.01, 0],
    [0.295, 0],
    [0.315, 0.016],
    [0.315, 0.035],
    [0.285, 0.043],
    [0.28, 0.057],
    [0.12, 0.11],
    [0.075, 0.23],
    [0.112, 0.234],
    [0.116, 0.251],
    [0.17, 0.26],
    [0.29, 0.32],
    [0.38, 0.49],
    [0.382, 0.55],
    [0.397, 0.557],
    [0.402, 0.575],
    [0.391, 0.589],
    [0.34, 0.59],
    [0.31, 0.5],
    [0.21, 0.4],
    [0.01, 0.35],
  ];
  mesh(
    grail,
    new T.LatheGeometry(
      profile.map(([r, y]) => new T.Vector2(r, y)),
      36
    ),
    c.metal,
    0,
    0,
    0
  );
  // Repoussé flutes follow the expanding bowl below the rolled rim.
  const flutes = new T.InstancedMesh(new T.SphereGeometry(1, 8, 8), c.metal, 16);
  const stamp = new T.Object3D();
  stamp.scale.set(0.036, 0.1, 0.017);
  for (let i = 0; i < flutes.count; i++) {
    const angle = i * Math.PI * 2 / flutes.count;
    stamp.position.set(0.334 * Math.sin(angle), 0.405, 0.334 * Math.cos(angle));
    stamp.rotation.set(0.487, angle, 0, 'YXZ');
    stamp.updateMatrix();
    flutes.setMatrixAt(i, stamp.matrix);
  }
  grail.add(flutes);
  for (const side of [-1, 1]) {
    const handle = mesh(
      grail,
      new T.TorusGeometry(0.135, 0.032, 8, 20),
      c.metal,
      side * 0.37,
      0.44,
      0
    );
    handle.scale.y = 1.36;
  }
  grail.position.set(0, 1.21, -2.75);
  scene.add(grail);
  const lamp = new T.PointLight('#ffcf7a', 9, 5);
  lamp.position.set(0, 2.45, -2.6);
  scene.add(lamp);
  return { scene, grail, recipe };
}
export class DoverCottage {
  constructor(outdoors) {
    this.recipeFound = hasRecipe();
    this.porch = makeQuestEmblem();
    this.porch.visible = false;
    outdoors.add(this.porch);
    this.inside = false;
  }
  nearPorch(p) {
    return p.x >= PORCH.x && Math.hypot(p.x - PORCH.x, p.z - PORCH.z) < 3.1;
  }
  nearRecipe(p) {
    return this.inside && !this.recipeFound &&
      Math.hypot(p.x - recipeSpot.x, p.z - recipeSpot.z) < 1.45;
  }
  unfoldRecipe() {
    collectRecipe();
    this.recipeFound = true;
    this.recipe.visible = false;
  }
  prompt(p, finale = false) {
    if (!this.inside)
      return this.porch.visible && this.nearPorch(p)
        ? 'Enter 735 Dover St'
        : '';
    if (this.nearRecipe(p)) return 'Unfold the family recipe';
    if (Math.hypot(p.x, p.z - 4.75) < 2.0) return 'Return to Dover St';
    if ((finale || !hasGrail()) && Math.hypot(p.x, p.z + 2.75) < 2.05) {
      return hasGrail() ? 'Inspect your Grail engraving' : 'Take the ' + RELIC;
    }
    return '';
  }
  enter() {
    if (!this.scene) Object.assign(this, makeRoom());
    this.inside = true;
    this.recipeFound = hasRecipe();
    this.recipe.visible = !this.recipeFound;
    this.grail.visible = !hasGrail();
  }
  collect() {
    collectGrail();
    this.grail.visible = false;
  }
  blocked(x, z) {
    return (
      Math.abs(x) > 3.66 ||
      Math.abs(z) > 4.66 ||
      (Math.abs(x) < 1.04 && Math.abs(z + 2.75) < 1.06) ||
      (Math.abs(x) > 1.13 && z < -3.77)
    );
  }
  drawRadar(canvas, p, yaw) {
    const c = canvas.getContext('2d'),
      w = canvas.width,
      h = canvas.height;
    const scale = Math.min((w - 18) / 8.4, (h - 14) / 10.4);
    c.save();
    c.fillStyle = '#202820';
    c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    c.scale(scale, scale);
    c.fillStyle = '#526051';
    c.fillRect(-4.2, -5.2, 8.4, 10.4);
    c.fillStyle = '#c5d6b7';
    c.fillRect(-0.72, 4.82, 1.44, 0.38);
    c.fillStyle = this.grail.visible ? '#ffb852' : '#a7885b';
    c.fillRect(-0.5, -3.25, 1, 1);
    c.translate(p.x, p.z);
    c.rotate(-yaw);
    c.fillStyle = '#fff2cd';
    c.beginPath();
    c.moveTo(0, -0.52);
    c.lineTo(0.31, 0.38);
    c.lineTo(-0.31, 0.38);
    c.fill();
    c.restore();
  }
  animate(time) {
    this.grail.rotation.y = time * 0.86;
    this.grail.position.y = 1.2 + Math.sin(time * 2.2) * 0.07;
  }
}
