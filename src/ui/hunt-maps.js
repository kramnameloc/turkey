import { html, nothing } from 'lit-html';
import { COURSES } from '../gameplay/courses.js';
import { doverLeg } from '../world/dover/guide.js';
import { DOVER } from '../world/dover/location.js';
import { DOVER_ROUTE } from '../world/dover/route.js';
import {
  DISHES,
  SPAWN,
  TRAVEL,
  dishSpawn,
  drawMap,
  fieldData,
  formatTime,
  loadMapImage,
  regionData,
} from '../field.js';
import { renderPearlMap } from './pearl-map.js';
import { playerStorage } from '../player/storage.js';
import { button, heading } from './panel.js';

export const destinations = [...TRAVEL, DOVER];

function mapCanvas(label) {
  return html`<canvas class="zone-map" width="660" height="356" id="zone-map" aria-label=${label}></canvas>`;
}

export function paradeMap(floats) {
  return html`${heading('COMMUNITY PARK', 'Parade route')}
    ${mapCanvas('Parade loop and current lead balloon')}
    <p class="panel-text">The gold line follows Main Street, 1st Avenue and Community Park Road. The star marks the lead crew.</p>
    <label class="travel-label">WATCH A BALLOON<select id="parade-balloon">
      ${floats.map(({ label, release }, i) => html`<option value=${i}>${label}${release ? ' · crew only' : ''}</option>`)}
    </select></label>
    <div class="panel-actions">${button('Rejoin the parade', 'rejoin-parade', true, 'flag')}
      ${button('Back to my spot', 'resume')}</div>`;
}

function showCourseMap(game, show) {
  const course = game.course;
  const player = game.mapPosition;
  if (course.venue === 'pearl') {
    const panel = show(
      'map',
      html`${heading('DAY ' + (game.level + 1) + ' · BOULDER', 'Pearl Street')}
      <div id="pearl-map"></div><div class="panel-actions">${button('Return to trip', 'resume', true, 'focus')}</div>`
    );
    renderPearlMap(panel.querySelector('#pearl-map'), game);
    return;
  }
  const porch = game.arrivalAtDover;
  const parade = game.localParade;
  const dest = game.pendingDestination;
  const route = porch
    ? doverLeg(player, DOVER_ROUTE).points
    : dest
      ? game.guide.route
      : (parade?.route.points ?? []);
  const places = porch ? [DOVER] : (game.venue?.data.places ?? [DOVER]);
  const points = [
    player,
    ...places,
    ...route,
    ...game.fight.pickups,
    ...game.targets.filter((t) => !t.caught).map((t) => t.model.position),
  ];
  const xs = points.map((point) => point.x),
    zs = points.map((point) => point.z);
  const left = Math.min(...xs),
    right = Math.max(...xs);
  const top = Math.min(...zs),
    bottom = Math.max(...zs);
  const panel = show(
    'map',
    html`
    ${heading('DAY ' + (game.level + 1) + ' OF ' + COURSES.length, porch ? '735 Dover St after dark' : course.name)}
    ${mapCanvas('Map of the current day')}
    <div class="map-key"><span><b class="start-marker"></b> You</span>
      ${
        porch || dest
          ? html`<span class="dover-key">★ Destination</span>`
          : html`<span><b></b> Runaway dish</span><span class="gravy-key">✚ Emergency gravy</span>`
      }
      ${parade ? html`<span class="dover-key">★ Balloon parade</span>` : nothing}
    </div>
    <p class="panel-text">${
      porch
        ? 'Enter 735 Dover St and inspect the display.'
        : dest
          ? 'Follow the trail to ' + dest.name + '.'
          : game.huntLabel
    }</p>
    <div class="panel-actions">${button('Return to trip', 'resume', true, 'focus')}</div>`
  );
  drawMap(panel.querySelector('canvas'), game.mapData, {
    x: (left + right) / 2,
    z: (top + bottom) / 2,
    width: Math.max(
      game.venue ? 65 : 110,
      right - left + 22,
      ((bottom - top + 18) * 660) / 356
    ),
    targets: game.targets,
    pickups: game.fight.pickups,
    player,
    yaw: game.yaw,
    labels: true,
    route,
    destination: porch ? DOVER_ROUTE.at(-1) : (dest ?? parade?.leader),
    places,
  });
}

