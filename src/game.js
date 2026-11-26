import * as T from 'three';
import { addRegion, buildWorld } from './world.js';
import { DishGuide } from './guidance.js';
import { foodModel, caster, animateFood } from './models.js';
import {
  DISHES,
  SPAWN,
  LIMIT,
  dishSpawn,
  slideMove,
  fieldData,
  formatTime,
  drawMap,
} from './field.js';
import { sound } from './audio.js';
const $ = (s) => document.querySelector(s),
  clamp = T.MathUtils.clamp;
const direction = new T.Vector3(),
  toward = new T.Vector3(),
  projected = new T.Vector3(),
  ray = new T.Raycaster();
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function netGeometry() {
  const segments = [];
  const point = (r, a) => [
    r * Math.cos(a),
    r * Math.sin(a),
    -0.5 * (1 - r * r),
  ];
  for (let r = 1; r <= 4; r++)
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        b = ((i + 1) * Math.PI) / 8;
      segments.push(
        ...point(r / 4, a),
        ...point(r / 4, b),
        ...point(r / 4, a),
        ...point((r - 1) / 4, a)
      );
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(segments, 3));
  return g;
}
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const a = c.getContext('2d'),
    g = a.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#191b14ad');
  g.addColorStop(0.55, '#191b1477');
  g.addColorStop(1, '#191b1400');
  a.fillStyle = g;
  a.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}
