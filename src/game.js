import * as T from 'three';
import { addRegion, buildWorld } from './world.js';
import { courseMaps } from './course-maps.js';
import { streetLocator } from './street-location.js';
import { DOVER_ROUTE } from './dover-route.js';
import { loadVenue, lightDoverPorch } from './trip-venue.js';
import { doverCorners } from './parade-route.js';
import { doverLeg } from './dover-guide.js';
import { ChaseView, TURKEY_EYE } from './view.js';
import { TurkeyAvatar } from './turkey-avatar.js';
import { BODY_RADIUS, CASTER_SCALE } from './turkey-scale.js';
import { overlapsBody, separateFromActors } from './body-collision.js';
import { addPeaks } from './peaks.js';
import { DoverCottage } from './dover.js';
import { DOVER, PORCH, RELIC, hasGrail } from './dover-location.js';
import { FoodFight } from './foodfight.js';
import { Flurries } from './flurries.js';
import { COURSES, COURSE_TIME, coursePoint, rollSnow } from './courses.js';
import { DishGuide } from './guidance.js';
import { foodModel, caster, animateFood } from './models.js';
import {
  DISHES,
  SPAWN,
  TRAVEL,
  LIMIT,
  dishSpawn,
  slideMove,
  fieldData,
  formatTime,
  drawMap,
  loadMapImage,
} from './field.js';
import { sound } from './audio.js';
const $ = (s) => document.querySelector(s),
  clamp = T.MathUtils.clamp;
