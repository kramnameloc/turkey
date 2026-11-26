import * as T from 'three';
import { downstairsBlocked, drawDownstairsPlan, furnishDownstairs } from './downstairs.js';
import { PORCH, PORCH_LANTERN, RELIC, hasGrail, collectGrail, hasRecipe, collectRecipe } from './location.js';

const recipeSpot = { x: 3.43, z: -4.273 };
const crate = new T.BoxGeometry(1, 1, 1);
const paint = (color, props = {}) =>
  new T.MeshStandardMaterial({ color, ...props });
const colors = {
  timber: paint('#533424'),
  dark: paint('#153b38'),
  metal: paint('#d69b39', { metalness: 0.52, roughness: 0.28 }),
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
function plaque(p, lines, x, y, z, w, h, paper = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round((768 * h) / w);
  const g = canvas.getContext('2d');
  g.fillStyle = paper ? '#f3e7cb' : '#273d33';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#d6af6b';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 752, canvas.height - 16);
  g.fillStyle = paper ? '#57453b' : '#fff0c7';
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
    paper ? new T.MeshLambertMaterial({ map }) : new T.MeshBasicMaterial({ map }),
    x,
    y,
    z
  );
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

function makeRoom() {
  const scene = new T.Scene(), c = colors;
  furnishDownstairs(scene);
  plaque(scene, ['DOVER ST'], 0, 2.29, 5.17, 0.58, 0.16).rotation.y = Math.PI;
  const recipe = plaque(scene, ['Family recipe', 'Unfold before supper'], recipeSpot.x, 0.43, recipeSpot.z, 0.37, 0.21, true);
  recipe.rotation.z = -0.075;
  const stand = new T.Group();
  scene.add(stand);
  stand.position.z = -2.75;
  for (const x of [-0.49, 0.49])
    for (const z of [-0.49, 0.49])
      box(stand, c.timber, x, 0.41, z, 0.105, 0.82, 0.105);
  box(stand, c.timber, 0, 0.21, 0, 1.06, 0.065, 1.06);
  box(stand, c.timber, 0, 0.76, 0, 1.13, 0.20, 1.13);
  box(stand, paint('#986f4e'), 0, 0.895, 0, 1.31, 0.07, 1.31);
  stand.traverse(part => { if (part.isMesh) part.castShadow = part.receiveShadow = true; });
  plaque(stand, ['HALL OF GRAVY', 'Golden Gravy Grail'], 0, 0.76, 0.57, 0.54, 0.17);
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
  grail.position.set(0, 0.931, -2.75);
  scene.add(grail);
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
    return downstairsBlocked(x, z);
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
    drawDownstairsPlan(c);
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
}