export class Hunt {
  constructor(events) {
    this.events = events;
    this.canvas = $('#scene');
    this.scene = new T.Scene();
    this.renderer = new T.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    const touch = document.body.classList.contains('touch-mode');
    this.maxPixelRatio = Math.min(devicePixelRatio || 1, touch ? 1.25 : 1.65);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.frameSample = 0;
    this.frameCount = 0;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.camera = new T.PerspectiveCamera(63, 1, 0.045, 4100);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.tool = caster();
    this.camera.add(this.tool);
    this.tool.position.set(0.3, -0.25, -0.37);
    this.tool.rotation.set(0.1, 0.32, -0.1);
    this.net = new T.LineSegments(
      netGeometry(),
      new T.LineBasicMaterial({
        color: 0xffdc91,
        transparent: true,
        opacity: 1,
      })
    );
    this.net.visible = false;
    this.scene.add(this.net);
    this.netStart = new T.Vector3();
    this.netEnd = new T.Vector3();
    this.keys = new Set();
    this.joy = { x: 0, z: 0 };
    this.wing = $('#wing');
    this.pips = DISHES.map(() => document.createElement('b'));
    $('#progress-pips').replaceChildren(...this.pips);
    this.guide = new DishGuide(this.scene);
    this.isBlocked = (x, z) => this.blocked(x, z);
    this.targets = [];
    this.playing = false;
    this.active = false;
    this.subscribed = false;
  }
  async init() {
    this.data = await fieldData();
    this.world = await buildWorld(this.scene, this.data);
    const shade = new T.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
    });
    const shadowPlane = new T.PlaneGeometry(2.4, 2.4);
    shadowPlane.rotateX(-Math.PI / 2);
    this.targets = DISHES.map((d, i) => {
      const model = foodModel(d.id, this.scene.background),
        shadow = new T.Mesh(shadowPlane, shade);
      this.scene.add(model, shadow);
      return { ...d, index: i, model, shadow, caught: false, vx: 0, vz: 0 };
    });
    this.bindInput();
    this.resize();
    this.camera.position.set(SPAWN.x, 1.62, SPAWN.z);
    this.camera.rotation.y = Math.atan2(16, 4);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }
  async ensureRegion() {
    this.regionRequest ??= addRegion(this.scene, this.world)
      .then((r) => (this.region = r))
      .catch((e) => {
        this.regionRequest = null;
        throw e;
      });
    return this.regionRequest;
  }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth,
      h = this.canvas.clientHeight || window.innerHeight;
    const aspect = w / h;
    if (this.camera.aspect < 1 !== aspect < 1) this.clearTouch();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = aspect;
    // Widen the vertical field on a portrait screen so nearby dishes stay in view.
    this.camera.fov = clamp(
      T.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 8) / aspect)),
      63,
      94
    );
    this.camera.updateProjectionMatrix();
    this.tool.position.x = Math.min(0.39, 0.25 * this.camera.aspect);
    this.tool.scale.setScalar(this.camera.aspect < 1 ? 0.72 : 1);
  }
  async reset(mode = 'hunt', spot = SPAWN) {
    if (mode !== 'hunt') await this.region.prepareAt(spot.x, spot.z);
    this.mode = mode;
    this.active = true;
    this.elapsed = 0;
    this.last = 0;
    this.cooldown = 0;
    this.netTime = 0;
    this.net.visible = false;
    this.noticeTime = 0;
    this.hudTime = 1;
    this.tileTime = 1;
    this.velocityY = 0;
    this.lift = 0;
    this.steps = 0;
    this.shots = 0;
    this.count = 0;
    this.yaw = Math.atan2(16, 4);
    this.pitch = -0.022;
    this.keys.clear();
    this.joy = { x: 0, z: 0 };
    this.touchId = null;
    this.camera.position.set(spot.x, 1.62, spot.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    for (const t of this.targets) {
      t.caught = false;
      t.model.visible = t.shadow.visible = mode !== 'roam';
      const anchor = dishSpawn(t, mode);
      t.x = anchor.x;
      t.z = anchor.z;
      t.model.position.set(t.x, this.height(t.x, t.z), t.z);
      t.shadow.position.set(t.x, this.height(t.x, t.z) + 0.055, t.z);
      t.vx = t.vz = 0;
    }
    if (mode !== 'hunt') this.arrive(spot);
    this.guide.reset(0);
    $('#compass').disabled = mode === 'roam';
    this.resize();
    this.setHUD();
    this.toast(
      mode === 'city'
        ? 'One side and one dessert per landmark. Open the map to travel.'
        : mode === 'hunt'
          ? 'Capture all ' + DISHES.length + ' dishes before supper.'
          : 'Free roam · ' + (spot.name || 'Community Park'),
      3
    );
  }
  async teleport(spot) {
    await this.region.prepareAt(spot.x, spot.z);
    this.arrive(spot);
    this.guide.reset(this.elapsed);
  }
  arrive(spot) {
    this.region?.update(spot.x, spot.z);
    let x = spot.x,
      z = spot.z;
    for (let i = 0; this.blocked(x, z) && i < 100; i++) {
      const a = i * 2.4,
        d = 3 * Math.sqrt(i + 1);
      x = spot.x + Math.cos(a) * d;
      z = spot.z + Math.sin(a) * d;
    }
    if (this.blocked(x, z)) throw Error('No open landing near this landmark.');
    this.camera.position.set(x, this.height(x, z) + 1.62, z);
    this.lift = 0;
    this.velocityY = 0;
    this.tileTime = 1;
  }
  resume(lock = true) {
    this.playing = true;
    this.last = 0;
    this.keys.clear();
    this.canvas.focus({ preventScroll: true });
    if (lock && !document.body.classList.contains('touch-mode')) {
      try {
        this.canvas.requestPointerLock?.()?.catch?.(() => {});
      } catch {}
    }
  }
  pause() {
    this.playing = false;
    this.keys.clear();
    this.dragging = false;
    this.clearTouch();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  clearTouch() {
    this.joy = { x: 0, z: 0 };
    this.touchId = null;
    this.stickId = null;
    this.castId = null;
    $('#stick b').style.transform = '';
    $('#touch-fire').classList.remove('held');
  }
  stop() {
    this.pause();
    this.active = false;
  }
  height(x, z) {
    return this.mode !== 'hunt' && this.region ? this.region.height(x, z) : 0;
  }
  blocked(x, z) {
    if (this.mode === 'hunt') return this.world.solids.blocked(x, z);
    return this.world.solids.occupied(x, z) || this.region.blocked(x, z);
  }
  look(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch = clamp(this.pitch - dy * 0.0025, -1.35, 1.29);
  }
  flap() {
    if (this.playing && this.lift < 0.08) {
      this.velocityY = 7.3;
      this.lift = 0.08;
      sound('flap');
    }
  }
  toast(msg, n = 1.6) {
    $('#notice').textContent = msg;
    this.noticeTime = n;
  }
  findDish() {
    if (!this.playing || this.mode === 'roam') return;
    this.guide.toggle(this.elapsed);
    this.guide.update(this, this.aim());
  }
  bindInput() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.abort = new AbortController();
    const on = (obj, name, fn) =>
      obj.addEventListener(name, fn, { signal: this.abort.signal });
    on(window, 'resize', () => this.resize());
    this.viewportObserver = new ResizeObserver(() => {
      if (this.canvas.clientWidth && this.canvas.clientHeight) this.resize();
    });
    this.viewportObserver.observe(this.canvas);
    on(window, 'blur', () => {
      if (this.playing) this.events.pause();
    });
    on(document, 'visibilitychange', () => {
      if (document.hidden && this.playing) this.events.pause();
    });
    on(document, 'pointerlockchange', () => {
      if (this.locked && !document.pointerLockElement && this.playing)
        this.events.pause();
      this.locked = document.pointerLockElement === this.canvas;
    });
    on(window, 'keydown', (e) => {
      if (!this.playing) return;
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'KeyQ',
          'KeyE',
          'ShiftLeft',
          'ShiftRight',
          'Space',
          'KeyF',
          'KeyH',
          'KeyM',
          'Escape',
          'KeyP',
        ].includes(e.code)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space') this.flap();
      if (e.code === 'KeyF') this.cast();
      if (e.code === 'KeyH') this.findDish();
      if (e.code === 'Escape' || e.code === 'KeyP') this.events.pause();
      if (e.code === 'KeyM') this.events.map();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(document, 'mousemove', (e) => {
      if (
        this.playing &&
        (document.pointerLockElement === this.canvas || this.dragging)
      )
        this.look(e.movementX, e.movementY);
    });
    const startLook = (e) => {
      if (this.touchId != null) return;
      this.touchId = e.pointerId;
      this.touchLook = [e.clientX, e.clientY];
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveLook = (e) => {
      if (!this.playing || e.pointerId !== this.touchId) return;
      const gain = clamp(
        780 / Math.min(this.canvas.clientWidth, this.canvas.clientHeight),
        1,
        2.5
      );
      this.look(
        (e.clientX - this.touchLook[0]) * gain,
        (e.clientY - this.touchLook[1]) * gain
      );
      this.touchLook = [e.clientX, e.clientY];
    };
    on(this.canvas, 'pointerdown', (e) => {
      if (!this.playing) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        startLook(e);
        return;
      }
      if (e.button !== 0) return;
      if (document.pointerLockElement !== this.canvas) {
        this.dragging = true;
        try {
          this.canvas.requestPointerLock?.()?.catch?.(() => {});
        } catch {}
      }
      this.cast();
    });
    on(this.canvas, 'pointermove', moveLook);
    const release = (e) => {
      this.dragging = false;
      if (e.pointerId === this.touchId) this.touchId = null;
    };
    on(window, 'pointerup', release);
    on(window, 'pointercancel', release);
    on(this.canvas, 'lostpointercapture', release);
    const stick = $('#stick');
    const stickMove = (e) => {
      if (e.pointerId !== this.stickId) return;
      const rect = stick.getBoundingClientRect(),
        radius = Math.max(
          1,
          (rect.width - stick.firstElementChild.offsetWidth) / 2
        ),
        dx = (e.clientX - rect.left - rect.width / 2) / radius,
        dz = (e.clientY - rect.top - rect.height / 2) / radius,
        m = Math.max(1, Math.hypot(dx, dz));
      this.joy = { x: dx / m, z: dz / m };
      stick.firstElementChild.style.transform =
        'translate(' +
        this.joy.x * radius +
        'px,' +
        this.joy.z * radius +
        'px)';
    };
    on(stick, 'pointerdown', (e) => {
      if (!this.playing || this.stickId != null) return;
      this.stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      stickMove(e);
    });
    on(stick, 'pointermove', stickMove);
    const stopStick = (e) => {
      if (e.pointerId === this.stickId) {
        this.joy = { x: 0, z: 0 };
        this.stickId = null;
        stick.firstElementChild.style.transform = '';
      }
    };
    on(stick, 'pointerup', stopStick);
    on(stick, 'pointercancel', stopStick);
    on(stick, 'lostpointercapture', stopStick);
    on($('#compass'), 'click', () => this.findDish());
    const fire = $('#touch-fire');
    on(fire, 'pointerdown', (e) => {
      if (!this.playing || this.castId != null) return;
      this.castId = e.pointerId;
      fire.setPointerCapture(e.pointerId);
      startLook(e);
      fire.classList.add('held');
    });
    on(fire, 'pointermove', moveLook);
    const endCast = (e) => {
      if (this.castId !== e.pointerId) return;
      this.castId = null;
      fire.classList.remove('held');
      if (e.type === 'pointerup') {
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.updateMatrixWorld();
        this.cast();
      }
    };
    on(fire, 'pointerup', endCast);
    on(fire, 'pointercancel', endCast);
    on(fire, 'lostpointercapture', endCast);
    on(fire, 'click', (e) => {
      if (e.detail === 0) this.cast();
    });
    on($('#touch-flap'), 'click', () => this.flap());
  }
  dispose() {
    this.abort?.abort();
    this.viewportObserver?.disconnect();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
  aim() {
    if (this.mode === 'roam') return null;
    const p = this.camera.position;
    this.camera.getWorldDirection(direction);
    let best = null,
      bestDepth = 35;
    for (const t of this.targets) {
      if (t.caught) continue;
      toward.copy(t.model.position);
      toward.y += t.model.userData.aimHeight;
      toward.sub(p);
      const depth = toward.dot(direction);
      if (
        depth <= 0 ||
        depth > bestDepth ||
        toward.lengthSq() - depth * depth > (1.12 + depth * 0.015) ** 2
      )
        continue;
      ray.set(p, direction);
      ray.far = depth;
      if (
        ray.intersectObjects(this.world.walls, false).length ||
        this.region?.occludes(ray)
      )
        continue;
      best = t;
      bestDepth = depth;
    }
    return best;
  }
  cast() {
    if (!this.playing || this.cooldown > 0) return;
    const t = this.aim();
    this.shots++;
    this.cooldown = 0.58;
    this.netTime = 0.24;
    this.camera.getWorldDirection(direction);
    this.netStart.set(0.19, -0.15, -0.63).applyMatrix4(this.camera.matrixWorld);
    this.netEnd.copy(this.camera.position).addScaledVector(direction, 28);
    if (t) {
      this.netEnd.copy(t.model.position);
      this.netEnd.y += t.model.userData.aimHeight;
    }
    this.net.quaternion.copy(this.camera.quaternion);
    this.net.visible = true;
    sound('cast');
    if (t) {
      t.caught = true;
      t.model.visible = t.shadow.visible = false;
      this.count++;
      this.guide.reset(this.elapsed);
      sound('catch');
      this.toast(t.name + ' captured!', 1.8);
      this.setHUD();
      if (this.count === DISHES.length) {
        sound('win');
        this.finish(true);
      }
    }
  }
  finish(won) {
    this.pause();
    this.active = false;
    this.events.end({
      won,
      time: this.elapsed,
      shots: this.shots,
      count: this.count,
    });
  }
  moveTargets(dt) {
    for (const t of this.targets) {
      if (t.caught) continue;
      const p = t.model.position,
        time = this.elapsed,
        dx = p.x - this.camera.position.x,
        dz = p.z - this.camera.position.z,
        dist = Math.hypot(dx, dz);
      const a = time * (0.29 + t.index * 0.016) + t.index * 2.2,
        wx = t.x + Math.cos(a) * (3.5 + t.index),
        wz = t.z + Math.sin(a * 1.32) * 4.5;
      const flee = dist < 10 ? 1 - dist / 10 : 0;
      t.vx = T.MathUtils.damp(
        t.vx,
        clamp((wx - p.x) * 0.76 + (dx / (dist || 1)) * flee * 7, -3.2, 3.2),
        4,
        dt
      );
      t.vz = T.MathUtils.damp(
        t.vz,
        clamp((wz - p.z) * 0.76 + (dz / (dist || 1)) * flee * 7, -3.2, 3.2),
        4,
        dt
      );
      if (dist > 480 && this.mode === 'city') continue;
      if (!this.blocked(p.x + t.vx * dt, p.z)) p.x += t.vx * dt;
      if (!this.blocked(p.x, p.z + t.vz * dt)) p.z += t.vz * dt;
      animateFood(t.model, time, Math.hypot(t.vx, t.vz), t.index * 1.57);
      p.y =
        this.height(p.x, p.z) +
        0.1 +
        Math.abs(Math.sin(time * 4.5 + t.index)) * 0.1;
      t.model.rotation.y =
        Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z) +
        Math.sin(time * 1.7 + t.index) * 0.22;
      t.model.rotation.z = Math.sin(time * 4.5 + t.index) * 0.07;
      t.shadow.position.set(p.x, this.height(p.x, p.z) + 0.055, p.z);
    }
  }
  setHUD() {
    const roam = this.mode === 'roam';
    $('#progress-pips').hidden = roam;
    this.pips.forEach((pip, i) =>
      pip.classList.toggle('filled', this.targets[i].caught)
    );
    $('#counter').previousElementSibling.textContent = roam
      ? 'MODE'
      : 'DISHES CAPTURED';
    $('#counter').textContent = roam
      ? 'Free roam'
      : this.count + ' / ' + DISHES.length;
    $('#time').previousElementSibling.textContent = roam
      ? 'TIME AFIELD'
      : 'SUPPER IN';
    $('#time').textContent = formatTime(
      roam ? this.elapsed : Math.max(0, Math.ceil(LIMIT - this.elapsed))
    );
    const bearing = ((((-this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    $('#bearing').textContent =
      directions[Math.round(bearing / 45) % 8] +
      '  ' +
      String(Math.round(bearing) % 360).padStart(3, '0') +
      '°';
    const p = this.camera.position,
      far =
        this.mode !== 'hunt' && Math.max(Math.abs(p.x), Math.abs(p.z)) > 610;
    drawMap($('#radar'), far && this.region ? this.region.data : this.data, {
      x: p.x,
      z: p.z,
      width: far ? 900 : 240,
      targets: roam ? [] : this.targets,
      player: p,
      yaw: this.yaw,
    });
  }
  frame(time) {
    if (!this.playing) {
      this.last = 0;
      return;
    }
    const delta = this.last ? Math.max(0, (time - this.last) / 1000) : 0,
      dt = Math.min(0.06, delta);
    this.last = time;
    if (delta > 0) {
      this.frameSample += delta;
      this.frameCount++;
      if (this.frameCount >= 24) {
        const average = this.frameSample / this.frameCount,
          ratio = this.renderer.getPixelRatio();
        const next =
          average > 0.039
            ? Math.max(0.7, ratio * 0.82)
            : average < 0.014
              ? Math.min(this.maxPixelRatio, ratio + 0.08)
              : ratio;
        if (Math.abs(next - ratio) > 0.01) this.renderer.setPixelRatio(next);
        this.frameCount = 0;
        this.frameSample = 0;
      }
    }
    this.elapsed += delta;
    if (this.mode !== 'roam' && this.elapsed >= LIMIT) {
      this.elapsed = LIMIT;
      this.finish(false);
      return;
    }
    const k = this.keys;
    let strafe = Number(k.has('KeyD')) - Number(k.has('KeyA')) + this.joy.x;
    let forward =
      Number(k.has('KeyW') || k.has('ArrowUp')) -
      Number(k.has('KeyS') || k.has('ArrowDown')) -
      this.joy.z;
    const l = Math.max(1, Math.hypot(strafe, forward));
    strafe /= l;
    forward /= l;
    this.yaw +=
      (Number(k.has('ArrowLeft')) - Number(k.has('ArrowRight'))) * dt * 1.9;
    this.pitch = clamp(
      this.pitch + (Number(k.has('KeyQ')) - Number(k.has('KeyE'))) * dt * 1.05,
      -1.35,
      1.29
    );
    const sprint =
      k.has('ShiftLeft') ||
      k.has('ShiftRight') ||
      Math.hypot(this.joy.x, this.joy.z) > 0.85;
    const speed = this.mode === 'roam' ? (sprint ? 33 : 13) : sprint ? 13 : 7.2,
      sn = Math.sin(this.yaw),
      cs = Math.cos(this.yaw);
    slideMove(
      this.camera.position,
      (strafe * cs - forward * sn) * speed * dt,
      (-strafe * sn - forward * cs) * speed * dt,
      this.isBlocked
    );
    this.steps += dt * Math.hypot(strafe, forward) * (sprint ? 13 : 9);
    this.velocityY -= 18 * dt;
    this.lift = Math.max(0, this.lift + this.velocityY * dt);
    if (!this.lift) this.velocityY = 0;
    const p = this.camera.position;
    p.y =
      this.height(p.x, p.z) + 1.62 + this.lift + Math.sin(this.steps) * 0.038;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    if (this.mode !== 'roam') this.moveTargets(dt);
    if (this.mode !== 'hunt' && this.region && (this.tileTime += dt) > 0.5) {
      this.region.update(p.x, p.z);
      this.tileTime = 0;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.tool.position.y = -0.29 + Math.sin(this.steps) * 0.009;
    this.tool.position.z = -0.46 + Math.pow(this.cooldown / 0.58, 3) * 0.105;
    this.wing.style.transform =
      'translateY(' +
      (-Math.sin(this.steps) * 4 + this.cooldown * 10 - this.lift * 3) +
      'px) rotate(' +
      -this.lift * 2 +
      'deg)';
    if (this.netTime > 0) {
      this.netTime -= dt;
      const progress = 1 - Math.max(0, this.netTime) / 0.24;
      this.net.position.lerpVectors(this.netStart, this.netEnd, progress);
      this.net.scale.setScalar(0.12 + progress * 1.3);
      this.net.material.opacity = 1 - progress * 0.5;
      this.net.visible = this.netTime > 0;
    }
    this.noticeTime -= dt;
    if (this.noticeTime <= 0 && $('#notice').textContent)
      $('#notice').textContent = '';
    this.hudTime += dt;
    if (this.hudTime > 0.13) {
      this.hudTime = 0;
      this.setHUD();
      const target = this.aim(),
        label = $('#in-world-label');
      $('#crosshair').classList.toggle('aim', !!target);
      label.hidden = !target;
      if (target) {
        projected.copy(target.model.position);
        projected.y += target.model.userData.labelHeight;
        projected.project(this.camera);
        label.style.left = (projected.x * 0.5 + 0.5) * 100 + '%';
        label.style.top = clamp((0.5 - projected.y * 0.5) * 100, 15, 85) + '%';
        label.textContent =
          target.name +
          ' · ' +
          Math.round(p.distanceTo(target.model.position)) +
          ' m';
      }
      this.guide.update(this, target);
      $('#net-state').textContent = this.cooldown ? 'RECASTING' : 'READY';
    }
    this.renderer.render(this.scene, this.camera);
  }
}
