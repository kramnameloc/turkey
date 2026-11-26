import * as T from 'three';
import { randomSeed, treeShape } from './field.js';
const up = new T.Object3D();
export function parkFloor(data, height) {
  const group = new T.Group(),
    random = randomSeed(1973),
    c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d'),
    g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, '#1b26177b');
  g.addColorStop(0.44, '#1b261753');
  g.addColorStop(1, '#1b261700');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const flat = new T.PlaneGeometry(1, 1);
  flat.rotateX(-Math.PI / 2);
  const trees = data.trees,
    shade = new T.InstancedMesh(
      flat,
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      }),
      trees.length
    );
  const leafG = new T.BufferGeometry();
  leafG.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [
        0, 0.06, -1, -0.42, 0, 0, 0, 0.14, 0.25, 0, 0.06, -1, 0, 0.14, 0.25,
        0.42, 0.02, -0.1, -0.42, 0, 0, 0, 0, 1, 0, 0.14, 0.25, 0, 0.14, 0.25, 0,
        0, 1, 0.42, 0.02, -0.1,
      ],
      3
    )
  );
  const leaves = new T.InstancedMesh(
    leafG,
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
    trees.length * 18
  );
  let count = 0;
  const leafColors = ['#a48843', '#8f632b', '#b1823f', '#c39447', '#8c7841'];
  trees.forEach((t, i) => {
    const { height: treeHeight, width } = treeShape(t);
    const x = t.x - treeHeight * 0.13,
      z = t.z;
    const slope = new T.Vector3(
      height(x - 1, z) - height(x + 1, z),
      2,
      height(x, z - 1) - height(x, z + 1)
    ).normalize();
    up.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), slope);
    up.rotateY(0.8);
    up.position.set(x, height(x, z) + 0.045, z);
    up.scale.set(width, 1, width * 0.65);
    up.updateMatrix();
    shade.setMatrixAt(i, up.matrix);
    if (t.type === 'Coniferous' || treeHeight < 2) return;
    for (let n = 0; n < 18; n++) {
      const radius = Math.sqrt(random()) * width * 0.57,
        angle = random() * 6.28;
      up.position.set(
        t.x + Math.cos(angle) * radius,
        0.051,
        t.z + Math.sin(angle) * radius
      );
      up.position.y += height(up.position.x, up.position.z);
      up.rotation.set((random() - 0.5) * 0.2, random() * 6.28, 0);
      const size = 0.09 + random() * 0.09;
      up.scale.set(size, 1 * size, size);
      up.updateMatrix();
      leaves.setMatrixAt(count, up.matrix);
      leaves.setColorAt(
        count,
        new T.Color(leafColors[Math.floor(random() * leafColors.length)])
      );
      count++;
    }
  });
  leaves.count = count;
  group.add(shade, leaves);
  return group;
}
