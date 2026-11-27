import { html, nothing, render, svg } from 'lit-html';

const shapes = {
  camera: svg`<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>`,
  door: svg`<path d="M4 21h16M6 20V3h12v17M14 12h1"/>`,
  share: svg`<path d="M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2"/>`,
  volume: svg`<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>`,
  mute: svg`<path d="M11 5 6 9H3v6h3l5 4zM16 9l6 6m0-6-6 6"/>`,
  expand: svg`<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>`,
  shrink: svg`<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m18 0h-5v5"/>`,
  focus: svg`<circle cx="12" cy="12" r="7.6"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  target: svg`<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 8-8m-1-3v4h4"/>`,
  controller: svg`<path d="M7 7h10c2 0 3 2 4 5l1 5c0 3-2 4-4 2l-3-3H9l-3 3c-2 2-4 1-4-2l1-5c1-3 2-5 4-5Z"/><path d="M7 10v4m-2-2h4m7-1h.1m2 2h.1"/>`,
  pin: svg`<path d="M19 10c0 6-7 12-7 12S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>`,
  map: svg`<path d="m2 6 7-3 6 3 7-3v15l-7 3-6-3-7 3zm7-3v15m6-12v15"/>`,
  clock: svg`<circle cx="12" cy="13" r="8"/><path d="M12 9v5l2 1M9 1h6m-3 0v4m6 2 2-2"/>`,
  flag: svg`<path d="M5 22V3q4-3 9 0 3 2 6 0v11q-4 2-8-1-4-2-7 0"/>`,
  layers: svg`<path d="m12 2 10 6-10 6L2 8zm-9 11 9 5 9-5M3 17l9 5 9-5"/>`,
  x: svg`<path d="m6 6 12 12M18 6 6 18"/>`,
  pause: svg`<path d="M7 4h3v16H7zm7 0h3v16h-3z" fill="currentColor"/>`,
  feather: svg`<path d="M19 3c-4-2-7 1-10 5-2 3-3 7-2 10 4 1 7-1 10-5 3-4 5-8 2-10ZM4 21 15 8m-7 7h6"/>`,
  heart: svg`<path d="M20.8 4.9a5.3 5.3 0 0 0-7.5 0L12 6.2l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.6a5.3 5.3 0 0 0 0-7.5Z"/>`,
  net: svg`<ellipse cx="14.9" cy="8.8" rx="5.2" ry="7.5" transform="rotate(40 14.9 8.8)"/><path d="m10.5 14.2-7 8-1.3-1.1 6.9-8.1m2.8-8.5 6.3 5.3m-8.2-2.7 6.5 5.5m-.9-10-6.5 7.7m9.5-6.4-7.2 8.5" stroke-width="1.2"/>`,
  wide: svg`<path d="M4 3c0 5 1 8 5 11l2 7h2l2-7c4-3 5-6 5-11M4 3l8 7 8-7M7 9l5 4 5-4"/>`,
  popper: svg`<path d="m4 10 12-5 3 7-12 5zM9 16l1 5 3-1-1-5m5-10 2-1 3 8-2 1"/><circle cx="7" cy="6" r="2.5"/>`,
  sling: svg`<path d="m4 4 5 9 1 8h4l1-8 5-9-3-1-5 8-5-8zM5 4l7 3 7-3"/>`,
  cornucopia: svg`<ellipse cx="16.5" cy="10" rx="4.5" ry="7" transform="rotate(-25 16.5 10)"/><path d="M11.8 5.8c-4 2-3.2 9.4-7.5 10.4-1.2.2-2-.6-2-1.8-1.1 6 6 8.2 14.8 2.4m-7.9-4.1 2 5.1"/>`,
  book: svg`<path d="M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3zm9 2v15"/>`,
  check: svg`<path d="m4 12 5 5L20 6"/>`,
  mountain: svg`<path d="m1 20 8-15 4 7 3-4 7 12zm5-9 3 2 2-3"/>`,
};
export function icon(name) {
  if (!Object.hasOwn(shapes, name)) return nothing;
  return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
}

export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-i]'))
    render(icon(el.dataset.i), el);
}
