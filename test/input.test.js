import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { bindHuntInput } from '../src/player/input.js';

test('game keys act once per press, release held movement, and detach when the hunt is disposed', async (t) => {
  const browser = new Window({
    settings: { disableJavaScriptEvaluation: true },
  });
  const markup = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8'
  );
  globalThis.window = browser;
  globalThis.document = new browser.DOMParser().parseFromString(
    markup,
    'text/html'
  );
  globalThis.ResizeObserver = browser.ResizeObserver;
  const controller = new browser.AbortController();
  t.after(async () => {
    controller.abort();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.ResizeObserver;
    await browser.happyDOM.close();
  });
  const hunt = {
    playing: true,
    keys: new Set(),
    canvas: document.querySelector('#scene'),
    cast: t.mock.fn(),
    flap: t.mock.fn(),
  };
  bindHuntInput(hunt, controller.signal);
  const press = (type, code, repeat = false) => {
    const event = new browser.KeyboardEvent(type, {
      code,
      repeat,
      cancelable: true,
    });
    browser.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(press('keydown', 'Space'), true);
  press('keydown', 'Space', true);
  assert.equal(hunt.flap.mock.callCount(), 1);
  assert.ok(hunt.keys.has('Space'));
  press('keyup', 'Space');
  assert.equal(hunt.keys.size, 0);
  assert.equal(press('keydown', 'Tab'), false);
  assert.equal(hunt.keys.size, 0);
  hunt.playing = false;
  assert.equal(press('keydown', 'KeyF'), false);
  hunt.playing = true;
  controller.abort();
  assert.equal(press('keydown', 'KeyF'), false);
  assert.equal(hunt.cast.mock.callCount(), 0);
});
