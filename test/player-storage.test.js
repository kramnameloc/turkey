import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerStorage } from '../src/player/storage.js';

function browserStorage(values = {}) {
  const entries = new Map(Object.entries(values));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

test('settings and discoveries read existing saves and survive a new session', () => {
  const storage = browserStorage({
    'gobbler-hunt-timer': 'off',
    'gobbler-muted': '1',
    'gobbler-chase-view': 'on',
    'gobbler-dover-grail-v1': 'found',
  });
  const player = createPlayerStorage(() => storage);
  assert.equal(player.timer.get(), false);
  assert.equal(player.mute.get(), true);
  assert.equal(player.chase.get(), true);
  assert.equal(player.grail.has(), true);
  assert.equal(player.recipe.has(), false);
  player.timer.set(true);
  player.mute.set(false);
  player.chase.set(false);
  player.recipe.collect();
  const next = createPlayerStorage(() => storage);
  assert.equal(next.timer.get(), true);
  assert.equal(next.mute.get(), false);
  assert.equal(next.chase.get(), false);
  assert.equal(next.recipe.has(), true);
});

test('blocked storage still allows settings and discoveries for this session', () => {
  const player = createPlayerStorage(() => {
    throw new Error('Storage disabled');
  });
  assert.equal(player.timer.get(), true);
  assert.equal(player.mute.get(), false);
  player.timer.set(false);
  player.hudLayout.set('supper-ticket');
  player.grail.collect();
  assert.equal(player.timer.get(), false);
  assert.equal(player.hudLayout.get(), 'supper-ticket');
  assert.equal(player.grail.has(), true);
  assert.equal(player.best('hunt'), 0);
  assert.equal(player.recordBest('hunt', 42), false);
});

test('HUD layout defaults to Field Kit and remembers only supported layouts', () => {
  const storage = browserStorage();
  const player = createPlayerStorage(() => storage);
  assert.equal(player.hudLayout.get(), 'field-kit');
  storage.setItem('gobbler-hud-layout', 'unknown-layout');
  assert.equal(player.hudLayout.get(), 'field-kit');
  player.hudLayout.set('trail-atlas');
  player.hudLayout.set('unknown-layout');
  assert.equal(createPlayerStorage(() => storage).hudLayout.get(), 'trail-atlas');
});

test('a failed write keeps a setting usable and never announces an unsaved record', () => {
  const storage = browserStorage({
    'gobbler-muted': '0',
    'gobbler-trip-v2': '125',
  });
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  const player = createPlayerStorage(() => storage);
  player.mute.set(true);
  assert.equal(player.mute.get(), true);
  assert.equal(player.recordBest('campaign', 97), false);
  assert.equal(player.best('campaign'), 125);
});

test('personal bests keep the fastest finite positive time for each scored mode', () => {
  const storage = browserStorage({
    'gobbler-trip-v2': 'Infinity',
    'gobbler-foodfight-v1-city': '122.8',
  });
  const player = createPlayerStorage(() => storage);
  assert.equal(player.best('campaign'), 0);
  for (const invalid of [NaN, Infinity, 0, -2]) {
    assert.equal(player.recordBest('campaign', invalid), false);
  }
  assert.equal(player.recordBest('hunt', 50.3), true);
  assert.equal(player.recordBest('hunt', 50.3), false);
  assert.equal(player.recordBest('hunt', 51), false);
  assert.equal(player.recordBest('hunt', 49.9), true);
  assert.equal(player.best('hunt'), 49.9);
  assert.equal(player.best('city'), 122.8);
  assert.equal(player.recordBest('campaign', 91), true);
  assert.equal(storage.getItem('gobbler-trip-v2'), '91');
});
