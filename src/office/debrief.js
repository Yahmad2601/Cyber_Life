import { esc, fmt, h } from './util.js';

// Score one threat 0-100. Staying safe earns 40, checking through a second
// channel earns 30 and reporting earns 30. A compromise scores 0, or 25 if you
// told IT afterwards.
function threatResult(id, s) {
  if (!s.delivered.has(id)) return null;
  const c = s.compromised.get(id);
  if (c) return { score: c.contained ? 25 : 0, outcome: c.contained ? 'Compromised, then reported' : 'Compromised', tone: 'bad' };
  const v = s.verified.has(id), r = s.reported.has(id);
  let score = 40 + (v ? 30 : 0) + (r ? 30 : 0);
  if (s.replied.has(id)) score -= 10;
  if (s.clicked.has(id)) score -= 10;
  if (s.calledAttacker.has(id)) score -= 10;
  const outcome = v && r ? 'Verified & reported' : r ? 'Reported' : v ? 'Verified, not reported' : 'Ignored, not reported';
  return { score: Math.max(0, score), outcome, tone: v && r ? 'good' : 'ok' };
}

export function showDebrief(root, ctx) {
  const { world, s } = ctx;
  const results = Object.entries(world.threats).map(([id, t]) => ({ id, t, r: threatResult(id, s) })).filter((x) => x.r);
  const security = results.length ? results.reduce((n, x) => n + x.r.score, 0) / results.length : 0;
  const taskIds = Object.keys(world.tasks);
  const productivity = Math.max(0, (100 * taskIds.filter((k) => s.done.has(k)).length) / taskIds.length - 10 * s.falseAlarms.length);
  const score = Math.round(security * 0.8 + productivity * 0.2);
  const grade = score >= 80 ? 'Excellent' : score >= 50 ? 'Getting there' : 'Compromised';
  const tone = score >= 80 ? 'good' : score >= 50 ? 'ok' : 'bad';
  const missed = Object.keys(world.threats).length - results.length;

  const card = h(`
    <div class="office-modal">
      <div class="card debrief-card">
        <p class="eyebrow">Shift report · ${esc(world.org.name)} · clocked out ${fmt(s.now)}</p>
        <div class="score ${tone}"><b>${score}</b><span>${grade}</span></div>
        <div class="split">
          <div><span>Security</span><b>${Math.round(security)}</b></div>
          <div><span>Work done</span><b>${Math.round(productivity)}</b></div>
        </div>
        <h3>Attacks you faced (${results.length}${missed ? `, plus ${missed} that arrived after you clocked out` : ''})</h3>
        ${results
          .map(
            ({ id, t, r }) => `<details class="threat ${r.tone}" open>
              <summary><span class="pill ${r.tone}">${esc(r.outcome)}</span><b>${esc(t.title)}</b><em>${esc(t.channel)} · ${r.score}</em></summary>
              ${(() => {
                const steps = s.log.filter((l) => l.threat === id);
                return steps.length ? `<ol class="steps">${steps.map((l) => `<li><time>${fmt(l.at)}</time>${esc(l.text)}</li>`).join('')}</ol>` : '<p class="small">You took no action on it.</p>';
              })()}
              <p class="lbl">Red flags</p><ul>${t.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
              <p class="lbl">How to verify</p><p>${esc(t.verifyHow)}</p>
            </details>`,
          )
          .join('')}
        <h3>Your work</h3>
        <ul class="tasks">${taskIds.map((k) => `<li class="${s.done.has(k) ? 'hit' : 'miss'}"><span>${s.done.has(k) ? '✓' : '✗'}</span>${esc(world.tasks[k])}</li>`).join('')}
          ${s.falseAlarms.map((f) => `<li class="miss"><span>!</span>False alarm: reported a genuine item (${esc(f)})</li>`).join('')}</ul>
        <button class="btn primary wide" data-done>Back to the city</button>
      </div>
    </div>`);
  root.appendChild(card);
  return score;
}
