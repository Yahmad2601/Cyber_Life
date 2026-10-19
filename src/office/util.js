export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Game time is minutes since midnight.
export const fmt = (min) => {
  const m = Math.floor(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const digits = (s) => String(s).replace(/\D/g, '');

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// App logos and file-type icons are image files in ./assets.
const LOGOS = import.meta.glob('./assets/logos/*.svg', { eager: true, query: '?url', import: 'default' });
const WALLS = import.meta.glob('./assets/wallpapers/*.svg', { eager: true, query: '?url', import: 'default' });
export const logoUrl = (id) => LOGOS[`./assets/logos/${id}.svg`] || LOGOS['./assets/logos/txt.svg'];
export const wallpaperUrl = (id) => WALLS[`./assets/wallpapers/${id}.svg`];
export const logo = (id, cls = '') => `<img class="logo ${cls}" src="${logoUrl(id)}" alt="" draggable="false">`;

// Small monochrome glyphs for menus and the system tray (not app icons).
const g = (d) => `<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
export const GLYPH = {
  view: g('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>'),
  sort: g('<path d="M5 2v12M2 11l3 3 3-3M11 14V2M8 5l3-3 3 3"/>'),
  refresh: g('<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"/>'),
  undo: g('<path d="M5 3 2 6l3 3M2 6h7.5a4.5 4.5 0 0 1 0 9H6"/>'),
  new: g('<circle cx="8" cy="8" r="6"/><path d="M8 5v6M5 8h6"/>'),
  display: g('<rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M5.5 14h5M8 11.5V14"/>'),
  brush: g('<path d="M13.5 2.5 7 9M7 9c-2 0-3 1-3 2.5S3 14 1.5 14c3 0 5.5-1 5.5-3.5"/>'),
  terminal: g('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="m4.5 6 2 2-2 2M8.5 10.5H11"/>'),
  more: g('<path d="M3 4h10M3 8h10M3 12h10"/>'),
  open: g('<path d="M9 2.5h4.5V7M13.5 2.5 7 9M12 10v3.5H2.5V4H6"/>'),
  cut: g('<circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><path d="M5.5 10.5 12 2M10.5 10.5 4 2"/>'),
  copy: g('<rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>'),
  paste: g('<rect x="3" y="3" width="10" height="11.5" rx="1"/><path d="M6 1.5h4v3H6z"/>'),
  rename: g('<path d="M2 12.5h12M3 9.5l6.5-6.5 2 2L5 11.5H3z"/>'),
  delete: g('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/>'),
  pin: g('<path d="M10 1.5 14.5 6l-2 1-2.5 2.5.5 3-1 1L7 11l-4 4M2.5 6.5l1-1 3 .5L9 3.5l1-2"/>'),
  props: g('<circle cx="8" cy="8" r="6"/><path d="M8 7v4.5M8 4.5v.5"/>'),
  path: g('<path d="M6.5 9.5 9.5 6.5M7 4l1.5-1.5a3 3 0 0 1 4.2 4.2L11 8.5M9 12l-1.5 1.5a3 3 0 0 1-4.2-4.2L5 7.5"/>'),
  zip: g('<rect x="3" y="1.5" width="10" height="13" rx="1"/><path d="M8 1.5v2M8 5v1.5M8 8v1.5"/><rect x="6.8" y="10.5" width="2.4" height="2" rx=".5"/>'),
  task: g('<path d="M1.5 9h3l2-5 3 9 2-6 1 2h2"/>'),
  gear: g('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'),
  close: g('<path d="m3.5 3.5 9 9M12.5 3.5l-9 9"/>'),
  restore: g('<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2v3h3"/>'),
  search: g('<circle cx="6.8" cy="6.8" r="4.8"/><path d="m10.5 10.5 4 4"/>'),
  power: g('<path d="M8 1.5V8M4.5 3.8a5.5 5.5 0 1 0 7 0"/>'),
  lock: g('<rect x="3" y="7" width="10" height="7.5" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>'),
  signout: g('<path d="M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6"/>'),
  sleep: g('<path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"/>'),
  user: g('<circle cx="8" cy="5.5" r="3"/><path d="M2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/>'),
  wifi: g('<path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6.2 6.2 0 0 1 8.4 0M6 11.2a3 3 0 0 1 4 0"/><circle cx="8" cy="13.4" r=".6"/>'),
  wifiOff: g('<path d="M1.5 6a9.5 9.5 0 0 1 13 0M6 11.2a3 3 0 0 1 4 0M2 2l12 12"/>'),
  plane: g('<path d="M7 1.5h2l.5 5 5 2.5v1.5l-5-1-.3 3.5 1.8 1.2V15L8 14.2 5 15v-.8l1.8-1.2-.3-3.5-5 1V9l5-2.5z"/>'),
  bt: g('<path d="m4.5 5 7 6L8 14V2l3.5 3-7 6"/>'),
  volume: g('<path d="M2 6h2.5L8 3v10L4.5 10H2zM10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.5 6.5 0 0 1 0 9"/>'),
  battery: g('<rect x="1.5" y="4.5" width="11.5" height="7" rx="1.5"/><path d="M14.5 7v2"/><rect x="3" y="6" width="7" height="4" rx=".5" class="fill"/>'),
  sun: g('<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/>'),
  moon: g('<path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"/>'),
  focus: g('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/>'),
  leaf: g('<path d="M2.5 13.5C2.5 6 7 2.5 13.5 2.5 13.5 9 10 13.5 2.5 13.5zM2.5 13.5 9 7"/>'),
  chevUp: g('<path d="m4 10 4-4 4 4"/>'),
  chevRight: g('<path d="m6 3 5 5-5 5"/>'),
  check: g('<path d="m3 8.5 3 3 7-7"/>'),
  dot: g('<circle cx="8" cy="8" r="3" class="fill"/>'),
  edit: g('<path d="M3 10.5 10.5 3l2.5 2.5L5.5 13H3z"/>'),
  shield: g('<path d="M8 1.5 13.5 3.5v4c0 3.5-2.4 6-5.5 7-3.1-1-5.5-3.5-5.5-7v-4z"/>'),
  back: g('<path d="M13 8H3M7 4 3 8l4 4"/>'),
  call: g('<path d="M5.2 1.8 6.6 5 5.3 6.2a8 8 0 0 0 4.5 4.5L11 9.4l3.2 1.4-.6 2.5c-.2.6-.8 1-1.4.9C6.6 13.6 2.4 9.4 1.8 3.8c-.1-.6.3-1.2.9-1.4z"/>'),
  bubble: g('<path d="M2 3.5h12v7.5H6.5L3 14v-3H2z"/>'),
  keypad: g('<circle cx="4" cy="3" r=".9" class="fill"/><circle cx="8" cy="3" r=".9" class="fill"/><circle cx="12" cy="3" r=".9" class="fill"/><circle cx="4" cy="7" r=".9" class="fill"/><circle cx="8" cy="7" r=".9" class="fill"/><circle cx="12" cy="7" r=".9" class="fill"/><circle cx="4" cy="11" r=".9" class="fill"/><circle cx="8" cy="11" r=".9" class="fill"/><circle cx="12" cy="11" r=".9" class="fill"/><circle cx="8" cy="14.5" r=".9" class="fill"/>'),
  people: g('<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c.4-2.5 2.2-4 4.5-4s4.1 1.5 4.5 4M11 3.2a2.4 2.4 0 0 1 0 4.6M12.3 9.6c1.3.5 2 1.7 2.2 3.9"/>'),
  history: g('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>'),
  sms: g('<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="m2 4 6 5 6-5"/>'),
  backspace: g('<path d="M5.5 3H14v10H5.5L1.5 8zM8 6l4 4M12 6l-4 4"/>'),
  callIn: g('<path d="M13 3 6 10M6 5.5V10h4.5"/>'),
  callOut: g('<path d="M5 11 12 4M7.5 4H12v4.5"/>'),
  globeLock: g('<rect x="3.5" y="7" width="9" height="7" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>'),
  warn: g('<path d="M8 1.8 15 14H1zM8 6.5v3.5M8 12v.2"/>'),
  up: g('<path d="M8 13V3M4 7l4-4 4 4"/>'),
};
