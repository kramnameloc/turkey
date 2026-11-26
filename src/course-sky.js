import * as T from 'three';

// North is -Z. Keep the low November sun in the southern sky and light
// the buildings from the same direction as the disk above the horizon.
const daylight = {
  morning: {
    zenith: '#5384b7', horizon: '#f4d7b7', shadow: '#9faabd', rim: '#fff0d4',
    sun: [29, 15, 28], light: '#ffe2bc', fill: '#e1eeff', fog: '#c3bbb4',
    cover: .54, wind: .82,
  },
  parade: {
    zenith: '#377db9', horizon: '#c8ddec', shadow: '#aebdce', rim: '#fff8ea',
    sun: [12, 26, 41], light: '#fff1d8', fill: '#e9f4ff', fog: '#bccbd3',
    cover: .57, wind: 1.08,
  },
  springs: {
    zenith: '#447fab', horizon: '#ccdde1', shadow: '#8b9bad', rim: '#f3f4ea',
    sun: [-12, 23, 37], light: '#f3ecd6', fill: '#d5e9f4', fog: '#b8cbd1',
    cover: .45, wind: 1.24,
  },
  pearl: {
    zenith: '#6588b5', horizon: '#f0c9a7', shadow: '#b1a6b8', rim: '#ffe4bb',
    sun: [-26, 17, 29], light: '#ffdcac', fill: '#f4e6db', fog: '#c9b7ad',
    cover: .53, wind: .86,
  },
  park: {
    zenith: '#5989ba', horizon: '#d7e1df', shadow: '#a8b7c4', rim: '#fff3df',
    sun: [17, 25, 38], light: '#fff0cd', fill: '#fff4da', fog: '#b8c0ac',
    cover: .52, wind: 1,
  },
};

