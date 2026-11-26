import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Obstacles, treeShape } from '../maps/obstacles.js';
import { PORCH, PORCH_LANTERN } from './dover/location.js';
import { addPeaks } from './peaks.js';

function poolSteam() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  const wash = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  wash.addColorStop(0, '#e1f4ed92');
  wash.addColorStop(1, '#e1f4ed00');
  c.fillStyle = wash;
  c.fillRect(0, 0, 64, 64);
  const group = new T.Group();
  const material = new T.SpriteMaterial({
    map: new T.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
  });
  for (let i = 0; i < 22; i++) {
    const sprite = new T.Sprite(material.clone());
    sprite.scale.set(2.5, 1.25, 1);
    group.add(sprite);
  }
  return {
    group,
    update(time) {
      group.children.forEach((p, i) => {
        const t = (time * 0.18 + i * 0.618) % 1;
        p.position.set(
          5 * Math.cos(i * 2.4) + t,
          0.32 + t * 1.4,
          -9 + 7 * Math.sin(i * 1.7)
        );
        p.material.opacity = Math.sin(t * Math.PI) * 0.38;
      });
    },
  };
}

// Reuse the park's oak and spruce geometry. The fixed groves are small enough
// to instance once at their middle detail level for the whole visit.
function venueTrees(sites, library) {
  const groups = new Map();
  const pose = new T.Object3D();
  const group = new T.Group();
  for (const tree of sites) {
    const shape = treeShape(tree);
    pose.position.set(tree.x, tree.ground ?? 0, tree.z);
    pose.scale.set(shape.width, shape.height, shape.width);
    pose.rotation.y = shape.rotation;
    pose.updateMatrix();
    if (!groups.has(shape.variety)) groups.set(shape.variety, []);
    groups.get(shape.variety).push(pose.matrix.clone());
  }
  for (const [key, poses] of groups) {
    const { geometry, material } = library.get(key)[1];
    const trees = new T.InstancedMesh(geometry, material, poses.length);
    poses.forEach((matrix, i) => trees.setMatrixAt(i, matrix));
    trees.castShadow = true;
    group.add(trees);
  }
  return group;
}

export async function loadVenue(id, world, sky) {
  const ice = id === 'ice',
    airport = id === 'airport';
  const scene = new T.Scene();
  if (ice) scene.background = new T.Color('#15172d');
  scene.fog = new T.FogExp2(
    ice ? '#393654' : airport ? '#786f80' : '#bbcccb',
    ice ? 0.012 : 0.008
  );
  const ambient = new T.HemisphereLight(ice ? '#c5eaff' : '#fff1da', '#958782', 1.6);
  const light = new T.DirectionalLight(
    ice ? '#b5a2ff' : '#ffdeac',
    1.9
  );
  const { scene: model } = await new GLTFLoader().loadAsync('/models/trip-' + id + '.glb');
  const { plan: data, furniture = [] } = model.children[0].userData;
  data.id = id;
  scene.add(model, ambient);
  light.position.set(-18, 30, 14);
  if (!ice) {
    light.castShadow = true;
    light.position.set(airport ? 23 : -27, 36, 20);
    Object.assign(light.shadow.camera, {
      left: -47,
      right: 47,
      top: 47,
      bottom: -47,
      far: 125,
    });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.normalBias = 0.025;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
  }
  scene.add(light);
  // 13th and Pearl, in metres relative to the Community Park DEM origin.
  if (id === 'pearl') await addPeaks(scene, new T.Vector3(-17900, 6, -11000));
  if (data.trees.length) scene.add(venueTrees(data.trees, world.trees.levels));
  const walls = [];
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    walls.push(mesh);
    const mat = mesh.material;
    mesh.castShadow = ![
      'Garden',
      'Road',
      'Paving',
      'Garden path',
      'Pavers',
      'Greenhouse',
    ].includes(mat.name);
    mesh.receiveShadow = !ice;
    if (mat.map) mat.map.anisotropy = 4;
    if (
      ['Ice', 'Glacier', 'Violet', 'Frost', 'Water'].includes(mat.name) ||
      mat.name.endsWith(' ice blocks')
    ) {
      mat.roughness = 0.18;
      if (!ice) {
        mat.envMap = sky;
        mat.envMapIntensity = 0.7;
      }
    }
    if (mat.name === 'Greenhouse' || mat.name === 'Teahouse glass') {
      mat.transparent = true;
      mat.opacity = mat.name === 'Greenhouse' ? 0.26 : 0.22;
      mat.depthWrite = false;
      mesh.castShadow = false;
    }
    if (mat.name === 'Glow' || mat.name === 'Ice' || mat.name === 'Amber') {
      mat.emissive
        .copy(mat.color)
        .multiplyScalar(mat.name === 'Glow' ? 0.9 : 0.2);
    }
  });
  for (const [name, x, z, yaw] of furniture) {
    for (const part of world.streetModels.get(name)) {
      const mesh = new T.Mesh(part.geometry, part.material);
      mesh.position.set(x, 0.03, z);
      mesh.rotation.y = yaw;
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      walls.push(mesh);
    }
  }
  if (ice) {
    for (const [x, z, tint] of [
      [-7, 5, '#ac6aff'],
      [5, 7, '#64dcff'],
      [0, -18, '#96ffdb'],
    ]) {
      const lamp = new T.PointLight(tint, 58, 18);
      lamp.position.set(x, 2, z);
      scene.add(lamp);
    }
  }
  const steam = id === 'springs' ? poolSteam() : null;
  if (steam) scene.add(steam.group);
  function placeAt(p) {
    const interior = data.places.find(
      ({ bounds }) =>
        bounds &&
        p.x >= bounds[0] &&
        p.z >= bounds[1] &&
        p.x <= bounds[2] &&
        p.z <= bounds[3]
    );
    if (interior) return interior.name;
    return data.places.reduce((best, place) =>
      Math.hypot(p.x - place.x, p.z - place.z) <
      Math.hypot(p.x - best.x, p.z - best.z)
        ? place
        : best
    ).name;
  }
  return {
    scene,
    data,
    walls,
    placeAt,
    solids: new Obstacles(data),
    update: steam?.update,
  };
}

// Keep the regional ground photography and buildings in place for the late arrival.
export function lightDoverPorch(scene, height) {
  const previousFog = scene.fog;
  const peaks = scene.getObjectByName('Colorado Front Range');
  peaks.visible = false;
  scene.fog = new T.Fog('#15223c', -13, 67);
  const lamp = new T.PointLight('#ffc577', 24, 21);
  lamp.position.set(
    PORCH.x + PORCH_LANTERN.out + 0.18,
    height(PORCH.x, PORCH.z) + PORCH_LANTERN.up,
    PORCH.z - PORCH_LANTERN.across
  );
  scene.add(lamp);
  return () => {
    lamp.removeFromParent();
    lamp.dispose();
    scene.fog = previousFog;
    peaks.visible = true;
  };
}
