import { phishing, bec } from './scenarios.js';

const SCENARIOS = { phishing, bec };

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function segs(list) {
  return list
    .map((s, i) => {
      const cls = s.href ? 'seg link' : 'seg';
      const attrs = `data-flag="${s.flag || ''}" data-i="${i}"${s.href ? ` data-href="${esc(s.href)}"` : ''}`;
      return `<span class="${cls}" ${attrs}>${esc(s.text)}</span>`;
    })
    .join('');
}

// Opens the inbox drill for an org. Resolves with a 0-100 score.
export function openDrill(org, kind) {
  const sc = SCENARIOS[kind](org);
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="mail" role="dialog" aria-label="${esc(sc.kind)} drill">
      <header class="mail-bar">
        <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
        <span class="mail-title">${esc(org.short)} Mail — Inbox</span>
        <span class="tag">${esc(sc.kind)} drill</span>
      </header>
      <p class="hint">Click every part of this email you find suspicious, then choose what you would do. Hover links to inspect them.</p>
      <article class="mail-body">
        <dl>
          <dt>From</dt><dd>${segs(sc.from)}</dd>
          ${sc.replyTo ? `<dt>Reply-To</dt><dd>${segs(sc.replyTo)}</dd>` : ''}
          <dt>To</dt><dd>${esc(sc.to)}</dd>
          <dt>Subject</dt><dd class="subject">${segs(sc.subject)}</dd>
        </dl>
        <div class="time">Today, ${sc.time}</div>
        ${sc.body.map((p) => `<p>${segs(p)}</p>`).join('')}
      </article>
      <div class="status-bar" aria-live="polite">&nbsp;</div>
      <footer class="actions">
        ${sc.actions.map((a, i) => `<button data-action="${i}">${esc(a.label)}</button>`).join('')}
      </footer>
    </div>`;
  document.body.appendChild(root);

  const status = root.querySelector('.status-bar');
  root.querySelectorAll('.seg').forEach((el) => {
    el.addEventListener('click', () => el.classList.toggle('marked'));
    if (el.dataset.href) {
      el.addEventListener('mouseenter', () => (status.textContent = el.dataset.href));
      el.addEventListener('mouseleave', () => (status.innerHTML = '&nbsp;'));
    }
  });

  return new Promise((resolve) => {
    root.querySelectorAll('[data-action]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const action = sc.actions[+btn.dataset.action];
        const marked = [...root.querySelectorAll('.seg.marked')];
        const found = new Set(marked.map((m) => m.dataset.flag).filter(Boolean));
        const falsePos = marked.filter((m) => !m.dataset.flag).length;
        const total = Object.keys(sc.flags).length;
        const flagScore = Math.max(0, (60 * found.size) / total - 5 * falsePos);
        const score = Math.round(Math.min(100, flagScore + action.points));
        showResults(root, sc, found, falsePos, action, score, () => {
          root.remove();
          resolve(score);
        });
      }),
    );
  });
}

function showResults(root, sc, found, falsePos, action, score, done) {
  const mail = root.querySelector('.mail');
  const grade = score >= 80 ? 'Excellent' : score >= 50 ? 'Getting there' : 'Compromised';
  mail.innerHTML = `
    <header class="mail-bar"><span class="mail-title">Debrief — ${esc(sc.title)}</span></header>
    <div class="debrief">
      <div class="score ${score >= 80 ? 'good' : score >= 50 ? 'ok' : 'bad'}"><b>${score}</b><span>${grade}</span></div>
      <p class="action-fb ${action.verdict}"><b>You chose:</b> ${esc(action.label)}<br>${esc(action.feedback)}</p>
      <h3>Red flags (${found.size}/${Object.keys(sc.flags).length})${falsePos ? ` · ${falsePos} false alarm${falsePos > 1 ? 's' : ''}` : ''}</h3>
      <ul class="flags">
        ${Object.entries(sc.flags)
          .map(([id, why]) => `<li class="${found.has(id) ? 'hit' : 'miss'}"><span>${found.has(id) ? '✓' : '✗'}</span>${esc(why)}</li>`)
          .join('')}
      </ul>
      <button class="primary" data-done>Back to the city</button>
    </div>`;
  mail.querySelector('[data-done]').addEventListener('click', done);
}
