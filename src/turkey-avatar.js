import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CASTER_SCALE, TURKEY_MODEL_SCALE } from './turkey-scale.js';

export class TurkeyAvatar extends T.Group {
  constructor() {
    super();
    this.name = 'Bourbon Red turkey';
    this.actions = new Map();
  }

  async load(...tools) {
    const { scene, animations } = await new GLTFLoader().loadAsync(
      '/models/bourbon-red.glb'
    );
    const wing = scene.getObjectByName('FirstPersonWing');
    wing.removeFromParent();
    // The player looks down -Z. The source bird faces +Z.
    scene.rotation.y = Math.PI;
    scene.scale.setScalar(TURKEY_MODEL_SCALE);
    this.body = scene;
    this.walkClip = animations.find((clip) => clip.name === 'Walk');
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

    const gear = new T.Group();
    this.gear = gear;
    gear.name = 'Turkey equipment';
    gear.add(...tools);
    gear.scale.setScalar(CASTER_SCALE);
    gear.position.set(1.07, 1.13, -0.5).multiplyScalar(TURKEY_MODEL_SCALE);
    this.add(gear);
    this.updateWorldMatrix(true, true);
    scene.getObjectByName('Wing_R').attach(gear);

    // This wing was cut from the standing mesh with its original UVs. It
    // rides the first-person caster, sharing its portrait scaling and recoil.
    wing.scale.setScalar(TURKEY_MODEL_SCALE / CASTER_SCALE);
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

  cast() {
    this.play('Attack', true).setDuration(0.43);
  }

  animate(dt, speed, lift, gliding = false) {
    const striking =
      this.current === this.actions.get('Attack') && this.current.isRunning();
    if (!striking && lift > 0.02) {
      const jump = this.play('Jump').setDuration(0.84);
      // The source Jump clip spreads both wings from 0.2 to 0.4 seconds.
      // Hold that pose during a glide and let the clip fold them on release.
      if (gliding) jump.time = 0.32;
      jump.paused = gliding;
    } else if (!striking) {
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
