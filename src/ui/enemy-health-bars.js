import * as T from 'three';

export class EnemyHealthBars extends T.Group {
  constructor() {
    super();
    this.plane = new T.PlaneGeometry(1, 1);
    this.track = new T.MeshBasicMaterial({ color: 0x29211b });
    this.fill = new T.MeshBasicMaterial({ color: 0xffca75 });
  }
  update(dishes, chasers, eye, camera) {
    let used = 0;
    const show = (target) => {
      const position = target.model.position;
      const distance = position.distanceTo(eye);
      if (target.caught || distance > 55) return;
      let bar = this.children[used++];
      if (!bar) {
        bar = new T.Mesh(this.plane, this.track);
        bar.add(new T.Mesh(this.plane, this.fill));
        this.add(bar);
      }
      bar.visible = true;
      bar.position.copy(position);
      bar.position.y += target.model.userData.labelHeight;
      bar.quaternion.copy(camera.quaternion);
      const width = Math.max(0.76, distance * 0.036);
      bar.scale.set(width, width * 0.13, 1);
      const fill = bar.children[0];
      const fraction = target.health / target.maxHealth;
      fill.scale.set(0.92 * fraction, 0.52, 1);
      fill.position.set(-0.46 * (1 - fraction), 0, 0.008);
    };
    dishes.forEach(show);
    chasers?.forEach(show);
    for (let i = used; i < this.children.length; i++) this.children[i].visible = false;
  }
  dispose() {
    this.plane.dispose();
    this.track.dispose();
    this.fill.dispose();
  }
}
