import { buildWorld, SHIFT_START, SHIFT_END } from './world.js';
import { esc, fmt, h, initials, logo, logoUrl, wallpaperUrl, GLYPH } from './util.js';
import { openMenu, closeMenu } from './os/menu.js';
import { createFs } from './os/fs.js';
import { seedFiles } from './os/files.js';
import { createDesktop } from './os/desktop.js';
import { createPanels } from './os/panels.js';
import { createMail } from './apps/mail.js';
import { createChat } from './apps/chat.js';
import { createPhone } from './apps/phone.js';
import { createHelpdesk } from './apps/helpdesk.js';
import { createBrowser } from './apps/browser.js';
import { createExplorer } from './apps/explorer.js';
import { createNotepad } from './apps/notepad.js';
import { createTerminal } from './apps/terminal.js';
import { createSettings } from './apps/settings.js';
import { createTaskmgr } from './apps/taskmgr.js';
import { buildReport } from './debrief.js';
import './office.css';

const MIN_PER_SEC = 1.25; // game minutes per real second at 1× (a shift takes about 6.5 minutes)
const SPEEDS = [1, 2, 4];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Opens a laptop over the city running Mirror OS for one shift at `org`.
// Resolves with a 0-100 score when the player shuts it down.
export function startShift(org) {
  const world = buildWorld(org);
  world.device = `${org.short.toUpperCase()}-LT-0412`;
  world.wifi = `${org.short}-Staff`;
  const today = new Date();

  const s = {
    now: SHIFT_START,
    delivered: new Set(), // threat ids and mail ids that have arrived
    verified: new Map(), // threat -> how
    reported: new Set(),
    compromised: new Map(), // threat -> { how, at, contained }
    replied: new Set(),
    clicked: new Set(),
    calledAttacker: new Set(),
    asked: new Set(),
    done: new Set(),
    falseAlarms: [],
    log: [], // { at, text, threat? }
  };

  const settings = {
    wallpaper: 'mirror', solid: '#1f3b5a', accent: '#0067c0', taskbarAlign: 'center', showSearch: true,
    brightness: 100, nightLight: false, volume: 60, wifi: true, bluetooth: true, airplane: false, focus: false, batterySaver: false,
    iconSize: 'medium', autoArrange: false, showIcons: true, sortBy: 'name', speed: 0,
    pinned: ['explorer', 'browser', 'mail', 'chat', 'phone', 'helpdesk'],
  };

  // ---------- the laptop ----------
  const stage = h(`
    <div class="laptop-stage">
      <button class="lid-close" title="Close the laptop">Close laptop</button>
      <div class="laptop">
        <div class="lid"><span class="cam"></span>
          <div class="screen"><div class="mos" style="--accent:${settings.accent}">
            <div class="wall"></div>
            <div class="desk"></div>
            <div class="windows"></div>
            <div class="toasts" aria-live="polite"></div>
            <div class="flyouts"></div>
            <nav class="taskbar">
              <div class="tb-apps">
                <button class="tb-start" title="Start">${logo('mirror')}</button>
                <button class="tb-search">${GLYPH.search}<span>Search</span></button>
                <div class="tb-items"></div>
              </div>
              <div class="tb-tray">
                <button class="tb-lang" title="Input language">ENG<small>UK</small></button>
                <button class="tb-quick" title="Quick settings"></button>
                <button class="tb-clock" title="Notifications"><span><b></b><small></small></span><i hidden></i></button>
                <button class="tb-peek" title="Show desktop"></button>
              </div>
            </nav>
            <div class="filter night"></div><div class="filter dim"></div>
            <div class="overlay"></div>
          </div></div>
        </div>
        <div class="deck"><span></span></div>
      </div>
    </div>`);
  document.body.appendChild(stage);
  const mos = stage.querySelector('.mos');
  const $ = (sel) => mos.querySelector(sel);

  // ---------- scheduler (game time) ----------
  const queue = [];
  const at = (min, fn) => {
    queue.push({ at: min, fn });
    queue.sort((a, b) => a.at - b.at);
  };
  const after = (min, fn) => at(s.now + min, fn);

  // ---------- dates ----------
  const dayDate = (min) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.floor(min / 1440));
  const stamp = (min) => {
    const dt = dayDate(min);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} ${fmt(((min % 1440) + 1440) % 1440)}`;
  };
  const dateLong = () => today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const ago = (min) => {
    const diff = s.now - min;
    if (diff < 2) return 'Just now';
    if (diff < 60) return `${Math.floor(diff)} min ago`;
    if (min >= 0) return `Today, ${fmt(min)}`;
    if (min >= -1440) return 'Yesterday';
    return stamp(min).split(' ')[0];
  };

  // ---------- context shared with every app ----------
  const apps = {};
  const items = []; // everything received, for the Helpdesk "related item" picker
  const notifs = [];
  let clip = null; // { nodes, mode }

  const ctx = {
    org, world, s, apps, settings,
    after,
    now: () => s.now,
    clock: () => fmt(s.now),
    stamp, dateLong, ago,
    open: (id, arg) => openApp(id, arg),
    close: (id, force) => closeApp(id, force),
    setTitle(id, title) {
      if (!apps[id]) return;
      apps[id].title = title;
      const w = wins.get(id);
      if (w) w.el.querySelector('.win-title').textContent = title;
      renderTaskbar();
    },
    running: () => [...wins.entries()].filter(([, w]) => w.state !== 'closed').map(([id]) => id),
    isOpen: (id) => wins.get(id)?.state === 'open',
    notify,
    notifications: () => notifs,
    clearNotifications: () => (notifs.length = 0),
    dismissNotification: (n) => notifs.splice(notifs.indexOf(n), 1),
    badges: () => renderTaskbar(),
    track: (item) => items.some((x) => x.key === item.key) || items.unshift(item),
    items: () => items,
    menu: (x, y, list, opts) => openMenu(mos, x, y, list, opts),
    dialog,
    properties,
    itemMenu,
    openNode,
    pin(id, on) {
      settings.pinned = on ? [...settings.pinned, id] : settings.pinned.filter((p) => p !== id);
      renderTaskbar();
    },
    appList: () => Object.values(apps).filter((a) => !a.hidden),
    allFiles: () => ['desktop', 'documents', 'downloads'].flatMap(function walk(id) {
      return fs.children(id).flatMap((n) => (n.type === 'folder' ? walk(n.id) : n.type === 'app' || n.type === 'recycle' ? [] : [n]));
    }),
    recentFiles: () => ctx.allFiles().sort((a, b) => b.modified - a.modified).slice(0, 6),
    download(name, href) {
      const existing = fs.children('downloads').find((n) => n.name === name);
      return existing || fs.add('downloads', { type: name.split('.').pop(), name, href, size: '84 KB' });
    },
    battery: () => Math.max(9, 87 - (s.now - SHIFT_START) / (settings.batterySaver ? 16 : 11)),
    wallpaperCss: () => (settings.wallpaper === 'solid' ? `background:${settings.solid}` : `background-image:url(${wallpaperUrl(settings.wallpaper)})`),
    applySettings,
    lock: () => lockScreen(),
    restart: () => restart(),
    clockOut: () => askClockOut(),
    clipboard: {
      has: () => !!clip?.nodes.some((n) => fs.get(n.id)),
      set: (nodes, mode) => (clip = { nodes: [...nodes], mode }),
      paste(folder, asShortcut = false) {
        if (!ctx.clipboard.has()) return;
        for (const n of clip.nodes) {
          if (asShortcut) fs.add(folder, n.type === 'app' ? { ...n, id: undefined, parent: folder } : { type: n.type, name: `${n.name.replace(/\.\w+$/, '')} - Shortcut`, target: n.id, shortcut: true });
          else if (clip.mode === 'cut') (n.parent = folder), fs.touch(n);
          else copyNode(n, folder);
        }
        if (clip.mode === 'cut') clip = null;
      },
    },
    // ----- shift scoring hooks -----
    log(text, threat) {
      s.log.push({ at: s.now, text, threat });
    },
    deliver(id) {
      s.delivered.add(id);
    },
    verify(threat, how) {
      if (!s.verified.has(threat)) s.verified.set(threat, how);
      ctx.log(`Checked it with ${how}`, threat);
    },
    report(threat, how) {
      if (s.reported.has(threat)) return;
      s.reported.add(threat);
      ctx.log(`Reported it via ${how}`, threat);
    },
    falseAlarm(label) {
      s.falseAlarms.push(label);
      ctx.log(`Reported a genuine message as suspicious: ${label}`);
    },
    compromise(threat, how) {
      if (s.compromised.has(threat)) return;
      s.compromised.set(threat, { how, at: s.now, contained: false });
      ctx.log(how, threat);
      if (s.compromised.size === 1) after(12, () => apps.mail.receive({ ...world.securityAlert, at: s.now }));
    },
    contain(how) {
      for (const [threat, c] of s.compromised)
        if (!c.contained) {
          c.contained = true;
          ctx.log(`Told IT straight away (${how}). Account reset and Security alerted`, threat);
        }
    },
    complete(task) {
      if (s.done.has(task)) return;
      s.done.add(task);
      ctx.log(`Done: ${world.tasks[task]}`);
    },
    // A question asked of a contact by phone or chat. Applies its effects once.
    applyTopic(topic, who, channel) {
      const how = `${world.people[who].name} (${channel})`;
      if (topic.verify) ctx.verify(topic.verify, how);
      if (topic.report) ctx.report(topic.report, how);
      if (topic.contain) ctx.contain(how);
      if (topic.attacker && !s.calledAttacker.has(topic.attacker)) {
        s.calledAttacker.add(topic.attacker);
        ctx.log(`Called the number given in the email. The attacker answered and "confirmed" it`, topic.attacker);
      }
    },
    topicsFor(who) {
      return (world.topics[who] || []).map((tp, i) => ({ ...tp, key: `${who}:${i}` })).filter((tp) => !s.asked.has(tp.key) && (!tp.when || tp.when(s)));
    },
  };

  const fs = createFs({ user: world.me.email.split('@')[0], now: () => s.now });
  ctx.fs = fs;

  apps.explorer = createExplorer(ctx);
  apps.browser = createBrowser(ctx);
  apps.mail = createMail(ctx);
  apps.chat = createChat(ctx);
  apps.phone = createPhone(ctx);
  apps.helpdesk = createHelpdesk(ctx);
  apps.notepad = createNotepad(ctx);
  apps.terminal = createTerminal(ctx);
  apps.settings = createSettings(ctx);
  apps.taskmgr = createTaskmgr(ctx);
  for (const a of Object.values(apps)) a.baseTitle = a.name || a.title;
  const { briefing } = seedFiles(fs, world, ctx);

  let panels = null;
  let desktop = null;

  // ---------- windows ----------
  const wins = new Map(); // id -> { el, state: 'open'|'min'|'closed' }
  let zTop = 10;
  let cascade = 0;

  function openApp(id, arg) {
    const app = apps[id];
    if (!app) return;
    let w = wins.get(id);
    if (!w) {
      const el = h(`
        <section class="win" role="dialog" aria-label="${esc(app.title)}">
          <header class="win-bar">
            <span class="win-logo">${logo(id, 'xs')}</span><span class="win-title">${esc(app.title)}</span>
            <button data-w="min" aria-label="Minimise"><svg viewBox="0 0 10 10"><path d="M1 5h8"/></svg></button>
            <button data-w="max" aria-label="Maximise"><svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7"/></svg></button>
            <button data-w="close" aria-label="Close" class="x"><svg viewBox="0 0 10 10"><path d="m1.5 1.5 7 7M8.5 1.5l-7 7"/></svg></button>
          </header>
          <div class="win-body app-${id}"></div>
        </section>`);
      el.querySelector('.win-body').appendChild(app.el);
      el.addEventListener('pointerdown', () => focus(id));
      el.querySelector('[data-w=min]').addEventListener('click', (e) => (e.stopPropagation(), minimise(id)));
      el.querySelector('[data-w=close]').addEventListener('click', (e) => (e.stopPropagation(), closeApp(id)));
      el.querySelector('[data-w=max]').addEventListener('click', () => el.classList.toggle('max'));
      el.querySelector('.win-bar').addEventListener('dblclick', (e) => !e.target.closest('button') && el.classList.toggle('max'));
      el.querySelector('.win-bar').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const max = el.classList.contains('max');
        ctx.menu(e.clientX, e.clientY, [
          { label: 'Restore', disabled: !max, action: () => el.classList.remove('max') },
          { label: 'Minimise', action: () => minimise(id) },
          { label: 'Maximise', disabled: max, action: () => el.classList.add('max') },
          '-',
          { label: 'Close', shortcut: 'Alt+F4', action: () => closeApp(id) },
        ], { classic: true });
      });
      drag(el);
      $('.windows').appendChild(el);
      w = { el, state: 'closed' };
      wins.set(id, w);
    }
    if (w.state === 'closed') place(w.el, app);
    w.state = 'open';
    w.el.hidden = false;
    w.el.classList.remove('minimising');
    focus(id);
    app.onOpen?.(arg);
    renderTaskbar();
  }
  function place(el, app) {
    const area = $('.windows').getBoundingClientRect();
    const [ww, wh] = app.size || [760, 520];
    const width = Math.min(ww, area.width - 16), height = Math.min(wh, area.height - 16);
    const x = Math.max(8, Math.min(area.width - width - 8, 40 + cascade * 30 + (app.offsetX || 0) * 0.6));
    const y = Math.max(8, Math.min(area.height - height - 8, 20 + cascade * 26));
    cascade = (cascade + 1) % 6;
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
    if (app.maximised) el.classList.add('max');
  }
  function minimise(id) {
    const w = wins.get(id);
    w.state = 'min';
    w.el.hidden = true;
    w.el.classList.remove('active');
    renderTaskbar();
  }
  async function closeApp(id, force = false) {
    const w = wins.get(id);
    if (!w || w.state === 'closed') return;
    if (!force && apps[id].beforeClose && !(await apps[id].beforeClose())) return;
    w.state = 'closed';
    w.el.hidden = true;
    w.el.classList.remove('active', 'max');
    renderTaskbar();
  }
  function focus(id) {
    const w = wins.get(id);
    w.el.style.zIndex = ++zTop;
    wins.forEach((x) => x.el.classList.toggle('active', x === w));
    renderTaskbar();
  }
  function drag(w) {
    const bar = w.querySelector('.win-bar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const area = $('.windows').getBoundingClientRect();
      let max = w.classList.contains('max');
      let ox = e.clientX - area.left - w.offsetLeft, oy = e.clientY - area.top - w.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (max) {
          // Dragging a maximised window restores it under the pointer.
          w.classList.remove('max');
          max = false;
          ox = w.offsetWidth / 2;
          oy = 16;
        }
        w.style.left = `${Math.max(-w.offsetWidth + 100, Math.min(area.width - 100, ev.clientX - area.left - ox))}px`;
        w.style.top = `${Math.max(0, Math.min(area.height - 36, ev.clientY - area.top - oy))}px`;
      };
      const up = (ev) => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        if (ev.clientY - area.top <= 2) w.classList.add('max'); // drag to the top edge to maximise
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
  }

  // ---------- taskbar ----------
  // Only touch the DOM when the markup changes, so a click is never cut short by a re-render.
  const setHtml = (el, html) => el._html !== html && (el.innerHTML = el._html = html);
  function renderTaskbar() {
    const running = ctx.running();
    const ids = [...settings.pinned, ...running.filter((id) => !settings.pinned.includes(id))];
    setHtml($('.tb-items'), ids
      .map((id) => {
        const w = wins.get(id);
        const state = !w || w.state === 'closed' ? '' : w.state === 'open' && w.el.classList.contains('active') ? 'active' : 'open';
        const n = apps[id].unread?.() || 0;
        return `<button data-app="${id}" class="${state}" title="${esc(apps[id].title)}">${logo(id)}${n ? `<i>${n > 9 ? '9+' : n}</i>` : ''}</button>`;
      })
      .join(''));
    $('.taskbar').classList.toggle('left', settings.taskbarAlign === 'left');
    $('.tb-search').hidden = !settings.showSearch;
    const online = settings.wifi && !settings.airplane;
    setHtml($('.tb-quick'), `${GLYPH[online ? 'wifi' : 'wifiOff']}${settings.volume > 0 ? GLYPH.volume : ''}${GLYPH.battery}`);
    $('.tb-clock b').textContent = fmt(s.now);
    $('.tb-clock small').textContent = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const badge = $('.tb-clock i');
    badge.hidden = !notifs.length;
    badge.textContent = notifs.length;
    $('.tb-start').classList.toggle('on', panels?.isOpen('start'));
  }
  $('.tb-items').addEventListener('click', (e) => {
    const id = e.target.closest('[data-app]')?.dataset.app;
    if (!id) return;
    const w = wins.get(id);
    if (w?.state === 'open' && w.el.classList.contains('active')) minimise(id);
    else openApp(id);
  });
  $('.taskbar').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.target.closest('[data-app]')?.dataset.app;
    if (!id) {
      return ctx.menu(e.clientX, e.clientY, [
        { label: 'Task Manager', glyph: 'task', action: () => openApp('taskmgr') },
        '-',
        { label: 'Taskbar settings', glyph: 'gear', action: () => openApp('settings', 'taskbar') },
      ]);
    }
    const pinned = settings.pinned.includes(id);
    const running = wins.get(id) && wins.get(id).state !== 'closed';
    ctx.menu(e.clientX, e.clientY, [
      { label: apps[id].baseTitle, glyph: 'open', action: () => openApp(id) },
      { label: pinned ? 'Unpin from taskbar' : 'Pin to taskbar', glyph: 'pin', action: () => ctx.pin(id, !pinned) },
      ...(running ? ['-', { label: 'Close window', glyph: 'close', action: () => closeApp(id) }] : []),
    ]);
  });
  $('.tb-peek').addEventListener('click', () => {
    const open = ctx.running().filter((id) => wins.get(id).state === 'open');
    if (open.length) open.forEach(minimise);
  });

  panels = createPanels(ctx, $('.flyouts'));
  $('.tb-start').addEventListener('click', () => panels.toggle('start'));
  $('.tb-search').addEventListener('click', () => panels.toggle('start', { focusSearch: true }));
  $('.tb-quick').addEventListener('click', () => panels.toggle('quick'));
  $('.tb-clock').addEventListener('click', () => panels.toggle('notif'));
  $('.tb-lang').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    ctx.menu(r.left, r.top - 6, [{ label: 'English (United Kingdom) · UK keyboard', radio: true }, '-', { label: 'More keyboard settings', action: () => openApp('settings', 'time') }]);
  });

  // ---------- desktop ----------
  desktop = createDesktop(ctx, $('.desk'));

  // Right-click anywhere else: text fields get Cut/Copy/Paste; the browser's own menu never shows.
  mos.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const field = e.target.closest('input:not([type=range]):not([type=checkbox]), textarea');
    if (!field) return;
    const hasSel = field.selectionStart !== field.selectionEnd;
    const ro = field.readOnly;
    const run = (cmd) => () => (field.focus(), document.execCommand(cmd));
    ctx.menu(e.clientX, e.clientY, [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: ro, action: run('undo') },
      '-',
      { label: 'Cut', shortcut: 'Ctrl+X', disabled: ro || !hasSel, action: run('cut') },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: !hasSel, action: run('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: ro, action: () => navigator.clipboard?.readText().then((t) => (field.focus(), field.setRangeText(t, field.selectionStart, field.selectionEnd, 'end'), field.dispatchEvent(new Event('input', { bubbles: true })))).catch(() => {}) },
      { label: 'Delete', disabled: ro || !hasSel, action: run('delete') },
      '-',
      { label: 'Select all', shortcut: 'Ctrl+A', action: () => (field.focus(), field.select()) },
    ], { classic: true });
  });

  // ---------- files ----------
  function openNode(n) {
    if (!n) return;
    if (n.target) {
      const t = fs.get(n.target);
      if (!t || t.parent === 'recycle') return dialog({ title: 'Problem with Shortcut', body: `<p>The item '${esc(n.name)}' that this shortcut refers to has been changed or moved.</p>`, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
      return openNode(t);
    }
    if (n.type === 'recycle') return openApp('explorer', 'recycle');
    if (n.type === 'folder') return openApp('explorer', n.id);
    if (n.type === 'app') return openApp(n.app);
    if (n.type === 'txt' || n.type === 'csv') return openApp('notepad', n);
    if (n.type === 'pdf') return openApp('browser', n.href || 'file://missing.pdf');
    if (n.type === 'zip') return dialog({ title: n.name, body: '<p>This folder is empty.</p>', buttons: [{ label: 'OK', value: 'ok', primary: true }] });
  }

  function copyNode(n, folder) {
    const base = n.name.replace(/(\.\w+)$/, '');
    const ext = n.type === 'folder' || n.type === 'app' ? '' : (n.name.match(/\.\w+$/) || [''])[0];
    const same = fs.children(folder).some((c) => c.name === n.name);
    const copy = fs.add(folder, { ...n, from: undefined, name: same ? `${base} - Copy${ext}` : n.name, modified: s.now });
    if (n.type === 'folder') fs.children(n.id).forEach((c) => copyNode(c, copy.id));
    return copy;
  }

  // The right-click menu for files, folders and shortcuts (desktop and File Explorer).
  function itemMenu(x, y, nodes, { rename }) {
    const n = nodes[0];
    if (n.type === 'recycle') {
      return ctx.menu(x, y, [
        { label: 'Open', glyph: 'open', shortcut: 'Enter', action: () => openNode(n) },
        { label: 'Empty Recycle Bin', glyph: 'delete', disabled: !fs.children('recycle').length, action: () => (openApp('explorer', 'recycle'), apps.explorer.el.querySelector('[data-cmd=empty]')?.click()) },
        '-',
        { label: 'Properties', glyph: 'props', shortcut: 'Alt+Enter', action: () => properties(n) },
      ]);
    }
    const one = nodes.length === 1;
    const isApp = n.type === 'app';
    const textLike = n.type === 'txt' || n.type === 'csv';
    const zip = () => {
      const z = fs.add(n.parent, { type: 'zip', name: `${one ? n.name.replace(/\.\w+$/, '') : 'Archive'}.zip`, size: '1 KB' });
      rename?.(z);
    };
    const copyPath = () => navigator.clipboard?.writeText(nodes.map((m) => `"${fs.path(m)}"`).join('\n')).catch(() => {});
    const pinItems = isApp ? [{ label: settings.pinned.includes(n.app) ? 'Unpin from taskbar' : 'Pin to taskbar', glyph: 'pin', action: () => ctx.pin(n.app, !settings.pinned.includes(n.app)) }] : [];
    const classic = () =>
      ctx.menu(x, y, [
        { label: 'Open', action: () => nodes.forEach(openNode) },
        ...(textLike ? [{ label: 'Edit', action: () => openNode(n) }, { label: 'Open with', sub: [{ label: 'Notepad', action: () => openNode(n) }] }] : []),
        ...(isApp ? [{ label: 'Open file location', action: () => openApp('explorer', 'desktop') }] : []),
        ...pinItems,
        '-',
        { label: 'Send to', sub: [{ label: 'Compressed (zipped) folder', action: zip }, { label: 'Desktop (create shortcut)', action: () => (ctx.clipboard.set(nodes, 'copy'), ctx.clipboard.paste('desktop', true)) }, { label: 'Documents', action: () => nodes.forEach((m) => copyNode(m, 'documents')) }] },
        '-',
        { label: 'Cut', action: () => ctx.clipboard.set(nodes, 'cut') },
        { label: 'Copy', action: () => ctx.clipboard.set(nodes, 'copy') },
        '-',
        { label: 'Create shortcut', action: () => (ctx.clipboard.set(nodes, 'copy'), ctx.clipboard.paste(n.parent, true)) },
        { label: 'Delete', action: () => fs.remove(nodes) },
        { label: 'Rename', disabled: !one, action: () => rename?.(n) },
        '-',
        { label: 'Properties', action: () => properties(n) },
      ], { classic: true });
    ctx.menu(x, y, [
      { row: [
        { glyph: 'cut', title: 'Cut (Ctrl+X)', action: () => ctx.clipboard.set(nodes, 'cut') },
        { glyph: 'copy', title: 'Copy (Ctrl+C)', action: () => ctx.clipboard.set(nodes, 'copy') },
        { glyph: 'rename', title: 'Rename (F2)', disabled: !one, action: () => rename?.(n) },
        { glyph: 'delete', title: 'Delete (Delete)', action: () => fs.remove(nodes) },
      ] },
      { label: 'Open', glyph: 'open', shortcut: 'Enter', action: () => nodes.forEach(openNode) },
      ...(textLike ? [{ label: 'Open with', glyph: 'view', sub: [{ label: 'Notepad', action: () => openNode(n) }, '-', { label: 'Choose another app', disabled: true }] }] : []),
      ...(n.type === 'folder' ? [{ label: 'Open in Terminal', glyph: 'terminal', action: () => openApp('terminal', { cwd: n.id }) }] : []),
      ...pinItems,
      ...(isApp ? [] : [{ label: 'Compress to ZIP file', glyph: 'zip', action: zip }]),
      { label: 'Copy as path', glyph: 'path', shortcut: 'Ctrl+Shift+C', action: copyPath },
      { label: 'Properties', glyph: 'props', shortcut: 'Alt+Enter', action: () => properties(n) },
      '-',
      { label: 'Show more options', glyph: 'more', action: classic },
    ]);
  }

  function properties(n) {
    const isApp = n.type === 'app';
    const rows = isApp
      ? [['Target type', 'Application'], ['Target', `C:\\Program Files\\Mirror\\${apps[n.app].baseTitle}\\${n.app}.exe`], ['Start in', fs.home]]
      : [['Type of file', fs.typeName(n)], ['Location', n.root ? fs.home : fs.path(fs.get(n.parent))], ['Size', fs.size(n) || (n.type === 'folder' ? `${fs.children(n.id).length} items` : '0 bytes')], ['Created', stamp(n.created ?? n.modified)], ['Modified', stamp(n.modified)]];
    dialog({
      title: `${n.name} Properties`,
      body: `<div class="props-head">${logo(fs.icon(n))}<b>${esc(n.name)}</b></div><dl class="props">${rows.map(([k, v]) => `<dt>${k}:</dt><dd>${esc(v)}</dd>`).join('')}</dl>`,
      buttons: [{ label: 'OK', value: 'ok', primary: true }, { label: 'Cancel', value: 'cancel' }],
    });
  }

  // ---------- dialogs ----------
  function dialog({ title, body, buttons }) {
    return new Promise((resolve) => {
      const el = h(`<div class="dlg-layer"><form class="dlg" role="alertdialog" aria-label="${esc(title)}">
          <header><span>${esc(title)}</span><button type="button" data-v="cancel" aria-label="Close"><svg viewBox="0 0 10 10"><path d="m1.5 1.5 7 7M8.5 1.5l-7 7"/></svg></button></header>
          <div class="dlg-body">${body}</div>
          <footer>${buttons.map((b) => `<button type="${b.primary ? 'submit' : 'button'}" class="btn ${b.primary ? 'primary' : ''}" data-v="${b.value}">${esc(b.label)}</button>`).join('')}</footer></form></div>`);
      mos.appendChild(el);
      const form = el.querySelector('form');
      const done = (value) => {
        el.remove();
        resolve({ value, form: new FormData(form) });
      };
      form.addEventListener('submit', (e) => (e.preventDefault(), done(buttons.find((b) => b.primary)?.value ?? 'ok')));
      form.addEventListener('click', (e) => {
        const b = e.target.closest('button[type=button][data-v]');
        if (b) done(b.dataset.v);
      });
      form.addEventListener('keydown', (e) => e.key === 'Escape' && (e.stopPropagation(), done('cancel')));
      (form.querySelector('input, select') || form.querySelector('.btn.primary'))?.focus();
    });
  }

  // ---------- notifications ----------
  function notify({ app, title, text, onClick }) {
    const n = { app, title, text, onClick, at: s.now };
    notifs.unshift(n);
    if (notifs.length > 30) notifs.pop();
    renderTaskbar();
    panels.refresh();
    if (settings.focus || !booted) return;
    const t = h(`<div class="toast" role="status"><header>${logo(app, 'xs')}<span>${esc(apps[app].baseTitle)}</span><button aria-label="Dismiss"><svg viewBox="0 0 10 10"><path d="m1.5 1.5 7 7M8.5 1.5l-7 7"/></svg></button></header>
      <button class="toast-body"><b>${esc(title)}</b><span>${esc(text)}</span></button></div>`);
    t.querySelector('header button').addEventListener('click', () => t.remove());
    t.querySelector('.toast-body').addEventListener('click', () => {
      t.remove();
      ctx.dismissNotification(n);
      onClick ? onClick() : openApp(app);
      renderTaskbar();
    });
    const stack = $('.toasts');
    stack.appendChild(t);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    setTimeout(() => t.classList.add('out'), 5500);
    setTimeout(() => t.remove(), 6000);
  }

  // ---------- settings ----------
  function applySettings() {
    $('.wall').setAttribute('style', ctx.wallpaperCss());
    mos.style.setProperty('--accent', settings.accent);
    $('.dim').style.opacity = String((1 - settings.brightness / 100) * 0.75);
    $('.night').style.opacity = settings.nightLight ? '1' : '0';
    desktop?.render();
    renderTaskbar();
    apps.settings.refresh?.();
  }

  // ---------- the day's events ----------
  for (const ev of world.timeline)
    at(ev.at, () => {
      if (ev.threat) ctx.deliver(ev.threat);
      if (ev.type === 'mail') apps.mail.receive(ev.mail);
      if (ev.type === 'chat') apps.chat.receive(ev);
      if (ev.type === 'sms') apps.phone.sms(ev);
      if (ev.type === 'call') apps.phone.ring(ev);
      if (ev.type === 'ticket') apps.helpdesk.update(ev);
    });

  // ---------- clock loop ----------
  let paused = true;
  let booted = false;
  let finished = false;
  let last = performance.now();
  let raf = 0;
  let resolveShift;
  function tick(nowMs) {
    const dt = Math.min((nowMs - last) / 1000, 0.25);
    last = nowMs;
    if (!paused) {
      const prevMin = Math.floor(s.now);
      s.now = Math.min(SHIFT_END, s.now + dt * MIN_PER_SEC * SPEEDS[settings.speed]);
      while (queue.length && queue[0].at <= s.now) queue.shift().fn();
      if (Math.floor(s.now) !== prevMin) renderTaskbar();
      apps.phone.tick?.();
      if (s.now >= SHIFT_END) endOfDay();
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // ---------- boot, lock, sign-in ----------
  const overlay = $('.overlay');
  function bootScreen(text = '') {
    overlay.className = 'overlay boot';
    overlay.innerHTML = `<img src="${logoUrl('mirror')}" alt=""><div class="spinner"><i></i><i></i><i></i><i></i><i></i></div>${text ? `<p>${esc(text)}</p>` : ''}`;
  }
  function lockScreen() {
    paused = true;
    closeMenu();
    panels.close();
    overlay.className = 'overlay lock';
    overlay.setAttribute('style', ctx.wallpaperCss());
    overlay.innerHTML = `<div class="lock-time"><b>${fmt(s.now)}</b><span>${dateLong().replace(/ \d{4}$/, '')}</span></div>
      <div class="lock-sign" hidden>
        <span class="avatar huge">${initials(world.me.name)}</span><b>${esc(world.me.name)}</b>
        <form class="pin"><input type="password" inputmode="numeric" placeholder="PIN" aria-label="PIN" autocomplete="off" maxlength="8"><button aria-label="Sign in">${GLYPH.chevRight}</button></form>
        <small class="pin-msg">${esc(org.short)} work account · ${esc(world.me.email)}</small>
        <button type="button" class="link">I forgot my PIN</button>
      </div>
      <div class="lock-tray">${GLYPH.wifi}${GLYPH.battery}</div>`;
    const sign = overlay.querySelector('.lock-sign');
    const reveal = () => {
      if (!sign.hidden) return;
      overlay.classList.add('up');
      sign.hidden = false;
      setTimeout(() => sign.querySelector('input').focus(), 50);
    };
    overlay.onclick = (e) => {
      if (!e.target.closest('.lock-sign')) reveal();
    };
    overlay.onkeydown = () => {
      if (sign.hidden) reveal();
    };
    overlay.tabIndex = 0;
    setTimeout(() => overlay.focus());
    sign.querySelector('.link').onclick = () => (sign.querySelector('.pin-msg').textContent = `Ask the IT Service Desk (ext. 4357) to reset it. For this shift, any 4-digit PIN works.`);
    sign.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const pin = sign.querySelector('input').value;
      if (!/^\d{4,8}$/.test(pin)) {
        sign.querySelector('.pin-msg').textContent = 'The PIN is incorrect. Enter at least 4 digits.';
        const form = sign.querySelector('form');
        form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 400);
        return;
      }
      sign.innerHTML = `<span class="avatar huge">${initials(world.me.name)}</span><b>Welcome</b><div class="spinner"><i></i><i></i><i></i><i></i><i></i></div>`;
      await wait(900);
      unlock();
    };
  }
  function unlock() {
    overlay.className = 'overlay';
    overlay.innerHTML = '';
    overlay.removeAttribute('style');
    overlay.onclick = overlay.onkeydown = null;
    paused = false;
    last = performance.now();
    if (!booted) {
      booted = true;
      openApp('notepad', briefing);
    }
    renderTaskbar();
  }
  async function restart() {
    if (!(await confirmUnsaved())) return;
    paused = true;
    bootScreen('Restarting');
    await wait(1300);
    overlay.innerHTML = '';
    await wait(400);
    bootScreen();
    await wait(1200);
    lockScreen();
  }
  async function confirmUnsaved() {
    return apps.notepad.beforeClose ? apps.notepad.beforeClose() : true;
  }

  // ---------- ending the shift ----------
  async function askClockOut() {
    if (finished) return;
    const res = await dialog({
      title: 'Shut down',
      body: `<p>It's ${fmt(s.now)}. Clock out now and end your shift?</p><p class="muted">Anything still waiting in Mail, Chat, Phone or the Helpdesk will count as not done.</p>`,
      buttons: [{ label: 'Clock out', value: 'yes', primary: true }, { label: 'Cancel', value: 'no' }],
    });
    if (res.value === 'yes') finish();
  }
  function endOfDay() {
    if (finished) return;
    paused = true;
    dialog({
      title: 'Mirror OS',
      body: `<div class="props-head">${logo('report')}<b>It's 17:00. Your shift is over.</b></div><p>Your shift report is ready.</p>`,
      buttons: [{ label: 'View shift report', value: 'ok', primary: true }],
    }).then(finish);
  }
  function finish() {
    if (finished) return;
    finished = true;
    paused = true;
    const { el, score } = buildReport(ctx);
    apps.report = { id: 'report', title: 'Shift report', baseTitle: 'Shift report', el, size: [760, 620], hidden: true, maximised: true };
    openApp('report');
    el.querySelector('[data-done]').addEventListener('click', () => shutdown(score));
  }
  async function shutdown(score) {
    closeMenu();
    panels.close();
    bootScreen('Shutting down');
    await wait(1400);
    overlay.className = 'overlay off';
    overlay.innerHTML = '';
    await wait(300);
    cancelAnimationFrame(raf);
    stage.classList.add('closing');
    await wait(700);
    stage.remove();
    resolveShift(score);
  }

  stage.querySelector('.lid-close').addEventListener('click', () => (finished ? shutdown(Number(apps.report.el.querySelector('.score b').textContent)) : booted ? askClockOut() : null));

  // Power on: the lid opens, Mirror OS boots, then the lock screen.
  (async () => {
    applySettings();
    renderTaskbar();
    bootScreen();
    await wait(1700);
    lockScreen();
  })();

  return new Promise((resolve) => (resolveShift = resolve));
}
