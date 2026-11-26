import * as T from 'three';

function snowGeometry() {
  // Each flake keeps its own trajectory as the camera turns or runs past it.
  const count = 2100;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  let seed = 52391;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < count; i++) {
    positions[i * 3] = random() * 36;
    positions[i * 3 + 1] = random() * 18;
    positions[i * 3 + 2] = random() * 36;
    sizes[i] = random();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('flakeSize', new T.BufferAttribute(sizes, 1));
  return geometry;
}

function fallingSnow() {
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      flutter: { value: 1 },
      viewHeight: { value: 720 },
      center: { value: new T.Vector3() },
    },
    vertexShader: /* glsl */ `
      uniform float time, flutter, viewHeight;
      uniform vec3 center;
      attribute float flakeSize;
      varying float density, angle;
      void main() {
        float phase = position.x + position.z;
        vec3 flight = position + time * vec3(.58 + .56 * flakeSize, -(.82 + 1.22 * flakeSize), .21);
        flight.xz += flutter * vec2(sin(time * .90 + phase), cos(time * .66 + position.y)) * .28;
        vec3 span = vec3(36., 18., 36.);
        vec3 local = mod(flight - center + span * .5, span) - span * .5;
        vec4 view = viewMatrix * vec4(center + local, 1.);
        gl_Position = projectionMatrix * view;
        float meters = mix(.019, .074, flakeSize * flakeSize);
        gl_PointSize = clamp(meters * viewHeight * projectionMatrix[1][1] * .5 / max(.25, -view.z), 1.5, 11.);
        float range = length(local.xz);
        density = (.50 + .43 * flakeSize) * smoothstep(.45, 1.9, -view.z)
          * (1. - smoothstep(13., 17.9, range)) * (1. - smoothstep(7., 8.9, abs(local.y)));
        angle = phase + time * (.32 + flakeSize * .5) * flutter;
      }`,
    fragmentShader: /* glsl */ `
      varying float density, angle;
      void main() {
        vec2 p = gl_PointCoord * 2. - 1.;
        float s = sin(angle), c = cos(angle);
        p = mat2(c, -s, s, c) * p;
        float alpha = density * (1. - smoothstep(.30, 1., length(p * vec2(1.18, .96))));
        if (alpha < .025) discard;
        gl_FragColor = vec4(.88, .93, 1., alpha);
        #include <colorspace_fragment>
      }`,
  });
  const snow = new T.Points(snowGeometry(), material);
  snow.frustumCulled = false;
  snow.name = 'November flurries';
  const size = new T.Vector2();
  snow.onBeforeRender = (renderer) => {
    material.uniforms.viewHeight.value = renderer.getDrawingBufferSize(size).y;
  };
  return snow;
}

function skyHaze() {
  // Draw a tint at the far depth of the sky, behind terrain, trees and the flakes.
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  );
  const material = new T.ShaderMaterial({
    depthWrite: false,
    transparent: true,
    uniforms: { tint: { value: new T.Color('#bfccd3') } },
    vertexShader: /* glsl */ `
      varying float y;
      void main() { y = position.y; gl_Position = vec4(position.xy, 1., 1.); }
    `,
    fragmentShader: /* glsl */ `
      varying float y;
      uniform vec3 tint;
      void main() {
        gl_FragColor = vec4(tint, mix(.32, .46, smoothstep(-.45, .94, y)));
        #include <colorspace_fragment>
      }`,
  });
  const haze = new T.Mesh(geometry, material);
  haze.name = 'November sky haze';
  haze.frustumCulled = false;
  haze.renderOrder = -1000;
  return haze;
}

export class Flurries {
  constructor(scene) {
    this.scene = scene;
    this.snow = fallingSnow();
    this.haze = skyHaze();
    this.snow.visible = this.haze.visible = false;
    this.snowing = false;
    scene.add(this.snow, this.haze);
    this.preference = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    );
    this.setMotion = () => {
      const reduced = this.preference?.matches;
      this.snow.geometry.setDrawRange(0, reduced ? 520 : 2100);
      this.snow.material.uniforms.flutter.value = reduced ? 0 : 1;
    };
    this.setMotion();
    this.preference?.addEventListener('change', this.setMotion);
  }

  setSnowing(enabled) {
    if (this.snowing === enabled) return;
    this.snowing = enabled;
    this.snow.visible = this.haze.visible = enabled;
    const scene = this.scene;
    if (enabled) {
      this.clearSky = {
        intensity: scene.backgroundIntensity,
        fog: scene.fog,
        lights: [],
      };
      scene.backgroundIntensity *= 0.87;
      const fog = scene.fog?.clone() || new T.FogExp2('#c0c9cd', 0.0018);
      fog.color.lerp(new T.Color('#bdc7cc'), 0.75);
      if (fog.isFogExp2) fog.density = Math.max(0.0018, fog.density * 1.6);
      else fog.far = fog.near + (fog.far - fog.near) * 0.65;
      scene.fog = fog;
      const cloudLight = new T.Color('#e1eafb');
      scene.traverse((light) => {
        if (!light.isDirectionalLight && !light.isHemisphereLight) return;
        this.clearSky.lights.push({
          light,
          color: light.color.clone(),
          intensity: light.intensity,
        });
        light.color.lerp(cloudLight, light.isDirectionalLight ? 0.5 : 0.32);
        light.intensity *= light.isDirectionalLight ? 0.69 : 1.04;
      });
    } else {
      scene.backgroundIntensity = this.clearSky.intensity;
      scene.fog = this.clearSky.fog;
      for (const { light, color, intensity } of this.clearSky.lights) {
        light.color.copy(color);
        light.intensity = intensity;
      }
      this.clearSky = null;
    }
  }

  update(dt, camera) {
    if (!this.snowing) return;
    const uniforms = this.snow.material.uniforms;
    camera.getWorldPosition(uniforms.center.value);
    uniforms.time.value += dt * (this.preference?.matches ? 0.5 : 1);
  }

  dispose() {
    this.setSnowing(false);
    this.preference?.removeEventListener('change', this.setMotion);
    for (const object of [this.snow, this.haze]) {
      object.removeFromParent();
      object.geometry.dispose();
      object.material.dispose();
    }
  }
}
