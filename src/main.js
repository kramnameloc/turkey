import './style.css';
import { fillIcons, icon } from './icons.js';
import {
  DISHES,
  dishSpawn,
  SPAWN,
  TRAVEL,
  drawMap,
  fieldData,
  regionData,
  formatTime,
} from './field.js';
import { isMuted, toggleAudio, wakeAudio } from './audio.js';
const $ = (q) => document.querySelector(q),
  panel = $('#panel'),
  content = $('#panel-content');
let game,
  engineRequest,
  screen = '',
  loading = false,
  modalOrigin = 'home',
  mapLevel = 'park',
  selectedSpot = 0,
  previousFocus = null;
const bestKey = (mode) => 'gobbler-best-' + mode + '-' + DISHES.length;
const button = (label, action, primary = false, glyph = '') =>
  '<button class="' +
  (primary ? 'primary' : 'secondary') +
  '" data-action="' +
  action +
  '">' +
  (glyph ? icon(glyph) : '') +
  label +
  '</button>';
const links = (url, text) =>
  '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
const heading = (k, t) =>
  '<div class="panel-kicker"><span class="dash"></span>' +
  k +
  '</div><h2 id="panel-title" class="panel-title">' +
  t +
  '</h2>';
function best(mode = 'hunt') {
  try {
    const n = Number(localStorage.getItem(bestKey(mode)));
    return n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function refreshBest() {
  const b = best();
  $('#best').textContent = b ? formatTime(b) : 'Unrecorded';
}
function syncSound() {
  const b = $('[data-action="sound"]');
  b.innerHTML = icon(isMuted() ? 'mute' : 'volume');
  b.setAttribute('aria-label', isMuted() ? 'Enable audio' : 'Mute audio');
  b.title = b.ariaLabel;
  b.setAttribute('aria-pressed', String(!isMuted()));
}
function syncFull() {
  const b = $('[data-action="fullscreen"]'),
    on = !!document.fullscreenElement;
  b.innerHTML = icon(on ? 'shrink' : 'expand');
  b.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  b.title = b.ariaLabel;
}
function show(screenName, html) {
  if (!panel.open) {
    previousFocus = document.activeElement;
    panel.showModal();
  }
  screen = screenName;
  content.innerHTML = html;
  panel.scrollTop = 0;
  panel.setAttribute('aria-labelledby', 'panel-title');
  $('.panel-head [data-action="close"]').hidden = screen === 'loading';
}
function dismiss() {
  if (panel.open) panel.close();
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
  if (loading) return;
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
  const isControls = tab === 'controls';
  const tabs =
    '<div class="panel-tabs">' +
    [
      ['dishes', 'guide', 'Side dishes'],
      ['desserts', 'desserts', 'Desserts'],
      ['controls', 'controls', 'Controls'],
    ]
      .map(
        ([key, action, label]) =>
          `<button data-action="${action}" aria-pressed="${tab === key}">${label}</button>`
      )
      .join('') +
    '</div>';
  const list = DISHES.filter((d) => !!d.dessert === (tab === 'desserts'))
    .map((d) => {
      const caught =
        game?.active && game.targets.some((t) => t.id === d.id && t.caught);
      return `<div class="target-row" style="--dish:${d.color}"><img src="/dishes/${d.id}.webp" alt=""><div><small>${caught ? 'CAPTURED' : d.dessert ? 'DESSERT' : 'SIDE DISH'}</small><strong>${d.name}</strong></div></div>`;
    })
    .join('');
  const touch = document.body.classList.contains('touch-mode');
  const rows = touch
    ? [
        ['Move', 'Left stick'],
        ['Sprint', 'Push stick to the rim'],
        ['Aim', 'Swipe the view'],
        ['Cast net', 'Tap Cast'],
        ['Aim and cast', 'Drag Cast, then release'],
        ['Flap jump', 'Tap Flap'],
        ['Find next dish', 'Tap the compass'],
        ['Hunt map', 'Tap the minimap'],
        ['Pause', 'Tap pause'],
      ]
    : [
        ['Move', 'W A S D'],
        ['Aim', 'Mouse'],
        ['Cast net', 'Left click / F'],
        ['Sprint', 'Shift'],
        ['Flap jump', 'Space'],
        ['Find next dish', 'H'],
        ['Hunt map', 'M'],
        ['Pause', 'Esc / P'],
      ];
  const controls =
    '<div>' +
    rows
      .map(
        ([a, b]) =>
          '<div class="control-row"><span>' +
          a +
          '</span>' +
          (touch ? '<strong>' + b + '</strong>' : '<kbd>' + b + '</kbd>') +
          '</div>'
      )
      .join('') +
    '</div>' +
    (touch
      ? ''
      : '<p class="panel-text">Use ← and → to turn with the keyboard, Q to look up, and E to look down.</p>');
  show(
    'guide',
    heading('FIELD MANUAL', isControls ? 'How to play' : 'Field guide') +
      '<p class="panel-text">' +
      (isControls
        ? 'Get within 35 meters and cast when the reticle turns amber.'
        : 'Catch every side and dessert before supper. Look for the orange diamonds on the map. If you lose sight of the food, arrows will guide you.') +
      '</p>' +
      tabs +
      (isControls ? controls : '<div class="targets">' + list + '</div>') +
      '<div class="panel-actions">' +
      (game?.active
        ? button('Back to hunt', 'resume', true, 'focus')
        : button('Start hunt', 'start', true, 'focus')) +
      '</div>'
  );
}
async function map(level) {
  if (
    !level &&
    game?.playing &&
    game.mode === 'city' &&
    game.guide.suggestedStop != null
  )
    selectedSpot = game.guide.suggestedStop;
  openFromGame();
  if (level) mapLevel = level;
  else mapLevel = game?.active && game.mode !== 'hunt' ? 'city' : 'park';
  const city = mapLevel === 'city',
    active = game?.active;
  // A timed park hunt always stays in the same course.
  const allowCity = !active || game.mode !== 'hunt';
  const tabs =
    '<div class="panel-tabs"><button data-action="park-map" aria-pressed="' +
    !city +
    '">Community Park</button>' +
    (allowCity
      ? '<button data-action="city-map" aria-pressed="' +
        city +
        '">Greater Broomfield</button>'
      : '') +
    '</div>';
  let acts = '';
  if (city) {
    const options = TRAVEL.map(
      (t, i) =>
        '<option value="' +
        i +
        '" ' +
        (i === selectedSpot ? 'selected' : '') +
        '>' +
        t.name +
        '</option>'
    ).join('');
    if (!active || game.mode === 'roam' || game.mode === 'city')
      acts =
        '<label class="travel-label">TRAVEL DESTINATION<select id="travel-spot">' +
        options +
        '</select></label>';
    acts +=
      '<div class="panel-actions">' +
      (active
        ? button('Travel here', 'travel', true, 'map')
        : button('Citywide hunt', 'city-hunt', true, 'focus') +
          button('Explore freely', 'explore', false, 'map')) +
      '</div>';
  } else {
    acts =
      '<div class="panel-actions">' +
      (active
        ? button('Return to field', 'resume', true, 'focus')
        : button('Hunt Community Park', 'start', true, 'focus')) +
      '</div>';
  }
  show(
    'map',
    heading('FIELD CARTOGRAPHY', city ? 'Greater Broomfield' : 'Hunt map') +
      tabs +
      '<canvas class="zone-map" id="zone-map" width="660" height="356" aria-label="Map of the hunt area"></canvas><div class="map-key"><span><b class="start-marker"></b> ' +
      (active ? 'You' : 'Starting point') +
      '</span>' +
      (active && game.mode === 'roam'
        ? ''
        : '<span><b></b> Runaway dish</span>') +
      '</div><p class="panel-text">' +
      (city
        ? 'Each of the six Broomfield landmarks has a side dish and a dessert.' +
          (best('city')
            ? ' Your best city run is ' + formatTime(best('city')) + '.'
            : '')
        : 'The park course circles Community Park Pond, west of the ballfields and north of the public library.') +
      '</p>' +
      acts
  );
  const canvas = $('#zone-map');
  const select = $('#travel-spot');
  if (select)
    select.addEventListener('change', () => {
      selectedSpot = Number(select.value);
    });
  try {
    const d = city ? await regionData() : await fieldData();
    if (!canvas.isConnected) return;
    const targets = active
      ? game.targets
      : city
        ? DISHES.map((d) => dishSpawn(d, 'city'))
        : DISHES;
    const player = active
      ? game.camera.position
      : city
        ? TRAVEL[selectedSpot]
        : SPAWN;
    const centerX = city ? -1240 : 16,
      centerZ = city ? -1100 : -5;
    const width = Math.max(
      city ? 10200 : 640,
      Math.abs(player.x - centerX) * 2.25,
      (Math.abs(player.z - centerZ) * 2.25 * canvas.width) / canvas.height
    );
    const settings = {
      x: centerX,
      z: centerZ,
      width,
      player,
      yaw: active ? game.yaw : Math.PI / 2,
      targets: active && game.mode === 'roam' ? [] : targets,
      labels: true,
      places: city ? TRAVEL : [],
    };
    const render = () =>
      drawMap(canvas, d, {
        ...settings,
        player: active || !city ? player : TRAVEL[selectedSpot],
        selected: city ? selectedSpot : -1,
      });
    render();
    if (city && select) {
      select.addEventListener('change', render);
      canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        const x =
          ((event.clientX - rect.left - rect.width / 2) * width) / rect.width +
          centerX;
        const z =
          ((event.clientY - rect.top - rect.height / 2) * width) / rect.width +
          centerZ;
        let nearest = -1,
          closest = (width / rect.width) * 22;
        TRAVEL.forEach((spot, i) => {
          const distance = Math.hypot(x - spot.x, z - spot.z);
          if (distance < closest) {
            nearest = i;
            closest = distance;
          }
        });
        if (nearest >= 0) {
          selectedSpot = nearest;
          select.value = String(nearest);
          render();
        }
      });
    }
  } catch {
    if (canvas.isConnected)
      canvas.replaceWith(
        Object.assign(document.createElement('p'), {
          textContent: 'Map data could not load. Reopen the map to retry.',
        })
      );
  }
}
function credits() {
  openFromGame();
  show(
    'credits',
    heading('FIELD ARCHIVE', 'Map & photo credits') +
      '<div class="credits"><h3>Broomfield geography</h3><p>Buildings, streets, paths, landmarks, and surveyed trees come from the City and County of Broomfield. Ground photography and regional elevation come from USGS and USDA. Building heights and façades are approximations. ' +
      links('/geo/sources.json', 'Map sources and coverage') +
      '</p><h3>Cover photography</h3><p>Wild turkey by Frank Schulenburg, Flatirons by Kpsudeep, and Rocky Flats prairie by Zach Schiff / USFWS. The cropped and color-graded composite is licensed under ' +
      links('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0') +
      '. ' +
      links('/cover/credits.json', 'Original photographs') +
      '. The first-person wing uses an adapted photograph by P. Hughes (CC BY-SA 4.0).</p><h3>Field scenery</h3><p>Adapted Broomfield Flatirons by Kpsudeep (CC BY-SA 4.0), photographic panorama by Greg Zaal, grass by Charlotte Baglioni, cottonwood by Famartin (CC BY-SA 4.0), oak by Betelguese (CC BY-SA 3.0), and photographed façades by Scouser. ' +
      links('/scenery/sources.json', 'Scenery sources and licenses') +
      '</p></div>'
  );
}
function pause() {
  if (!game?.active) return;
  game.pause();
  modalOrigin = 'pause';
  show(
    'pause',
    heading('FIELD BREAK', 'Hunt paused') +
      '<p class="panel-text">' +
      (game.mode === 'roam'
        ? 'Your place in Broomfield is saved for this session.'
        : game.count +
          ' of ' +
          DISHES.length +
          ' dishes captured. The supper clock is paused.') +
      '</p><div class="panel-actions">' +
      button('Resume', 'resume', true, 'focus') +
      button('Hunt map', 'map', false, 'map') +
      button('Field guide', 'guide', false, 'book') +
      button('Return to lobby', 'home') +
      '</div>'
  );
}
function end({ won, time, shots, count }) {
  modalOrigin = 'end';
  let record = false;
  if (won && (!best(game.mode) || time < best(game.mode))) {
    try {
      localStorage.setItem(bestKey(game.mode), String(time));
      record = true;
    } catch {}
  }
  const cells = [
    ['CAPTURED', count + ' / ' + DISHES.length],
    ['TIME AFIELD', formatTime(time)],
    ['NETS CAST', shots],
    ['ACCURACY', (shots ? Math.round((count / shots) * 100) : 0) + '%'],
  ];
  show(
    'end',
    heading(
      won ? 'MISSION COMPLETE' : 'SUPPER BELL',
      won ? 'Dinner is served!' : 'Time for supper'
    ) +
      '<p class="panel-text">' +
      (won
        ? record
          ? 'The full Thanksgiving menu is at the table. New personal best!'
          : 'The full Thanksgiving menu is at the table.'
        : 'Supper started with ' +
          count +
          ' of ' +
          DISHES.length +
          ' dishes. The rest are still out there.') +
      '</p><div class="result-stats">' +
      cells
        .map(
          ([k, v]) =>
            '<div class="result-cell"><small>' +
            k +
            '</small><strong>' +
            v +
            '</strong></div>'
        )
        .join('') +
      '</div><div class="panel-actions">' +
      button(
        'Hunt again',
        game.mode === 'city' ? 'city-hunt' : 'start',
        true,
        'focus'
      ) +
      button('Return to lobby', 'home') +
      '</div>'
  );
  refreshBest();
}
async function start(mode = 'hunt') {
  if (loading) return;
  loading = true;
  wakeAudio();
  game?.pause();
  modalOrigin = 'home';
  show(
    'loading',
    heading('ENTERING THE FIELD', 'Loading terrain') +
      '<p class="panel-text">Preparing the Broomfield map and field photography…</p><div class="loading-line"></div>'
  );
  try {
    if (!engineRequest)
      engineRequest = (async () => {
        const { Hunt } = await import('./game.js');
        const g = new Hunt({ pause, map: () => map(), end });
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
    if (mode !== 'hunt') await game.ensureRegion();
    $('#lobby').hidden = true;
    $('#arena').hidden = false;
    await game.reset(mode, mode === 'hunt' ? SPAWN : TRAVEL[selectedSpot]);
    loading = false;
    resume();
  } catch (error) {
    console.error(error);
    loading = false;
    $('#arena').hidden = true;
    $('#lobby').hidden = false;
    show(
      'error',
      heading('FIELD CONNECTION', 'Unable to start') +
        '<p class="panel-text">' +
        (/WebGL|context/i.test(error.message)
          ? 'The field needs WebGL 2. Enable graphics acceleration in your browser and try again.'
          : 'A map or photograph could not load. Check your connection to the game and retry.') +
        '</p><div class="panel-actions">' +
        button(
          'Retry',
          mode === 'hunt' ? 'start' : mode === 'city' ? 'city-hunt' : 'explore',
          true
        ) +
        button('Back to lobby', 'home') +
        '</div>'
    );
  }
}
const actions = {
  home,
  close: closePanel,
  guide: () => guide(),
  desserts: () => guide('desserts'),
  controls: () => guide('controls'),
  map: () => map(),
  'city-map': () => map('city'),
  'park-map': () => map('park'),
  start: () => start(),
  'city-hunt': () => start('city'),
  explore: () => start('roam'),
  resume,
  pause,
  credits,
  travel: async () => {
    if (loading || !game?.active || game.mode === 'hunt') return;
    const spot = TRAVEL[selectedSpot];
    loading = true;
    show(
      'loading',
      heading('HUNT MAP', 'Traveling') +
        '<p class="panel-text">Preparing ' +
        spot.name +
        '…</p>'
    );
    try {
      await game.teleport(spot);
      resume();
      game.toast(spot.name);
    } catch {
      game.region.update(game.camera.position.x, game.camera.position.z);
      show(
        'travel-error',
        heading('HUNT MAP', 'Travel interrupted') +
          '<p class="panel-text">This landmark could not load. Your hunt is paused at your last location.</p><div class="panel-actions">' +
          button('Hunt map', 'city-map', true) +
          button('Resume', 'resume') +
          '</div>'
      );
    } finally {
      loading = false;
    }
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
        heading('DISPLAY', 'Fullscreen unavailable') +
          '<p class="panel-text">This browser does not allow fullscreen in this view.</p>' +
          button('Back to lobby', 'home')
      );
    }
  },
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a && !a.disabled) actions[a.dataset.action]?.();
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
document.querySelector('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  home();
});
const coarsePointer = matchMedia('(pointer: coarse)');
const setTouchMode = (enabled) =>
  document.body.classList.toggle('touch-mode', enabled);
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
$('#lobby-total').textContent = DISHES.length + ' dishes';
fillIcons();
syncSound();
syncFull();
refreshBest();
fieldData().catch(() => {});
