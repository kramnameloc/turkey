import { html, nothing } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { COURSES } from '../gameplay/courses.js';
import { hasGrail, hasRecipe, RELIC } from '../world/dover/location.js';
import { DISHES } from '../maps/field-data.js';
import { button, heading } from './panel.js';

const desktopControls = [
  ['Move', 'W A S D'],
  ['Aim', 'Mouse'],
  ['Cast weapon', 'Left click / F'],
  ['Switch weapon', 'R'],
  ['Sprint', 'Shift'],
  ['Jump / glide', 'Tap / hold Space'],
  ['Find next dish', 'H'],
  ['Camera view', 'V'],
  ['Use door or display', 'G'],
  ['Hunt map', 'M'],
  ['Pause', 'Esc / P'],
];
const touchControls = [
  ['Move', 'Left stick'],
  ['Sprint', 'Push stick to the rim'],
  ['Aim', 'Swipe the view'],
  ['Cast weapon', 'Tap Cast'],
  ['Switch weapon', 'Tap the weapon name'],
  ['Aim and cast', 'Drag Cast, then release'],
  ['Jump / glide', 'Tap / hold Flap'],
  ['Find next dish', 'Tap the compass'],
  ['Camera view', 'Tap the camera button'],
  ['Use door or display', 'Tap the prompt'],
  ['Hunt map', 'Tap the minimap'],
  ['Pause', 'Tap pause'],
];

function controls(touch) {
  const rows = touch ? touchControls : desktopControls;
  return html`<div>${rows.map(
    ([label, binding]) => html`
    <div class="control-row"><span>${label}</span>
      ${touch ? html`<strong>${binding}</strong>` : html`<kbd>${binding}</kbd>`}
    </div>`
  )}
    </div>
    ${touch ? nothing : html`<p class="panel-text">Use ← and → to turn with the keyboard, Q to look up, and E to look down.</p>`}
    <div class="field-note"><strong>Food fight rules</strong><p>The Harvest Net slows a fleeing dish. Two captures unlock the quick Cranberry Popper. Five unlock the Buttered Roll Sling, which can interrupt a dish winding up at close range. New weapons equip automatically. Captures can also grant 20 seconds of buttered boots or four wide casts. Walk into a green gravy boat for up to 35 health. If a sprout starts tooting, move.</p></div>`;
}

function dishes(desserts, game) {
  const grail = hasGrail();
  return html`<div class="targets">${DISHES.filter(
    (dish) => !!dish.dessert === desserts
  ).map((dish) => {
    const caught =
      game?.active &&
      game.allTargets.some((target) => target.id === dish.id && target.caught);
    return html`<div class="target-row" ${ref((row) => row?.style.setProperty('--dish', dish.color))}>
      <img src=${'/dishes/' + dish.id + '.webp'} alt="">
      <div><small>${caught ? 'CAPTURED' : desserts ? 'DESSERT' : 'SIDE DISH'}</small>
        <strong>${dish.name}</strong></div>
    </div>`;
  })}</div>
  <div class="field-note"><strong>${grail ? 'Collected · ' + RELIC : 'Rare find · Dover Street'}</strong>
    <p>${
      grail
        ? 'One of one. Your turkey found the prize in the Hall of Gravy.'
        : 'Follow the porch light to 735 Dover St on your first night. You can also visit the cottage from the Greater Broomfield map.'
    }</p>
    <p>${
      hasRecipe()
        ? 'Family recipe decoded. The Cornucopia of Plenty fires a golden pumpkin for 100 damage. Each dish it captures restores up to 12 turkey HP.'
        : 'A handwritten note reads, “Save room for seconds. Check the cupboards.”'
    }</p>
  </div>`;
}

const sections = [
  ['trip', 'itinerary', 'Trip days'],
  ['dishes', 'guide', 'Side dishes'],
  ['desserts', 'desserts', 'Desserts'],
  ['controls', 'controls', 'Controls'],
];

export function fieldGuide(tab, game, touch) {
  const tabs = html`<div class="panel-tabs">${sections.map(
    ([key, action, label]) =>
      html`<button data-action=${action} aria-pressed=${tab === key}>${label}</button>`
  )}</div>`;
  if (tab === 'trip') {
    return html`${heading('FIELD MANUAL', 'Six days in Colorado')}${tabs}
      ${COURSES.map(
        (
          day,
          i
        ) => html`<div class="field-note"><strong>Day ${i + 1} · ${day.name}</strong>
        <p>${day.menu}</p><ol>${day.hunts.map((hunt) => html`<li>${hunt.name}</li>`)}</ol></div>`
      )}
      <div class="panel-actions">${
        game?.active
          ? button('Back to hunt', 'resume', true)
          : button('Start trip', 'start', true)
      }</div>`;
  }
  const isControls = tab === 'controls';
  return html`${heading('FIELD MANUAL', isControls ? 'How to play' : 'Field guide')}
    <p class="panel-text">${
      isControls
        ? 'Cast when the reticle turns amber. Bring a dish to zero HP to capture it. Step sideways or flap when a dish winds up.'
        : 'Each trip day has three hunts. Catch both dishes to start the next hunt. Orange diamonds mark food. A mint cross marks an Emergency Gravy Boat.'
    }</p>
    ${tabs}${isControls ? controls(touch) : dishes(tab === 'desserts', game)}
    <div class="panel-actions">${
      game?.active
        ? button('Back to hunt', 'resume', true, 'focus')
        : button('Start hunt', 'start', true, 'focus')
    }</div>`;
}
