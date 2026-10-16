import { buildWorld, SHIFT_START, SHIFT_END } from './world.js';
import { esc, fmt, h, initials, ICONS } from './util.js';
import { createMail } from './apps/mail.js';
import { createChat } from './apps/chat.js';
import { createPhone } from './apps/phone.js';
import { createHelpdesk } from './apps/helpdesk.js';
import { createBrowser } from './apps/browser.js';
import { showDebrief } from './debrief.js';
import './office.css';

const MIN_PER_SEC = 1.25; // game minutes per real second at 1× (a shift takes about 6.5 minutes)
const SPEEDS = [1, 2, 4];

// Opens a full-screen office desktop for one shift at `org`. Resolves with a 0-100 score.
export function startShift(org) {
  const world = buildWorld(org);
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

  const root = h(`
    <div class="office" style="--org:${org.color}; --org-accent:${org.accent}">
      <div class="wallpaper"><div class="wp-mark"><b>${esc(org.short)}</b><span>${esc(org.name)}</span></div></div>
      <div class="desk-icons"></div>
      <div class="windows"></div>
      <div class="toasts" aria-live="polite"></div>
      <div class="start-menu" hidden>
        <div class="sm-user"><span class="avatar">${initials(world.me.name)}</span><div><b>${esc(world.me.name)}</b><span>${esc(world.me.role)} · ${esc(org.short)}</span></div></div>
        <button data-sm="help">How a shift works</button>
        <button data-sm="out" class="danger">Clock out now</button>
      </div>
      <nav class="taskbar">
        <button class="start" aria-label="Start"><span>${esc(org.short)}</span></button>
        <div class="task-apps"></div>
        <div class="tray">
          <button class="speed" title="Game speed">1×</button>
          <div class="clock"><b>09:00</b><span>${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
        </div>
      </nav>
    </div>`);
  document.body.appendChild(root);
  const $ = (sel) => root.querySelector(sel);

  // ---------- scheduler (game time) ----------
  const queue = [];
  const at = (min, fn) => {
    queue.push({ at: min, fn });
    queue.sort((a, b) => a.at - b.at);
  };
  const after = (min, fn) => at(s.now + min, fn);

  // ---------- context shared with every app ----------
  const apps = {};
  const items = []; // everything received, for the Helpdesk "related item" picker
  const ctx = {
    org, world, s, apps,
    after,
    now: () => s.now,
    open: (id, arg) => openApp(id, arg),
    notify,
    badges: () => renderTaskbar(),
    track: (item) => items.some((x) => x.key === item.key) || items.unshift(item),
    isOpen: (id) => wins.has(id) && !wins.get(id).hidden,
    items: () => items,
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

  apps.mail = createMail(ctx);
  apps.chat = createChat(ctx);
  apps.phone = createPhone(ctx);
  apps.helpdesk = createHelpdesk(ctx);
  apps.browser = createBrowser(ctx);
  const PINNED = ['mail', 'chat', 'phone', 'helpdesk'];

  // ---------- windows ----------
  const wins = new Map();
  let zTop = 10;
  let cascade = 0;

  function openApp(id, arg) {
    const app = apps[id];
    let w = wins.get(id);
    if (!w) {
      w = h(`
        <section class="win app-${id}" role="dialog" aria-label="${esc(app.title)}">
          <header class="win-bar">
            <span class="win-icon">${ICONS[id]}</span><span class="win-title">${esc(app.title)}</span>
            <button data-w="min" aria-label="Minimise">–</button>
            <button data-w="max" aria-label="Maximise">□</button>
            <button data-w="close" aria-label="Close" class="x">×</button>
          </header>
          <div class="win-body"></div>
        </section>`);
      w.querySelector('.win-body').appendChild(app.el);
      const [ww, wh] = app.size || [760, 520];
      const area = $('.windows').getBoundingClientRect();
      const x = Math.max(0, Math.min(area.width - ww, 60 + cascade * 34 + (app.offsetX || 0)));
      const y = Math.max(0, Math.min(area.height - wh, 30 + cascade * 28));
      cascade = (cascade + 1) % 6;
      Object.assign(w.style, { left: `${x}px`, top: `${y}px`, width: `${ww}px`, height: `${wh}px` });
      w.addEventListener('pointerdown', () => focus(id));
      w.querySelector('[data-w=min]').addEventListener('click', (e) => (e.stopPropagation(), hide(id)));
      w.querySelector('[data-w=close]').addEventListener('click', (e) => (e.stopPropagation(), hide(id)));
      w.querySelector('[data-w=max]').addEventListener('click', () => w.classList.toggle('max'));
      w.querySelector('.win-bar').addEventListener('dblclick', () => w.classList.toggle('max'));
      drag(w);
      $('.windows').appendChild(w);
      wins.set(id, w);
    }
    w.hidden = false;
    focus(id);
    app.onOpen?.(arg);
    renderTaskbar();
  }
  function hide(id) {
    wins.get(id).hidden = true;
    renderTaskbar();
  }
  function focus(id) {
    const w = wins.get(id);
    w.style.zIndex = ++zTop;
    wins.forEach((x) => x.classList.toggle('active', x === w));
    renderTaskbar();
  }
  function drag(w) {
    const bar = w.querySelector('.win-bar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || w.classList.contains('max')) return;
      const area = $('.windows').getBoundingClientRect();
      const ox = e.clientX - w.offsetLeft, oy = e.clientY - w.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        w.style.left = `${Math.max(-w.offsetWidth + 80, Math.min(area.width - 80, ev.clientX - ox))}px`;
        w.style.top = `${Math.max(0, Math.min(area.height - 40, ev.clientY - oy))}px`;
      };
      const up = () => (bar.removeEventListener('pointermove', move), bar.removeEventListener('pointerup', up));
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
  }

  // ---------- taskbar, desktop icons, start menu ----------
  function renderTaskbar() {
    const ids = [...PINNED, ...[...wins.keys()].filter((id) => !PINNED.includes(id) && !wins.get(id).hidden)];
    $('.task-apps').innerHTML = ids
      .map((id) => {
        const w = wins.get(id);
        const state = !w || w.hidden ? '' : w.classList.contains('active') ? 'active' : 'open';
        const n = apps[id].unread?.() || 0;
        return `<button data-app="${id}" class="${state}" title="${esc(apps[id].title)}">${ICONS[id]}${n ? `<i>${n}</i>` : ''}</button>`;
      })
      .join('');
  }
  $('.task-apps').addEventListener('click', (e) => {
    const id = e.target.closest('[data-app]')?.dataset.app;
    if (!id) return;
    const w = wins.get(id);
    if (w && !w.hidden && w.classList.contains('active')) hide(id);
    else openApp(id);
  });
  $('.desk-icons').innerHTML = PINNED.map((id) => `<button data-app="${id}">${ICONS[id]}<span>${esc(apps[id].title)}</span></button>`).join('');
  $('.desk-icons').addEventListener('dblclick', (e) => {
    const id = e.target.closest('[data-app]')?.dataset.app;
    if (id) openApp(id);
  });
  $('.desk-icons').addEventListener('keydown', (e) => {
    const id = e.target.closest('[data-app]')?.dataset.app;
    if (id && e.key === 'Enter') openApp(id);
  });

  const menu = $('.start-menu');
  $('.start').addEventListener('click', (e) => (e.stopPropagation(), (menu.hidden = !menu.hidden)));
  root.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !e.target.closest('.start-menu, .start')) menu.hidden = true;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sm]');
    if (!b) return;
    menu.hidden = true;
    if (b.dataset.sm === 'help') intro();
    if (b.dataset.sm === 'out' && confirm('Clock out now? Anything still waiting will count as not done.')) finish();
  });

  let speed = 0;
  $('.speed').addEventListener('click', () => {
    speed = (speed + 1) % SPEEDS.length;
    $('.speed').textContent = `${SPEEDS[speed]}×`;
  });

  // ---------- notifications ----------
  function notify({ app, title, text, onClick }) {
    const t = h(`<button class="toast"><span class="toast-icon">${ICONS[app]}</span><span><b>${esc(title)}</b><span>${esc(text)}</span></span></button>`);
    t.addEventListener('click', () => {
      t.remove();
      onClick ? onClick() : openApp(app);
    });
    const stack = $('.toasts');
    stack.appendChild(t);
    while (stack.children.length > 4) stack.firstElementChild.remove();
    setTimeout(() => t.classList.add('out'), 5500);
    setTimeout(() => t.remove(), 6000);
    renderTaskbar();
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
  let last = performance.now();
  let raf = 0;
  let resolveShift;
  let finished = false;
  function tick(nowMs) {
    const dt = Math.min((nowMs - last) / 1000, 0.25);
    last = nowMs;
    if (!paused) {
      s.now = Math.min(SHIFT_END, s.now + dt * MIN_PER_SEC * SPEEDS[speed]);
      while (queue.length && queue[0].at <= s.now) queue.shift().fn();
      $('.clock b').textContent = fmt(s.now);
      apps.phone.tick?.();
      if (s.now >= SHIFT_END) return finish();
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function intro() {
    paused = true;
    const card = h(`
      <div class="office-modal">
        <div class="card">
          <p class="eyebrow">${esc(org.name)}</p>
          <h2>Good morning, ${esc(world.me.name.split(' ')[0])}</h2>
          <p>You're a <b>${esc(world.me.role)}</b>. Your shift runs from 09:00 to 17:00. Work through your Mail, Chat, Phone and Helpdesk as you normally would: pay what's due, answer colleagues and approve requests.</p>
          <p>Not everything that arrives today will be what it seems. If something feels off, don't check it through the same message. Check it through a channel you already trust: the staff directory, a colleague or the IT Service Desk. Then report it.</p>
          <p class="small">Drag windows by their title bar. Use the 1× button in the corner to speed up the clock, and the ${esc(org.short)} button to clock out early.</p>
          <button class="btn primary">Start my shift</button>
        </div>
      </div>`);
    card.querySelector('button').addEventListener('click', () => {
      card.remove();
      paused = false;
      last = performance.now();
    });
    root.appendChild(card);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    paused = true;
    const score = showDebrief(root, ctx);
    root.querySelector('[data-done]').addEventListener('click', () => {
      root.remove();
      resolveShift(score);
    });
  }

  renderTaskbar();
  intro();
  return new Promise((resolve) => (resolveShift = resolve));
}
