import './ui/style.css';
import { render } from 'lit-html';
import { COURSES, TRIP_HUNTS } from './gameplay/courses.js';
import { SPAWN, formatTime } from './maps/field-data.js';
import { isMuted, toggleAudio, wakeAudio } from './player/audio.js';
import { fillIcons, icon } from './ui/icons.js';
import { renderPearlMap } from './ui/pearl-map.js';
import { playerStorage } from './player/storage.js';
import { creditsPanel } from './ui/credits.js';
import { fieldGuide } from './ui/field-guide.js';
import { destinations, showHuntMap } from './ui/hunt-maps.js';
import {
  courseClearPanel,
  pausePanel,
  resultsPanel,
  startAction,
} from './ui/hunt-panels.js';
import { button, hudLayoutPicker, loadingPanel, messagePanel } from './ui/panel.js';

const $ = (q) => document.querySelector(q),
  panel = $('#panel'),
  content = $('#panel-content');
let game,
  engineRequest,
  startupFileError,
  screen = '',
  loading = false,
  modalOrigin = 'home',
  selectedSpot = 0,
  previousFocus = null;
let timerEnabled = playerStorage.timer.get();

function syncHudLayout() {
  const layout = playerStorage.hudLayout.get();
  $('.hud').dataset.layout = layout;
  for (const picker of document.querySelectorAll('select[name="hud-layout"]'))
    picker.value = layout;
}

function syncTimer() {
  $('#lobby-timer').textContent = timerEnabled
    ? 'On · 2 min/hunt'
    : 'Off · No time limit';
  for (const control of document.querySelectorAll('[data-action="timer"]')) {
    control.setAttribute('aria-pressed', String(timerEnabled));
    control.title = timerEnabled
      ? 'Turn the hunt timer off'
      : 'Turn the hunt timer on';
  }
  const state = $('#pause-timer-state');
  if (state) state.textContent = timerEnabled ? 'On' : 'Off';
}
function refreshBest() {
  const b = playerStorage.best();
  $('#best').textContent = b ? formatTime(b) : 'Unrecorded';
}
function syncSound() {
  const enabled = !isMuted();
  for (const b of document.querySelectorAll('[data-action="sound"]')) {
    render(icon(enabled ? 'volume' : 'mute'), b.querySelector('i'));
    b.setAttribute('aria-label', enabled ? 'Mute audio' : 'Enable audio');
    b.title = b.ariaLabel;
    b.setAttribute('aria-pressed', String(enabled));
    const state = b.querySelector('span');
    if (state) state.textContent = enabled ? 'On' : 'Off';
  }
}
function syncFull() {
  const b = $('[data-action="fullscreen"]'),
    on = !!document.fullscreenElement;
  render(icon(on ? 'shrink' : 'expand'), b.querySelector('i'));
  b.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  b.title = b.ariaLabel;
}
function show(screenName, view) {
  if (!panel.open) previousFocus = document.activeElement;
  // Each visit owns its canvas and listeners, including outstanding map loads.
  const fragment = document.createDocumentFragment();
  render(view, fragment);
  content.replaceChildren(fragment);
  screen = screenName;
  panel.scrollTop = 0;
  panel.setAttribute('aria-labelledby', 'panel-title');
  $('.panel-head [data-action="close"]').hidden = [
    'loading',
    'course-clear',
    'course-error',
  ].includes(screen);
  if (!panel.open) panel.showModal();
  return content;
}
function dismiss() {
  if (panel.open) panel.close();
  content.replaceChildren();
  screen = '';
}
function home() {
  game?.stop();
  loading = false;
  dismiss();
  $('#arena').hidden = true;
  $('#lobby').hidden = false;
  modalOrigin = 'home';
  refreshBest();
  if (previousFocus?.isConnected && $('#lobby').contains(previousFocus))
    previousFocus.focus({ preventScroll: true });
}
function resume() {
  if (!game?.active) {
    home();
    return;
  }
  dismiss();
  $('#arena').hidden = false;
  $('#lobby').hidden = true;
  game.resume();
}
function openFromGame() {
  if (game?.playing) {
    game.pause();
    modalOrigin = 'playing';
  } else if (screen === 'pause') modalOrigin = 'pause';
  else if (!game?.active) modalOrigin = 'home';
}
function closePanel() {
  if (loading || screen === 'course-clear' || screen === 'course-error') return;
  if (screen === 'end' || screen === 'error' || screen === 'fullscreen-error') {
    home();
    return;
  }
  if (screen === 'pause') {
    resume();
    return;
  }
  if (modalOrigin === 'playing') {
    resume();
    return;
  }
  if (modalOrigin === 'pause' && game?.active) {
    pause();
    return;
  }
  dismiss();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}
