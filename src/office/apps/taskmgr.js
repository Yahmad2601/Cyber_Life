import { esc, h, logo } from '../util.js';

const BACKGROUND = [
  ['Mirror Shell', 'mirror', 1.1, 88],
  ['Desktop Window Manager', 'mirror', 0.8, 64],
  ['Mirror Security Service', 'settings', 0.4, 142],
  ['Service Host: Network Service', 'settings', 0.1, 12],
  ['Mirror Search Indexer', 'explorer', 0.2, 36],
];

// Task Manager: running apps and background processes; End task closes a window.
export function createTaskmgr(ctx) {
  let sel = null;
  let timer = 0;
  const el = h(`<div class="tm-app"><header class="tm-head"><b>Processes</b><span class="muted"></span>
      <button class="btn" data-run>Run new task</button><button class="btn" data-end disabled>End task</button></header>
      <div class="tm-body"></div></div>`);
  const body = el.querySelector('.tm-body');
  const jitter = (v) => Math.max(0, v * (0.6 + Math.random() * 0.8));

  function render() {
    const apps = ctx.running();
    const rows = [
      ...apps.map((id) => ({ id, name: ctx.apps[id].title, icon: id, cpu: jitter(id === 'browser' ? 2.4 : 0.9), mem: jitter(id === 'browser' ? 220 : 90) })),
      ...BACKGROUND.map(([name, icon, cpu, mem]) => ({ name, icon, cpu: jitter(cpu), mem: jitter(mem), bg: true })),
    ];
    const totalCpu = rows.reduce((n, r) => n + r.cpu, 0);
    el.querySelector('.tm-head .muted').textContent = `CPU ${Math.round(totalCpu + 6)}%  ·  Memory ${(3.1 + rows.reduce((n, r) => n + r.mem, 0) / 1024).toFixed(1)} / 16.0 GB`;
    const group = (label, list) =>
      list.length
        ? `<tr class="grp"><td colspan="3">${label} (${list.length})</td></tr>${list
            .map((r) => `<tr data-id="${r.id || ''}" class="${r.id && r.id === sel ? 'sel' : ''} ${r.bg ? 'bg' : ''}"><td>${logo(r.icon, 'sm')}${esc(r.name)}</td><td>${r.cpu.toFixed(1)}%</td><td>${r.mem.toFixed(1)} MB</td></tr>`)
            .join('')}`
        : '';
    body.innerHTML = `<table class="tm-table"><thead><tr><th>Name</th><th>CPU</th><th>Memory</th></tr></thead><tbody>
      ${group('Apps', rows.filter((r) => !r.bg))}${group('Background processes', rows.filter((r) => r.bg))}</tbody></table>`;
    el.querySelector('[data-end]').disabled = !sel;
  }

  body.addEventListener('click', (e) => {
    const id = e.target.closest('tr[data-id]')?.dataset.id;
    sel = id || null;
    render();
  });
  el.querySelector('[data-end]').addEventListener('click', () => {
    if (!sel) return;
    ctx.close(sel, true);
    sel = null;
    render();
  });
  el.querySelector('[data-run]').addEventListener('click', async () => {
    const res = await ctx.dialog({
      title: 'Create new task',
      body: '<p>Type the name of a program, folder or document, and Mirror OS will open it for you.</p><label class="field">Open<input name="cmd" placeholder="notepad"></label>',
      buttons: [{ label: 'OK', value: 'ok', primary: true }, { label: 'Cancel', value: 'cancel' }],
    });
    if (res.value !== 'ok') return;
    const cmd = String(res.form.get('cmd') || '').trim().toLowerCase().replace(/\.exe$/, '');
    const id = { cmd: 'terminal', powershell: 'terminal', explorer: 'explorer', notepad: 'notepad', control: 'settings', 'ms-settings:': 'settings', taskmgr: 'taskmgr' }[cmd] || cmd;
    if (ctx.apps[id] && id !== 'report') ctx.open(id);
    else ctx.dialog({ title: cmd || 'Run', body: `<p>Mirror OS cannot find '${esc(cmd)}'. Make sure you typed the name correctly, and then try again.</p>`, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
  });

  return {
    id: 'taskmgr', title: 'Task Manager', el, size: [600, 460], offsetX: 180,
    onOpen() {
      render();
      clearInterval(timer);
      timer = setInterval(() => (el.isConnected && !el.closest('.win[hidden]') ? render() : clearInterval(timer)), 1500);
    },
  };
}
