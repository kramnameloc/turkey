import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class TurkeyAvatar extends T.Group {
  constructor() {
    super();
    this.name = 'Bourbon Red turkey';
    this.actions = new Map();
  }

  async load(netCaster, wishbone) {
    const { scene, animations } = await new GLTFLoader().loadAsync(
      '/models/bourbon-red.glb'
    );
    const wing = scene.getObjectByName('FirstPersonWing');
    wing.removeFromParent();
    // The player looks down -Z. The source bird faces +Z and stands 3.54
    // source units tall. Keep its standing height at 1.06 game meters.
    scene.rotation.y = Math.PI;
    scene.scale.setScalar(0.3);
    this.add(scene);
    this.mixer = new T.AnimationMixer(scene);
    for (const clip of animations)
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    for (const name of ['Jump', 'Attack']) {
      const action = this.actions.get(name);
      action.setLoop(T.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    this.play('Stand');
    this.mixer.update(0);

    this.netCaster = netCaster;
    this.wishbone = wishbone;
    const gear = new T.Group();
    gear.add(netCaster, wishbone);
    gear.scale.setScalar(0.73);
    gear.position.set(0.32, 0.34, -0.15);
    this.add(gear);
    this.updateWorldMatrix(true, true);
    scene.getObjectByName('Wing_R').attach(gear);

    // This wing was cut from the standing mesh with its original UVs. It
    // rides the first-person caster, sharing its portrait scaling and recoil.
    wing.scale.setScalar(0.26);
    wing.rotation.set(1.02, -0.55, -0.56);
    wing.position.set(0.06, -0.035, -0.11);
    return wing;
  }

  play(name, restart = false) {
    const action = this.actions.get(name);
    if (action === this.current && !restart) return action;
    if (this.current && this.current !== action) this.current.fadeOut(0.09);
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (this.current && this.current !== action) action.fadeIn(0.09);
    this.current = action;
    return action;
  }

  showWishbone(wide) {
    this.netCaster.visible = !wide;
    this.wishbone.visible = wide;
  }

  cast() {
    this.play('Attack', true).setDuration(0.43);
  }

  animate(dt, speed, lift) {
    if (lift > 0.02) {
      this.play('Jump').setDuration(0.84);
    } else if (
      this.current !== this.actions.get('Attack') ||
      !this.current.isRunning()
    ) {
      const gait = speed < 0.15 ? 'Stand' : speed < 9 ? 'Walk' : 'Run';
      const action = this.play(gait);
      if (gait !== 'Stand')
        action.setEffectiveTimeScale(
          T.MathUtils.clamp(speed / (gait === 'Walk' ? 7.2 : 13), 0.65, 1.55)
        );
    }
    this.mixer.update(dt);
  }
}