function fieldMapPanel(game, city, timerEnabled, selectedSpot) {
  const active = game?.active;
  const best = city && playerStorage.best('city');
  return html`${heading('FIELD CARTOGRAPHY', city ? 'Greater Broomfield' : 'Hunt map')}
    <div class="panel-tabs">
      ${active ? nothing : html`<button data-action="itinerary">Trip days</button>`}
      <button data-action="park-map" aria-pressed=${!city}>Community Park</button>
      ${
        !active || game.mode !== 'hunt'
          ? html`<button data-action="city-map" aria-pressed=${city}>Greater Broomfield</button>`
          : nothing
      }
    </div>
    ${mapCanvas('Map of the hunt area')}
    <div class="map-key"><span><b class="start-marker"></b> ${active ? 'You' : 'Starting point'}</span>
      ${active && game.mode === 'roam' ? nothing : html`<span><b></b> Runaway dish</span>`}
      ${active && !city && game.localParade ? html`<span class="dover-key">★ Balloon parade</span>` : nothing}
    </div>
    <p class="panel-text">${
      city
        ? 'Each of the six hunt stops has a side dish and a dessert. Visit 735 Dover St for the rare find.'
        : 'The park course circles Community Park Pond, west of the ballfields and north of the public library.'
    }
      ${best ? ' Your best city run is ' + formatTime(best) + '.' : nothing}</p>
    ${
      city
        ? html`<label class="travel-label">TRAVEL DESTINATION<select id="travel-spot">
      ${destinations.map((spot, i) => html`<option value=${i} ?selected=${i === selectedSpot}>${spot.name}</option>`)}
    </select></label>`
        : nothing
    }
    <div class="panel-actions">${
      city
        ? active
          ? button('Travel here', 'travel', true, 'map')
          : [
              button('Citywide hunt', 'city-hunt', true, 'focus'),
              button('Explore freely', 'explore', false, 'map'),
            ]
        : active
          ? button('Return to field', 'resume', true, 'focus')
          : button(
              timerEnabled ? 'Park time trial' : 'Park hunt',
              'park-trial',
              true,
              'focus'
            )
    }</div>`;
}

export async function showHuntMap({
  game,
  level,
  timerEnabled,
  selectedSpot,
  selectSpot,
  show,
}) {
  if (game?.active && game.mode === 'campaign')
    return showCourseMap(game, show);
  if (game?.active && game.mode === 'parade') {
    const panel = show('map', paradeMap(game.parade.floats));
    const player = game.mapPosition;
    drawMap(panel.querySelector('canvas'), game.data, {
      x: -145,
      z: 149,
      width: Math.max(
        585,
        Math.abs(player.x + 145) * 2.2,
        Math.abs(player.z - 149) * 4
      ),
      route: game.parade.route.points,
      destination: game.parade.leader,
      targets: [],
      player,
      yaw: game.yaw,
    });
    return;
  }
  const active = game?.active;
  const city = level ? level === 'city' : !!active && game.mode !== 'hunt';
  const panel = show(
    'map',
    fieldMapPanel(game, city, timerEnabled, selectedSpot)
  );
  const canvas = panel.querySelector('canvas');
  const select = panel.querySelector('select');
  const choose = (index) => {
    selectedSpot = index;
    selectSpot(index);
  };
  select?.addEventListener('change', () => choose(Number(select.value)));
  try {
    const data = await (city ? regionData() : fieldData());
    await loadMapImage(data);
    if (!canvas.isConnected) return;
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
    const targets = active
      ? game.targets
      : city
        ? DISHES.map((dish) => dishSpawn(dish, 'city'))
        : DISHES;
    const draw = () =>
      drawMap(canvas, data, {
        x: centerX,
        z: centerZ,
        width,
        player: active || !city ? player : destinations[selectedSpot],
        yaw: active ? game.yaw : Math.PI / 2,
        targets: active && game.mode === 'roam' ? [] : targets,
        labels: true,
        route: active && !city ? game.localParade?.route.points : [],
        destination: active && !city ? game.localParade?.leader : null,
        places: city ? destinations : [],
        pickups: active ? game.fight.pickups : [],
        selected: city ? selectedSpot : -1,
      });
    draw();
    if (!select) return;
    select.addEventListener('change', draw);
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      const scale = width / rect.width;
      const x = (event.clientX - rect.left - rect.width / 2) * scale + centerX;
      const z = (event.clientY - rect.top - rect.height / 2) * scale + centerZ;
      let nearest = -1,
        closest = scale * 22;
      destinations.forEach((spot, i) => {
        const distance = Math.hypot(x - spot.x, z - spot.z);
        if (distance < closest) {
          nearest = i;
          closest = distance;
        }
      });
      if (nearest >= 0) {
        choose(nearest);
        select.value = String(nearest);
        draw();
      }
    });
  } catch {
    if (canvas.isConnected) {
      const error = document.createElement('p');
      error.textContent = 'Map data could not load. Reopen the map to retry.';
      canvas.replaceWith(error);
    }
  }
}
