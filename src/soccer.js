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
    markings = [],
    barriers = [];
  const line = (list, a, b) => list.push(...a, ...b);
  function marking(ax, az, bx, bz) {
    const dx = bx - ax,
      dz = bz - az,
      length = Math.hypot(dx, dz);
    const nx = (-dz / length) * 0.06,
      nz = (dx / length) * 0.06;
    const steps = Math.ceil(length / 2);
    const turf = (x, z) => [x, height(x, z) + 0.043, z];
    for (let i = 0; i < steps; i++) {
      const x = ax + (dx * i) / steps,
        z = az + (dz * i) / steps;
      const xx = ax + (dx * (i + 1)) / steps,
        zz = az + (dz * (i + 1)) / steps;
      line(markings, turf(x, z), turf(xx, zz));
      const a = turf(x + nx, z + nz),
        b = turf(x - nx, z - nz);
      const c = turf(xx - nx, zz - nz),
        d = turf(xx + nx, zz + nz);
      paint.push(...a, ...d, ...c, ...a, ...c, ...b);
    }
  }
  function arc(x, z, radius, start, end, steps) {
    for (let i = 0; i < steps; i++) {
      const a = start + ((end - start) * i) / steps;
      const b = start + ((end - start) * (i + 1)) / steps;
      marking(
        x + radius * Math.cos(a),
        z + radius * Math.sin(a),
        x + radius * Math.cos(b),
        z + radius * Math.sin(b)
      );
    }
  }
  for (const cz of [pod.z - 34, pod.z + 34]) {
    const ax = pod.x - 50,
      bx = pod.x + 50;
    for (const x of [ax, pod.x, bx]) marking(x, cz - 29, x, cz + 29);
    for (const z of [cz - 29, cz + 29]) marking(ax, z, bx, z);
    arc(pod.x, cz, 9.15, 0, 2 * Math.PI, 64);
    marking(pod.x - 0.12, cz, pod.x + 0.12, cz);
    for (const x of [ax, bx]) {
      const intoField = x === ax ? 1 : -1;
      for (const [depth, halfWidth] of [
        [5.5, 9.16],
        [16.5, 20.16],
      ]) {
        const end = x + intoField * depth;
        for (const z of [cz - halfWidth, cz + halfWidth]) marking(x, z, end, z);
        marking(end, cz - halfWidth, end, cz + halfWidth);
      }
      const penalty = x + intoField * 11;
      marking(penalty - 0.12, cz, penalty + 0.12, cz);
      const facing = intoField === 1 ? 0 : Math.PI,
        sweep = Math.acos(5.5 / 9.15);
      arc(penalty, cz, 9.15, facing - sweep, facing + sweep, 20);

      // The crossbar stays level while the ground rails follow the grade.
      const rear = x - intoField * 2,
        z1 = cz - 3.66,
        z2 = cz + 3.66;
      const crossbar = height(x, cz) + 2.44,
        backRail = crossbar - 0.79;
      const front = (z) => [x, crossbar, z];
      const back = (z) => [rear, backRail, z];
      const foot = (u, z) => [u, height(u, z) + 0.055, z];
      line(frame, front(z1), front(z2));
      line(frame, back(z1), back(z2));
      line(frame, foot(rear, z1), foot(rear, z2));
      for (const z of [z1, z2]) {
        line(frame, foot(x, z), front(z));
        line(frame, front(z), back(z));
        line(frame, foot(rear, z), back(z));
        line(frame, foot(x, z), foot(rear, z));
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

      // A little slack in the back panel makes the net read as cord at eye level.
      // Pin every edge to its rail and fill the side panels as well as the roof.
      const backNet = (u, v) => {
        const z = z1 + (z2 - z1) * u,
          floor = foot(rear, z)[1];
        const slack = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        return [
          rear - intoField * 0.15 * slack,
          floor + (backRail - floor) * v,
          z,
        ];
      };
      const roofNet = (u, v) => {
        const slack = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        return [
          x + (rear - x) * v,
          crossbar + (backRail - crossbar) * v - 0.09 * slack,
          z1 + (z2 - z1) * u,
        ];
      };
      function weave(point, columns, rows) {
        for (let i = 0; i <= columns; i++) {
          for (let j = 0; j <= rows; j++) {
            const at = point(i / columns, j / rows);
            if (i < columns) line(net, at, point((i + 1) / columns, j / rows));
            if (j < rows) line(net, at, point(i / columns, (j + 1) / rows));
          }
        }
      }
      weave(backNet, 34, 8);
      weave(roofNet, 34, 10);
      for (const z of [z1, z2]) {
        weave(
          (u, v) => {
            const px = x + (rear - x) * u,
              floor = foot(px, z)[1];
            return [
              px,
              floor + (crossbar + (backRail - crossbar) * u - floor) * v,
              z,
            ];
          },
          10,
          10
        );
      }
    }
  }
  const group = new T.Group();
  const geo = (vertices) =>
    new T.BufferGeometry().setAttribute(
      'position',
      new T.Float32BufferAttribute(vertices, 3)
    );
  group.add(
    new T.LineSegments(
      geo(net),
      new T.LineBasicMaterial({
        color: '#f1efdc',
        transparent: true,
        opacity: 0.66,
        depthWrite: false,
      })
    )
  );
  group.add(
    new T.Mesh(
      geo(paint),
      new T.MeshBasicMaterial({
        color: '#f1edd6',
        transparent: true,
        opacity: 0.83,
        depthWrite: false,
      })
    )
  );
  const bars = new T.InstancedMesh(
    new T.CylinderGeometry(0.055, 0.055, 1, 10),
    new T.MeshLambertMaterial({ color: '#f0eee6' }),
    frame.length / 6
  );
  const a = new T.Vector3(),
    b = new T.Vector3(),
    up = new T.Vector3(0, 1, 0);
  const piece = new T.Object3D();
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
  return { group, barriers, markings };
}
