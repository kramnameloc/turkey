import * as T from 'three';

export { TURKEY_EYE } from './turkey-scale.js';
const pivot = new T.Vector3();
const offset = new T.Vector3();

export class ChaseView extends T.PerspectiveCamera {
  constructor() {
    super(63, 1, 0.045, 4100);
    this.rotation.order = 'YXZ';
    this.distance = 0;
  }
  follow(eye, yaw, pitch, dt, snap, blocked, ground, indoors) {
    const tilt = T.MathUtils.clamp(pitch - 0.12, -1.28, 1.05);
    this.rotation.set(tilt, yaw, 0, 'YXZ');
    pivot.copy(eye);
    pivot.y += 0.06;
    // A longer, lower outdoor boom reduces foreground exaggeration beside trees.
    offset.set(
      indoors ? 0.32 : 0.56,
      indoors ? 0.52 : 0.78,
      indoors ? 2.8 : 5.8
    );
    offset.applyQuaternion(this.quaternion);
    const length = offset.length();
    offset.divideScalar(length);
    let available = length;
    for (let step = 1, n = Math.ceil(length / 0.18); step <= n; step++) {
      const s = (step * length) / n;
      const x = pivot.x + offset.x * s,
        z = pivot.z + offset.z * s;
      const y = pivot.y + offset.y * s;
      if (blocked(x, z) || y < ground(x, z) + 0.22 || (indoors && y > 3.26)) {
        available = Math.max(0, ((step - 1) * length) / n - 0.08);
        break;
      }
    }
    this.distance =
      snap || available < this.distance
        ? available
        : T.MathUtils.damp(this.distance, available, 7.5, dt);
    this.position.copy(pivot).addScaledVector(offset, this.distance);
    this.updateMatrixWorld();
  }
}