const direction = new T.Vector3(),
  toward = new T.Vector3(),
  projected = new T.Vector3(),
  ray = new T.Raycaster();
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const toolRest = { y: -0.24, z: -0.5 };
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
    this.timerEnabled = true;
    this.canvas = $('#scene');
    this.streetLabel = $('#current-street');
    this.streetText = this.streetLabel.querySelector('span');
    this.scene = new T.Scene();
    this.venues = new Map();
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.camera = new T.PerspectiveCamera(63, 1, 0.045, 4100);
    this.camera.rotation.order = 'YXZ';
    this.chaseCamera = new ChaseView();
    this.avatar = new TurkeyAvatar();
    this.scene.add(this.camera, this.avatar);
    this.house = new DoverCottage(this.scene);
    this.thirdPerson = false;
    try {
      this.thirdPerson = localStorage.getItem('gobbler-chase-view') === 'on';
    } catch {}
    this.fight = new FoodFight(this);
    this.standardTool = caster();
    this.wideTool = this.fight.art.upgrade('wide');
    this.wideTool.visible = false;
    this.tool = new T.Group();
    this.tool.add(this.standardTool, this.wideTool);
    this.camera.add(this.tool);
    this.tool.position.set(0, toolRest.y, toolRest.z);
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
    this.pips = DISHES.map(() => document.createElement('b'));
    $('#progress-pips').replaceChildren(...this.pips);
    this.guide = new DishGuide(this.scene);
    this.isBlocked = (x, z) => this.blocked(x, z);
    this.playerBlocked = (x, z) => {
      if (this.blocked(x, z)) return true;
      if (this.house.inside) return false;
      const feet = this.height(x, z) + this.lift;
      return (
        this.targets.some((t) => overlapsBody(t, x, z, feet)) ||
        !!this.streetParade?.blocks(x, z, BODY_RADIUS, null, feet)
      );
    };
    this.ground = (x, z) => this.height(x, z);
    this.updateViewControls();
    this.targets = [];
    this.playing = false;
    this.active = false;
    this.subscribed = false;
  }
  async init() {
    const [data, wing] = await Promise.all([
      fieldData(),
      this.avatar.load(this.standardTool.clone(), this.wideTool.clone()),
    ]);
    this.data = data;
    this.parkStreetAt = streetLocator(data);
    this.tool.add(wing);
    this.world = await buildWorld(this.scene, this.data);
    await Promise.all([addPeaks(this.scene), loadMapImage(this.data)]);
    this.daySky = this.scene.background;
    this.groundShadow = shadowTexture();
    const shade = new T.MeshBasicMaterial({
      map: this.groundShadow,
      transparent: true,
      depthWrite: false,
    });
    const shadowPlane = new T.PlaneGeometry(2.4, 2.4);
    shadowPlane.rotateX(-Math.PI / 2);
    this.weather = new Flurries(this.scene);
    this.allTargets = DISHES.map((d, i) => {
      const model = foodModel(d.id, this.scene.background),
        shadow = new T.Mesh(shadowPlane, shade);
      this.scene.add(model, shadow);
      return {
        ...d,
        index: i,
        model,
        shadow,
        radius: model.userData.bodyRadius,
        height: model.userData.bodyHeight,
        caught: false,
        vx: 0,
        vz: 0,
      };
    });
    this.fieldActors = new T.Group();
    this.fieldActors.add(
      this.net,
      this.guide.arrows,
      this.fight.group,
      this.fight.trails,
      ...this.allTargets.flatMap((t) => [t.model, t.shadow])
    );
    this.scene.add(this.fieldActors);
    this.bindInput();
    this.resize();
    this.camera.position.set(
      SPAWN.x,
      this.height(SPAWN.x, SPAWN.z) + TURKEY_EYE,
      SPAWN.z
    );
    this.camera.rotation.y = Math.atan2(16, 4);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }
  async ensureRegion() {
    this.regionRequest ??= (async () => {
      this.region ??= await addRegion(this.scene, this.world);
      [this.maps] = await Promise.all([
        courseMaps(this.scene, this.world, this.region),
        loadMapImage(this.region.data),
      ]);
      this.regionStreetAt = streetLocator(this.region.data);
      return this.region;
    })().catch((e) => {
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
    this.chaseCamera.aspect = aspect;
    this.chaseCamera.fov = this.camera.fov;
    this.chaseCamera.updateProjectionMatrix();
    this.tool.position.x = Math.min(0.29, 0.2 * this.camera.aspect);
    this.tool.scale.setScalar(
      CASTER_SCALE * (this.camera.aspect < 1 ? 0.72 : 1)
    );
  }
  get mapPosition() {
    return this.house.inside ? PORCH : this.camera.position;
  }
  get viewCamera() {
    return this.thirdPerson ? this.chaseCamera : this.camera;
  }
  updateViewControls() {
    const button = $('#view-toggle');
    button.setAttribute('aria-pressed', String(this.thirdPerson));
    button.title = this.thirdPerson
      ? 'Switch to first person (V)'
      : 'Switch to chase camera (V)';
    button.setAttribute('aria-label', button.title);
    $('#view-name').textContent = this.thirdPerson
      ? 'Chase cam'
      : 'First person';
    this.tool.visible = !this.thirdPerson && !this.house.inside;
    if (this.avatar.gear) this.avatar.gear.visible = !this.house.inside;
    this.avatar.visible = this.thirdPerson;
  }
  toggleView() {
    if (!this.playing) return;
    this.thirdPerson = !this.thirdPerson;
    try {
      localStorage.setItem(
        'gobbler-chase-view',
        this.thirdPerson ? 'on' : 'off'
      );
    } catch {}
    this.updateViewControls();
    this.syncView(0, true);
    this.toast(this.thirdPerson ? 'Chase camera' : 'First person');
  }
  syncView(dt, snap = false, speed = 0, heading = this.yaw) {
    const p = this.camera.position;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    if (!this.thirdPerson) return;
    this.chaseCamera.follow(
      p,
      this.yaw,
      this.pitch,
      dt,
      snap,
      this.isBlocked,
      this.ground,
      this.house.inside || this.venue?.data.id === 'ice',
      this.house.inside ? 3.26 : 10.3
    );
    // At a wall the boom can fold to the eye. Keep feathers out of the near plane.
    this.avatar.visible = this.chaseCamera.distance > 0.9;
    this.avatar.position.set(p.x, this.height(p.x, p.z) + this.lift, p.z);
    this.avatar.rotation.y = this.cooldown > 0.15 ? this.yaw : heading;
    this.avatar.animate(
      dt,
      speed,
      this.lift,
      this.flapTime === 0 && (this.keys.has('Space') || this.flapId != null)
    );
  }
  leaveCottage() {
    if (!this.house.inside) return;
    this.house.inside = false;
    this.scene.add(this.camera, this.avatar);
    this.updateViewControls();
  }
  interact() {
    if (!this.playing) return;
    if (this.pendingDestination) {
      const { x, z } = this.pendingDestination;
      const p = this.camera.position;
      if (Math.hypot(p.x - x, p.z - z) > 3) return;
      this.pendingDestination = null;
      if (this.course.venue === 'airport') {
        this.useVenue(null);
        this.arrivalAtDover = true;
        this.restoreDaylight = lightDoverPorch(this.scene, this.ground);
        this.arrive({ x: 1160, z: -1015 });
        this.yaw = Math.atan2(
          this.camera.position.x - PORCH.x,
          this.camera.position.z - PORCH.z
        );
        this.pitch = 0.045;
        this.syncView(0, true);
        this.guide.reset(this.elapsed);
        this.toast(
          '735 Dover St · Follow the porch light and inspect the display.',
          5
        );
        this.setHUD();
      } else this.completeCourse();
      return;
    }
    if (!this.house.prompt(this.camera.position, this.arrivalAtDover)) return;
    const p = this.camera.position;
    if (!this.house.inside) {
      this.house.enter();
      this.house.scene.add(this.camera, this.avatar);
      p.set(0, TURKEY_EYE, 2.5);
      this.yaw = 0;
      this.guide.hide();
      this.toast('Hall of Gravy · Search the display pedestal.', 3);
    } else if (p.z > 0) {
      this.leaveCottage();
      this.yaw = -Math.PI / 2;
      p.set(
        PORCH.x + 1.85,
        this.height(PORCH.x + 1.85, PORCH.z) + TURKEY_EYE,
        PORCH.z
      );
      this.toast('Back on Dover Street.');
    } else {
      this.house.collect();
      this.trackingDover = false;
      if (this.arrivalAtDover) {
        sound('win');
        this.completeCourse();
        return;
      }
      sound('bonus');
      this.toast('One of one! ' + RELIC + ' added to your field guide.', 5);
    }
    this.lift = this.flapTime = this.velocityY = this.pitch = 0;
    this.netTime = 0;
    this.net.visible = false;
    this.updateViewControls();
    this.syncView(0, true);
    this.setHUD();
  }
  get untimed() {
    return this.mode === 'roam' || this.mode === 'parade';
  }
  get activeParade() {
    return this.mode === 'campaign' ? this.doverParade : this.parade;
  }
  get streetParade() {
    return !this.house.inside && this.activeParade?.group.visible
      ? this.activeParade
      : null;
  }
  get localParade() {
    return !this.trackingDover && this.activeParade?.group.visible
      ? this.activeParade
      : null;
  }
  get regional() {
    return (
      this.mode === 'city' ||
      this.mode === 'roam' ||
      (this.mode === 'campaign' && (!this.course?.venue || this.arrivalAtDover))
    );
  }
  get timeLimit() {
    return this.mode === 'campaign' ? COURSE_TIME : LIMIT;
  }
  get course() {
    return COURSES[this.level];
  }
  get currentHunt() {
    return this.mode === 'campaign' ? this.course.hunts[this.huntIndex] : null;
  }
  get huntLabel() {
    return (
      'Hunt ' +
      (this.huntIndex + 1) +
      '/' +
      this.course.hunts.length +
      ' · ' +
      this.currentHunt.name
    );
  }
  get huntCaptures() {
    return this.targets.filter((target) => target.caught).length;
  }
  get mapData() {
    return this.venue?.data ?? (this.regional ? this.region.data : this.data);
  }
  useVenue(venue) {
    this.venue = venue;
    const scene = venue?.scene ?? this.scene;
    scene.add(this.fieldActors, this.camera, this.avatar);
  }
  async reset(mode = 'campaign', spot = SPAWN) {
    this.leaveCottage();
    this.mode = mode;
    $('#arena').classList.toggle('parade-mode', mode === 'parade');
    const mapLabel = mode === 'parade' ? 'Parade map' : 'Hunt map';
    $('.radar').title = 'Open ' + mapLabel.toLowerCase();
    $('.radar').setAttribute('aria-label', $('.radar').title);
    $('#radar-label').textContent = mapLabel.toUpperCase();
    $('[data-action="pause"]').setAttribute(
      'aria-label',
      mode === 'parade' ? 'Pause parade' : 'Pause hunt'
    );
    this.updateViewControls();
    this.nextParadeAttempt = 0;
    if (mode === 'parade') {
      await this.loadParade();
    }
    this.level = 0;
    this.bankedTime = 0;
    this.timedRun = true;
    this.bankedCount = 0;
    this.shots = 0;
    this.saved = { shots: 0 };
    await this.beginCourse(0, mode === 'campaign' ? COURSES[0].spawn : spot);
  }
  async beginCourse(level, spot = COURSES[level].spawn) {
    const campaign = this.mode === 'campaign';
    const course = COURSES[level];
    const regionalSpot = campaign && course.venue === 'airport' ? DOVER : spot;
    let venue = null;
    if (campaign && course.venue) {
      venue = this.venues.get(course.venue);
      if (!venue) {
        venue = await loadVenue(course.venue, this.world, this.daySky);
        this.venues.set(course.venue, venue);
      }
    }
    if (
      ['city', 'roam'].includes(this.mode) ||
      (campaign && (!venue || course.venue === 'airport'))
    ) {
      const region = await this.ensureRegion();
      await region.prepareAt(regionalSpot.x, regionalSpot.z);
      await this.maps.prepare(regionalSpot.x, regionalSpot.z);
      if (campaign && course.parade && !this.doverParade) {
        const site = region.data.detailMaps.find((s) => s.id === 'dover');
        const { Parade } = await import('./parade.js');
        this.doverParade = await Parade.load(
          site,
          {
            height: this.world.height,
            streetModels: this.world.streetModels,
            solids: site.solids,
          },
          this.avatar,
          this.groundShadow,
          {
            corners: doverCorners,
            count: 8,
            startDistance: 66,
            name: 'Dover Thanksgiving parade',
          }
        );
        this.doverParade.group.visible = false;
        this.scene.add(this.doverParade.group);
      }
    }
    this.leaveCottage();
    this.weather.setSnowing(false);
    this.restoreDaylight?.();
    this.restoreDaylight = null;
    this.useVenue(venue);
    this.level = level;
    this.arrivalAtDover = false;
    this.pendingDestination = null;
    this.trackingDover = false;
    this.intermission = false;
    this.active = true;
    this.elapsed = 0;
    this.huntIndex = 0;
    this.last = 0;
    this.cooldown = 0;
    this.netTime = 0;
    this.net.visible = false;
    this.noticeTime = 0;
    this.hudTime = 1;
    this.tileTime = 1;
    this.velocityY = 0;
    this.lift = this.flapTime = 0;
    this.steps = 0;
    this.count = 0;
    this.shots = this.saved.shots;
    this.paradeHits = this.saved.paradeHits ?? 0;
    this.paradeCaptures = this.saved.paradeCaptures ?? 0;
    this.fight.reset(this.saved);
    $('#hit-flash').style.opacity = '0';
    this.yaw = campaign ? (course.yaw ?? 0) : Math.atan2(16, 4);
    this.pitch = campaign ? (course.pitch ?? -0.022) : -0.022;
    this.keys.clear();
    this.clearTouch();
    this.targets = [];
    if (this.parade) this.parade.group.visible = false;
    if (this.doverParade) this.doverParade.group.visible = false;
    this.activeParade?.reset();
    if (this.mode === 'parade') this.rejoinParade();
    else this.arrive(spot);
    this.updateParade();
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    for (const t of this.allTargets) t.caught = false;
    this.spawnHunt();
    if (!this.untimed) this.stockGravy(spot);
    this.weather.setSnowing(
      !this.venue && this.mode !== 'parade' && rollSnow()
    );
    this.weatherAt = 50 + Math.random() * 45;
    $('#compass').disabled = this.untimed;
    this.resize();
    this.setHUD();
    this.toast(
      campaign
        ? 'Day ' + (level + 1) + ' · ' + this.huntLabel
        : this.mode === 'city'
          ? 'One side and one dessert per landmark. Open the map to travel.'
          : this.mode === 'hunt'
            ? 'Capture all twelve dishes before supper.'
            : this.mode === 'parade'
              ? 'Main Street parade · Follow the balloons or watch from the curb.'
              : 'Free roam · ' + (spot.name || 'Community Park'),
      3
    );
  }
  spawnHunt() {
    this.countdownElapsed = 0;
    this.targets = [];
    const anchors = this.currentHunt
      ? new Map(
          this.currentHunt.dishes.map(([id, dx, dz]) => [
            id,
            coursePoint(this.course, dx, dz),
          ])
        )
      : null;
    for (const t of this.allTargets) {
      t.model.visible = t.shadow.visible =
        !this.untimed && (!anchors || anchors.has(t.id));
      if (!t.model.visible) continue;
      this.targets.push(t);
      const anchor = anchors ? anchors.get(t.id) : dishSpawn(t, this.mode);
      t.x = anchor.x;
      t.z = anchor.z;
      t.model.position.set(t.x, this.height(t.x, t.z), t.z);
      t.shadow.position.set(t.x, this.height(t.x, t.z) + 0.055, t.z);
      t.vx = t.vz = 0;
    }
    this.guide.reset(this.elapsed);
  }
  loadParade() {
    this.paradeRequest ??= import('./parade.js')
      .then(({ Parade }) =>
        Parade.load(this.data, this.world, this.avatar, this.groundShadow)
      )
      .then((parade) => {
        this.parade = parade;
        parade.group.visible = false;
        this.scene.add(parade.group);
        return parade;
      })
      .catch((error) => {
        this.paradeRequest = null;
        throw error;
      });
    return this.paradeRequest;
  }
  updateParade() {
    const p = this.camera.position;
    if (this.mode === 'campaign') {
      if (this.doverParade) {
        const visible =
          !!this.course.parade &&
          !this.house.inside &&
          Math.hypot(p.x - DOVER.x, p.z - DOVER.z) < 450;
        this.doverParade.group.visible = visible;
        if (visible) this.doverParade.update(this.elapsed, p);
      }
      return;
    }
    const nearby = !this.house.inside && Math.hypot(p.x + 145, p.z - 148) < 650;
    if (!this.parade) {
      if (
        nearby &&
        !this.paradeRequest &&
        this.elapsed >= this.nextParadeAttempt
      ) {
        this.loadParade().catch(() => {
          this.nextParadeAttempt = this.elapsed + 30;
        });
      }
      return;
    }
    this.parade.group.visible = nearby;
    if (nearby) this.parade.update(this.elapsed, p);
  }
  rejoinParade(index = 0) {
    const { viewer, subject } = this.parade.viewpoint(index);
    this.arrive(viewer);
    const p = this.camera.position;
    this.yaw = Math.atan2(p.x - subject.x, p.z - subject.z);
    this.pitch = Math.atan2(
      this.height(subject.x, subject.z) + 5.3 - p.y,
      Math.hypot(p.x - subject.x, p.z - subject.z)
    );
    this.syncView(0, true);
  }
  stockGravy(spot) {
    this.gravyStop = spot;
    const points =
      this.mode === 'campaign'
        ? this.course.gravy.map(([x, z]) => coursePoint(this.course, x, z))
        : this.mode === 'city'
          ? [
              { x: spot.x - 8, z: spot.z + 8 },
              { x: spot.x + 9, z: spot.z - 11 },
            ]
          : [
              { x: -52, z: 28 },
              { x: -110, z: -63 },
              { x: 132, z: -75 },
              { x: 160, z: 19 },
            ];
    this.fight.stock(points);
  }
  async advance() {
    if (!this.intermission || this.level >= COURSES.length - 1) return;
    await this.beginCourse(this.level + 1);
  }
  async retry() {
    await this.beginCourse(this.level);
  }
  async teleport(spot) {
    await this.region.prepareAt(spot.x, spot.z);
    await this.maps.prepare(spot.x, spot.z);
    this.arrive(spot);
    if (this.mode === 'city') this.stockGravy(spot);
    this.guide.reset(this.elapsed);
  }
  openSpot(spot) {
    let x = spot.x,
      z = spot.z;
    for (let i = 0; this.blocked(x, z) && i < 100; i++) {
      const a = i * 2.4,
        d = 3 * Math.sqrt(i + 1);
      x = spot.x + Math.cos(a) * d;
      z = spot.z + Math.sin(a) * d;
    }
    if (this.blocked(x, z)) throw Error('No open landing near this landmark.');
    return { x, z };
  }
  arrive(spot) {
    this.leaveCottage();
    if (this.regional) this.region.update(spot.x, spot.z);
    this.house.porch.visible = this.regional;
    if (this.regional)
      this.house.porch.position.y = this.height(PORCH.x, PORCH.z);
    this.trackingDover =
      this.arrivalAtDover ||
      (this.mode !== 'campaign' && spot === DOVER && !hasGrail());
    if (spot === DOVER) {
      this.yaw = Math.PI / 2;
      this.pitch = 0;
    }
    const { x, z } = this.openSpot(spot);
    this.camera.position.set(x, this.height(x, z) + TURKEY_EYE, z);
    this.lift = this.flapTime = 0;
    this.velocityY = 0;
    this.tileTime = 1;
    this.syncView(0, true);
  }
  resume(lock = true) {
    if (!this.active || this.intermission) return;
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
    this.flapId = null;
    $('#touch-flap').classList.remove('held');
    $('#stick b').style.transform = '';
    $('#touch-fire').classList.remove('held');
  }
  stop() {
    this.pause();
    if (this.parade) this.parade.group.visible = false;
    this.active = false;
  }
  height(x, z) {
    if (this.house.inside || this.venue) return 0;
    return this.regional && this.region
      ? this.region.height(x, z)
      : this.world.height(x, z);
  }
  blocked(x, z) {
    if (this.house.inside) return this.house.blocked(x, z);
    if (this.venue) return this.venue.solids.blocked(x, z);
    if (!this.regional) return this.world.solids.blocked(x, z);
    return (
      this.world.solids.occupied(x, z) ||
      this.region.blocked(x, z) ||
      this.maps.blocked(x, z)
    );
  }
  look(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch = clamp(this.pitch - dy * 0.0025, -1.35, 1.29);
  }
  flap() {
    if (!this.playing || this.lift > 0) return;
    this.velocityY = 7.3;
    this.lift = 0.03;
    this.flapTime = 0.68;
    sound('flap');
  }
  advanceFlight(dt, held) {
    if (!this.lift) return;
    // One wingbeat per takeoff. Holding the button after it ends opens the
    // wings for a glide; releasing it lets the bird drop at normal gravity.
    const powered = held ? Math.min(dt, this.flapTime) : 0;
    this.flapTime = Math.max(0, this.flapTime - dt);
    if (powered > 0) {
      this.velocityY = T.MathUtils.damp(this.velocityY, 2.65, 6, powered);
      this.lift += this.velocityY * powered;
    }
    const coast = dt - powered;
    this.velocityY -= 18 * coast;
    if (held) this.velocityY = Math.max(-1.35, this.velocityY);
    this.lift = Math.max(0, this.lift + this.velocityY * coast);
    if (this.house.inside && this.lift >= 2.15) {
      this.lift = 2.15;
      this.velocityY = Math.min(0, this.velocityY);
      this.flapTime = 0;
    }
    if (!this.lift) this.velocityY = this.flapTime = 0;
  }
  toast(msg, n = 1.6) {
    $('#notice').textContent = msg;
    this.noticeTime = n;
  }
  findDish() {
    if (!this.playing || this.house.inside || this.untimed) return;
    this.guide.toggle(this.elapsed);
    const target = this.aim();
    this.guide.update(this, target?.isParadeParticipant ? null : target);
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
          'KeyV',
          'KeyG',
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
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'KeyG') this.interact();
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
    on($('#view-toggle'), 'click', () => this.toggleView());
    on($('#interact'), 'click', () => this.interact());
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
        this.syncView(0);
        this.cast();
      }
    };
    on(fire, 'pointerup', endCast);
    on(fire, 'pointercancel', endCast);
    on(fire, 'lostpointercapture', endCast);
    on(fire, 'click', (e) => {
      if (e.detail === 0) this.cast();
    });
    const flap = $('#touch-flap');
    on(flap, 'pointerdown', (e) => {
      if (!this.playing || this.flapId != null) return;
      this.flapId = e.pointerId;
      flap.setPointerCapture(e.pointerId);
      flap.classList.add('held');
      this.flap();
    });
    const releaseFlap = (e) => {
      if (this.flapId !== e.pointerId) return;
      this.flapId = null;
      flap.classList.remove('held');
    };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      on(flap, event, releaseFlap);
    on(flap, 'click', (e) => {
      if (e.detail === 0) this.flap();
    });
  }
  dispose() {
    this.abort?.abort();
    this.viewportObserver?.disconnect();
    this.renderer.setAnimationLoop(null);
    this.weather?.dispose();
    this.fight.dispose();
    this.renderer.dispose();
  }
  occluded(ray) {
    if (this.venue)
      return ray.intersectObjects(this.venue.walls, false).length > 0;
    return (
      ray.intersectObjects(this.world.walls, false).length > 0 ||
      this.region?.occludes(ray)
    );
  }
  aim() {
    if (this.house.inside) return null;
    const p = this.camera.position,
      view = this.viewCamera;
    view.getWorldDirection(direction);
    const range = this.fight.wide ? 52 : 35;
    let best = null,
      bestDepth = Infinity;
    const participants = this.streetParade?.nearbyActors;
    const candidates = participants?.length
      ? [...this.targets, ...participants]
      : this.targets;
    for (const t of candidates) {
      if (t.caught) continue;
      toward.copy(t.model.position);
      let aimY = toward.y + t.model.userData.aimHeight;
      if (t.isParadeParticipant) {
        // Aim anywhere from feet to head. Use the actual body width so a cast
        // past a family can still reach a dish down the street.
        const horizontal = direction.x ** 2 + direction.z ** 2;
        const along =
          horizontal > 0.001
            ? ((toward.x - view.position.x) * direction.x +
                (toward.z - view.position.z) * direction.z) /
              horizontal
            : 0;
        aimY = clamp(
          view.position.y + direction.y * along,
          toward.y + t.radius * 0.55,
          toward.y + t.height - t.radius * 0.55
        );
      }
      toward.y = aimY;
      if (toward.distanceToSquared(p) > range * range) continue;
      toward.sub(view.position);
      const depth = toward.dot(direction);
      if (
        depth <= 0 ||
        depth > bestDepth ||
        toward.lengthSq() - depth * depth >
          (t.isParadeParticipant
            ? t.radius + (this.fight.wide ? 0.45 : 0.1)
            : (this.fight.wide ? 2.8 : 1.12) +
              depth * (this.fight.wide ? 0.05 : 0.015)) **
            2
      )
        continue;
      // Both the reticle and the turkey must have a clear shot around corners.
      ray.far = toward.length();
      ray.set(view.position, toward.normalize());
      if (this.thirdPerson && this.occluded(ray)) continue;
      toward.copy(t.model.position);
      toward.y = aimY;
      toward.sub(p);
      ray.far = toward.length();
      ray.set(p, toward.normalize());
      if (this.occluded(ray)) continue;
      best = t;
      bestDepth = depth;
    }
    return best;
  }
  cast() {
    if (!this.playing || this.house.inside || this.cooldown > 0) return;
    const t = this.aim();
    this.shots++;
    this.wideCast = this.fight.wide > 0;
    if (this.wideCast) this.fight.wide--;
    this.net.material.color.setHex(this.wideCast ? 0x8bffe0 : 0xffdc91);
    this.cooldown = this.wideCast ? 0.3 : 0.58;
    this.netTime = 0.24;
    if (this.thirdPerson) {
      this.avatar.rotation.y = this.yaw;
      this.avatar.cast();
    }
    this.viewCamera.getWorldDirection(direction);
    this.netStart.set(0.19, -0.15, -0.63).applyMatrix4(this.camera.matrixWorld);
    this.netEnd.copy(this.viewCamera.position).addScaledVector(direction, 28);
    if (t) {
      this.netEnd.copy(t.model.position);
      this.netEnd.y += t.model.userData.aimHeight;
    }
    this.net.quaternion.copy(this.viewCamera.quaternion);
    this.net.visible = true;
    sound('cast');
    if (t?.isParadeParticipant) {
      this.paradeHits++;
      this.toast(this.streetParade.hit(t), 3.2);
      if (t.caught) {
        this.paradeCaptures++;
        sound('catch');
      }
      this.setHUD();
      return;
    }
    if (t) {
      t.caught = true;
      t.model.visible = t.shadow.visible = false;
      this.count++;
      this.guide.reset(this.elapsed);
      sound('catch');
      const bonus = this.fight.reward(t);
      this.toast(t.name + ' captured! ' + bonus, bonus ? 3.2 : 1.8);
      if (this.targets.every((target) => target.caught)) {
        this.completeHunt(bonus);
      } else this.setHUD();
    }
  }
  completeHunt(bonus) {
    sound('win');
    if (this.currentHunt && this.huntIndex + 1 < this.course.hunts.length) {
      this.huntIndex++;
      this.spawnHunt();
      this.toast(this.huntLabel + (bonus ? ' · ' + bonus : ''), 4);
    } else if (this.currentHunt && this.course.destination) {
      this.pendingDestination = this.course.destination;
      this.fight.clearField();
      this.guide.reset(this.elapsed);
      this.toast(
        'Follow the trail to ' + this.pendingDestination.name + '.',
        5
      );
    } else {
      this.completeCourse(bonus);
      return;
    }
    this.setHUD();
  }
  completeCourse(bonus = '') {
    if (this.mode !== 'campaign' || this.level === COURSES.length - 1) {
      this.finish(true);
      return;
    }
    this.pause();
    this.intermission = true;
    this.bankedTime += this.elapsed;
    this.bankedCount += this.count;
    this.saved = {
      ...this.fight.checkpoint(),
      shots: this.shots,
      paradeHits: this.paradeHits,
      paradeCaptures: this.paradeCaptures,
    };
    this.events.courseClear(bonus);
  }
  finish(won, reason = 'time') {
    this.pause();
    this.active = false;
    this.events.end({
      won,
      reason,
      time: this.bankedTime + this.elapsed,
      shots: this.shots,
      count: this.bankedCount + this.count,
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
    const untimed = this.untimed,
      parade = this.mode === 'parade';
    $('#progress-pips').hidden = untimed;
    this.pips.forEach((pip, i) => {
      pip.hidden = i >= this.targets.length;
      pip.classList.toggle('filled', !!this.targets[i]?.caught);
    });
    this.standardTool.visible = !this.fight.wide;
    this.wideTool.visible = !!this.fight.wide;
    this.avatar.showWishbone(!!this.fight.wide);
    $('#gear-name').textContent = this.fight.wide
      ? 'Wishbone slinger'
      : 'Net caster';
    $('#vitals').hidden =
      untimed && !this.streetParade?.chasers.size && this.fight.health === 100;
    $('#health-value').textContent = this.fight.health;
    $('#vitals').classList.toggle('low', this.fight.health <= 35);
    const bonuses = [
      this.fight.wide ? 'Wishbone ×' + this.fight.wide : '',
      this.fight.speed ? 'Boots ' + Math.ceil(this.fight.speed) + 's' : '',
    ].filter(Boolean);
    $('#boosts').textContent = bonuses.join(' · ');
    $('#boosts').hidden = !bonuses.length || untimed;
    const threat = this.streetParade?.threat;
    const warning = threat
      ? threat.name + ' winding up · Jump or cast!'
      : untimed || this.house.inside
        ? ''
        : this.fight.warning();
    $('#incoming').textContent = warning;
    $('#incoming').hidden = !warning;
    $('#counter').previousElementSibling.textContent = untimed
      ? 'MODE'
      : this.mode === 'campaign'
        ? 'DAY ' +
          (this.level + 1) +
          ' · HUNT ' +
          (this.huntIndex + 1) +
          '/' +
          this.course.hunts.length
        : 'DISHES CAPTURED';
    $('#counter').textContent = untimed
      ? parade
        ? 'Balloon parade'
        : 'Free roam'
      : this.huntCaptures + ' / ' + this.targets.length;
    $('.clock-box').hidden = !this.timerEnabled;
    $('#time').previousElementSibling.textContent = untimed
      ? 'TIME AFIELD'
      : 'SUPPER IN';
    $('#time').textContent = formatTime(
      untimed
        ? this.elapsed
        : Math.max(0, Math.ceil(this.timeLimit - this.countdownElapsed))
    );
    const bearing = ((((-this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    $('#bearing').textContent =
      directions[Math.round(bearing / 45) % 8] +
      '  ' +
      String(Math.round(bearing) % 360).padStart(3, '0') +
      '°';
    const p = this.camera.position;
    const bounds = this.data.bounds;
    const inPark =
      p.x >= bounds.minX &&
      p.x <= bounds.maxX &&
      p.z >= bounds.minZ &&
      p.z <= bounds.maxZ;
    const streetAt =
      this.regional && !inPark ? this.regionStreetAt : this.parkStreetAt;
    const street = this.house.inside
      ? ''
      : this.venue
        ? this.venue.placeAt(p)
        : streetAt(p.x, p.z, this.streetText.textContent);
    if (this.streetText.textContent !== street) {
      this.streetText.textContent = street;
      this.streetLabel.hidden = !street;
    }
    const dest = this.pendingDestination;
    const prompt =
      dest && Math.hypot(p.x - dest.x, p.z - dest.z) <= 3
        ? dest.prompt
        : this.house.prompt(p, this.arrivalAtDover);
    $('#interact').hidden = !prompt;
    $('#interact-name').textContent = prompt;
    $('#compass').disabled =
      !!dest || this.trackingDover || this.house.inside || untimed;
    if (this.arrivalAtDover || dest) {
      $('#time').previousElementSibling.textContent = 'SUPPER CLOCK';
      $('#time').textContent = 'Held';
      $('#counter').previousElementSibling.textContent = 'DESTINATION';
      $('#counter').textContent = dest?.name ?? '735 Dover St';
    }
    if (this.house.inside) {
      this.house.drawRadar($('#radar'), p, this.yaw);
      return;
    }
    const far = this.regional && Math.max(Math.abs(p.x), Math.abs(p.z)) > 610;
    const route = this.trackingDover
      ? doverLeg(p, DOVER_ROUTE).points
      : this.localParade?.route.points;
    drawMap(
      $('#radar'),
      this.venue?.data ?? (far ? this.region.data : this.data),
      {
        x: p.x,
        z: p.z,
        width: this.venue ? 84 : far ? 285 : 240,
        route: dest ? this.guide.route : route,
        destination:
          dest ?? (this.trackingDover ? PORCH : this.localParade?.leader),
        targets: untimed ? [] : this.targets,
        player: p,
        yaw: this.yaw,
        pickups: this.fight.pickups,
      }
    );
  }
  advanceClock(delta) {
    this.elapsed += delta;
    if (!this.arrivalAtDover && !this.pendingDestination && !this.untimed) {
      if (this.timerEnabled) {
        this.countdownElapsed += delta;
        if (this.countdownElapsed >= this.timeLimit) {
          this.elapsed -= this.countdownElapsed - this.timeLimit;
          this.countdownElapsed = this.timeLimit;
          return true;
        }
      } else if (delta > 0) {
        this.timedRun = false;
      }
    }
    return false;
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
    if (this.advanceClock(delta)) {
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
    const speed = this.house.inside
        ? sprint
          ? 4.2
          : 2.9
        : this.mode === 'roam'
          ? sprint
            ? 33
            : 13
          : (sprint ? 13 : 7.2) * (this.fight.speed > 0 ? 1.65 : 1),
      sn = Math.sin(this.yaw),
      cs = Math.cos(this.yaw);
    const oldX = this.camera.position.x,
      oldZ = this.camera.position.z;
    this.advanceFlight(dt, k.has('Space') || this.flapId != null);
    slideMove(
      this.camera.position,
      (strafe * cs - forward * sn) * speed * dt,
      (-strafe * sn - forward * cs) * speed * dt,
      this.playerBlocked
    );
    this.updateParade();
    const hunting =
      !this.house.inside &&
      !this.pendingDestination &&
      !this.arrivalAtDover &&
      !this.untimed;
    if (hunting) this.moveTargets(dt);
    const feet =
      this.height(this.camera.position.x, this.camera.position.z) + this.lift;
    if (hunting)
      separateFromActors(
        this.camera.position,
        feet,
        this.targets,
        this.playerBlocked
      );
    if (this.streetParade)
      separateFromActors(
        this.camera.position,
        feet,
        this.streetParade.nearbyActors,
        this.playerBlocked
      );
    this.steps += dt * Math.hypot(strafe, forward) * (sprint ? 13 : 9);
    const p = this.camera.position;
    p.y =
      this.height(p.x, p.z) +
      TURKEY_EYE +
      this.lift +
      Math.sin(this.steps) * 0.027;
    const movedX = p.x - oldX,
      movedZ = p.z - oldZ;
    const travelYaw =
      Math.hypot(movedX, movedZ) > 0.001
        ? Math.atan2(-movedX, -movedZ)
        : this.yaw;
    this.syncView(
      dt,
      false,
      dt ? Math.hypot(movedX, movedZ) / dt : 0,
      travelYaw
    );
    this.world.updateSignals(this.elapsed);
    if (hunting) {
      this.fight.update(dt, delta);
      if (!this.fight.health) {
        this.setHUD();
        this.finish(false, 'health');
        return;
      }
    } else {
      this.fight.speed = Math.max(0, this.fight.speed - delta);
      this.fight.tickDamage(dt);
    }
    const attacker = this.streetParade?.contactAttack(
      p,
      this.height(p.x, p.z) + this.lift
    );
    if (attacker) {
      const damage = attacker.float ? 12 : 8;
      if (this.fight.takeHit(damage)) {
        sound('splat');
        this.toast(attacker.name + ' tagged you! −' + damage + ' HP', 1.8);
        this.setHUD();
        if (!this.fight.health) {
          this.finish(false, 'parade');
          return;
        }
      }
    }
    $('#hit-flash').style.opacity = String(this.fight.hitFlash * 0.72);
    if (!this.venue && !this.arrivalAtDover && this.elapsed >= this.weatherAt) {
      this.weather.setSnowing(rollSnow());
      this.weatherAt = this.elapsed + 50 + Math.random() * 45;
    }
    if (!this.house.inside) this.weather.update(dt, this.viewCamera);
    if (
      !this.house.inside &&
      this.regional &&
      this.region &&
      (this.tileTime += dt) > 0.5
    ) {
      this.region.update(p.x, p.z);
      this.maps.prepare(p.x, p.z).catch(() => {});
      if (this.mode === 'city') {
        const next = TRAVEL.find(
          (s) => s !== this.gravyStop && Math.hypot(p.x - s.x, p.z - s.z) < 85
        );
        if (next && !this.isBlocked(next.x, next.z)) this.stockGravy(next);
      }
      this.tileTime = 0;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.tool.position.y = toolRest.y + Math.sin(this.steps) * 0.009;
    this.tool.position.z =
      toolRest.z + Math.pow(this.cooldown / 0.58, 3) * 0.105;
    if (this.netTime > 0) {
      this.netTime -= dt;
      const progress = 1 - Math.max(0, this.netTime) / 0.24;
      this.net.position.lerpVectors(this.netStart, this.netEnd, progress);
      this.net.scale.setScalar(0.12 + progress * (this.wideCast ? 2.8 : 1.3));
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
        projected.project(this.viewCamera);
        label.style.left = (projected.x * 0.5 + 0.5) * 100 + '%';
        label.style.top = clamp((0.5 - projected.y * 0.5) * 100, 15, 85) + '%';
        label.textContent =
          target.name +
          ' · ' +
          Math.round(p.distanceTo(target.model.position)) +
          ' m';
      }
      this.guide.update(this, target?.isParadeParticipant ? null : target);
      $('#net-state').textContent = this.cooldown ? 'RECASTING' : 'READY';
    }
    if (this.house.inside) this.house.animate(this.elapsed);
    else if (this.venue) this.venue.update?.(this.elapsed);
    else {
      this.world.trees.update(p.x, p.z, this.viewCamera);
      this.world.grasses.update(p.x, p.z, time * 0.001);
    }
    this.renderer.render(
      this.house.inside ? this.house.scene : (this.venue?.scene ?? this.scene),
      this.viewCamera
    );
  }
}
