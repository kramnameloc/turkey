import test from 'node:test';
import assert from 'node:assert/strict';
import { Hunt } from '../src/game.js';
import { overlapsBody } from '../src/body-collision.js';
import { slideMove } from '../src/field.js';
import { BODY_RADIUS } from '../src/turkey-scale.js';

function jump(held, inside = false, dt = 1 / 60) {
  const hunt = Object.assign(Object.create(Hunt.prototype), {
    lift: 0.03,
    velocityY: 7.3,
    flapTime: 0.68,
    house: { inside },
  });
  let peak = 0,
    seconds = 0,
    slowestFall = 0;
  while (hunt.lift > 0 && seconds < 6) {
    hunt.advanceFlight(dt, held(seconds));
    seconds += dt;
    peak = Math.max(peak, hunt.lift);
    slowestFall = Math.min(slowestFall, hunt.velocityY);
  }
  assert.equal(hunt.lift, 0);
  return { peak, seconds, slowestFall };
}

test('a tap clears a turkey, holding gives one short ascent and controlled descent, and releasing folds the wings', () => {
  for (const dt of [1 / 120, 1 / 30, 0.06]) {
    const hop = jump(() => false, false, dt),
      flight = jump(() => true, false, dt);
    assert.ok(hop.peak > 0.95 && hop.peak < 1.65);
    assert.ok(flight.peak > 2.1 && flight.peak < 3.1);
    assert.ok(flight.seconds > hop.seconds + 1 && flight.seconds < 4);
    assert.equal(flight.slowestFall, -1.35);
    const folded = jump((s) => s < 0.8, false, dt);
    assert.ok(folded.seconds < flight.seconds - 0.5);
    assert.ok(jump(() => true, true, dt).peak <= 2.15);
  }
});
test('horizontal collision clears only when the feet pass the actual character top on its terrain', () => {
  const actor = {
    model: { position: { x: 0, y: 12, z: 0 } },
    radius: 0.37,
    height: 0.9,
  };
  const cross = (feet) => {
    const p = { x: -3, z: 0 };
    slideMove(p, 6, 0, (x, z) => overlapsBody(actor, x, z, feet));
    return p.x;
  };
  assert.ok(cross(12.88) <= -actor.radius - BODY_RADIUS);
  assert.ok(cross(12.91) > 2.99);
  actor.height = 1.75;
  assert.ok(cross(13.4) < 0);
  assert.ok(cross(13.8) > 2.99);
  actor.caught = true;
  assert.ok(cross(12) > 2.99);
});