function guide(tab = 'dishes') {
  openFromGame();
  show(
    'guide',
    fieldGuide(tab, game, document.body.classList.contains('touch-mode'))
  );
}
function map(level) {
  if (
    !level &&
    game?.playing &&
    game.mode === 'city' &&
    game.guide.suggestedStop != null
  ) {
    selectedSpot = game.guide.suggestedStop;
  }
  openFromGame();
  return showHuntMap({
    game,
    level,
    timerEnabled,
    selectedSpot,
    show,
    selectSpot: (index) => {
      selectedSpot = index;
    },
  });
}
function credits() {
  openFromGame();
  show('credits', creditsPanel());
}
function pause() {
  if (!game?.active) return;
  game.pause();
  modalOrigin = 'pause';
  show('pause', pausePanel(game, timerEnabled));
  syncTimer();
  syncSound();
}
function courseClear(bonus) {
  show('course-clear', courseClearPanel(game, bonus, timerEnabled));
}
async function rideShuttle() {
  if (loading || game?.pendingDestination !== COURSES[0].destination) return;
  loading = true;
  openFromGame();
  show('loading', loadingPanel('DAY 1', 'Riding to Dover', 'Preparing 735 Dover Street…'));
  try {
    await game.rideShuttle();
    resume();
  } catch {
    show('travel-error', messagePanel(
      'DOVER SHUTTLE', 'Travel interrupted', 'Your hunt is paused at the airport.',
      [button('Retry shuttle', 'ride-shuttle', true), button('Return to airport', 'resume')]
    ));
  } finally {
    loading = false;
  }
}
async function changeCourse(retry) {
  if (loading) return;
  loading = true;
  const level = game.level + (retry ? 0 : 1);
  const next = COURSES[level];
  show('loading', loadingPanel('DAY ' + (level + 1), next.name, next.menu));
  try {
    if (retry) await game.retry();
    else await game.advance();
    resume();
  } catch {
    show(
      'course-error',
      messagePanel(
        'HUNT MAP',
        'Travel interrupted',
        'Your course checkpoint is saved for this run.',
        [
          button('Try again', retry ? 'retry-course' : 'next-course', true),
          button('Return to lobby', 'home'),
        ]
      )
    );
  } finally {
    loading = false;
  }
}
function end(result) {
  modalOrigin = 'end';
  const record =
    result.won &&
    game.timedRun &&
    timerEnabled &&
    playerStorage.recordBest(game.mode, result.time);
  const body = show('end', resultsPanel(game, result, timerEnabled, record));
  const recap = body.querySelector('#pearl-map');
  if (recap) renderPearlMap(recap, game, true);
  refreshBest();
}
async function start(mode = 'campaign') {
  if (loading) return;
  loading = true;
  wakeAudio();
  game?.pause();
  modalOrigin = 'home';
  const title =
    mode === 'parade'
      ? 'Preparing the parade'
      : mode === 'campaign'
        ? 'Day 1 · Denver arrivals'
        : 'Loading terrain';
  show(
    'loading',
    loadingPanel(
      'ENTERING THE FIELD',
      title,
      mode === 'campaign'
        ? COURSES[0].menu
        : 'Preparing the Broomfield map and field photography…'
    )
  );
  try {
    if (startupFileError) throw startupFileError;
    if (!engineRequest)
      engineRequest = (async () => {
        const [{ Hunt }] = await Promise.all([
          import('./game.js'),
          import('./ui/hud-layouts.css'),
        ]);
        const g = new Hunt({ pause, map: () => map(), end, courseClear, shuttle: rideShuttle });
        try {
          await g.init();
          return g;
        } catch (e) {
          g.dispose();
          throw e;
        }
      })().catch((e) => {
        engineRequest = null;
        throw e;
      });
    game = await engineRequest;
    game.timerEnabled = timerEnabled;
    $('#lobby').hidden = true;
    $('#arena').hidden = false;
    await game.reset(
      mode,
      mode === 'hunt' || mode === 'campaign'
        ? SPAWN
        : destinations[selectedSpot]
    );
    loading = false;
    resume();
  } catch (error) {
    console.error(error);
    loading = false;
    $('#arena').hidden = true;
    $('#lobby').hidden = false;
    let message = 'A game asset could not load. Check your connection and retry.';
    if (startupFileError) message = 'Reload the page to fetch the current game files.';
    else if (/WebGL|context/i.test(error?.message))
      message = 'The field needs WebGL 2. Enable graphics acceleration in your browser and try again.';
    show(
      'error',
      messagePanel(
        'FIELD CONNECTION',
        'Unable to start',
        message,
        [
          startupFileError
            ? button('Reload game', 'reload-game', true)
            : button('Retry', startAction(mode), true),
          button('Back to lobby', 'home'),
        ]
      )
    );
  }
}
const publicLink = document.querySelector('link[rel="canonical"]').href;
async function shareGame() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Turkey Takeover', url: publicLink });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  $('#share-status').textContent = '';
  $('#share-url').value = publicLink;
  $('#share-link').showModal();
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicLink);
    $('#share-status').textContent = 'Copied!';
  } catch {
    $('#share-url').focus();
    $('#share-url').select();
    $('#share-status').textContent = 'Select and copy the game link.';
  }
}
const actions = {
  'reload-game': () => window.location.reload(),
  share: shareGame,
  'copy-link': copyLink,
  'dismiss-share': () => $('#share-link').close(),
  home,
  close: closePanel,
  guide: () => guide(),
  itinerary: () => guide('trip'),
  desserts: () => guide('desserts'),
  controls: () => guide('controls'),
  map: () => map(),
  'city-map': () => map('city'),
  'park-map': () => map('park'),
  start: () => start(),
  'park-trial': () => start('hunt'),
  'next-course': () => changeCourse(false),
  'retry-course': () => changeCourse(true),
  'ride-shuttle': rideShuttle,
  'city-hunt': () => start('city'),
  explore: () => start('roam'),
  parade: () => start('parade'),
  'rejoin-parade': () => {
    if (game?.active && game.mode === 'parade') {
      game.rejoinParade(Number($('#parade-balloon').value));
      resume();
    }
  },
  resume,
  pause,
  credits,
  travel: async () => {
    if (loading || !game?.active || !['city', 'roam'].includes(game.mode))
      return;
    const spot = destinations[selectedSpot];
    loading = true;
    show(
      'loading',
      loadingPanel('HUNT MAP', 'Traveling', 'Preparing ' + spot.name + '…')
    );
    try {
      await game.teleport(spot);
      resume();
      game.toast(spot.name);
    } catch {
      game.region.update(game.mapPosition.x, game.mapPosition.z);
      show(
        'travel-error',
        messagePanel(
          'HUNT MAP',
          'Travel interrupted',
          'This landmark could not load. Your hunt is paused at your last location.',
          [button('Hunt map', 'city-map', true), button('Resume', 'resume')]
        )
      );
    } finally {
      loading = false;
    }
  },
  timer: () => {
    timerEnabled = !timerEnabled;
    playerStorage.timer.set(timerEnabled);
    if (game) {
      game.timerEnabled = timerEnabled;
      if (game.active) game.setHUD();
    }
    if (screen === 'pause') {
      pause();
      content.querySelector('[data-action="timer"]').focus();
    } else syncTimer();
  },
  sound: () => {
    toggleAudio();
    syncSound();
  },
  fullscreen: async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      show(
        'fullscreen-error',
        messagePanel(
          'DISPLAY',
          'Fullscreen unavailable',
          'This browser does not allow fullscreen in this view.',
          button('Back to lobby', 'home')
        )
      );
    }
  },
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a && !a.disabled && Object.hasOwn(actions, a.dataset.action))
    actions[a.dataset.action]();
});
document.addEventListener('change', (event) => {
  if (event.target.name === 'hud-layout') {
    playerStorage.hudLayout.set(event.target.value);
    syncHudLayout();
  }
});
panel.addEventListener('cancel', (e) => {
  e.preventDefault();
  closePanel();
});
panel.addEventListener('click', (e) => {
  if (e.target === panel) {
    const r = panel.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closePanel();
  }
});
document.addEventListener('fullscreenchange', syncFull);
// An open lobby keeps its build's hashed JS and CSS URLs until the page reloads.
window.addEventListener('vite:preloadError', (event) => {
  if (!game) startupFileError = event.payload;
});
document.querySelector('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  home();
});
const coarsePointer = matchMedia('(pointer: coarse)');
const setTouchMode = (enabled) => {
  if (!enabled && document.body.classList.contains('touch-mode'))
    game?.clearTouch();
  document.body.classList.toggle('touch-mode', enabled);
};
setTouchMode(coarsePointer.matches);
coarsePointer.addEventListener('change', (e) => setTouchMode(e.matches));
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen')
      setTouchMode(true);
    else if (e.pointerType === 'mouse') setTouchMode(false);
  },
  { capture: true, passive: true }
);
if (!document.fullscreenEnabled) $('[data-action="fullscreen"]').hidden = true;
$('#lobby-total').textContent =
  TRIP_HUNTS.length + ' hunts · ' + COURSES.length + ' days';
fillIcons();
render(hudLayoutPicker(), $('#lobby-hud-picker'));
syncHudLayout();
syncTimer();
syncSound();
syncFull();
refreshBest();
