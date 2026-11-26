import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TreeStand } from '../src/trees.js';
import {
  Obstacles,
  PARK_SIGNS,
  plantParkSaplings,
  treeShape,
} from '../src/field.js';

const park = JSON.parse(
  await readFile(new URL('../public/geo/broomfield.json', import.meta.url))
);
const file = await readFile(
  new URL('../public/models/november-oaks.glb', import.meta.url)
);
const loader = new GLTFLoader();
// Parse the shipped geometry and materials. Node has no browser image decoder.
loader.register((parser) => {
  parser.loadImageSource = async () => new T.Texture();
  return { name: 'HeadlessTextures' };
});
const { scene: oaks } = await loader.parseAsync(
  Uint8Array.from(file).buffer,
  ''
);

test('every oak form and the spruce stay grounded and scaled through distance changes and tile reloads', () => {
  const stand = new TreeStand(new T.Scene(), null, oaks);
  const sites = new Map();
  for (const t of park.trees) sites.set(treeShape(t).variety, t);
  assert.deepEqual([...sites.keys()].sort(), [...stand.levels.keys()].sort());
  const matrix = new T.Matrix4();
  for (const [form, tree] of sites) {
    const site = { ...tree, ground: -3.4 };
    const shape = treeShape(site);
    stand.add('tile', [site]);
    const triangles = [];
    let original;
    for (const [detail, distance] of [0, 80, 300].entries()) {
      stand.update(site.x, site.z + distance);
      const visible = stand.group.children.filter((m) => m.visible);
      assert.equal(visible.length, 1);
      const [mesh] = visible;
      assert.equal(mesh.name, form + '_' + detail);
      assert.equal(mesh.count, 1);
      mesh.getMatrixAt(0, matrix);
      for (const [i, value] of [
        [12, site.x],
        [13, site.ground],
        [14, site.z],
      ]) {
        assert.ok(Math.abs(matrix.elements[i] - value) < 0.0001);
      }
      const box = mesh.geometry.boundingBox;
      const extent = box.getSize(new T.Vector3());
      assert.ok(Math.abs(box.min.y) < 0.00001, form);
      assert.ok(extent.x > 0.4 && extent.z > 0.4, form);
      assert.ok(
        Math.abs(extent.y * matrix.elements[5] - shape.height) < 0.0001,
        form
      );
      if (form !== 'pine') {
        const scaleX = new T.Vector3().setFromMatrixColumn(matrix, 0).length();
        assert.ok(
          Math.abs(Math.max(extent.x, extent.z) * scaleX - shape.width) <
            0.0001,
          form
        );
        assert.equal(mesh.geometry.groups.length, 2);
        assert.ok(mesh.material[1].alphaTest > 0);
      }
      if (!original) original = matrix.clone();
      assert.ok(matrix.equals(original));
      triangles.push(mesh.geometry.index.count / 3);
    }
    assert.ok(triangles[0] > triangles[1] && triangles[1] > triangles[2], form);
    stand.remove('tile');
    stand.update(site.x, site.z);
    assert.ok(stand.group.children.every((m) => !m.visible));
    stand.add('tile', [site]);
    stand.update(site.x, site.z);
    stand.group.children.find((m) => m.visible).getMatrixAt(0, matrix);
    assert.ok(matrix.equals(original));
    stand.remove('tile');
  }
});

test('branches above the turkey leave the ground clear up to the trunk', () => {
  const tree = { x: 0, z: 0, height: 6, species: 'Oak' };
  const { variety, radius, width } = treeShape(tree);
  const leaves = oaks.getObjectByName(variety + '_0_leaves');
  const lowestBranch = leaves.geometry.boundingBox.min.y * tree.height;
  assert.ok(lowestBranch > 0.9 && lowestBranch < 2.1);
  assert.ok(radius < width * 0.08);
});

test('Dover summer trees keep their branch and leaf materials at every viewing distance', async () => {
  const stand = new TreeStand(new T.Scene(), null, oaks);
  const atlas = new T.Texture(),
    sprigs = new T.Texture();
  stand.fullLeafMaps = Promise.resolve([atlas, sprigs]);
  const { trees } = JSON.parse(
    await readFile(new URL('../public/geo/region/8-12.json', import.meta.url))
  );
  const tree = trees.find((t) => t.fullLeaf);
  const form = treeShape(tree).variety;
  await Promise.all([stand.prepare([tree]), stand.prepare([tree])]);
  assert.equal(stand.batches.filter((b) => b.name.endsWith('_full')).length, 3);
  stand.add('dover', [tree]);
  const counts = [];
  for (const [lod, distance] of [0, 80, 300].entries()) {
    stand.update(tree.x, tree.z + distance);
    const visible = stand.group.children.filter((m) => m.visible);
    assert.equal(visible.length, 1);
    const [{ name, material, geometry }] = visible;
    assert.equal(name, form + '_' + lod + '_full');
    assert.deepEqual(
      geometry.groups.map((g) => g.materialIndex),
      [0, 1, 2]
    );
    assert.equal(material[1].map, atlas);
    assert.equal(material[2].map, sprigs);
    assert.equal(
      geometry.attributes.color.count,
      geometry.attributes.position.count
    );
    counts.push(geometry.groups[2].count);
  }
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2]);
});

test('scattered park saplings have repeatable positions, clear ground and matching collisions', () => {
  const surveyed = new Obstacles(park, PARK_SIGNS);
  const planted = new Obstacles(park, PARK_SIGNS);
  const saplings = plantParkSaplings(park, planted);
  assert.ok(saplings.length > 0);
  assert.deepEqual(
    saplings,
    plantParkSaplings(park, new Obstacles(park, PARK_SIGNS))
  );
  for (const t of saplings) {
    assert.match(treeShape(t).variety, /^sapling/);
    assert.equal(surveyed.blocked(t.x, t.z), false);
    assert.equal(planted.blocked(t.x, t.z), true);
  }
});
