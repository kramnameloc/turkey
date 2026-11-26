import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { FieldGrasses, grassClass } from '../src/world/grass.js';
import areas from '../src/world/grass-areas.json' with { type: 'json' };

test('detailed grass masks override the regional aerial, including clear ground and water', () => {
  const width = 2048;
  const cover = new Uint8Array((width * 3584) / 4).fill(0x55);
  const park = areas.find((a) => a.id === 'park');
  const start = (park.y + 512) * width + park.x + 512;
  cover[start / 4] = 0b11100100;
  for (let sample = 0; sample < 4; sample++)
    assert.equal(
      grassClass(((sample + 0.5) * 1360) / 1024, 0.5, { cover, width }),
      sample
    );
  assert.equal(grassClass(3000, 2000, { cover, width }), 1);
  assert.equal(grassClass(20000, 20000, { cover, width }), 0);
});

test('returning to a field restores the same clumps, scale, and terrain contact', () => {
  const material = new T.MeshBasicMaterial({ map: new T.Texture() });
  const forms = [0, 1, 2].map(
    () => new T.Mesh(new T.BufferGeometry(), material)
  );
  const atlas = {
    cover: new Uint8Array((2048 * 3584) / 4).fill(0xff),
    width: 2048,
  };
  const height = (x, z) => x * 0.012 - z * 0.018;
  const grasses = new FieldGrasses(new T.Scene(), { forms, atlas }, height);
  grasses.update(-44, 20);
  const snapshots = grasses.meshes.map((m) =>
    m.instanceMatrix.array.slice(0, 16 * m.count)
  );
  assert.ok(grasses.meshes[1].count > 0 && grasses.meshes[2].count > 0);
  grasses.update(1527, -1842);
  grasses.update(-44, 20);
  for (const [i, m] of grasses.meshes.entries()) {
    assert.deepEqual(
      m.instanceMatrix.array.subarray(0, 16 * m.count),
      snapshots[i]
    );
    for (let j = 0; j < snapshots[i].length; j += 16) {
      const matrix = snapshots[i].subarray(j, j + 16);
      assert.ok(
        Math.abs(matrix[13] - height(matrix[12], matrix[14]) + 0.003) < 0.00001
      );
      assert.ok(matrix[5] >= 0.14 && matrix[5] <= 0.54);
    }
  }
});
