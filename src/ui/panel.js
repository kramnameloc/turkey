import { html, nothing } from 'lit-html';
import { icon } from './icons.js';
import { HUD_LAYOUTS, playerStorage } from '../player/storage.js';

export function hudLayoutPicker() {
  const selected = playerStorage.hudLayout.get();
  return html`<label class="hud-picker">
    <span>HUD layout</span>
    <select name="hud-layout">
      ${Object.entries(HUD_LAYOUTS).map(([id, name]) =>
        html`<option value=${id} ?selected=${selected === id}>${name}</option>`
      )}
    </select>
  </label>`;
}

export function heading(kicker, title) {
  return html`<div class="panel-kicker"><span class="dash"></span>${kicker}</div>
    <h2 id="panel-title" class="panel-title">${title}</h2>`;
}

export function button(label, action, primary = false, glyph) {
  return html`<button class=${primary ? 'primary' : 'secondary'} data-action=${action}>
    ${glyph ? icon(glyph) : nothing}${label}
  </button>`;
}

export function messagePanel(kicker, title, text, buttons) {
  return html`${heading(kicker, title)}<p class="panel-text">${text}</p>
    <div class="panel-actions">${buttons}</div>`;
}

export function loadingPanel(kicker, title, text) {
  return html`${heading(kicker, title)}<p class="panel-text">${text}</p>
    <div class="loading-line"></div>`;
}
