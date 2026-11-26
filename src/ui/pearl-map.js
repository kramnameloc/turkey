import { html, nothing, render } from 'lit-html';
import { drawMap } from '../maps/draw-map.js';
import { walkingTrail } from '../gameplay/trail.js';

// The hunt already owns the capture flags and resets them at the day checkpoint.
function stopsFor(game, served) {
  const stops = game.course.hunts.map((hunt, i) => {
    const dishes = hunt.dishes.map(([id]) =>
      game.allTargets.find((dish) => dish.id === id)
    );
    const total = dishes.filter((d) => d.caught).length;
    const state =
      total === dishes.length
        ? 'done'
        : i === game.huntIndex
          ? 'active'
          : 'later';
    return {
      name: hunt.name,
      dishes,
      state,
      status:
        state === 'later'
          ? 'Upcoming'
          : total + '/' + dishes.length + ' caught',
    };
  });
  stops.push({
    name: game.course.destination.name,
    state: served ? 'done' : game.pendingDestination ? 'active' : 'later',
    status: served
      ? 'Tea served'
      : game.pendingDestination
        ? 'Sit down for tea'
        : 'After all six dishes',
  });
  return stops;
}

export function renderPearlMap(container, game, served = false) {
  const stops = stopsFor(game, served);
  render(
    html`
    <div class="pearl-map-layout">
      <canvas class="zone-map" width="360" height="318" role="img"
        aria-label="Downtown Boulder course map. Pearl Street runs east to the courthouse. Follow 13th Street south past Walnut and Canyon to the rose garden and teahouse."></canvas>
      <ol class="pearl-stops" aria-label="Pearl Street completion">
        ${stops.map(
          (stop, i) => html`
          <li class=${stop.state} aria-current=${stop.state === 'active' ? 'step' : nothing}>
            <span class="stop-pin" aria-hidden="true">${i + 1}</span>
            <div><strong>${stop.name}</strong><small>${stop.state === 'done' ? '✓ ' : ''}${stop.status}</small>
            ${
              stop.state === 'active' && stop.dishes
                ? stop.dishes.map(
                    (d) =>
                      html`<span class="dish-progress" aria-label="${d.name} ${d.caught ? 'captured' : 'remaining'}">${d.caught ? '✓' : '◇'} ${d.name}</span>`
                  )
                : nothing
            }</div>
          </li>`
        )}
      </ol>
    </div>
    <div class="map-key"><span><b class="start-marker"></b> You</span>
    ${game.pendingDestination ? html`<span class="dover-key">★ Tea table</span>` : served ? nothing : html`<span><b></b> Runaway dish</span>`}
    ${game.fight.pickups.length ? html`<span class="gravy-key">✚ Emergency gravy</span>` : nothing}
    </div>`,
    container
  );
  const canvas = container.querySelector('canvas');
  const { bounds: b, places, mapLabels } = game.mapData;
  const x = (b.minX + b.maxX) / 2,
    z = (b.minZ + b.maxZ) / 2;
  const scale = Math.min(
    (canvas.width - 12) / (b.maxX - b.minX),
    (canvas.height - 12) / (b.maxZ - b.minZ)
  );
  drawMap(canvas, game.mapData, {
    x,
    z,
    width: canvas.width / scale,
    player: game.mapPosition,
    yaw: game.yaw,
    pickups: game.fight.pickups,
    targets: game.targets,
    route: game.pendingDestination
      ? [
          game.mapPosition,
          ...walkingTrail(
            game.mapPosition,
            game.pendingDestination,
            game.isBlocked
          ),
        ]
      : [],
    destination: game.pendingDestination,
    drawLandmarks: (ctx, px, py) =>
      drawStops(ctx, px, py, stops, places, mapLabels),
  });
}

function drawStops(ctx, px, py, stops, places, mapLabels) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#303b32';
  ctx.fillStyle = '#fff2d2';
  for (const label of mapLabels) {
    ctx.strokeText(label.name, px(label.x), py(label.z));
    ctx.fillText(label.name, px(label.x), py(label.z));
  }
  for (const [i, stop] of stops.entries()) {
    const place = places.find((p) => p.name === stop.name);
    const u = px(place.x),
      v = py(place.z);
    ctx.beginPath();
    ctx.arc(u, v, 8.5, 0, 2 * Math.PI);
    ctx.fillStyle = { active: '#ffd077', done: '#a6d8b2', later: '#364438' }[
      stop.state
    ];
    ctx.fill();
    ctx.strokeStyle = stop.state === 'later' ? '#e2dec9' : '#253327';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = stop.state === 'later' ? '#fff4dd' : '#253327';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(String(i + 1), u, v + 0.5);
  }
}
