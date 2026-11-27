import { html, nothing } from 'lit-html';
import { COURSES, TRIP_CAPTURES } from '../gameplay/courses.js';
import { DISHES, formatTime } from '../maps/field-data.js';
import { icon } from './icons.js';
import { button, heading } from './panel.js';

export function startAction(mode) {
  return {
    campaign: 'start',
    city: 'city-hunt',
    hunt: 'park-trial',
    roam: 'explore',
    parade: 'parade',
  }[mode];
}

export function pausePanel(game, timerEnabled) {
  const parade = game.mode === 'parade';
  const text = parade
    ? 'The balloons and their turkey crews will pick up where you left them.'
    : game.mode === 'roam'
      ? 'Your place in Broomfield is saved for this session.'
      : `${game.huntCaptures} of ${game.targets.length} dishes captured. ` +
        (game.mode === 'campaign' ? game.huntLabel + '. ' : '') +
        (timerEnabled
          ? 'The supper clock is paused.'
          : 'Play at your own pace.');
  return html`${heading('FIELD BREAK', parade ? 'Parade paused' : 'Hunt paused')}
    <p class="panel-text">${text}</p>
    <div class="panel-actions">${button('Resume', 'resume', true, 'focus')}
      <button class="secondary" data-action="timer" aria-label="Hunt timer">${icon('clock')}
        Hunt timer · <span id="pause-timer-state"></span></button>
      <button class="secondary" data-action="sound"><i></i> Audio · <span></span></button>
      ${button(parade ? 'Parade map' : 'Hunt map', 'map', false, 'map')}
      ${parade ? nothing : button('Field guide', 'guide', false, 'book')}
      ${button('Return to lobby', 'home')}
    </div>`;
}

function stat(label, value) {
  return html`<div class="result-cell"><small>${label}</small><strong>${value}</strong></div>`;
}

export function courseClearPanel(game, bonus, timerEnabled) {
  const next = COURSES[game.level + 1];
  return html`${heading('DAY ' + (game.level + 1) + ' COMPLETE', game.course.name)}
    <p class="panel-text">All ${game.course.hunts.length} hunts complete. ${game.count} dishes captured. ${bonus}</p>
    <div class="field-note"><strong>Tomorrow · ${next.name}</strong><p>${next.menu}</p></div>
    <div class="result-stats">${timerEnabled ? stat('DAY TIME', formatTime(game.elapsed)) : nothing}
      ${stat('TURKEY HEALTH', game.fight.health + ' / 100')}</div>
    <div class="panel-actions">${button('Start Day ' + (game.level + 2), 'next-course', true, 'map')}
      ${button('Return to lobby', 'home')}</div>`;
}

function outcome(game, { won, reason, count }, total, record) {
  if (won) {
    const text =
      game.mode === 'campaign'
        ? 'All six days are complete. Tea is served in Boulder.'
        : 'The full Thanksgiving menu is at the table.';
    return ['Dinner is served!', text + (record ? ' New personal best!' : '')];
  }
  if (reason === 'parade')
    return [
      'Caught by the parade!',
      'Bring a pursuer to zero HP to catch them. Hold Flap to glide over the crowd.',
    ];
  if (reason === 'health')
    return [
      'You got basted!',
      'The side dishes won the food fight. Watch for the windup and grab an Emergency Gravy Boat when your health dips.',
    ];
  return [
    'Time for supper',
    `Supper started with ${count} of ${total} dishes. The rest are still out there.`,
  ];
}

export function resultsPanel(game, result, timerEnabled, record) {
  const { won, count, time, shots } = result;
  const campaign = game.mode === 'campaign';
  const total = campaign ? TRIP_CAPTURES : DISHES.length;
  const [title, text] = outcome(game, result, total, record);
  const retry = !won && campaign;
  const again = retry
    ? 'Retry ' + game.course.name
    : game.mode === 'parade'
      ? 'Rejoin the parade'
      : game.mode === 'roam'
        ? 'Explore again'
        : 'Hunt again';
  return html`${heading(won ? 'MISSION COMPLETE' : 'SUPPER BELL', title)}
    <p class="panel-text">${text}</p>
    <div class="result-stats">
      ${game.untimed ? nothing : stat('DISHES CAPTURED', count + ' / ' + total)}
      ${game.paradeHits ? stat('PURSUERS NETTED', game.paradeCaptures) : nothing}
      ${timerEnabled ? stat('TIME AFIELD', formatTime(time)) : nothing}
      ${stat('CASTS', shots)}${stat('ACCURACY', (shots ? Math.round((game.hits / shots) * 100) : 0) + '%')}
    </div>
    ${
      won && campaign && game.course.venue === 'pearl'
        ? html`
      <details class="pearl-recap"><summary>Completed Pearl Street map</summary><div id="pearl-map"></div></details>`
        : nothing
    }
    <div class="panel-actions">${button(again, retry ? 'retry-course' : startAction(game.mode), true, 'focus')}
      ${button('Share game', 'share', false, 'share')}${button('Return to lobby', 'home')}</div>`;
}
