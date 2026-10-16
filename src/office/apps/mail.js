import { esc, fmt, h, initials } from '../util.js';

// Inbox + reading pane. Links show their real target on hover; work requests
// (payments, approvals) are buttons in the toolbar.
export function createMail(ctx) {
  const { world, s } = ctx;
  const inbox = []; // newest first: { ...mail, at, read, handled }
  let current = null;
  let composing = false;

  const el = h(`
    <div class="mail-app">
      <aside class="mail-list"><div class="pane-head">Inbox</div><ul></ul></aside>
      <article class="mail-read"></article>
    </div>`);
  const list = el.querySelector('ul');
  const pane = el.querySelector('.mail-read');

  const addr = (p) => `${esc(p.name)} <span class="addr">&lt;${esc(p.email)}&gt;</span>`;

  function renderList() {
    list.innerHTML = inbox.length
      ? inbox
          .map(
            (m) => `<li data-id="${m.id}" class="${m.read ? '' : 'unread'} ${m === current ? 'sel' : ''}">
              <b>${esc(m.from.name)}</b><time>${fmt(m.at)}</time><span>${esc(m.subject)}</span></li>`,
          )
          .join('')
      : '<li class="empty">Nothing here yet</li>';
  }

  function para(p) {
    const parts = typeof p === 'string' ? [p] : p;
    return parts.map((x) => (typeof x === 'string' ? esc(x) : `<a href="#" data-href="${esc(x.href)}">${esc(x.text)}</a>`)).join('');
  }

  function renderPane() {
    if (!current) {
      pane.innerHTML = '<div class="empty-pane">Select a message to read it</div>';
      return;
    }
    const m = current;
    const act = m.action && !m.handled ? `<button class="btn primary" data-a="action">${esc(m.action.label)}</button>` : m.handled ? `<span class="done-chip">✓ ${esc(m.handled)}</span>` : '';
    pane.innerHTML = `
      <div class="toolbar">
        ${act}
        <button class="btn" data-a="reply">↩ Reply</button>
        <button class="btn" data-a="report" title="Send to the Security team">⚑ Report phishing</button>
        <button class="btn ghost" data-a="delete">🗑 Delete</button>
      </div>
      <div class="confirm" hidden></div>
      <h3 class="subject">${esc(m.subject)}</h3>
      <div class="head">
        <span class="avatar">${initials(m.from.name)}</span>
        <dl>
          <dt>From</dt><dd>${addr(m.from)}</dd>
          ${m.replyTo ? `<dt>Reply-To</dt><dd><span class="addr">${esc(m.replyTo)}</span></dd>` : ''}
          <dt>To</dt><dd><span class="addr">${esc(m.to)}</span></dd>
        </dl>
        <time>Today, ${fmt(m.at)}</time>
      </div>
      ${m.from.email.endsWith('@' + world.org.domain) ? '' : `<div class="ext-banner">External sender: this message came from outside ${esc(world.org.short)}.</div>`}
      <div class="body">${m.body.map((p) => `<p>${para(p)}</p>`).join('')}</div>
      ${m.attachments ? `<div class="attach">${m.attachments.map((a) => `<button data-href="${esc(a.href)}">📎 ${esc(a.name)}</button>`).join('')}</div>` : ''}
      <div class="compose" hidden></div>
      <div class="status"></div>`;
  }

  function select(m) {
    current = m;
    composing = false;
    if (!m.read) {
      m.read = true;
      ctx.badges();
    }
    renderList();
    renderPane();
  }

  function remove(m, note) {
    inbox.splice(inbox.indexOf(m), 1);
    current = null;
    renderList();
    pane.innerHTML = `<div class="empty-pane">${esc(note)}</div>`;
    ctx.badges();
  }

  list.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id) select(inbox.find((m) => m.id === id));
  });

  // Hovering a link shows its real destination, like a browser status bar.
  pane.addEventListener('mouseover', (e) => {
    const a = e.target.closest('[data-href]');
    if (a) pane.querySelector('.status').textContent = a.dataset.href;
  });
  pane.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-href]')) pane.querySelector('.status').textContent = '';
  });

  pane.addEventListener('click', (e) => {
    const m = current;
    const link = e.target.closest('[data-href]');
    if (link) {
      e.preventDefault();
      const href = link.dataset.href;
      if (m.threat && !s.clicked.has(m.threat)) {
        s.clicked.add(m.threat);
        ctx.log('Clicked the link in the email', m.threat);
      }
      if (href.startsWith(world.portal)) ctx.open('helpdesk', 'announcements');
      else ctx.open('browser', href);
      return;
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'action') confirmAction(m);
    if (a === 'reply') compose(m);
    if (a === 'report') {
      if (m.threat) ctx.report(m.threat, 'the Report button in Mail');
      else ctx.falseAlarm(`"${m.subject}"`);
      ctx.notify({ app: 'mail', title: 'Thanks for reporting', text: 'The message was sent to Security and removed from your inbox.' });
      remove(m, 'Reported to Security.');
    }
    if (a === 'delete') remove(m, 'Message deleted.');
  });

  function confirmAction(m) {
    const box = pane.querySelector('.confirm');
    box.hidden = false;
    box.innerHTML = `<p><b>${esc(m.action.label)}</b><br>${esc(m.action.detail)}</p>
      <button class="btn primary" data-c="yes">Confirm</button><button class="btn" data-c="no">Cancel</button>`;
    box.onclick = (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (!c) return;
      box.hidden = true;
      if (c === 'no') return;
      if (m.action.task) ctx.complete(m.action.task);
      if (m.action.compromise) ctx.compromise(m.action.compromise, `${m.action.label}: ${m.action.detail}`);
      m.handled = m.action.label.startsWith('Approve') ? 'Approved' : 'Payment sent';
      renderPane();
    };
  }

  function compose(m) {
    if (composing) return;
    composing = true;
    const to = m.replyTo || m.from.email;
    const box = pane.querySelector('.compose');
    box.hidden = false;
    const options = m.replies || ['Thanks, noted.'];
    box.innerHTML = `<div class="compose-to">To: <span class="addr">${esc(to)}</span></div>
      <div class="chips">${options.map((r, i) => `<button class="chip" data-r="${i}">${esc(r)}</button>`).join('')}</div>
      <button class="btn ghost" data-r="cancel">Discard</button>`;
    box.onclick = (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r === undefined) return;
      box.hidden = true;
      composing = false;
      if (r === 'cancel') return;
      ctx.notify({ app: 'mail', title: 'Sent', text: `To ${to}` });
      if (m.threat) {
        s.replied.add(m.threat);
        ctx.log(`Replied to the email itself ("${options[r]}"). The reply went to ${to}`, m.threat);
        ctx.after(4, () =>
          receive({ id: `${m.id}-re`, threat: m.threat, from: m.replyTo ? { name: m.from.name, email: m.replyTo } : m.from, to: m.to, subject: `RE: ${m.subject}`, body: [m.attackerReply], action: m.action, replies: m.replies, attackerReply: m.attackerReply }),
        );
      }
    };
  }

  function receive(mail) {
    if (inbox.some((m) => m.id === mail.id)) return;
    const m = { ...mail, at: ctx.now(), read: false };
    inbox.unshift(m);
    ctx.deliver(m.id);
    if (m.threat) ctx.deliver(m.threat);
    ctx.track({ key: `mail:${m.id}`, label: `Email · ${m.from.name}: ${m.subject}`, threat: m.threat });
    renderList();
    ctx.notify({ app: 'mail', title: m.from.name, text: m.subject, onClick: () => (ctx.open('mail'), select(m)) });
  }

  renderList();
  renderPane();
  return {
    id: 'mail', title: 'Mail', el, size: [860, 560],
    receive,
    unread: () => inbox.filter((m) => !m.read).length,
  };
}
