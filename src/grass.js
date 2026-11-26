import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { randomSeed } from './field.js';
import areas from './grass-areas.json' with { type: 'json' };

// Decode the four placement classes into two bits per sample. Read the atlas in
// strips to keep the temporary canvas small on phones.
async function loadCover() {
  const image = await new T.ImageLoader().loadAsync('/scenery/grass-cover.png');
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cover = new Uint8Array((image.width * image.height) / 4);
  let out = 0;
  for (let y = 0; y < image.height; y += canvas.height) {
    const rows = Math.min(canvas.height, image.height - y);
    ctx.drawImage(image, 0, y, image.width, rows, 0, 0, image.width, rows);
    const pixels = ctx.getImageData(0, 0, image.width, rows).data;
    for (let i = 0; i < pixels.length; i += 16)
      cover[out++] =
        (pixels[i] >> 6) |
        ((pixels[i + 4] >> 6) << 2) |
        ((pixels[i + 8] >> 6) << 4) |
        ((pixels[i + 12] >> 6) << 6);
  }
  return { cover, width: canvas.width };
}

export function grassClass(x, z, atlas) {
  // Detailed park and neighborhood masks precede the regional aerial.
  for (const { bounds: b, size, x: u, y: v } of areas) {
    if (x < b.minX || x >= b.maxX || z < b.minZ || z >= b.maxZ) continue;
    const col = u + Math.floor((size * (x - b.minX)) / (b.maxX - b.minX));
    const row = v + Math.floor((size * (z - b.minZ)) / (b.maxZ - b.minZ));
    const i = row * atlas.width + col;
    return (atlas.cover[i >> 2] >> ((i & 3) * 2)) & 3;
  }
  return 0;
}

export async function loadGrasses() {
  const [model, atlas] = await Promise.all([
    new GLTFLoader().loadAsync('/models/field-grasses.glb'),
    loadCover(),
  ]);
  return {
    forms: ['Lawn', 'Dry', 'Reeds'].map((name) =>
      model.scene.getObjectByName(name)
    ),
    atlas,
  };
}

const CELL = 6,
  SAMPLES = 8,
  RING = 3;
export class FieldGrasses {
  constructor(scene, { forms, atlas }, height) {
    this.height = height;
    this.atlas = atlas;
    this.cellX = this.cellZ = Infinity;
    this.cells = new Map();
    const capacity = ((2 * RING + 1) * SAMPLES) ** 2;
    const material = forms[0].material;
    material.map.anisotropy = 4;
    material.alphaToCoverage = true;
    this.wind = { value: 0 };
    this.focus = { value: new T.Vector2() };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.grassTime = this.wind;
      shader.uniforms.grassFocus = this.focus;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float grassTime; uniform vec2 grassFocus; varying float bladeTip;'
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec2 root = instanceMatrix[3].xz;
          bladeTip = position.y;
          float fade = 1.0 - smoothstep(12.0,17.0,length(grassFocus-root));
          float sway = sin(grassTime*1.65 + dot(root,vec2(.39,.22))) + .44*sin(grassTime*2.1-root.y*.7);
          transformed.x += sway*.065*bladeTip*bladeTip;
          transformed *= fade;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float bladeTip;'
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb *= mix(.68,1.13,bladeTip);`
        );
    };
    this.meshes = forms.map((form) => {
      const mesh = new T.InstancedMesh(form.geometry, material, capacity);
      mesh.name = 'Field grasses';
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });
  }

  cell(cx, cz) {
    const random = randomSeed(
      Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 971
    );
    const plants = [];
    for (let j = 0; j < SAMPLES; j++)
      for (let i = 0; i < SAMPLES; i++) {
        const x = (cx + (i + random()) / SAMPLES) * CELL,
          z = (cz + (j + random()) / SAMPLES) * CELL;
        const kind = grassClass(x, z, this.atlas);
        if (!kind) continue;
        const dry = kind === 2,
          bank = kind === 3;
        const form = bank && random() < 0.57 ? 2 : dry || bank ? 1 : 0;
        const size =
          form === 2
            ? 0.32 + random() * 0.22
            : dry || bank
              ? 0.14 + random() * 0.14
              : 0.048 + random() * 0.058;
        plants.push({
          x,
          z,
          y: this.height(x, z) - 0.003,
          form,
          size,
          width: size * ((form === 0 ? 2.0 : 1.1) + random() * 0.8),
          angle: random() * Math.PI * 2,
          shade: 0.82 + random() * 0.32,
        });
      }
    return plants;
  }

  update(x, z, time = 0) {
    this.wind.value = time;
    this.focus.value.set(x, z);
    const cx = Math.floor(x / CELL),
      cz = Math.floor(z / CELL);
    if (cx === this.cellX && cz === this.cellZ) return;
    this.cellX = cx;
    this.cellZ = cz;
    const next = new Map(),
      counts = [0, 0, 0],
      pose = new T.Object3D(),
      color = new T.Color();
    for (let j = cz - RING; j <= cz + RING; j++)
      for (let i = cx - RING; i <= cx + RING; i++) {
        const key = i + ',' + j,
          plants = this.cells.get(key) || this.cell(i, j);
        next.set(key, plants);
        for (const p of plants) {
          pose.position.set(p.x, p.y, p.z);
          pose.rotation.y = p.angle;
          pose.scale.set(p.width, p.size, p.width);
          pose.updateMatrix();
          const mesh = this.meshes[p.form],
            index = counts[p.form]++;
          mesh.setMatrixAt(index, pose.matrix);
          color
            .setRGB(
              p.form === 0 ? 0.96 : 1.12,
              p.form === 0 ? 1.26 : 1.03,
              0.96
            )
            .multiplyScalar(p.shade);
          mesh.setColorAt(index, color);
        }
      }
    this.cells = next;
    this.meshes.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
}
