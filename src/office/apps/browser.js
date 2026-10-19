import { esc, h, logo, GLYPH } from '../util.js';

const NEWTAB = 'mirror://newtab';

// A minimal browser for links and attachments opened from Mail. The address
// bar always shows the real URL, which is the lesson.
export function createBrowser(ctx) {
  const { world, s } = ctx;
  let url = NEWTAB;
  const back = [];
  const el = h(`<div class="browser-app">
      <div class="br-tabs"><div class="br-tab">${logo('browser', 'xs')}<span class="br-title">New tab</span></div></div>
      <div class="br-bar">
        <button class="fx-nav" data-back title="Back">${GLYPH.back}</button>
        <button class="fx-nav" data-reload title="Reload">${GLYPH.refresh}</button>
        <form class="addr-bar"><span class="lock"></span><input aria-label="Address" spellcheck="false"></form>
      </div>
      <div class="page"></div></div>`);
  const page = el.querySelector('.page');
  const input = el.querySelector('.addr-bar input');

  function render() {
    const p = world.pages[url];
    const secure = url.startsWith('https://') || url.startsWith('file://') || url === NEWTAB;
    const lock = el.querySelector('.lock');
    lock.innerHTML = url === NEWTAB ? GLYPH.search : secure ? GLYPH.globeLock : `${GLYPH.warn}<span>Not secure</span>`;
    lock.className = secure ? 'lock' : 'lock warn';
    input.value = url === NEWTAB ? '' : url;
    input.placeholder = 'Search or enter web address';
    const title = url === NEWTAB ? 'New tab' : p?.title || url.replace(/^\w+:\/\//, '');
    el.querySelector('.br-title').textContent = title;
    ctx.setTitle('browser', `${title} - Browser`);
    if (url === NEWTAB) {
      page.innerHTML = `<div class="newtab">${logo('mirror')}<h3>Good ${s.now < 720 ? 'morning' : 'afternoon'}, ${esc(world.me.name.split(' ')[0])}</h3>
        <div class="nt-links">
          <button data-go="${world.portal}">${logo('helpdesk')}<span>IT Helpdesk</span></button>
          <button data-go="mirror://mail">${logo('mail')}<span>Mail</span></button>
          <button data-go="file://handbook.pdf">${logo('pdf')}<span>Staff handbook</span></button>
        </div></div>`;
      return;
    }
    if (!p) {
      page.innerHTML = `<div class="err"><h3>Hmm… can't reach this page</h3><p>Check if there is a typo in ${esc(url.replace(/^\w+:\/\//, '').split('/')[0])}.</p><p class="muted">DNS_PROBE_FINISHED_NXDOMAIN</p></div>`;
      return;
    }
    if (p.kind === 'doc') {
      page.innerHTML = `<div class="doc">${p.html}</div>`;
      return;
    }
    if (p.kind === 'phish') {
      const done = s.compromised.has(p.threat);
      page.innerHTML = done
        ? `<div class="signin"><h3>Verification complete</h3><p>Thank you. Your mailbox has been verified. You may close this window.</p></div>`
        : `<form class="signin">
            <div class="logo-box" style="background:${world.org.color}">${esc(world.org.short)}</div>
            <h3>Sign in to verify your mailbox</h3>
            <input name="u" value="${esc(world.me.email)}" aria-label="Email">
            <input name="p" type="password" placeholder="Password" aria-label="Password" autocomplete="off">
            <button class="btn primary">Verify</button>
            <p class="small">${esc(world.org.name)} · IT Service Desk</p></form>`;
    }
  }

  function go(next) {
    if (next === url) return render();
    if (next.startsWith(world.portal)) return ctx.open('helpdesk', 'announcements');
    if (next === 'mirror://mail') return ctx.open('mail');
    back.push(url);
    url = next;
    render();
  }

  el.querySelector('.addr-bar').addEventListener('submit', (e) => {
    e.preventDefault();
    let v = input.value.trim();
    if (!v) return;
    if (!/^\w+:\/\//.test(v)) v = v.includes('.') && !v.includes(' ') ? `https://${v}` : `https://search.mirror.net/?q=${encodeURIComponent(v)}`;
    go(v);
  });
  input.addEventListener('keydown', (e) => e.stopPropagation());
  el.querySelector('[data-back]').addEventListener('click', () => back.length && ((url = back.pop()), render()));
  el.querySelector('[data-reload]').addEventListener('click', render);
  page.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t) go(t.dataset.go);
  });
  page.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = world.pages[url];
    ctx.compromise(p.threat, `Typed your password into ${url}`);
    render();
  });

  return {
    id: 'browser', name: 'Browser', title: 'Browser', el, size: [860, 560], offsetX: 200,
    onOpen(href) {
      if (href) go(href);
      else render();
    },
  };
}
