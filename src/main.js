import './style.css';
import { DOVER_ROUTE } from './dover-route.js';
import { doverLeg } from './dover-guide.js';
import { DOVER, RELIC, hasGrail } from './dover-location.js';
import { COURSES, TRIP_HUNTS, TRIP_CAPTURES } from './courses.js';
import { fillIcons, icon } from './icons.js';
import {
  DISHES,
  dishSpawn,
  SPAWN,
  TRAVEL,
  drawMap,
  fieldData,
  regionData,
  loadMapImage,
  formatTime,
} from './field.js';
import { isMuted, toggleAudio, wakeAudio } from './audio.js';
const destinations = [...TRAVEL, DOVER];
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
const timerKey = 'gobbler-hunt-timer';
let timerEnabled = true;
try {
  timerEnabled = localStorage.getItem(timerKey) !== 'off';
} catch {}
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
const bestKey = (mode) =>
  mode === 'campaign' ? 'gobbler-trip-v2' : 'gobbler-foodfight-v1-' + mode;
const startAction = (mode) =>
  ({
    campaign: 'start',
    city: 'city-hunt',
    hunt: 'park-trial',
    roam: 'explore',
    parade: 'parade',
  })[mode];
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
function best(mode = 'campaign') {
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
  $('.panel-head [data-action="close"]').hidden = [
    'loading',
    'course-clear',
    'course-error',
  ].includes(screen);
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
  const isControls = tab === 'controls';
  const tabs =
    '<div class="panel-tabs">' +
    [
      ['trip', 'itinerary', 'Trip days'],
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
        game?.active && game.allTargets.some((t) => t.id === d.id && t.caught);
      return `<div class="target-row" style="--dish:${d.color}"><img src="/dishes/${d.id}.webp" alt=""><div><small>${caught ? 'CAPTURED' : d.dessert ? 'DESSERT' : 'SIDE DISH'}</small><strong>${d.name}</strong></div></div>`;
    })
    .join('');
  if (tab === 'trip') {
    show(
      'guide',
      heading('FIELD MANUAL', 'Six days in Colorado') +
        tabs +
        COURSES.map(
          (day, i) =>
            '<div class="field-note"><strong>Day ' +
            (i + 1) +
            ' · ' +
            day.name +
            '</strong><p>' +
            day.menu +
            '</p><ol>' +
            day.hunts.map((hunt) => '<li>' + hunt.name + '</li>').join('') +
            '</ol></div>'
        ).join('') +
        '<div class="panel-actions">' +
        (game?.active
          ? button('Back to hunt', 'resume', true)
          : button('Start trip', 'start', true)) +
        '</div>'
    );
    return;
  }
  const touch = document.body.classList.contains('touch-mode');
  const rows = touch
    ? [
        ['Move', 'Left stick'],
        ['Sprint', 'Push stick to the rim'],
        ['Aim', 'Swipe the view'],
        ['Cast net', 'Tap Cast'],
        ['Aim and cast', 'Drag Cast, then release'],
        ['Jump / glide', 'Tap / hold Flap'],
        ['Find next dish', 'Tap the compass'],
        ['Camera view', 'Tap the camera button'],
        ['Use door or display', 'Tap the prompt'],
        ['Hunt map', 'Tap the minimap'],
        ['Pause', 'Tap pause'],
      ]
    : [
        ['Move', 'W A S D'],
        ['Aim', 'Mouse'],
        ['Cast net', 'Left click / F'],
        ['Sprint', 'Shift'],
        ['Jump / glide', 'Tap / hold Space'],
        ['Find next dish', 'H'],
        ['Camera view', 'V'],
        ['Use door or display', 'G'],
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
        ? 'Cast when the reticle turns amber. Step sideways or flap when a dish winds up.'
        : 'Each trip day has three hunts. Catch both dishes to start the next hunt. Orange diamonds mark food. A mint cross marks an Emergency Gravy Boat.') +
      '</p>' +
      tabs +
      (isControls
        ? controls +
          '<div class="field-note"><strong>Food fight rules</strong><p>Captures can give 20 seconds of buttered boots or four long-range, wide casts from the wishbone slinger. Both equip automatically. Walk into a green gravy boat for up to 35 health. If a sprout starts tooting, move.</p></div>'
        : '<div class="targets">' +
          list +
          '</div><div class="field-note"><strong>' +
          (hasGrail() ? 'Collected · ' + RELIC : 'Rare find · Dover Street') +
          '</strong><p>' +
          (hasGrail()
            ? 'One of one. Your turkey found the prize in the Hall of Gravy.'
            : 'Follow the porch light to 735 Dover St on your first night. You can also visit the cottage from the Greater Broomfield map.') +
          '</p></div>') +
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
  if (game?.active && game.mode === 'parade') {
    show(
      'map',
      heading('COMMUNITY PARK', 'Parade route') +
        '<canvas class="zone-map" id="zone-map" width="660" height="356" aria-label="Parade loop and current lead balloon"></canvas>' +
        '<p class="panel-text">The gold line follows Main Street, 1st Avenue and Community Park Road. The star marks the lead crew.</p>' +
        '<label class="travel-label">WATCH A BALLOON<select id="parade-balloon">' +
        game.parade.floats
          .map(
            ({ label, release }, i) =>
              '<option value="' +
              i +
              '">' +
              label +
              (release ? ' · crew only' : '') +
              '</option>'
          )
          .join('') +
        '</select></label><div class="panel-actions">' +
        button('Rejoin the parade', 'rejoin-parade', true, 'flag') +
        button('Back to my spot', 'resume') +
        '</div>'
    );
    const p = game.mapPosition;
    drawMap($('#zone-map'), game.data, {
      x: -145,
      z: 149,
      width: Math.max(585, Math.abs(p.x + 145) * 2.2, Math.abs(p.z - 149) * 4),
      route: game.parade.route.points,
      destination: game.parade.leader,
      targets: [],
      player: p,
      yaw: game.yaw,
    });
    return;
  }
  if (game?.active && game.mode === 'campaign') return courseMap();
  if (level) mapLevel = level;
  else mapLevel = game?.active && game.mode !== 'hunt' ? 'city' : 'park';
  const city = mapLevel === 'city',
    active = game?.active;
  // A timed park hunt always stays in the same course.
  const allowCity = !active || game.mode !== 'hunt';
  const tabs =
    '<div class="panel-tabs">' +
    (!active ? '<button data-action="itinerary">Trip days</button>' : '') +
    '<button data-action="park-map" aria-pressed="' +
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
    const options = destinations
      .map(
        (t, i) =>
          '<option value="' +
          i +
          '" ' +
          (i === selectedSpot ? 'selected' : '') +
          '>' +
          t.name +
          '</option>'
      )
      .join('');
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
        : button(
            timerEnabled ? 'Park time trial' : 'Park hunt',
            'park-trial',
            true,
            'focus'
          )) +
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
      (active && !city && game.localParade
        ? '<span class="dover-key">★ Balloon parade</span>'
        : '') +
      '</div><p class="panel-text">' +
      (city
        ? 'Each of the six hunt stops has a side dish and a dessert. Visit 735 Dover St for the rare find.' +
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
    await loadMapImage(d);
    if (!canvas.isConnected) return;
    const targets = active
      ? game.targets
      : city
        ? DISHES.map((d) => dishSpawn(d, 'city'))
        : DISHES;
    const player = active
      ? game.mapPosition
      : city
        ? destinations[selectedSpot]
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
      route: active && !city ? game.localParade?.route.points : [],
      destination: active && !city ? game.localParade?.leader : null,
      places: city ? destinations : [],
      pickups: active ? game.fight.pickups : [],
    };
    const render = () =>
      drawMap(canvas, d, {
        ...settings,
        player: active || !city ? player : destinations[selectedSpot],
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
        destinations.forEach((spot, i) => {
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
      '<div class="credits"><h3>Broomfield geography</h3><p>Buildings, streets, paths, landmarks, and surveyed trees come from the City and County of Broomfield. USGS elevation follows the local slopes. USGS lidar supplies many roof and tree heights, with estimates elsewhere. The Dover aerial comes from Colorado’s 2020 Denver Regional Aerial Photography Project (CC0). Fifteen Dover roofs follow the laser survey. The two houses at 735 Dover and next door use modeled exteriors based on a July 2026 street view. Five civic roof models follow the lidar survey. The Library and Auditorium exterior uses local photographs by HonjuTheCat (CC0). Brunner Farmhouse was modeled from the city’s exterior photograph and footprint. ' +
      links('/geo/sources.json', 'Map sources and coverage') +
      '</p><h3>Cover photography</h3><p>Wild turkey by Frank Schulenburg, Flatirons by Kpsudeep, and Rocky Flats prairie by Zach Schiff / USFWS. The cropped and color-graded composite is licensed under ' +
      links('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0') +
      '. ' +
      links('/cover/credits.json', 'Original photographs') +
      '.</p><h3>Player model</h3><p>The Bourbon Red turkey uses the supplied model, color texture, and character animations. Its right wing also appears in first person.</p><h3>Field scenery</h3><p>Adapted Broomfield Flatirons by Kpsudeep (CC BY-SA 4.0), photographic panorama by Greg Zaal, grass by Charlotte Baglioni, cottonwood by Famartin (CC BY-SA 4.0), oak by Betelguese (CC BY-SA 3.0), and photographed façades by Scouser. ' +
      'The grass clumps and seed heads are adapted from grass by Georgeous (Sketchfab Standard). ' +
      'Parked vehicles on Dover use Kenney’s Car Kit (CC0). Soft-surface trails use Gravel Ground 01 by Rob Tuytel (CC0). Road surfaces, ironwork, and residential masonry are adapted from Street by Pasha (CC BY 4.0). ' +
      'Street furniture and controls are adapted from AndrewPunchak and pixelsquare, posed spectators from PolyOne Studio, ranch houses from Designed By Jonathan, and shrubs from LOLIPOP (CC BY 4.0). ' +
      'The balloon models are by Macys Parade and the 1993 Sonic model is by pika39019 (CC BY 4.0). ' +
      'The oak models and their autumn and summer foliage are adapted from the Oak trees pack by LOLIPOP (CC BY 4.0). ' +
      links('/scenery/sources.json', 'Scenery sources and licenses') +
      '. The western skyline combines USGS terrain with sculpted relief and snow from Snowy Mountain by James Lucas (CC BY-NC 4.0). ' +
      links('/scenery/peaks-credits.json', 'Front Range sources') +
      '</p></div>'
  );
}
function pause() {
  if (!game?.active) return;
  game.pause();
  modalOrigin = 'pause';
  show(
    'pause',
    heading(
      'FIELD BREAK',
      game.mode === 'parade' ? 'Parade paused' : 'Hunt paused'
    ) +
      '<p class="panel-text">' +
      (game.mode === 'parade'
        ? 'The balloons and their turkey crews will pick up where you left them.'
        : game.mode === 'roam'
          ? 'Your place in Broomfield is saved for this session.'
          : game.huntCaptures +
            ' of ' +
            game.targets.length +
            ' dishes captured. ' +
            (game.mode === 'campaign' ? game.huntLabel + '. ' : '') +
            (timerEnabled
              ? 'The supper clock is paused.'
              : 'Play at your own pace.')) +
      '</p><div class="panel-actions">' +
      button('Resume', 'resume', true, 'focus') +
      '<button class="secondary" data-action="timer" aria-label="Hunt timer">' +
      icon('clock') +
      'Hunt timer · <span id="pause-timer-state"></span></button>' +
      button(
        game.mode === 'parade' ? 'Parade map' : 'Hunt map',
        'map',
        false,
        'map'
      ) +
      (game.mode === 'parade'
        ? ''
        : button('Field guide', 'guide', false, 'book')) +
      button('Return to lobby', 'home') +
      '</div>'
  );
  syncTimer();
}
function courseMap() {
  const course = game.course,
    p = game.mapPosition;
  const porch = game.arrivalAtDover;
  const parade = game.localParade;
  const dest = game.pendingDestination;
  const route = porch
    ? doverLeg(p, DOVER_ROUTE).points
    : dest
      ? game.guide.route
      : (parade?.route.points ?? []);
  const places = porch ? [DOVER] : (game.venue?.data.places ?? [DOVER]);
  const points = [
    p,
    ...places,
    ...route,
    ...game.fight.pickups,
    ...game.targets.filter((t) => !t.caught).map((t) => t.model.position),
  ];
  const xs = points.map((v) => v.x),
    zs = points.map((v) => v.z);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...zs),
    bottom = Math.max(...zs);
  show(
    'map',
    heading(
      'DAY ' + (game.level + 1) + ' OF ' + COURSES.length,
      porch ? '735 Dover St after dark' : course.name
    ) +
      '<canvas class="zone-map" id="zone-map" width="660" height="356" aria-label="Map of the current day"></canvas>' +
      '<div class="map-key"><span><b class="start-marker"></b> You</span>' +
      (porch || dest
        ? '<span class="dover-key">★ Destination</span>'
        : '<span><b></b> Runaway dish</span><span class="gravy-key">✚ Emergency gravy</span>') +
      (parade ? '<span class="dover-key">★ Balloon parade</span>' : '') +
      '</div><p class="panel-text">' +
      (porch
        ? 'Enter 735 Dover St and inspect the display.'
        : dest
          ? 'Follow the trail to ' + dest.name + '.'
          : game.huntLabel) +
      '</p><div class="panel-actions">' +
      button('Return to trip', 'resume', true, 'focus') +
      '</div>'
  );
  drawMap($('#zone-map'), game.mapData, {
    x: (left + right) / 2,
    z: (top + bottom) / 2,
    width: Math.max(
      game.venue ? 65 : 110,
      right - left + 22,
      ((bottom - top + 18) * 660) / 356
    ),
    targets: game.targets,
    pickups: game.fight.pickups,
    player: p,
    yaw: game.yaw,
    labels: true,
    route,
    destination: porch ? DOVER_ROUTE.at(-1) : (dest ?? parade?.leader),
    places,
  });
}
function courseClear(bonus) {
  const next = COURSES[game.level + 1];
  show(
    'course-clear',
    heading('DAY ' + (game.level + 1) + ' COMPLETE', game.course.name) +
      '<p class="panel-text">All ' +
      game.course.hunts.length +
      ' hunts complete. ' +
      game.count +
      ' dishes captured. ' +
      (bonus ? bonus + ' ' : '') +
      '</p><div class="field-note"><strong>Tomorrow · ' +
      next.name +
      '</strong><p>' +
      next.menu +
      '</p></div><div class="result-stats">' +
      (timerEnabled
        ? '<div class="result-cell"><small>DAY TIME</small><strong>' +
          formatTime(game.elapsed) +
          '</strong></div>'
        : '') +
      '<div class="result-cell"><small>TURKEY HEALTH</small><strong>' +
      game.fight.health +
      ' / 100</strong></div></div><div class="panel-actions">' +
      button('Start Day ' + (game.level + 2), 'next-course', true, 'map') +
      button('Return to lobby', 'home') +
      '</div>'
  );
}
async function changeCourse(retry) {
  if (loading) return;
  loading = true;
  const next = COURSES[game.level + (retry ? 0 : 1)];
  show(
    'loading',
    heading('DAY ' + (COURSES.indexOf(next) + 1), next.name) +
      '<p class="panel-text">' +
      next.menu +
      '</p><div class="loading-line"></div>'
  );
  try {
    if (retry) await game.retry();
    else await game.advance();
    resume();
  } catch {
    show(
      'course-error',
      heading('HUNT MAP', 'Travel interrupted') +
        '<p class="panel-text">Your course checkpoint is saved for this run.</p><div class="panel-actions">' +
        button('Try again', retry ? 'retry-course' : 'next-course', true) +
        button('Return to lobby', 'home') +
        '</div>'
    );
  } finally {
    loading = false;
  }
}
function end({ won, time, shots, count, reason }) {
  modalOrigin = 'end';
  let record = false;
  if (
    won &&
    game.timedRun &&
    timerEnabled &&
    (!best(game.mode) || time < best(game.mode))
  ) {
    try {
      localStorage.setItem(bestKey(game.mode), String(time));
      record = true;
    } catch {}
  }
  const total = game.mode === 'campaign' ? TRIP_CAPTURES : DISHES.length;
  const cells = [
    ...(game.untimed ? [] : [['DISHES CAPTURED', count + ' / ' + total]]),
    ...(game.paradeHits ? [['PURSUERS NETTED', game.paradeCaptures]] : []),
    ...(timerEnabled ? [['TIME AFIELD', formatTime(time)]] : []),
    ['NETS CAST', shots],
    [
      'ACCURACY',
      (shots ? Math.round(((count + game.paradeHits) / shots) * 100) : 0) + '%',
    ],
  ];
  show(
    'end',
    heading(
      won ? 'MISSION COMPLETE' : 'SUPPER BELL',
      won
        ? 'Dinner is served!'
        : reason === 'parade'
          ? 'Caught by the parade!'
          : reason === 'health'
            ? 'You got basted!'
            : 'Time for supper'
    ) +
      '<p class="panel-text">' +
      (won
        ? game.mode === 'campaign'
          ? 'All six days are complete. Tea is served in Boulder.' +
            (record ? ' New personal best!' : '')
          : record
            ? 'The full Thanksgiving menu is at the table. New personal best!'
            : 'The full Thanksgiving menu is at the table.'
        : reason === 'parade'
          ? 'Cast your net again to catch a pursuer. Hold Flap to glide over the crowd.'
          : reason === 'health'
            ? 'The side dishes won the food fight. Watch for the windup and grab an Emergency Gravy Boat when your health dips.'
            : 'Supper started with ' +
              count +
              ' of ' +
              total +
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
        !won && game.mode === 'campaign'
          ? 'Retry ' + game.course.name
          : game.mode === 'parade'
            ? 'Rejoin the parade'
            : game.mode === 'roam'
              ? 'Explore again'
              : 'Hunt again',
        !won && game.mode === 'campaign'
          ? 'retry-course'
          : startAction(game.mode),
        true,
        'focus'
      ) +
      button('Share game', 'share', false, 'share') +
      button('Return to lobby', 'home') +
      '</div>'
  );
  refreshBest();
}
async function start(mode = 'campaign') {
  if (loading) return;
  loading = true;
  wakeAudio();
  game?.pause();
  modalOrigin = 'home';
  show(
    'loading',
    heading(
      'ENTERING THE FIELD',
      mode === 'parade'
        ? 'Preparing the parade'
        : mode === 'campaign'
          ? 'Day 1 · Denver arrivals'
          : 'Loading terrain'
    ) +
      '<p class="panel-text">' +
      (mode === 'campaign'
        ? COURSES[0].menu
        : 'Preparing the Broomfield map and field photography…') +
      '</p><div class="loading-line"></div>'
  );
  try {
    if (!engineRequest)
      engineRequest = (async () => {
        const { Hunt } = await import('./game.js');
        const g = new Hunt({ pause, map: () => map(), end, courseClear });
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
    show(
      'error',
      heading('FIELD CONNECTION', 'Unable to start') +
        '<p class="panel-text">' +
        (/WebGL|context/i.test(error.message)
          ? 'The field needs WebGL 2. Enable graphics acceleration in your browser and try again.'
          : 'A game asset could not load. Check your connection and retry.') +
        '</p><div class="panel-actions">' +
        button('Retry', startAction(mode), true) +
        button('Back to lobby', 'home') +
        '</div>'
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
      game.region.update(game.mapPosition.x, game.mapPosition.z);
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
  timer: () => {
    timerEnabled = !timerEnabled;
    try {
      localStorage.setItem(timerKey, timerEnabled ? 'on' : 'off');
    } catch {}
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
$('#lobby-total').textContent =
  TRIP_HUNTS.length + ' hunts · ' + COURSES.length + ' days';
fillIcons();
syncTimer();
syncSound();
syncFull();
refreshBest();
fieldData().catch(() => {});
