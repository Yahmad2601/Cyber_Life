import { esc, fmt, h, initials, logo, GLYPH } from '../util.js';

const FOLDERS = { inbox: 'Inbox', sent: 'Sent items', deleted: 'Deleted items' };

// Folder pane + message list + reading pane. Links show their real target on
// hover; work requests (payments, approvals) are buttons in the toolbar.
export function createMail(ctx) {
  const { world, s } = ctx;
  const mails = []; // newest first: { ...mail, at, read, handled, folder }
  let folder = 'inbox';
  let current = null;
  let composing = false;

  const el = h(`
    <div class="mail-app">
      <nav class="mail-folders">
        <div class="mail-acct">${logo('mail', 'sm')}<span><b>${esc(world.me.name)}</b><small>${esc(world.me.email)}</small></span></div>
        <div class="mail-fl"></div>
      </nav>
      <aside class="mail-list"><div class="pane-head"></div><ul></ul></aside>
      <article class="mail-read"></article>
    </div>`);
  const list = el.querySelector('ul');
  const pane = el.querySelector('.mail-read');

  const addr = (p) => `${esc(p.name)} <span class="addr">&lt;${esc(p.email)}&gt;</span>`;
  const inFolder = (f) => mails.filter((m) => m.folder === f);

  function renderFolders() {
    el.querySelector('.mail-fl').innerHTML = Object.entries(FOLDERS)
      .map(([id, label]) => {
        const n = id === 'inbox' ? inFolder('inbox').filter((m) => !m.read).length : 0;
        return `<button data-f="${id}" class="${id === folder ? 'on' : ''}"><span>${label}</span>${n ? `<b>${n}</b>` : ''}</button>`;
      })
      .join('');
  }

  function renderList() {
    renderFolders();
    el.querySelector('.mail-list .pane-head').textContent = FOLDERS[folder];
    const rows = inFolder(folder);
    list.innerHTML = rows.length
      ? rows
          .map(
            (m) => `<li data-id="${m.id}" class="${m.read ? '' : 'unread'} ${m === current ? 'sel' : ''}">
              <b>${esc(folder === 'sent' ? `To: ${m.toName || m.to}` : m.from.name)}</b><time>${fmt(m.at)}</time><span>${esc(m.subject)}</span></li>`,
          )
          .join('')
      : `<li class="empty">${folder === 'inbox' ? 'All caught up' : 'Nothing in this folder'}</li>`;
  }

  function para(p) {
    const parts = typeof p === 'string' ? [p] : p;
    return parts.map((x) => (typeof x === 'string' ? esc(x) : `<a href="#" data-href="${esc(x.href)}">${esc(x.text)}</a>`)).join('');
  }

  function renderPane() {
    if (!current) {
      pane.innerHTML = `<div class="empty-pane">${logo('mail')}<p>Select an item to read</p></div>`;
      return;
    }
    const m = current;
    const mine = m.folder === 'sent';
    const act = m.action && !m.handled && !mine ? `<button class="btn primary" data-a="action">${esc(m.action.label)}</button>` : m.handled ? `<span class="done-chip">${GLYPH.check} ${esc(m.handled)}</span>` : '';
    pane.innerHTML = `
      <div class="toolbar">
        ${act}
        ${mine ? '' : `<button class="btn" data-a="reply">${GLYPH.undo}<span>Reply</span></button>`}
        ${mine ? '' : `<button class="btn" data-a="report" title="Send to the Security team">${GLYPH.shield}<span>Report phishing</span></button>`}
        <button class="btn ghost" data-a="delete">${GLYPH.delete}<span>${m.folder === 'deleted' ? 'Delete permanently' : 'Delete'}</span></button>
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
      ${mine || m.from.email.endsWith('@' + world.org.domain) ? '' : `<div class="ext-banner">${GLYPH.props}<span>External sender. This message came from outside ${esc(world.org.short)}.</span></div>`}
      <div class="body">${m.body.map((p) => `<p>${para(p)}</p>`).join('')}</div>
      ${m.attachments ? `<div class="attach">${m.attachments.map((a) => `<button data-href="${esc(a.href)}" data-file="${esc(a.name)}">${logo(a.name.split('.').pop(), 'sm')}<span><b>${esc(a.name)}</b><small>84 KB</small></span></button>`).join('')}</div>` : ''}
      <div class="compose" hidden></div>
      <div class="status"></div>`;
  }

  function select(m) {
    current = m;
    composing = false;
    if (m && !m.read) {
      m.read = true;
      ctx.badges();
    }
    renderList();
    renderPane();
  }

  function moveOut(m, note) {
    if (m.folder === 'deleted') mails.splice(mails.indexOf(m), 1);
    else m.folder = 'deleted';
    current = null;
    renderList();
    pane.innerHTML = `<div class="empty-pane">${logo('mail')}<p>${esc(note)}</p></div>`;
    ctx.badges();
  }

  el.querySelector('.mail-fl').addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    if (!f) return;
    folder = f;
    select(null);
  });
  list.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id) select(mails.find((m) => m.id === id));
  });
  list.addEventListener('contextmenu', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    e.preventDefault();
    const m = mails.find((x) => x.id === id);
    ctx.menu(e.clientX, e.clientY, [
      { label: 'Open', glyph: 'open', action: () => select(m) },
      { label: m.read ? 'Mark as unread' : 'Mark as read', glyph: 'check', action: () => ((m.read = !m.read), renderList(), ctx.badges()) },
      '-',
      { label: 'Report phishing', glyph: 'shield', disabled: m.folder === 'sent', action: () => (select(m), pane.querySelector('[data-a=report]')?.click()) },
      { label: 'Delete', glyph: 'delete', action: () => moveOut(m, 'Message deleted.') },
    ]);
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
      if (link.dataset.file) {
        ctx.download(link.dataset.file, href);
        ctx.notify({ app: 'explorer', title: 'Download complete', text: `${link.dataset.file} was saved to Downloads.` });
      } else if (m.threat && !s.clicked.has(m.threat)) {
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
      ctx.notify({ app: 'mail', title: 'Thanks for reporting', text: 'The message was sent to Security and moved to Deleted items.' });
      m.folder = 'deleted';
      current = null;
      renderList();
      pane.innerHTML = `<div class="empty-pane">${logo('mail')}<p>Reported to Security.</p></div>`;
      ctx.badges();
    }
    if (a === 'delete') moveOut(m, 'Message deleted.');
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
      <div class="compose-subj">RE: ${esc(m.subject)}</div>
      <div class="chips">${options.map((r, i) => `<button class="chip" data-r="${i}">${esc(r)}</button>`).join('')}</div>
      <button class="btn ghost" data-r="cancel">Discard</button>`;
    box.onclick = (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r === undefined) return;
      box.hidden = true;
      composing = false;
      if (r === 'cancel') return;
      mails.unshift({ id: `sent-${mails.length}`, folder: 'sent', read: true, at: ctx.now(), from: world.me, to, toName: m.replyTo ? to : m.from.name, subject: `RE: ${m.subject}`, body: [options[r]] });
      renderList();
      ctx.notify({ app: 'mail', title: 'Message sent', text: `To ${to}` });
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
    if (mails.some((m) => m.id === mail.id)) return;
    const m = { ...mail, at: ctx.now(), read: false, folder: 'inbox' };
    mails.unshift(m);
    ctx.deliver(m.id);
    if (m.threat) ctx.deliver(m.threat);
    ctx.track({ key: `mail:${m.id}`, label: `Email · ${m.from.name}: ${m.subject}`, threat: m.threat });
    renderList();
    ctx.notify({ app: 'mail', title: m.from.name, text: m.subject, onClick: () => (ctx.open('mail'), (folder = 'inbox'), select(m)) });
  }

  renderList();
  renderPane();
  return {
    id: 'mail', title: 'Mail', el, size: [1000, 600],
    receive,
    unread: () => inFolder('inbox').filter((m) => !m.read).length,
  };
}
