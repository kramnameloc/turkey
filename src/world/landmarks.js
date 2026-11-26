import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { contains } from '../maps/obstacles.js';

export async function loadLandmarks() {
  const models = new Map();
  const geometries = new Set();
  async function register(url) {
    const { scene } = await new GLTFLoader().loadAsync(url);
    for (const root of scene.children) {
      const { name, anchor, footprintName, postFootprints } = root.userData;
      const parts = [];
      root.traverse((part) => {
        if (!part.isMesh) return;
        parts.push(part);
        geometries.add(part.geometry);
        if (part.material.map) part.material.map.anisotropy = 8;
      });
      if (!models.has(footprintName)) models.set(footprintName, []);
      models.get(footprintName).push({
        name,
        anchor,
        parts,
        posts: postFootprints?.map((points) => ({ points })),
      });
    }
  }
  await register('/models/broomfield-landmarks.glb');
  let exteriors;
  function match(footprint) {
    // The farmhouse and pergola are unnamed Cultural polygons in the city export.
    const key = footprint.doverFacade?.model ?? footprint.name;
    if (!key && footprint.type !== 'Cultural') return;
    return models
      .get(key)
      ?.find(({ anchor }) => contains(footprint.points, ...anchor));
  }
  return {
    geometries,
    prepare(buildings) {
      if (buildings.some((b) => b.doverFacade?.model))
        return (exteriors ??= register('/models/dover-exteriors.glb').catch(
          (error) => {
            exteriors = null;
            throw error;
          }
        ));
    },
    collisionFootprints: (buildings) =>
      buildings.flatMap((b) => match(b)?.posts ?? [b]),
    place(group, footprint, base) {
      const model = match(footprint);
      if (!model) return false;
      const [x, z] = model.anchor;
      for (const part of model.parts) {
        const mesh = part.clone(false);
        mesh.name = model.name;
        mesh.position.set(x, base, z);
        group.add(mesh);
      }
      return true;
    },
  };
}
