import { digits, esc, fmt, h, initials, GLYPH } from '../util.js';

// Desk phone / softphone: keypad, staff directory, recent calls and SMS.
// Calls are short dialogues; what you can ask comes from world.topics.
const RING_MS = 15000; // real time, so a call can be answered at any shift speed
export function createPhone(ctx) {
  const { world, s } = ctx;
  const P = world.people;
  let tab = 'contacts';
  let typed = '';
  let call = null; // { who, lines: [{from, text}], choices, incoming?, state: 'ringing'|'live'|'ended' }
  const recents = []; // { who, number, dir: 'in'|'out'|'missed', at }
  const texts = []; // { from, text, at, read }
  let missed = 0;

  const el = h(`<div class="phone-app"><div class="phone-screen"></div><nav class="phone-tabs">
      <button data-tab="keypad">${GLYPH.keypad}<span>Keypad</span></button>
      <button data-tab="contacts">${GLYPH.people}<span>Directory</span></button>
      <button data-tab="recents">${GLYPH.history}<span>Recents</span></button>
      <button data-tab="messages">${GLYPH.sms}<span>Messages</span></button></nav></div>`);
  const screen = el.querySelector('.phone-screen');

  const byNumber = (n) => Object.values(P).find((p) => p.number && digits(p.number) === digits(n) && p.id !== 'me');
  const pretty = (n) => (n.length === 11 ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : `Ext. ${n}`);

  function render() {
    el.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
      const badge = b.dataset.tab === 'messages' ? texts.filter((x) => !x.read).length : b.dataset.tab === 'recents' ? missed : 0;
      b.querySelector('i')?.remove();
      if (badge) b.insertAdjacentHTML('beforeend', `<i>${badge}</i>`);
    });
    el.querySelector('.phone-tabs').hidden = !!call;
    if (call) return renderCall();
    if (tab === 'keypad') {
      screen.innerHTML = `<div class="keypad">
        <div class="typed">${typed ? esc(typed) : '<span>Enter a number or extension</span>'}</div>
        <div class="keys">${'123456789*0#'.split('').map((k) => `<button data-key="${k}">${k}</button>`).join('')}</div>
        <div class="key-row"><button class="dial" data-dial aria-label="Call">${GLYPH.call}</button><button class="back" data-back aria-label="Delete">${GLYPH.backspace}</button></div></div>`;
    }
    if (tab === 'contacts') {
      screen.innerHTML = `<div class="pane-head">Staff directory</div><ul class="dir">${world.directory
        .map(
          (p) => `<li><span class="avatar">${initials(p.name)}</span><span class="who"><b>${esc(p.name)}</b><span>${esc(p.role)}</span><span class="num">${pretty(digits(p.number))}${p.external ? ' · external' : ''}</span></span>
            <span class="acts"><button data-callp="${p.id}" title="Call">${GLYPH.call}</button>${p.external ? '' : `<button data-chatp="${p.id}" title="Chat">${GLYPH.bubble}</button>`}</span></li>`,
        )
        .join('')}</ul>`;
    }
    if (tab === 'recents') {
      missed = 0;
      ctx.badges();
      screen.innerHTML = `<div class="pane-head">Recent calls</div><ul class="recents">${
        recents.length
          ? recents
              .map((r) => `<li class="${r.dir}"><span>${r.dir === 'in' ? GLYPH.callIn : r.dir === 'out' ? GLYPH.callOut : GLYPH.close}</span><b>${esc(r.who ? P[r.who].name : pretty(r.number))}</b><time>${fmt(r.at)}</time><button data-num="${r.number}" title="Call back">${GLYPH.call}</button></li>`)
              .join('')
          : '<li class="empty">No calls yet</li>'
      }</ul>`;
    }
    if (tab === 'messages') {
      texts.forEach((x) => (x.read = true));
      ctx.badges();
      screen.innerHTML = `<div class="pane-head">Messages</div><ul class="sms">${
        texts.length ? texts.map((x) => `<li><div><b>${esc(x.from)}</b><time>${fmt(x.at)}</time></div><p>${esc(x.text)}</p></li>`).join('') : '<li class="empty">No messages</li>'
      }</ul>`;
    }
  }

  function renderCall() {
    const p = P[call.who];
    const name = p ? p.name : pretty(call.number);
    if (call.state === 'ringing') {
      screen.innerHTML = `<div class="call ringing"><span class="avatar big">${p ? initials(p.name) : '?'}</span><b>${esc(name)}</b><span>Incoming call…</span>
        <div class="call-btns"><button class="decline" data-decline>Decline</button><button class="answer" data-answer>Answer</button></div></div>`;
      return;
    }
    const choices = call.state === 'live' ? callChoices() : [];
    screen.innerHTML = `<div class="call"><div class="call-top"><span class="avatar">${p ? initials(p.name) : '?'}</span><div><b>${esc(name)}</b><span>${call.state === 'ended' ? 'Call ended' : 'On call · ' + esc(pretty(digits(call.number)))}</span></div></div>
      <div class="transcript">${call.lines.map((l) => `<p class="${l.from === 'me' ? 'mine' : l.from === 'sys' ? 'sys' : ''}">${esc(l.text)}</p>`).join('')}</div>
      <div class="choices">${choices.map((c, i) => `<button class="chip" data-choice="${i}">${esc(c.label)}</button>`).join('')}</div>
      <button class="${call.state === 'ended' ? 'btn' : 'hangup'}" data-hangup>${call.state === 'ended' ? 'Close' : 'Hang up'}</button></div>`;
    const tr = screen.querySelector('.transcript');
    tr.scrollTop = tr.scrollHeight;
  }

  function callChoices() {
    if (call.choices) return call.choices; // scripted incoming call
    if (!call.who) return [];
    return ctx.topicsFor(call.who).map((tp) => ({ label: tp.ask, topic: tp }));
  }

  function dial(number) {
    if (call) return;
    const n = digits(number);
    if (!n) return;
    let p = byNumber(n);
    const lines = [];
    if (p?.forward) {
      lines.push({ from: 'sys', text: `${p.name}'s line is forwarding to ${P[p.forward].name}.` });
      p = P[p.forward];
    }
    recents.unshift({ who: p?.id, number: n, dir: 'out', at: ctx.now() });
    if (!p) {
      call = { number: n, lines: [{ from: 'sys', text: 'The number you have dialled is not reachable. Please try again later.' }], state: 'ended' };
    } else {
      lines.push({ from: p.id, text: p.greeting || `${p.name} speaking.` });
      call = { who: p.id, number: n, lines, state: 'live' };
      if (p.id === 'fakeVendor') ctx.log(`Dialled ${pretty(n)}, the number given in the email`, 'vendor');
    }
    ctx.open('phone');
    render();
  }

  function ring(ev) {
    if (call) {
      recents.unshift({ who: ev.from, number: digits(P[ev.from].number), dir: 'missed', at: ctx.now() });
      missed++;
      return;
    }
    call = { who: ev.from, number: digits(P[ev.from].number), lines: [], incoming: ev, state: 'ringing', until: performance.now() + RING_MS };
    ctx.open('phone');
    ctx.notify({ app: 'phone', title: `Incoming call · ${P[ev.from].name}`, text: P[ev.from].role, onClick: () => ctx.open('phone') });
    render();
  }

  screen.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.key) (typed = (typed + d.key).slice(0, 14)), render();
    if ('back' in d) (typed = typed.slice(0, -1)), render();
    if ('dial' in d) dial(typed);
    if (d.callp) dial(P[d.callp].number);
    if (d.chatp) ctx.open('chat', { with: d.chatp });
    if (d.num) dial(d.num);
    if ('answer' in d) {
      const ev = call.incoming;
      recents.unshift({ who: ev.from, number: call.number, dir: 'in', at: ctx.now() });
      Object.assign(call, { state: 'live', lines: [{ from: ev.from, text: ev.text }], choices: ev.choices });
      render();
    }
    if ('decline' in d) missCall();
    if (d.choice !== undefined) {
      const c = callChoices()[+d.choice];
      call.lines.push({ from: 'me', text: c.label });
      if (c.topic) {
        s.asked.add(c.topic.key);
        call.lines.push({ from: call.who, text: c.topic.answer });
        ctx.applyTopic(c.topic, call.who, 'phone');
      } else {
        call.lines.push({ from: call.who, text: c.answer });
        if (c.task) ctx.complete(c.task);
        call.choices = null; // back to normal topics once the scripted bit is done
      }
      render();
    }
    if ('hangup' in d) {
      call = null;
      typed = '';
      render();
    }
  });
  el.querySelector('.phone-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) (tab = t.dataset.tab), render();
  });

  function missCall() {
    recents.unshift({ who: call.who, number: call.number, dir: 'missed', at: ctx.now() });
    missed++;
    call = null;
    render();
    ctx.badges();
  }

  render();
  return {
    id: 'phone', title: 'Phone', el, size: [360, 600], offsetX: 420,
    ring,
    sms(ev) {
      texts.unshift({ from: ev.from, text: ev.text, at: ctx.now(), read: false });
      if (ev.threat) ctx.track({ key: `sms:${ev.threat}`, label: `SMS · ${ev.from}: "${ev.text.slice(0, 40)}…"`, threat: ev.threat });
      ctx.notify({ app: 'phone', title: `SMS · ${ev.from}`, text: ev.text, onClick: () => (ctx.open('phone'), (tab = 'messages'), render()) });
      render();
    },
    tick() {
      if (call?.state === 'ringing' && performance.now() >= call.until) missCall();
    },
    onOpen(arg) {
      if (arg?.call) dial(P[arg.call].number);
    },
    unread: () => texts.filter((x) => !x.read).length + missed,
  };
}
