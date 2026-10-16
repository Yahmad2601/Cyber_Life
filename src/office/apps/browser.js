import { esc, h } from '../util.js';

// A minimal browser for links and attachments opened from Mail. The address
// bar always shows the real URL, which is the lesson.
export function createBrowser(ctx) {
  const { world, s } = ctx;
  let url = '';
  const el = h(`<div class="browser-app"><div class="addr-bar"><span class="lock"></span><span class="url"></span></div><div class="page"></div></div>`);
  const page = el.querySelector('.page');

  function render() {
    const p = world.pages[url];
    const secure = url.startsWith('https://') || url.startsWith('file://');
    el.querySelector('.lock').textContent = secure ? '🔒' : '⚠ Not secure';
    el.querySelector('.lock').className = secure ? 'lock' : 'lock warn';
    el.querySelector('.url').textContent = url;
    if (!p) {
      page.innerHTML = `<div class="err"><h3>This site can't be reached</h3><p>${esc(url)} took too long to respond.</p></div>`;
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
            <div class="logo" style="background:${world.org.color}">${esc(world.org.short)}</div>
            <h3>Sign in to verify your mailbox</h3>
            <input name="u" value="${esc(world.me.email)}" aria-label="Email">
            <input name="p" type="password" placeholder="Password" aria-label="Password" autocomplete="off">
            <button class="btn primary">Verify</button>
            <p class="small">${esc(world.org.name)} · IT Service Desk</p></form>`;
    }
  }

  page.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = world.pages[url];
    ctx.compromise(p.threat, `Typed your password into ${url}`);
    render();
  });

  return {
    id: 'browser', title: 'Browser', el, size: [640, 480], offsetX: 200,
    onOpen(href) {
      if (href) url = href;
      render();
    },
  };
}
