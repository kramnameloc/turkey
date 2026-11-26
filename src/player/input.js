import { MathUtils } from 'three';

const movementKeys = new Set([
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
]);

export function lockPointer(canvas) {
  try {
    canvas.requestPointerLock?.()?.catch?.(() => {});
  } catch {
    // Drag-to-aim remains available when the browser refuses pointer lock.
  }
}

export function bindHuntInput(hunt, signal) {
  const $ = (selector) => document.querySelector(selector);
  const on = (target, type, listener, capture = false) =>
    target.addEventListener(type, listener, { signal, capture });
  on(window, 'resize', () => hunt.resize());
  const observer = new ResizeObserver(() => {
    if (hunt.canvas.clientWidth && hunt.canvas.clientHeight) hunt.resize();
  });
  observer.observe(hunt.canvas);
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  on(window, 'blur', () => {
    if (hunt.playing) hunt.events.pause();
  });
  on(document, 'visibilitychange', () => {
    if (document.hidden && hunt.playing) hunt.events.pause();
  });
  on(document, 'pointerlockchange', () => {
    if (hunt.locked && !document.pointerLockElement && hunt.playing)
      hunt.events.pause();
    hunt.locked = document.pointerLockElement === hunt.canvas;
  });
  const keyActions = new Map([
    ['Space', () => hunt.flap()],
    ['KeyF', () => hunt.cast()],
    ['KeyR', () => hunt.switchWeapon()],
    ['KeyV', () => hunt.toggleView()],
    ['KeyG', () => hunt.interact()],
    ['KeyH', () => hunt.findDish()],
    ['Escape', () => hunt.events.pause()],
    ['KeyP', () => hunt.events.pause()],
    ['KeyM', () => hunt.events.map()],
  ]);
  on(window, 'keydown', (event) => {
    if (!hunt.playing) return;
    const action = keyActions.get(event.code);
    if (!action && !movementKeys.has(event.code)) return;
    event.preventDefault();
    hunt.keys.add(event.code);
    if (!event.repeat) action?.();
  });
  on(window, 'keyup', (e) => hunt.keys.delete(e.code));
  on(document, 'mousemove', (e) => {
    if (
      hunt.playing &&
      (document.pointerLockElement === hunt.canvas || hunt.dragging)
    )
      hunt.look(e.movementX, e.movementY);
  });
  const startLook = (e) => {
    if (hunt.touchId != null) return;
    hunt.touchId = e.pointerId;
    hunt.touchLook = [e.clientX, e.clientY];
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveLook = (e) => {
    if (!hunt.playing || e.pointerId !== hunt.touchId) return;
    const gain = MathUtils.clamp(
      780 / Math.min(hunt.canvas.clientWidth, hunt.canvas.clientHeight),
      1,
      2.5
    );
    hunt.look(
      (e.clientX - hunt.touchLook[0]) * gain,
      (e.clientY - hunt.touchLook[1]) * gain
    );
    hunt.touchLook = [e.clientX, e.clientY];
  };
  on(hunt.canvas, 'pointerdown', (e) => {
    if (!hunt.playing) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      startLook(e);
      return;
    }
    if (e.button !== 0) return;
    if (document.pointerLockElement !== hunt.canvas) {
      hunt.dragging = true;
      lockPointer(hunt.canvas);
    }
    hunt.cast();
  });
  on(hunt.canvas, 'pointermove', moveLook);
  const release = (e) => {
    hunt.dragging = false;
    if (e.pointerId === hunt.touchId) hunt.touchId = null;
  };
  on(window, 'pointerup', release);
  on(window, 'pointercancel', release);
  on(hunt.canvas, 'lostpointercapture', release);
  const stick = $('#stick');
  const stickMove = (e) => {
    if (e.pointerId !== hunt.stickId) return;
    if (!e.buttons) {
      hunt.resetStick();
      return;
    }
    const rect = stick.getBoundingClientRect(),
      radius = Math.max(
        1,
        (rect.width - stick.firstElementChild.offsetWidth) / 2
      ),
      dx = (e.clientX - rect.left - rect.width / 2) / radius,
      dz = (e.clientY - rect.top - rect.height / 2) / radius,
      m = Math.max(1, Math.hypot(dx, dz));
    hunt.joy = { x: dx / m, z: dz / m };
    stick.firstElementChild.style.transform =
      'translate(' + hunt.joy.x * radius + 'px,' + hunt.joy.z * radius + 'px)';
  };
  on(stick, 'pointerdown', (e) => {
    if (!hunt.playing || e.button !== 0) return;
    // A fresh press can reclaim the stick after an interrupted gesture.
    hunt.stickId = e.pointerId;
    hunt.stickType = e.pointerType;
    stickMove(e);
  });
  on(window, 'pointermove', stickMove, true);
  const stopStick = (e) => {
    if (e.pointerId === hunt.stickId) hunt.resetStick();
  };
  on(window, 'pointerup', stopStick, true);
  on(window, 'pointercancel', stopStick, true);
  on(stick, 'lostpointercapture', stopStick);
  // Touch targets stay tied to where each finger landed, including when
  // another finger is still aiming or casting and pointerup was missed.
  const checkStickTouches = (e) => {
    if (
      hunt.stickType === 'touch' &&
      !Array.from(e.touches).some((touch) => stick.contains(touch.target))
    )
      hunt.resetStick();
  };
  on(window, 'touchend', checkStickTouches, true);
  on(window, 'touchcancel', checkStickTouches, true);
  on($('#weapon-switch'), 'click', () => hunt.switchWeapon());
  on($('#view-toggle'), 'click', () => hunt.toggleView());
  on($('#interact'), 'click', () => hunt.interact());
  on($('#compass'), 'click', () => hunt.findDish());
  const fire = $('#touch-fire');
  on(fire, 'pointerdown', (e) => {
    if (!hunt.playing || hunt.castId != null) return;
    hunt.castId = e.pointerId;
    fire.setPointerCapture(e.pointerId);
    startLook(e);
    fire.classList.add('held');
  });
  on(fire, 'pointermove', moveLook);
  const endCast = (e) => {
    if (hunt.castId !== e.pointerId) return;
    hunt.castId = null;
    fire.classList.remove('held');
    if (e.type === 'pointerup') {
      hunt.syncView(0);
      hunt.cast();
    }
  };
  on(fire, 'pointerup', endCast);
  on(fire, 'pointercancel', endCast);
  on(fire, 'lostpointercapture', endCast);
  on(fire, 'click', (e) => {
    if (e.detail === 0) hunt.cast();
  });
  const flap = $('#touch-flap');
  on(flap, 'pointerdown', (e) => {
    if (!hunt.playing || hunt.flapId != null) return;
    hunt.flapId = e.pointerId;
    flap.setPointerCapture(e.pointerId);
    flap.classList.add('held');
    hunt.flap();
  });
  const releaseFlap = (e) => {
    if (hunt.flapId !== e.pointerId) return;
    hunt.flapId = null;
    flap.classList.remove('held');
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    on(flap, event, releaseFlap);
  on(flap, 'click', (e) => {
    if (e.detail === 0) hunt.flap();
  });
}
