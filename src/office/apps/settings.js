import { esc, h, logo, wallpaperUrl, GLYPH } from '../util.js';

const PAGES = [
  ['system', 'System', 'display'],
  ['network', 'Network & internet', 'wifi'],
  ['personalization', 'Personalization', 'brush'],
  ['apps', 'Apps', 'view'],
  ['accounts', 'Accounts', 'user'],
  ['time', 'Time & language', 'sun'],
  ['privacy', 'Privacy & security', 'shield'],
  ['update', 'Mirror Update', 'refresh'],
];
const WALLPAPERS = { mirror: 'Mirror', dusk: 'Aso dusk', savanna: 'Savanna', solid: 'Solid colour' };
const ACCENTS = ['#0067c0', '#5b3fd6', '#c2185b', '#d24f12', '#1f8a4c', '#3f4955'];

export function createSettings(ctx) {
  const { settings: st, world } = ctx;
  let page = 'system';
  let checked = null;

  const el = h(`<div class="set-app"><aside class="set-side">
      <div class="set-user"><span class="avatar">${world.me.name.split(' ').map((w) => w[0]).join('')}</span><div><b>${esc(world.me.name)}</b><small>${esc(world.me.email)}</small></div></div>
      <label class="set-find">${GLYPH.search}<input placeholder="Find a setting" aria-label="Find a setting"></label>
      <nav></nav></aside><main class="set-main"></main></div>`);
  const main = el.querySelector('.set-main');

  const toggle = (key, label, sub = '') =>
    `<div class="set-row"><div><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><label class="switch"><input type="checkbox" data-k="${key}" ${st[key] ? 'checked' : ''}><span></span><em>${st[key] ? 'On' : 'Off'}</em></label></div>`;
  const slider = (key, label, min, max, glyph) =>
    `<div class="set-row"><div><b>${label}</b></div><label class="slider">${GLYPH[glyph]}<input type="range" min="${min}" max="${max}" value="${st[key]}" data-k="${key}"></label></div>`;

  function render() {
    el.querySelector('nav').innerHTML = PAGES.map(([id, label, glyph]) => `<button data-p="${id}" class="${id === page ? 'on' : ''}">${GLYPH[glyph]}<span>${label}</span></button>`).join('');
    const title = PAGES.find((p) => p[0] === page)[1];
    let body = '';
    if (page === 'system') {
      body = `<h3>Display</h3>${slider('brightness', 'Brightness', 30, 100, 'sun')}${toggle('nightLight', 'Night light', 'Use warmer colours to help block blue light')}
        <h3>Sound</h3>${slider('volume', 'Volume', 0, 100, 'volume')}
        <h3>Notifications</h3>${toggle('focus', 'Do not disturb', 'Notifications go straight to the notification centre')}
        <h3>Power &amp; battery</h3>${toggle('batterySaver', 'Battery saver')}
        <h3>About</h3><div class="set-card"><dl>
          <dt>Device name</dt><dd>${esc(world.device)}</dd><dt>Processor</dt><dd>Intel Core i5-1345U 1.60 GHz</dd>
          <dt>Installed RAM</dt><dd>16.0 GB</dd><dt>Edition</dt><dd>Mirror OS 2 Pro</dd><dt>Version</dt><dd>2.4.1 (Build 26100)</dd>
          <dt>Organisation</dt><dd>${esc(world.org.name)}</dd></dl></div>`;
    }
    if (page === 'network') {
      body = `<div class="set-card hero">${GLYPH[st.wifi && !st.airplane ? 'wifi' : 'wifiOff']}<div><b>${st.wifi && !st.airplane ? `${esc(world.wifi)}` : 'Not connected'}</b><small>${st.wifi && !st.airplane ? 'Connected, secured' : 'Wi-Fi is off'}</small></div></div>
        ${toggle('wifi', 'Wi-Fi')}${toggle('airplane', 'Airplane mode', 'Stop all wireless communication')}
        <div class="set-row"><div><b>VPN</b><small>${esc(world.org.short)} Secure Access · connected automatically on the office network</small></div></div>`;
    }
    if (page === 'personalization') {
      body = `<div class="set-preview" style="${ctx.wallpaperCss()}"><div class="mini-bar"></div></div>
        <h3>Background</h3><div class="set-walls">${Object.entries(WALLPAPERS)
          .map(([id, label]) => `<button data-wall="${id}" class="${st.wallpaper === id ? 'on' : ''}" title="${label}" style="${id === 'solid' ? `background:${st.solid}` : `background-image:url(${wallpaperUrl(id)})`}"><span>${label}</span></button>`)
          .join('')}</div>
        <h3>Accent colour</h3><div class="set-accents">${ACCENTS.map((c) => `<button data-accent="${c}" class="${st.accent === c ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
        <h3>Taskbar</h3><div class="set-row"><div><b>Taskbar alignment</b></div><select data-k="taskbarAlign"><option value="center" ${st.taskbarAlign === 'center' ? 'selected' : ''}>Center</option><option value="left" ${st.taskbarAlign === 'left' ? 'selected' : ''}>Left</option></select></div>
        ${toggle('showSearch', 'Search box on the taskbar')}`;
    }
    if (page === 'apps') {
      body = `<h3>Installed apps</h3>${ctx
        .appList()
        .map((a) => `<div class="set-row app">${logo(a.id, 'sm')}<div><b>${esc(a.baseTitle)}</b><small>${esc(a.publisher || 'Mirror Systems')}</small></div><span class="muted">${a.size || '24.0 MB'}</span></div>`)
        .join('')}`;
    }
    if (page === 'accounts') {
      body = `<div class="set-card hero"><span class="avatar big">${world.me.name.split(' ').map((w) => w[0]).join('')}</span><div><b>${esc(world.me.name)}</b><small>${esc(world.me.email)}</small><small>${esc(world.me.role)} · Administrator</small></div></div>
        <h3>Access work or school</h3><div class="set-row"><div><b>Connected to ${esc(world.org.name)}'s directory</b><small>Managed by ${esc(world.org.short)} IT. Some settings are managed by your organisation.</small></div></div>
        <div class="set-row"><div><b>Sign-in options</b><small>PIN (Mirror Hello) · Security key</small></div></div>`;
    }
    if (page === 'time') {
      body = `<div class="set-card hero">${GLYPH.sun}<div><b>${ctx.clock()}</b><small>${ctx.dateLong()}</small></div></div>
        <div class="set-row"><div><b>Time zone</b></div><span class="muted">(UTC+01:00) West Central Africa</span></div>
        <div class="set-row"><div><b>Region</b></div><span class="muted">Nigeria</span></div>
        <div class="set-row"><div><b>Language</b></div><span class="muted">English (Nigeria)</span></div>`;
    }
    if (page === 'privacy') {
      body = `<div class="set-card hero">${GLYPH.shield}<div><b>Mirror Security</b><small>Your device is being protected by ${esc(world.org.short)} IT.</small></div></div>
        <div class="set-row"><div><b>Virus &amp; threat protection</b><small>No actions needed. Last scan today, 08:41</small></div></div>
        <div class="set-row"><div><b>Firewall &amp; network protection</b><small>Domain network · firewall is on</small></div></div>
        <div class="set-row"><div><b>Phishing protection</b><small>Warn me about password reuse and unsafe sign-in pages</small></div><span class="muted">Managed</span></div>`;
    }
    if (page === 'update') {
      body = `<div class="set-card hero">${GLYPH.refresh}<div><b>${checked ? "You're up to date" : 'Updates available soon'}</b><small>Last checked: ${checked ? `today, ${checked}` : 'yesterday, 18:02'}</small></div>
        <button class="btn primary" data-check>Check for updates</button></div>
        <div class="set-row"><div><b>Update history</b><small>2026-10 Cumulative Update for Mirror OS 2 (KB5041921) · Successfully installed</small></div></div>`;
    }
    main.innerHTML = `<h2>${title}</h2>${body}`;
  }

  el.querySelector('nav').addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]')?.dataset.p;
    if (p) (page = p), render();
  });
  el.querySelector('.set-find input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const hit = q && [['brightness', 'system'], ['night', 'system'], ['volume', 'system'], ['wallpaper', 'personalization'], ['background', 'personalization'], ['taskbar', 'personalization'], ['wi-fi', 'network'], ['wifi', 'network'], ['update', 'update'], ['account', 'accounts'], ['time', 'time']].find(([k]) => k.startsWith(q) || q.startsWith(k));
    if (hit) (page = hit[1]), render();
  });
  main.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
    ctx.applySettings();
    if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') render();
  });
  main.addEventListener('click', (e) => {
    const w = e.target.closest('[data-wall]')?.dataset.wall;
    const a = e.target.closest('[data-accent]')?.dataset.accent;
    if (w) st.wallpaper = w;
    if (a) st.accent = a;
    if (w || a) (ctx.applySettings(), render());
    if (e.target.closest('[data-check]')) {
      main.querySelector('.hero b').textContent = 'Checking for updates…';
      setTimeout(() => ((checked = ctx.clock()), render()), 1200);
    }
  });

  return {
    id: 'settings', title: 'Settings', el, size: [820, 560], offsetX: 100,
    onOpen(arg) {
      if (arg === 'display') page = 'system';
      else if (arg === 'taskbar') page = 'personalization';
      else if (arg) page = arg;
      render();
    },
    refresh: () => el.isConnected && render(),
  };
}