export async function loadCourseSky(dayPanorama) {
  const loader = new T.TextureLoader();
  const [twilight, clouds] = await Promise.all([
    loader.loadAsync('/scenery/airport-twilight.webp'),
    loader.loadAsync('/scenery/airport-clouds.webp'),
  ]);
  twilight.colorSpace = T.SRGBColorSpace;
  twilight.wrapS = clouds.wrapS = clouds.wrapT = T.RepeatWrapping;
  const u = {
    panorama: { value: dayPanorama }, clouds: { value: clouds },
    time: { value: 0 }, dusk: { value: 0 }, night: { value: false },
    daylight: { value: true }, westRange: { value: true }, snow: { value: 0 },
    zenith: { value: new T.Color() }, horizon: { value: new T.Color() },
    shadow: { value: new T.Color() }, rim: { value: new T.Color() },
    sunDir: { value: new T.Vector3() }, cover: { value: .5 },
  };
  const material = new T.ShaderMaterial({
    uniforms: u, side: T.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 direction;
      void main() {
        direction = position;
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.);
        gl_Position = clip.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform sampler2D panorama, clouds;
      uniform float time, dusk, cover, snow;
      uniform bool daylight, night, westRange;
      uniform vec3 zenith, horizon, sunDir, shadow, rim;
      varying vec3 direction;
      void main() {
        vec3 ray = normalize(direction);
        vec2 uv = equirectUv(ray);
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        dx.x -= round(dx.x);
        dy.x -= round(dy.x);
        vec3 sky = textureGrad(panorama, uv, dx, dy).rgb;
        vec3 shadeColor = shadow, rimColor = rim;
        if (daylight) {
          vec3 air = mix(horizon, zenith, smoothstep(-.02, .75, ray.y));
          float radius = length(ray - sunDir);
          air += vec3(1., .83, .58) * (.29 * exp(-8. * radius) + 1. - smoothstep(.009, .012, radius));
          // Keep the photographed low horizon, with clear air behind the
          // separately rendered Front Range where it replaces the photo.
          float west = westRange ? smoothstep(.025, .35, -ray.x) : 0.;
          sky = mix(sky, air, max(west, smoothstep(.015, .13, ray.y)));
          sky = mix(sky, vec3(.49, .56, .63), snow * .60);
        } else {
          sky *= night ? vec3(.095, .13, .24) : mix(vec3(1.10,1.02,1.), vec3(.38,.49,.73), dusk);
          float elevation = night ? .59 : mix(.32, .55, dusk);
          vec3 moon = vec3(.72 * cos(elevation), sin(elevation), .694 * cos(elevation));
          float radius = length(ray - moon);
          float disc = 1. - smoothstep(.011, .0128, radius);
          float crescent = smoothstep(.010, .013, length(ray - moon + vec3(.006,.003,-.006)));
          sky += vec3(.25,.27,.34) * exp(-37. * radius) * .34;
          sky = mix(sky, vec3(.99,.89,.73), disc * (.12 + .88 * crescent));
          shadeColor = night ? vec3(.025,.035,.063) : mix(vec3(.27,.245,.33), vec3(.066,.09,.16), dusk);
          rimColor = night ? vec3(.11,.14,.21) : mix(vec3(.95,.62,.44), vec3(.36,.34,.45), dusk);
        }
        vec2 plane = ray.xz / (max(ray.y, 0.) + .18);
        float height = smoothstep(.085, .24, ray.y);
        vec2 highUV = plane * vec2(.12,.30) + time * vec2(.00065,.00018);
        float veil = smoothstep(.43, .69, texture2D(clouds, highUV).r);
        sky = mix(sky, mix(shadeColor, rimColor, .70), veil * height * .37);

        vec2 lowUV = plane * .22 + vec2(.35,.18) + time * vec2(.0018,.0005);
        float body = texture2D(clouds, lowUV).r;
        float detail = texture2D(clouds, lowUV * 2.7 - time * .00048).r;
        float density = body + (detail - .5) * .19;
        float cloudCover = smoothstep(cover - snow*.10, cover + .16, density) * height;
        vec2 offset = daylight ? sunDir.xz * .02 : vec2(-.016,.010);
        float sunward = texture2D(clouds, lowUV + offset).r;
        float edge = clamp(.44 + (body - sunward) * 4.8 - (density - .52) * 2.8, 0., 1.);
        vec3 cloud = mix(shadeColor, rimColor, edge);
        sky = mix(sky, mix(cloud, vec3(.52,.57,.62), snow*.65), cloudCover * .86);
        gl_FragColor = vec4(sky, 1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new T.Mesh(new T.BoxGeometry(2, 2, 2), material);
  dome.name = 'Outdoor sky';
  dome.frustumCulled = false;
  // Peaks clear depth after drawing, so the sky must precede their pass.
  dome.renderOrder = -10001;
  const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = motion?.matches ?? false;
  const onMotionChange = event => { reducedMotion = event.matches; };
  motion?.addEventListener('change', onMotionChange);
  const sunset = new T.Color('#ffdcbb'), blueHour = new T.Color('#c1ceee');
  const warmFog = new T.Color('#94818a'), coolFog = new T.Color('#646b82');
  let profile, settings, sun, ambient;
  function update(elapsed, snowing = false) {
    const time = reducedMotion ? 0 : elapsed;
    u.time.value = time * (settings?.wind ?? 1);
    u.snow.value = Number(snowing);
    if (profile === 'airport') {
      const dusk = T.MathUtils.smoothstep(time, 0, 160);
      u.dusk.value = dusk;
      sun.color.lerpColors(sunset, blueHour, dusk);
      sun.intensity = 1.9 - .43 * dusk;
      ambient.intensity = 1.6 - .16 * dusk;
      dome.parent.fog.color.lerpColors(warmFog, coolFog, dusk);
    }
  }
  return {
    show(scene, name) {
      dome.removeFromParent();
      profile = name;
      if (name === 'indoor') return;
      settings = daylight[name];
      scene.add(dome);
      sun = scene.children.find(o => o.isDirectionalLight);
      ambient = scene.children.find(o => o.isHemisphereLight);
      u.daylight.value = !!settings;
      u.night.value = name === 'night';
      u.westRange.value = name !== 'springs';
      u.panorama.value = settings ? dayPanorama : twilight;
      u.cover.value = settings?.cover ?? (name === 'night' ? .56 : .45);
      if (settings) {
        for (const key of ['zenith', 'horizon', 'shadow', 'rim']) u[key].value.set(settings[key]);
        sun.position.fromArray(settings.sun);
        u.sunDir.value.copy(sun.position).normalize();
        sun.color.set(settings.light);
        sun.intensity = 2.1;
        ambient.color.set(settings.fill);
        ambient.intensity = 1.7;
        scene.fog.color.set(settings.fog);
        sun.shadow.needsUpdate = true;
      } else if (name === 'night') {
        sun.position.set(29, 26, 28);
        sun.color.set('#bccff7');
        sun.intensity = .65;
        ambient.color.set('#a7bce6');
        ambient.intensity = .68;
      }
      update(0);
    },
    update,
    dispose() {
      motion?.removeEventListener('change', onMotionChange);
      dome.removeFromParent();
      dome.geometry.dispose();
      material.dispose();
      clouds.dispose();
      twilight.dispose();
    },
  };
}
