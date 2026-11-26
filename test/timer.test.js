import test from 'node:test';
import assert from 'node:assert/strict';
import { Hunt } from '../src/game.js';

test('switching the timer pauses the deadline while the simulation continues, and resumes the remaining time', () => {
  for (const mode of ['campaign', 'hunt', 'city']) {
    const hunt = Object.assign(Object.create(Hunt.prototype), {
      mode,
      elapsed: 0,
      countdownElapsed: 0,
      timedRun: true,
      timerEnabled: true,
    });
    const remaining = 4;
    assert.equal(hunt.advanceClock(hunt.timeLimit - remaining), false);
    hunt.timerEnabled = false;
    assert.equal(hunt.advanceClock(0), false);
    assert.equal(hunt.timedRun, true);
    assert.equal(hunt.advanceClock(400), false);
    assert.equal(hunt.timedRun, false);
    assert.equal(hunt.countdownElapsed, hunt.timeLimit - remaining);
    hunt.timerEnabled = true;
    assert.equal(hunt.advanceClock(3), false);
    assert.equal(hunt.advanceClock(2), true);
    assert.equal(hunt.countdownElapsed, hunt.timeLimit);
    assert.equal(hunt.elapsed, hunt.timeLimit + 400);
  }
});
test('free roam, parade visits and the Dover finale always allow time to pass freely', () => {
  for (const mode of ['roam', 'parade', 'campaign']) {
    const hunt = Object.assign(Object.create(Hunt.prototype), {
      mode,
      elapsed: 0,
      countdownElapsed: 0,
      timedRun: true,
      timerEnabled: true,
      doverFinale: mode === 'campaign',
    });
    assert.equal(hunt.advanceClock(600), false);
    assert.equal(hunt.elapsed, 600);
    assert.equal(hunt.countdownElapsed, 0);
    assert.equal(hunt.timedRun, true);
  }
});
