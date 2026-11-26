import * as T from 'three';

// Same local metre projection and elevation datum as Community Park. The two
// assets are generated together by scripts/geo_peaks.py from the National Map.
const WEST = -96900, NORTH = -87040, PARK_ELEVATION = 1624.7;
const GRID = 512, STEP_X = 170, STEP_Z = 340;

function mountainGeometry(buffer) {
  const header = new DataView(buffer);
  const count = header.getUint32(0, true);
  const length = header.getUint32(4, true);
  const vertices = new Uint16Array(buffer, 8, count * 3);
  const sourceIndices = new Uint16Array(buffer, 8 + count * 6, length);
  const positions = [];
  const uvs = [];
  const opacity = [];
  const indices = Array.from(sourceIndices);
  const east = [];
  for (let i = 0; i < count; i++) {
    const x = vertices[3 * i], z = vertices[3 * i + 2];
    const elevation = vertices[3 * i + 1] - PARK_ELEVATION;
    positions.push(WEST + x * STEP_X, elevation, NORTH + z * STEP_Z);
    uvs.push(x / GRID, 1 - z / GRID);
    opacity.push(1);
    if (x === GRID) east.push(i);
  }
  // Continue the foremost escarpment down past the local scene's horizon.
  east.sort((a, b) => positions[3 * a + 2] - positions[3 * b + 2]);
  for (const [j, i] of east.entries()) {
    const foot = count + j;
    positions.push(positions[3 * i], positions[3 * i + 1] - 120, positions[3 * i + 2]);
    opacity.push(0);
    uvs.push(uvs[2 * i], uvs[2 * i + 1]);
    if (j) indices.push(east[j - 1], i, foot, east[j - 1], foot, foot - 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setAttribute('opacity', new T.Float32BufferAttribute(opacity, 1));
  g.setIndex(indices);
  return g;
}

// Reconstruct clear sky across the previous photographic horizon only in the
// western sector. Above the ridges the same photographed sky blends back in.
function horizon(scene) {
  const positions = [], indices = [];
  for (let i = 0; i <= 42; i++) {
    const angle = (i / 42 - 0.5) * Math.PI;
    for (const y of [-0.16, 0.30]) {
      positions.push(-Math.cos(angle), y, Math.sin(angle));
    }
    if (i) indices.push(2*i-2, 2*i-1, 2*i, 2*i-1, 2*i+1, 2*i);
  }
  const g = new T.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  const m = new T.ShaderMaterial({
    name: 'Western horizon sky',
    uniforms: {
      panorama: { value: scene.background },
      skyIntensity: { value: 1 },
      horizonTint: { value: new T.Color('#c1c3c4') },
    },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `
      #include <common>
      uniform sampler2D panorama;
      uniform float skyIntensity;
      uniform vec3 horizonTint;
      varying vec3 direction;
      vec3 sampleSky(vec2 uv) {
        // atan wraps from 1 to 0 at due west. Repair the derivative used
        // for mip selection across that seam so it does not draw a line.
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        dx.x -= round(dx.x);
        dy.x -= round(dy.x);
        return textureGrad(panorama, uv, dx, dy).rgb;
      }
      void main() {
        vec3 d = normalize(direction);
        vec2 uv = equirectUv(d);
        vec3 sky = sampleSky(uv);
        vec3 clearSky = sampleSky(vec2(uv.x, max(uv.y, 0.568)));
        clearSky = mix(clearSky, horizonTint, 0.50 * (1.0 - smoothstep(-0.02, 0.20, d.y)));
        float west = smoothstep(0.025, 0.35, -d.x);
        float band = smoothstep(-0.14, -0.03, d.y) * (1.0 - smoothstep(0.15, 0.245, d.y));
        gl_FragColor = vec4(mix(sky, clearSky, west * band) * skyIntensity, 1.0);
        #include <colorspace_fragment>
      }`,
    side: T.DoubleSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const strip = new T.Mesh(g, m);
  strip.name = 'Clear sky over the Front Range';
  strip.frustumCulled = false;
  strip.renderOrder = -10001;
  strip.onBeforeRender = () => { m.uniforms.skyIntensity.value = scene.backgroundIntensity; };
  return strip;
}

export async function addPeaks(scene) {
  const [data, surface] = await Promise.all([
    fetch('/scenery/front-range.mesh').then((response) => {
      if (!response.ok) throw new Error('Could not load the Front Range elevation mesh');
      return response.arrayBuffer();
    }),
    new T.TextureLoader().loadAsync('/scenery/front-range.webp'),
  ]);
  surface.colorSpace = T.SRGBColorSpace;
  surface.anisotropy = 4;
  const m = new T.ShaderMaterial({
    name: 'Front Range atmospheric perspective',
    uniforms: {
      surface: { value: surface },
      clearHaze: { value: new T.Color('#9baebb') },
      snowHaze: { value: new T.Color('#bac5cb') },
      weather: { value: 0 },
    },
    vertexShader: `
      varying vec2 mapUV;
      varying float visibility;
      varying float range;
      varying float edge;
      attribute float opacity;
      void main() {
        mapUV = uv;
        visibility = opacity;
        vec3 p = position;
        range = length(cameraPosition.xz - p.xz);
        edge = 1.0 - smoothstep(70000.0, 87040.0, abs(p.z));
        // A mild vertical emphasis keeps the alpine relief legible at a wide
        // game FOV. Curvature includes standard terrestrial refraction.
        float emphasis = mix(1.12, 1.82, smoothstep(700.0, 2400.0, p.y));
        p.y = p.y * emphasis * edge - range * range / 15000000.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        // This draw has its own depth range so adjacent ridges occlude
        // correctly without changing gameplay's near/far clipping precision.
        gl_Position.z = gl_Position.w - 150.0;
      }`,
    fragmentShader: `
      uniform sampler2D surface;
      uniform vec3 clearHaze;
      uniform vec3 snowHaze;
      uniform float weather;
      varying vec2 mapUV;
      varying float visibility;
      varying float range;
      varying float edge;
      void main() {
        vec3 albedo = texture2D(surface, mapUV).rgb;
        float air = 0.06 + 0.43 * (1.0 - exp(-range / 62000.0));
        air = mix(air, 0.72, weather * 0.83);
        air = mix(0.90, air, edge);
        vec3 haze = mix(clearHaze, snowHaze, weather);
        gl_FragColor = vec4(mix(albedo, haze, air), visibility);
        #include <colorspace_fragment>
      }`,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    fog: false,
  });
  const range = new T.Mesh(mountainGeometry(data), m);
  range.name = 'Colorado Front Range';
  range.renderOrder = -10000;
  range.frustumCulled = false;
  const clearIntensity = scene.backgroundIntensity;
  const forward = new T.Vector3();
  const triangleIndices = range.geometry.index.count;
  range.onBeforeRender = (renderer, targetScene, camera) => {
    // The playable city lies entirely east of the DEM. When the whole
    // view cone faces east, mobile GPUs can skip this draw entirely.
    const projection = camera.projectionMatrix.elements;
    const cone = Math.atan(Math.hypot(1 / projection[0], 1 / projection[5]));
    const eastward = camera.getWorldDirection(forward).x > Math.sin(cone);
    range.geometry.setDrawRange(0, eastward ? 0 : triangleIndices);
    m.uniforms.weather.value = T.MathUtils.clamp((clearIntensity - scene.backgroundIntensity) / 0.13, 0, 1);
  };
  // The background and these two draws precede every local opaque object.
  range.onAfterRender = (renderer) => renderer.clearDepth();
  scene.add(horizon(scene), range);
}
