import { html, nothing } from 'lit-html';
import { icon } from './icons.js';

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
