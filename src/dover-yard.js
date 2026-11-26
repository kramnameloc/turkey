import * as T from 'three';

// Dimensions are representative. These are outdoor scenery props at the game cottage.
const camper = { x: 1148, z: -980.15 };
const lamp = { x: 1150.95, z: -977.55 };
const hedge = { from: 1140.6, to: 1150.8, z: -977.2 };

export const yardBarriers = [
  {
    points: [
      [1146.35, -981.05],
      [1149.65, -981.05],
      [1150.65, -980.15],
      [1149.65, -979.25],
      [1146.35, -979.25],
    ],
  },
  {
    points: [
      [hedge.from - 0.45, hedge.z - 0.83],
      [hedge.to + 0.45, hedge.z - 0.83],
      [hedge.to + 0.45, hedge.z + 0.83],
      [hedge.from - 0.45, hedge.z + 0.83],
    ],
  },
];

export async function doverYard(models, terrain, solids) {
  const { height } = terrain;
  const group = new T.Group();
  group.name = 'Dover front yards';
  const box = new T.BoxGeometry();
  const mat = (color) => new T.MeshLambertMaterial({ color });
  const white = mat('#d8dde2'),
    canvas = mat('#e6e9eb'),
    aluminum = mat('#8e958d');
  const rubber = mat('#33352f'),
    seam = mat('#9b9e92');
  const trailer = new T.Group();
  trailer.name = 'Folded camping trailer';
  trailer.position.set(camper.x, height(camper.x, camper.z) + 0.04, camper.z);
  group.add(trailer);
  function part(parent, geo, material, x, y, z) {
    const object = new T.Mesh(geo, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }
  function slab(parent, material, x, y, z, w, h, d) {
    const object = part(parent, box, material, x, y, z);
    object.scale.set(w, h, d);
    return object;
  }
  slab(trailer, rubber, -0.03, 0.43, 0, 2.98, 0.21, 1.64);
  slab(trailer, white, 0, 0.83, 0, 3.16, 0.67, 1.74);
  slab(trailer, aluminum, 0, 0.56, 0, 3.18, 0.055, 1.77);
  slab(trailer, seam, 0, 1.16, 0, 3.23, 0.062, 1.79);
  // A chamfered, slightly crowned lid reads differently from the square body.
  const capProfile = new T.Shape();
  capProfile.moveTo(-1.63, 1.18);
  capProfile.lineTo(1.63, 1.18);
  capProfile.lineTo(1.59, 1.33);
  capProfile.lineTo(1.28, 1.49);
  capProfile.lineTo(-1.37, 1.48);
  capProfile.lineTo(-1.61, 1.38);
  capProfile.closePath();
  const cap = new T.ExtrudeGeometry(capProfile, {
    depth: 1.77,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.027,
    bevelThickness: 0.035,
  });
  part(trailer, cap, canvas, 0, 0, -0.885);
  const tire = new T.CylinderGeometry(0.29, 0.29, 0.17, 16);
  const hub = new T.CylinderGeometry(0.14, 0.14, 0.025, 12);
  for (const side of [-1, 1]) {
    part(trailer, tire, rubber, -0.25, 0.29, side * 0.89).rotation.x =
      Math.PI / 2;
    part(trailer, hub, aluminum, -0.25, 0.29, side * 0.985).rotation.x =
      Math.PI / 2;
    const tongue = slab(
      trailer,
      aluminum,
      1.98,
      0.42,
      side * 0.29,
      1.35,
      0.09,
      0.075
    );
    tongue.rotation.y = side * 0.47;
    slab(trailer, rubber, 1.54, 1.14, side * 0.67, 0.075, 0.19, 0.06);
    part(
      trailer,
      new T.CylinderGeometry(0.028, 0.036, 0.39, 7),
      aluminum,
      -1.3,
      0.24,
      side * 0.68
    );
  }
  slab(trailer, aluminum, 2.59, 0.42, 0, 0.25, 0.11, 0.15);
  slab(trailer, aluminum, 2.2, 0.22, 0, 0.064, 0.43, 0.064);
  // The tongue carries a small utility box behind the front jack.
  slab(trailer, rubber, 1.88, 0.65, 0, 0.39, 0.35, 0.53);
  slab(trailer, seam, 1.88, 0.84, 0, 0.43, 0.05, 0.57);

  const greenbeltLamp = new T.Group();
  greenbeltLamp.name = 'Saucer street light';
  greenbeltLamp.position.set(lamp.x, height(lamp.x, lamp.z), lamp.z);
  greenbeltLamp.scale.y = 1.27;
  group.add(greenbeltLamp);
  const post = mat('#685f53'),
    hood = mat('#53605a');
  function cylinder(top, bottom, h, y, m) {
    return part(
      greenbeltLamp,
      new T.CylinderGeometry(top, bottom, h, 16),
      m,
      0,
      y,
      0
    );
  }
  cylinder(0.067, 0.082, 5.05, 2.52, post);
  cylinder(0.15, 0.1, 0.26, 5.08, hood);
  cylinder(0.19, 0.135, 0.28, 5.32, mat('#c2c5ad'));
  cylinder(0.19, 0.49, 0.12, 5.52, hood);
  cylinder(0.47, 0.5, 0.05, 5.44, aluminum);
  solids.indexFeature(
    { ...lamp, radius: 0.1 },
    lamp.x - 0.1,
    lamp.x + 0.1,
    lamp.z - 0.1,
    lamp.z + 0.1
  );

  // Overlapping leafy clumps keep a clipped hedge's continuous silhouette.
  const shrubs = models.get('RoundShrub');
  const count = 12,
    pose = new T.Object3D();
  const bounds = new T.Box3();
  for (const shrub of shrubs) {
    shrub.geometry.computeBoundingBox();
    bounds.union(shrub.geometry.boundingBox);
  }
  const size = bounds.getSize(new T.Vector3());
  for (const shrub of shrubs) {
    const row = new T.InstancedMesh(shrub.geometry, shrub.material, count);
    row.name = 'Dover clipped hedge';
    for (let i = 0; i < count; i++) {
      const x = hedge.from + ((hedge.to - hedge.from) * i) / (count - 1),
        z = hedge.z + 0.11 * Math.sin(i * 2.1);
      const h = 1.56 + 0.15 * Math.sin(i * 1.7);
      pose.rotation.y = i * 1.95;
      pose.scale.set(2.18 / size.x, h / size.y, 2.13 / size.z);
      pose.position.set(
        x,
        height(x, z) - bounds.min.y * pose.scale.y - 0.03,
        z
      );
      pose.updateMatrix();
      row.setMatrixAt(i, pose.matrix);
    }
    group.add(row);
  }
  const [lawnMap, hedgeMap] = await Promise.all(
    ['dover-lawn', 'dover-hedge'].map((name) =>
      new T.TextureLoader().loadAsync('/scenery/' + name + '.webp')
    )
  );
  hedgeMap.colorSpace = T.SRGBColorSpace;
  hedgeMap.anisotropy = 8;
  hedgeMap.wrapS = hedgeMap.wrapT = T.RepeatWrapping;
  // The clipped foliage grows as one continuous mass above the woody stems.
  const skin = [],
    indices = [];
  const rows = 48,
    sides = 20;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const x = hedge.from - 0.62 + (hedge.to - hedge.from + 1.24) * t;
    const end = Math.min(1, 4 * Math.sqrt(Math.min(t, 1 - t)));
    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2,
        sy = Math.sin(angle),
        cz = Math.cos(angle);
      const ripple =
        0.04 * Math.sin(x * 4.4 + cz * 3) + 0.035 * Math.cos(x * 2.8 + sy * 4);
      const z = hedge.z + cz * (1.06 + ripple) * end;
      const y =
        height(x, z) +
        1.15 +
        0.91 * Math.sign(sy) * Math.pow(Math.abs(sy), 0.76) * end +
        end * (0.06 * Math.sin(x * 2.3) + ripple);
      skin.push(x, y, z);
      if (i < rows && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(
          k,
          k + sides + 1,
          k + 1,
          k + 1,
          k + sides + 1,
          k + sides + 2
        );
      }
    }
  }
  const shell = new T.BufferGeometry();
  shell.setAttribute('position', new T.Float32BufferAttribute(skin, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  const clipped = shell.toNonIndexed();
  const { position, normal } = clipped.attributes;
  const coords = [];
  // Project each triangle at a fixed leaf scale, including the curved ends.
  for (let i = 0; i < position.count; i += 3) {
    const direction = new T.Vector3();
    for (let j = i; j < i + 3; j++) {
      direction.x += normal.getX(j);
      direction.y += normal.getY(j);
      direction.z += normal.getZ(j);
    }
    const end =
      Math.abs(direction.x) >
      Math.max(Math.abs(direction.y), Math.abs(direction.z));
    const top = Math.abs(direction.y) > Math.abs(direction.z);
    for (let j = i; j < i + 3; j++) {
      const x = position.getX(j),
        y = position.getY(j),
        z = position.getZ(j);
      coords.push((end ? z : x) / 1.7, (end || !top ? y : z) / 1.7);
    }
  }
  clipped.setAttribute('uv', new T.Float32BufferAttribute(coords, 2));
  const hedgeSkin = new T.Mesh(
    clipped,
    new T.MeshLambertMaterial({ map: hedgeMap, side: T.DoubleSide })
  );
  hedgeSkin.name = 'Dover hedge foliage';
  group.add(hedgeSkin);
  lawnMap.colorSpace = T.SRGBColorSpace;
  lawnMap.anisotropy = 8;
  // Both layers follow the terrain grid. The turf lies beneath the concrete
  // ribbons, while the matching canopy mask falls across both turf and slabs.
  const corners = [
    [1138, -1018],
    [1138, -956],
    [1152.35, -956],
    [1152.35, -1018],
  ];
  const vertices = [],
    uvs = [];
  for (const face of [
    [0, 1, 2],
    [0, 2, 3],
  ])
    terrain.drape(
      face.map((i) => corners[i]),
      ([x, z], h) => {
        vertices.push(x, h, z);
        uvs.push((x - 1138) / 16, 1 - (z + 1018) / 62);
      }
    );
  const turfGeometry = new T.BufferGeometry();
  turfGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(vertices, 3)
  );
  turfGeometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  const turf = new T.Mesh(
    turfGeometry,
    new T.MeshBasicMaterial({ map: lawnMap })
  );
  turf.name = 'Dover lawns';
  turf.position.y = 0.005;
  const shade = new T.Mesh(
    turfGeometry,
    new T.MeshBasicMaterial({
      map: lawnMap,
      color: 0x141d22,
      transparent: true,
      depthWrite: false,
    })
  );
  shade.position.y = 0.084;
  shade.name = 'Dover yard shade';
  group.add(turf, shade);
  return group;
}
