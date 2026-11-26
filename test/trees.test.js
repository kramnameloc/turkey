import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { TreeStand } from '../src/trees.js';
import { treeShape } from '../src/field.js';

test('streamed trees retain solid 3D geometry, surveyed positions and scaled heights at every detail level', () => {
  const scene = new T.Scene(),
    stand = new TreeStand(scene, null);
  const trees = [
    { x: -7.4, z: 0, height: 8, ground: 4, species: 'Maple' },
    { x: -2, z: 0, height: 11, ground: 14, species: 'Cottonwood' },
    { x: 3, z: 0, height: 6, ground: -1, species: 'Oak' },
    { x: 7, z: 0, height: 15, ground: 2, type: 'Coniferous' },
  ];
  stand.add('tile', trees);
  const countTriangles = [];
  for (const distance of [0, 80, 300]) {
    stand.update(0, distance);
    const batches = stand.group.children.filter((m) => m.visible && m.count);
    assert.equal(batches.length, trees.length);
    let triangles = 0;
    for (const mesh of batches) {
      assert.equal(mesh.count, 1);
      const m = new T.Matrix4();
      mesh.getMatrixAt(0, m);
      const site = new T.Vector3().setFromMatrixPosition(m);
      const tree = trees.find((t) => Math.abs(t.x - site.x) < 0.0001);
      assert.ok(tree);
      assert.equal(site.y, tree.ground);
      const extent = mesh.geometry.boundingBox.getSize(new T.Vector3());
      assert.ok(extent.x > 0.55 && extent.z > 0.55);
      assert.ok(
        Math.abs(extent.y * m.elements[5] - treeShape(tree).height) < 0.0001
      );
      triangles += mesh.geometry.index.count / 3;
    }
    countTriangles.push(triangles);
  }
  assert.ok(
    countTriangles[0] > countTriangles[1] &&
      countTriangles[1] > countTriangles[2]
  );
  stand.remove('tile');
  stand.update(0, 300);
  assert.equal(stand.group.children.filter((m) => m.visible).length, 0);
});
