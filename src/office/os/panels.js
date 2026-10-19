import { esc, fmt, h, initials, logo, GLYPH } from '../util.js';

// Taskbar flyouts: Start menu, Quick settings and the notification centre.
export function createPanels(ctx, host) {
  const { settings: st, world, fs } = ctx;
  let open = null; // 'start' | 'quick' | 'notif'
  let view = 'pinned'; // 'pinned' | 'all'

  const start = h(`<div class="flyout start-menu" hidden>
      <label class="sm-search">${GLYPH.search}<input placeholder="Search for apps, settings and documents" aria-label="Search"></label>
      <div class="sm-body"></div>
      <footer class="sm-foot">
        <button class="sm-user" data-user><span class="avatar">${initials(world.me.name)}</span><span>${esc(world.me.name)}</span></button>
        <button class="sm-power" data-power title="Power">${GLYPH.power}</button>
      </footer></div>`);
  const quick = h(`<div class="flyout quick" hidden></div>`);
  const notif = h(`<div class="flyout notif" hidden></div>`);
  host.append(start, quick, notif);
  const search = start.querySelector('input');

  // ---------- Start ----------
  function renderStart() {
    const q = search.value.trim().toLowerCase();
    const body = start.querySelector('.sm-body');
    const apps = ctx.appList();
    if (q) {
      const appHits = apps.filter((a) => a.baseTitle.toLowerCase().includes(q));
      const files = ctx.allFiles().filter((n) => n.name.toLowerCase().includes(q)).slice(0, 6);
      const best = appHits[0] || files[0];
      body.innerHTML = best
        ? `<div class="sm-results"><div class="sm-best"><p class="sm-h">Best match</p>
            <button class="sm-res big" ${appHits[0] ? `data-app="${best.id}"` : `data-node="${best.id}"`}>${logo(appHits[0] ? best.id : fs.icon(best))}<span><b>${esc(appHits[0] ? best.baseTitle : best.name)}</b><small>${appHits[0] ? 'App' : fs.typeName(best)}</small></span></button></div>
            ${appHits.length > 1 ? `<p class="sm-h">Apps</p>${appHits.slice(1).map((a) => `<button class="sm-res" data-app="${a.id}">${logo(a.id, 'sm')}<span>${esc(a.baseTitle)}</span></button>`).join('')}` : ''}
            ${files.length && appHits[0] ? `<p class="sm-h">Documents</p>${files.map((n) => `<button class="sm-res" data-node="${n.id}">${logo(fs.icon(n), 'sm')}<span>${esc(n.name)}</span></button>`).join('')}` : ''}</div>`
        : `<p class="sm-none">No results for "${esc(q)}"</p>`;
      return;
    }
    if (view === 'all') {
      const sorted = [...apps].sort((a, b) => a.baseTitle.localeCompare(b.title));
      let letter = '';
      body.innerHTML = `<div class="sm-head"><b>All apps</b><button class="sm-chip" data-view="pinned">${GLYPH.back} Back</button></div><div class="sm-all">${sorted
        .map((a) => {
          const l = a.baseTitle[0].toUpperCase();
          const head = l !== letter ? `<p class="sm-letter">${(letter = l)}</p>` : '';
          return `${head}<button class="sm-res" data-app="${a.id}">${logo(a.id, 'sm')}<span>${esc(a.baseTitle)}</span></button>`;
        })
        .join('')}</div>`;
      return;
    }
    const recent = ctx.recentFiles().slice(0, 4);
    body.innerHTML = `<div class="sm-head"><b>Pinned</b><button class="sm-chip" data-view="all">All apps ${GLYPH.chevRight}</button></div>
      <div class="sm-grid">${apps.map((a) => `<button data-app="${a.id}">${logo(a.id)}<span>${esc(a.baseTitle)}</span></button>`).join('')}</div>
      <div class="sm-head"><b>Recommended</b></div>
      <div class="sm-rec">${recent.length ? recent.map((n) => `<button data-node="${n.id}">${logo(fs.icon(n), 'sm')}<span><b>${esc(n.name)}</b><small>${ctx.ago(n.modified)}</small></span></button>`).join('') : '<p class="muted">Files you open will show here.</p>'}</div>`;
  }
  search.addEventListener('input', renderStart);
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') start.querySelector('.sm-res')?.click();
    if (e.key === 'Escape') close();
  });
  start.addEventListener('click', (e) => {
    const t = e.target.closest('[data-app],[data-node],[data-view],[data-user],[data-power]');
    if (!t) return;
    if (t.dataset.view) return (view = t.dataset.view), renderStart();
    if (t.dataset.app) return close(), ctx.open(t.dataset.app);
    if (t.dataset.node) return close(), ctx.openNode(fs.get(t.dataset.node));
    const r = t.getBoundingClientRect();
    if ('user' in t.dataset)
      ctx.menu(r.left, r.top - 4, [
        { label: 'Change account settings', glyph: 'user', action: () => (close(), ctx.open('settings', 'accounts')) },
        { label: 'Lock', glyph: 'lock', action: () => (close(), ctx.lock()) },
        { label: 'Sign out (clock out)', glyph: 'signout', action: () => (close(), ctx.clockOut()) },
      ]);
    if ('power' in t.dataset)
      ctx.menu(r.left, r.top - 4, [
        { label: 'Sleep', glyph: 'sleep', action: () => (close(), ctx.lock()) },
        { label: 'Shut down (clock out)', glyph: 'power', action: () => (close(), ctx.clockOut()) },
        { label: 'Restart', glyph: 'restore', action: () => (close(), ctx.restart()) },
      ]);
  });
  start.addEventListener('contextmenu', (e) => {
    const t = e.target.closest('[data-app]');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    const id = t.dataset.app;
    const pinned = st.pinned.includes(id);
    ctx.menu(e.clientX, e.clientY, [
      { label: 'Open', glyph: 'open', action: () => (close(), ctx.open(id)) },
      { label: pinned ? 'Unpin from taskbar' : 'Pin to taskbar', glyph: 'pin', action: () => ctx.pin(id, !pinned) },
    ]);
  });

  // ---------- Quick settings ----------
  const tile = (key, label, glyph, sub = '') =>
    `<button class="qs-tile ${st[key] ? 'on' : ''}" data-k="${key}">${GLYPH[glyph]}<span>${label}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  function renderQuick() {
    const online = st.wifi && !st.airplane;
    quick.innerHTML = `<div class="qs-grid">
        ${tile('wifi', 'Wi-Fi', st.wifi ? 'wifi' : 'wifiOff', online ? world.wifi : 'Off')}
        ${tile('bluetooth', 'Bluetooth', 'bt', st.bluetooth ? 'On' : 'Off')}
        ${tile('airplane', 'Airplane mode', 'plane')}
        ${tile('batterySaver', 'Battery saver', 'leaf')}
        ${tile('focus', 'Do not disturb', 'focus')}
        ${tile('nightLight', 'Night light', 'moon')}
      </div>
      <label class="qs-slider">${GLYPH.sun}<input type="range" min="30" max="100" value="${st.brightness}" data-k="brightness" aria-label="Brightness"></label>
      <label class="qs-slider">${GLYPH.volume}<input type="range" min="0" max="100" value="${st.volume}" data-k="volume" aria-label="Volume"></label>
      <div class="qs-speed"><span>Shift speed</span>${[1, 2, 4].map((v, i) => `<button data-speed="${i}" class="${st.speed === i ? 'on' : ''}">${v}×</button>`).join('')}</div>
      <footer class="qs-foot"><span>${GLYPH.battery} ${Math.round(ctx.battery())}%</span><button data-open="settings" title="All settings">${GLYPH.gear}</button></footer>`;
  }
  quick.addEventListener('click', (e) => {
    const t = e.target.closest('[data-k],[data-speed],[data-open]');
    if (!t) return;
    if (t.dataset.speed) st.speed = +t.dataset.speed;
    else if (t.dataset.open) return close(), ctx.open('settings', 'system');
    else if (t.tagName === 'BUTTON') st[t.dataset.k] = !st[t.dataset.k];
    ctx.applySettings();
    renderQuick();
  });
  quick.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (k) (st[k] = +e.target.value), ctx.applySettings();
  });

  // ---------- Notification centre + calendar ----------
  function renderNotif() {
    const list = ctx.notifications();
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const pad = (first.getDay() + 6) % 7; // weeks start on Monday
    notif.innerHTML = `<section class="nc-list"><header><b>Notifications</b>${list.length ? '<button data-clear>Clear all</button>' : ''}</header>
        ${list.length ? list.map((n, i) => `<button class="nc-item" data-n="${i}"><div class="nc-app">${logo(n.app, 'xs')}<span>${esc(ctx.apps[n.app].baseTitle)}</span><time>${fmt(n.at)}</time></div><b>${esc(n.title)}</b><p>${esc(n.text)}</p></button>`).join('') : '<p class="nc-empty">No new notifications</p>'}</section>
      <section class="nc-cal"><header><b>${ctx.dateLong().replace(/ \d{4}$/, '')}</b></header>
        <div class="cal-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => `<i>${w}</i>`).join('')}${'<span></span>'.repeat(pad)}${Array.from({ length: days }, (_, i) => `<span class="${i + 1 === d.getDate() ? 'today' : ''}">${i + 1}</span>`).join('')}</div></section>`;
  }
  notif.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) return ctx.clearNotifications(), renderNotif(), ctx.badges();
    const i = e.target.closest('[data-n]')?.dataset.n;
    if (i === undefined) return;
    const n = ctx.notifications()[+i];
    ctx.dismissNotification(n);
    close();
    n.onClick ? n.onClick() : ctx.open(n.app);
  });

  // ---------- open / close ----------
  const panes = { start, quick, notif };
  const renders = { start: renderStart, quick: renderQuick, notif: renderNotif };
  function toggle(which, opts = {}) {
    if (open === which && !opts.focusSearch) return close();
    close();
    open = which;
    if (which === 'start') {
      view = 'pinned';
      search.value = '';
    }
    renders[which]();
    panes[which].hidden = false;
    if (which === 'notif') host.closest('.mos').querySelector('.toasts').replaceChildren(); // opening the centre dismisses banners
    ctx.badges();
    if (which === 'start') setTimeout(() => search.focus(), opts.focusSearch ? 0 : 60);
  }
  function close() {
    if (!open) return;
    panes[open].hidden = true;
    open = null;
    ctx.badges();
  }
  host.closest('.mos').addEventListener('pointerdown', (e) => {
    if (open && !e.target.closest('.flyout, .tb-start, .tb-search, .tb-quick, .tb-clock, .ctx-layer')) close();
  });

  return { toggle, close, isOpen: (w) => open === w, refresh: () => open && renders[open]() };
}
