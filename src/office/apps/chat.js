import { esc, fmt, h, initials } from '../util.js';

// Team chat. You reply by picking a suggested message. In a direct message the
// suggestions are the questions you can ask that person (shared with Phone).
export function createChat(ctx) {
  const { world, s } = ctx;
  const P = world.people;
  const convs = new Map(); // id -> { id, who?, title, sub, external, messages, replies, unread, blocked }
  let current = null;

  function conv(id) {
    if (!convs.has(id)) {
      const p = P[id];
      convs.set(
        id,
        id === 'team'
          ? { id, title: '# finance-team', sub: `${P.manager.name}, ${P.tunde.name}, ${P.zainab.name}, you`, messages: [], replies: [], unread: 0 }
          : { id, who: id, title: p.name, sub: p.external ? p.email : p.role, external: !!p.external, messages: [], replies: [], unread: 0 },
      );
    }
    return convs.get(id);
  }
  conv('team');

  const el = h(`
    <div class="chat-app">
      <aside class="chat-list"><div class="pane-head">Chats <button class="btn ghost small" data-new>+ New</button></div><ul></ul><div class="picker" hidden></div></aside>
      <section class="chat-main"></section>
    </div>`);
  const list = el.querySelector('ul');
  const main = el.querySelector('.chat-main');
  const picker = el.querySelector('.picker');

  function renderList() {
    list.innerHTML = [...convs.values()]
      .sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0))
      .map(
        (c) => `<li data-c="${c.id}" class="${c === current ? 'sel' : ''} ${c.unread ? 'unread' : ''}">
          <span class="avatar ${c.id === 'team' ? 'chan' : ''}">${c.id === 'team' ? '#' : initials(c.title)}</span>
          <span class="who"><b>${esc(c.title)}${c.external ? ' <em class="ext">External</em>' : ''}</b><span>${esc(c.messages.at(-1)?.text ?? c.sub)}</span></span>
          ${c.unread ? `<i>${c.unread}</i>` : ''}</li>`,
      )
      .join('');
  }

  function suggestions(c) {
    if (c.blocked) return [];
    const scripted = c.replies.map((r, i) => ({ label: r.label, key: `#${i}` }));
    const topics = c.who ? ctx.topicsFor(c.who).map((tp) => ({ label: tp.ask, key: tp.key })) : [];
    return [...scripted, ...topics];
  }

  function renderMain() {
    if (!current) {
      main.innerHTML = '<div class="empty-pane">Pick a chat</div>';
      return;
    }
    const c = current;
    const sugg = suggestions(c);
    main.innerHTML = `
      <header class="chat-head">
        <div><b>${esc(c.title)}</b>${c.external ? ' <em class="ext">External</em>' : ''}<span>${esc(c.sub)}</span></div>
        ${c.who ? `<button class="btn ghost small" data-call>📞 Call</button>` : ''}
        ${c.external ? `<button class="btn ghost small" data-report>${c.blocked ? 'Blocked' : '⚑ Report & block'}</button>` : ''}
      </header>
      ${c.external && !c.blocked ? `<div class="ext-banner">This person is outside ${esc(world.org.short)}. Be careful with links, files and codes.</div>` : ''}
      <div class="msgs">${c.messages
        .map((m) => {
          const mine = m.from === 'me';
          const p = P[m.from];
          return `<div class="msg ${mine ? 'mine' : ''}">${mine ? '' : `<span class="avatar">${initials(p.name)}</span>`}
            <div><div class="meta">${mine ? 'You' : esc(p.name)} · ${fmt(m.at)}</div><p>${esc(m.text)}</p></div></div>`;
        })
        .join('')}${c.typing ? `<div class="typing">${esc(P[c.typing].name)} is typing…</div>` : ''}</div>
      <footer class="chat-compose">
        ${sugg.length ? `<div class="chips">${sugg.map((x) => `<button class="chip" data-k="${x.key}">${esc(x.label)}</button>`).join('')}</div>` : ''}
        <div class="fake-input">${c.blocked ? 'You blocked this account.' : 'Choose a reply above'}</div>
      </footer>`;
    const box = main.querySelector('.msgs');
    box.scrollTop = box.scrollHeight;
  }

  function show(c) {
    current = c;
    c.unread = 0;
    picker.hidden = true;
    renderList();
    renderMain();
    ctx.badges();
  }

  function post(c, from, text) {
    c.messages.push({ from, text, at: ctx.now() });
    if (from !== 'me' && (current !== c || !ctx.isOpen('chat'))) c.unread++;
    renderList();
    if (current === c) renderMain();
    ctx.badges();
  }

  // Someone answers after a short (game-time) pause, showing a typing indicator.
  function answer(c, from, text, delay = 2) {
    c.typing = from;
    if (current === c) renderMain();
    ctx.after(delay, () => {
      c.typing = null;
      post(c, from, text);
      if (current !== c || !ctx.isOpen('chat')) ctx.notify({ app: 'chat', title: P[from].name, text, onClick: () => (ctx.open('chat'), show(c)) });
    });
  }

  list.addEventListener('click', (e) => {
    const id = e.target.closest('[data-c]')?.dataset.c;
    if (id) show(convs.get(id));
  });

  el.querySelector('[data-new]').addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    picker.innerHTML = world.directory
      .filter((p) => !p.external)
      .map((p) => `<button data-p="${p.id}"><b>${esc(p.name)}</b><span>${esc(p.role)}</span></button>`)
      .join('');
  });
  picker.addEventListener('click', (e) => {
    const id = e.target.closest('[data-p]')?.dataset.p;
    if (id) show(conv(id));
  });

  main.addEventListener('click', (e) => {
    const c = current;
    if (e.target.closest('[data-call]')) return ctx.open('phone', { call: c.who });
    if (e.target.closest('[data-report]')) {
      if (c.blocked) return;
      c.blocked = true;
      const threat = c.messages.find((m) => m.threat)?.threat;
      if (threat) ctx.report(threat, 'Report & block in Chat');
      else ctx.falseAlarm(`chat with ${c.title}`);
      ctx.notify({ app: 'chat', title: 'Reported', text: `${c.title} was blocked and reported to Security.` });
      return renderMain();
    }
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    if (k.startsWith('#')) {
      const r = c.replies[+k.slice(1)];
      post(c, 'me', r.label);
      if (!r.keep) c.replies = [];
      else c.replies = c.replies.filter((x) => x !== r);
      if (r.task) ctx.complete(r.task);
      if (r.compromise) {
        ctx.compromise(r.compromise, `Sent the sign-in code to ${c.title} on Chat`);
        c.replies = [];
      }
      if (r.answer) answer(c, r.answer.from, r.answer.text, 1);
    } else {
      const tp = ctx.topicsFor(c.who).find((x) => x.key === k);
      s.asked.add(k);
      post(c, 'me', tp.ask);
      const target = P[c.who];
      // Away contacts still reply in chat, just more slowly.
      answer(c, c.who, tp.answer, target.id === 'ceo' ? 6 : 3);
      ctx.after(target.id === 'ceo' ? 6 : 3, () => ctx.applyTopic(tp, c.who, 'chat'));
    }
    renderMain();
  });

  function receive(ev) {
    const c = conv(ev.conv);
    c.messages.push({ from: ev.from, text: ev.text, at: ctx.now(), threat: ev.threat });
    if (ev.replies) c.replies = ev.replies;
    if (current !== c || !ctx.isOpen('chat')) c.unread++;
    if (ev.threat) ctx.track({ key: `chat:${ev.conv}`, label: `Chat · ${P[ev.from].name}: "${ev.text.slice(0, 48)}…"`, threat: ev.threat });
    if (current === c) renderMain();
    renderList();
    ctx.notify({ app: 'chat', title: c.id === 'team' ? `${P[ev.from].name} in ${c.title}` : P[ev.from].name, text: ev.text, onClick: () => (ctx.open('chat'), show(c)) });
  }

  renderList();
  renderMain();
  return {
    id: 'chat', title: 'Chat', el, size: [780, 520], offsetX: 80,
    receive,
    onOpen: (arg) => {
      if (arg?.with) show(conv(arg.with));
      else if (!current) show(conv('team'));
      else if (current.unread) show(current);
    },
    unread: () => [...convs.values()].reduce((n, c) => n + c.unread, 0),
  };
}
