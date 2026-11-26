import * as T from 'three';

// Portable goal placement is representative. The playing area is registered
// to the city's surveyed Blue Pod facility at Broomfield County Commons.
export function bluePod(site, height) {
  const pod = site.landmarks.find(
    (p) => p.type === 'soccer' && p.name === 'Blue Pod'
  );
  if (!pod) return;
  const frame = [],
    net = [],
    paint = [],
    barriers = [];
  const line = (list, a, b) => list.push(...a, ...b);
  function marking(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
    for (let i = 0; i < n; i++) {
      const a = i / n,
        b = (i + 1) / n;
      const x = ax + (bx - ax) * a,
        z = az + (bz - az) * a;
      const xx = ax + (bx - ax) * b,
        zz = az + (bz - az) * b;
      line(
        paint,
        [x, height(x, z) + 0.065, z],
        [xx, height(xx, zz) + 0.065, zz]
      );
    }
  }
  // Two community pitches run east–west across the open grass.
  for (const cz of [pod.z - 34, pod.z + 34]) {
    const ax = pod.x - 50,
      bx = pod.x + 50;
    for (const x of [ax, pod.x, bx]) marking(x, cz - 29, x, cz + 29);
    for (const z of [cz - 29, cz + 29]) marking(ax, z, bx, z);
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16,
        b = ((i + 1) * Math.PI) / 16;
      marking(
        pod.x + 9.15 * Math.cos(a),
        cz + 9.15 * Math.sin(a),
        pod.x + 9.15 * Math.cos(b),
        cz + 9.15 * Math.sin(b)
      );
    }
    for (const x of [ax, bx]) {
      const rear = x + (x === ax ? -1 : 1) * 2,
        h = height(x, cz),
        z1 = cz - 3.66,
        z2 = cz + 3.66;
      const post = (x, z, y = 0) => [x, h + y, z];
      line(frame, post(x, z1, 2.44), post(x, z2, 2.44));
      for (const z of [z1, z2]) {
        line(frame, post(x, z), post(x, z, 2.44));
        line(frame, post(x, z, 2.44), post(rear, z, 1.65));
        line(frame, post(rear, z), post(rear, z, 1.65));
        line(frame, post(x, z), post(rear, z));
        barriers.push({
          points: [
            [x, z - 0.06],
            [rear, z - 0.06],
            [rear, z + 0.06],
            [x, z + 0.06],
          ],
        });
      }
      barriers.push({
        points: [
          [rear - 0.06, z1],
          [rear + 0.06, z1],
          [rear + 0.06, z2],
          [rear - 0.06, z2],
        ],
      });
      for (let j = 0; j <= 18; j++) {
        const z = z1 + ((z2 - z1) * j) / 18;
        line(net, post(rear, z), post(rear, z, 1.65));
        line(net, post(rear, z, 1.65), post(x, z, 2.44));
      }
      for (let j = 0; j <= 4; j++)
        line(
          net,
          post(rear, z1, (1.65 * j) / 4),
          post(rear, z2, (1.65 * j) / 4)
        );
    }
  }
  const group = new T.Group();
  function lines(vertices, color, opacity) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(vertices, 3)
    );
    group.add(
      new T.LineSegments(
        geometry,
        new T.LineBasicMaterial({ color, transparent: true, opacity })
      )
    );
  }
  lines(net, '#e3eadc', 0.64);
  lines(paint, '#fff7dc', 0.7);
  // Tubular posts keep their physical width at close range.
  const bars = new T.InstancedMesh(
    new T.CylinderGeometry(0.06, 0.06, 1, 8),
    new T.MeshLambertMaterial({ color: 0xf5f5ed }),
    frame.length / 6
  );
  const a = new T.Vector3(),
    b = new T.Vector3(),
    up = new T.Vector3(0, 1, 0),
    piece = new T.Object3D();
  for (let i = 0; i < frame.length; i += 6) {
    a.fromArray(frame, i);
    b.fromArray(frame, i + 3);
    piece.position.copy(a).lerp(b, 0.5);
    b.sub(a);
    piece.scale.set(1, b.length(), 1);
    piece.quaternion.setFromUnitVectors(up, b.normalize());
    piece.updateMatrix();
    bars.setMatrixAt(i / 6, piece.matrix);
  }
  group.add(bars);
  return { group, barriers, markings: paint };
}
