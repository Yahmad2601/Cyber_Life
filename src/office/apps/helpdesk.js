import { esc, fmt, h, logo, GLYPH } from '../util.js';

const CATEGORIES = {
  suspicious: 'Report a suspicious message',
  genuine: 'Ask if something is genuine',
  compromised: 'I may have been compromised',
  other: 'Other IT issue',
};

// IT self-service portal: tickets, a "raise a ticket" form and announcements.
// Tickets about a received item get an answer from IT a few game minutes later.
export function createHelpdesk(ctx) {
  const { world } = ctx;
  const tickets = world.tickets.map((t) => ({ ...t, thread: [...t.thread], unread: false }));
  let tab = 'tickets';
  let open = null;
  let next = 3402;

  const el = h(`<div class="hd-app">
      <header class="hd-top">${logo('helpdesk', 'sm')}<b>${esc(world.org.short)} IT Helpdesk</b><span class="url">${GLYPH.globeLock} helpdesk.${esc(world.org.domain)}</span></header>
      <nav class="hd-tabs"><button data-tab="tickets">My tickets</button><button data-tab="new">Raise a ticket</button><button data-tab="announcements">Announcements</button></nav>
      <div class="hd-body"></div></div>`);
  const body = el.querySelector('.hd-body');

  function render() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'tickets' && open) {
      open.unread = false;
      ctx.badges();
      body.innerHTML = `<button class="btn ghost small" data-back>${GLYPH.back}<span>All tickets</span></button>
        <h3>${esc(open.id)} · ${esc(open.subject)} <span class="status ${open.status.replace(/\s/g, '')}">${esc(open.status)}</span></h3>
        <div class="thread">${open.thread.map((m) => `<div class="post ${m.from === 'You' ? 'mine' : ''}"><div class="meta">${esc(m.from)} · ${fmt(m.at)}</div><p>${esc(m.text)}</p></div>`).join('')}</div>`;
      return;
    }
    if (tab === 'tickets') {
      body.innerHTML = `<table class="tickets"><thead><tr><th>Ticket</th><th>Subject</th><th>Status</th><th>Updated</th></tr></thead><tbody>${tickets
        .map((t) => `<tr data-t="${t.id}" class="${t.unread ? 'unread' : ''}"><td>${esc(t.id)}</td><td>${esc(t.subject)}</td><td><span class="status ${t.status.replace(/\s/g, '')}">${esc(t.status)}</span></td><td>${fmt(t.thread.at(-1).at)}</td></tr>`)
        .join('')}</tbody></table>`;
    }
    if (tab === 'new') {
      const items = ctx.items();
      body.innerHTML = `<form class="hd-form">
        <label>Category<select name="cat">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label>Related message <select name="item"><option value="">None</option>${items.map((it, i) => `<option value="${i}">${esc(it.label)}</option>`).join('')}</select></label>
        <label>Details<textarea name="text" rows="4" placeholder="What happened? Include anything you clicked or shared."></textarea></label>
        <button class="btn primary">Submit ticket</button></form>`;
    }
    if (tab === 'announcements') {
      body.innerHTML = world.announcements.map((a) => `<article class="notice"><h4>${esc(a.title)}</h4><p>${esc(a.text)}</p></article>`).join('');
    }
  }

  el.querySelector('.hd-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    tab = t.dataset.tab;
    open = null;
    render();
  });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) (open = null), render();
    const id = e.target.closest('[data-t]')?.dataset.t;
    if (id) (open = tickets.find((t) => t.id === id)), render();
  });
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const cat = f.get('cat');
    const item = f.get('item') === '' ? null : ctx.items()[+f.get('item')];
    const text = String(f.get('text') || '').trim();
    const t = {
      id: `INC-${next++}`,
      subject: item ? `${CATEGORIES[cat]}: ${item.label}` : CATEGORIES[cat],
      status: 'Open',
      thread: [{ from: 'You', at: ctx.now(), text: text || '(no details given)' }],
    };
    tickets.unshift(t);
    const threat = item?.threat;

    // Telling IT straight away counts at once; the answer comes a little later.
    if (cat === 'compromised') ctx.contain(`Helpdesk ticket ${t.id}`);
    if (cat === 'suspicious') {
      if (threat) ctx.report(threat, `Helpdesk ticket ${t.id}`);
      else if (item) ctx.falseAlarm(item.label);
    }
    if (cat === 'genuine' && threat) ctx.report(threat, `Helpdesk ticket ${t.id}`);

    ctx.after(5, () => {
      t.thread.push({ from: 'IT Service Desk', at: ctx.now(), text: reply(cat, item) });
      t.status = 'Resolved';
      t.unread = true;
      if (threat && cat !== 'other' && cat !== 'compromised') ctx.verify(threat, `the IT Service Desk (ticket ${t.id})`);
      ctx.notify({ app: 'helpdesk', title: `${t.id} updated`, text: 'IT Service Desk replied to your ticket', onClick: () => (ctx.open('helpdesk'), (tab = 'tickets'), (open = t), render()) });
      render();
    });
    ctx.notify({ app: 'helpdesk', title: `${t.id} raised`, text: 'The IT Service Desk will reply shortly.' });
    tab = 'tickets';
    open = t;
    render();
  });

  function reply(cat, item) {
    if (cat === 'compromised') return "Thanks for telling us quickly. We've reset your password, signed out every session and alerted Security and the bank. You did the right thing by reporting it.";
    if (!item) return cat === 'other' ? "Thanks, an engineer will be in touch." : "Thanks. Please pick the related message next time so we can act on it.";
    if (item.threat) return "This is NOT genuine. It's an attack. We've blocked the sender and are warning colleagues who got the same thing. Don't act on it, and thank you for checking.";
    if (cat === 'suspicious') return "We checked this one and it's genuine, so no action is needed. Thanks for being careful.";
    return "Yes, that's genuine. You can go ahead.";
  }

  render();
  return {
    id: 'helpdesk', title: 'IT Helpdesk', el, size: [720, 520], offsetX: 140,
    update(ev) {
      const t = tickets.find((x) => x.id === ev.id);
      t.thread.push({ from: ev.from, at: ctx.now(), text: ev.text });
      t.status = ev.status;
      t.unread = true;
      ctx.notify({ app: 'helpdesk', title: `${t.id} updated`, text: ev.text, onClick: () => (ctx.open('helpdesk'), (tab = 'tickets'), (open = t), render()) });
      render();
    },
    onOpen(arg) {
      if (arg) (tab = arg), (open = null);
      render(); // refresh the "related message" list
    },
    unread: () => tickets.filter((t) => t.unread).length,
  };
}
