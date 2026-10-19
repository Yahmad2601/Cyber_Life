import { esc, logo } from '../util.js';

const CELLS = { small: [76, 64], medium: [84, 92], large: [112, 124] };
const SORTS = { name: 'Name', size: 'Size', type: 'Item type', modified: 'Date modified' };

// The desktop: icons in a grid, rubber-band selection, drag to move, inline
// rename and the Mirror OS right-click menus.
export function createDesktop(ctx, area) {
  const { fs, settings } = ctx;
  const order = []; // node ids in cell order (index = cell); null = empty cell
  let selected = new Set();

  const grid = document.createElement('div');
  grid.className = 'desk-grid';
  area.appendChild(grid);
  const band = document.createElement('div');
  band.className = 'band';
  area.appendChild(band);

  const items = () => fs.children('desktop');
  const cell = () => CELLS[settings.iconSize];
  const rows = () => Math.max(1, Math.floor((area.clientHeight - 8) / cell()[1]));

  function sync() {
    const ids = new Set(items().map((n) => n.id));
    for (let i = 0; i < order.length; i++) if (order[i] && !ids.has(order[i])) order[i] = null;
    for (const id of ids) if (!order.includes(id)) place(id);
    if (settings.autoArrange) compact();
    selected = new Set([...selected].filter((id) => ids.has(id)));
  }
  function place(id) {
    const free = order.indexOf(null);
    if (free >= 0) order[free] = id;
    else order.push(id);
  }
  function compact() {
    const ids = order.filter(Boolean);
    order.length = 0;
    order.push(...ids);
  }
  function sortBy(key) {
    settings.sortBy = key;
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      size: (a, b) => parseInt(fs.size(a) || 0) - parseInt(fs.size(b) || 0),
      type: (a, b) => fs.typeName(a).localeCompare(fs.typeName(b)) || a.name.localeCompare(b.name),
      modified: (a, b) => a.modified - b.modified,
    }[key];
    const sys = (n) => (n.type === 'recycle' ? 0 : n.type === 'app' ? 1 : 2);
    const sorted = items().sort((a, b) => sys(a) - sys(b) || cmp(a, b));
    order.length = 0;
    order.push(...sorted.map((n) => n.id));
    render();
  }

  function render() {
    sync();
    const [cw, ch] = cell();
    const r = rows();
    grid.className = `desk-grid size-${settings.iconSize}`;
    grid.hidden = !settings.showIcons;
    grid.innerHTML = order
      .map((id, i) => {
        if (!id) return '';
        const n = fs.get(id);
        const x = Math.floor(i / r) * cw + 4, y = (i % r) * ch + 4;
        return `<button class="dicon ${selected.has(id) ? 'sel' : ''}" data-id="${id}" style="left:${x}px;top:${y}px;width:${cw - 4}px">
          <span class="dicon-img">${logo(fs.icon(n))}${n.type === 'app' ? '<span class="sc-arrow"></span>' : ''}</span>
          <span class="dicon-label">${esc(n.name)}</span></button>`;
      })
      .join('');
  }
  fs.on(render);
  new ResizeObserver(() => render()).observe(area);

  function select(ids, add = false) {
    if (!add) selected = new Set();
    for (const id of [].concat(ids)) selected.add(id);
    grid.querySelectorAll('.dicon').forEach((el) => el.classList.toggle('sel', selected.has(el.dataset.id)));
  }
  const selectedNodes = () => [...selected].map(fs.get).filter(Boolean);

  // ---------- pointer: select, drag, rubber band ----------
  area.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.rename')) return;
    area.focus({ preventScroll: true });
    const icon = e.target.closest('.dicon');
    const box = area.getBoundingClientRect();
    if (icon) {
      const id = icon.dataset.id;
      if (e.ctrlKey) {
        selected.has(id) ? selected.delete(id) : selected.add(id);
        return select([...selected]);
      }
      if (!selected.has(id)) select(id);
      dragIcons(e, icon, box);
      return;
    }
    select([]);
    const x0 = e.clientX - box.left, y0 = e.clientY - box.top;
    const move = (ev) => {
      const x1 = ev.clientX - box.left, y1 = ev.clientY - box.top;
      const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
      Object.assign(band.style, { display: 'block', left: `${l}px`, top: `${t}px`, width: `${w}px`, height: `${hh}px` });
      const hits = [...grid.querySelectorAll('.dicon')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right - box.left > l && r.left - box.left < l + w && r.bottom - box.top > t && r.top - box.top < t + hh;
      });
      select(hits.map((el) => el.dataset.id));
    };
    const up = () => {
      band.style.display = 'none';
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  function dragIcons(e, icon, box) {
    const start = [e.clientX, e.clientY];
    let moving = false;
    const els = [...grid.querySelectorAll('.dicon.sel')];
    const origin = els.map((el) => [el, el.offsetLeft, el.offsetTop]);
    const move = (ev) => {
      const dx = ev.clientX - start[0], dy = ev.clientY - start[1];
      if (!moving && Math.hypot(dx, dy) < 6) return;
      moving = true;
      for (const [el, x, y] of origin) Object.assign(el.style, { left: `${x + dx}px`, top: `${y + dy}px`, opacity: 0.75 });
    };
    const up = (ev) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (!moving) return;
      const [cw, ch] = cell();
      const r = rows();
      const col = Math.max(0, Math.floor((ev.clientX - box.left) / cw));
      const row = Math.max(0, Math.min(r - 1, Math.floor((ev.clientY - box.top) / ch)));
      let target = col * r + row;
      const lead = icon.dataset.id;
      const moved = [lead, ...[...selected].filter((id) => id !== lead)];
      if (settings.autoArrange) {
        const rest = order.filter((id) => id && !moved.includes(id));
        rest.splice(Math.min(target, rest.length), 0, ...moved);
        order.length = 0;
        order.push(...rest);
      } else {
        for (const id of moved) {
          const from = order.indexOf(id);
          if (from === target) {
            target++;
            continue;
          }
          while (order.length <= target) order.push(null);
          const there = order[target];
          order[target] = id;
          order[from] = there && !moved.includes(there) ? there : null;
          target++;
          while (order[target] && moved.includes(order[target])) target++;
        }
      }
      render();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  area.addEventListener('dblclick', (e) => {
    const icon = e.target.closest('.dicon');
    if (icon) ctx.openNode(fs.get(icon.dataset.id));
  });

  // ---------- keyboard ----------
  area.tabIndex = -1;
  area.addEventListener('keydown', (e) => {
    if (e.target.closest('.rename')) return;
    const nodes = selectedNodes();
    if (e.key === 'Delete' && nodes.length) fs.remove(nodes);
    else if (e.key === 'F2' && nodes.length === 1) rename(nodes[0]);
    else if (e.key === 'Enter' && nodes.length) nodes.forEach(ctx.openNode);
    else if (e.key === 'F5') refresh();
    else if (e.ctrlKey && e.key.toLowerCase() === 'z') fs.runUndo();
    else if (e.ctrlKey && e.key.toLowerCase() === 'a') (e.preventDefault(), select(order.filter(Boolean)));
    else if (e.ctrlKey && e.key.toLowerCase() === 'c' && nodes.length) ctx.clipboard.set(nodes, 'copy');
    else if (e.ctrlKey && e.key.toLowerCase() === 'x' && nodes.length) ctx.clipboard.set(nodes, 'cut');
    else if (e.ctrlKey && e.key.toLowerCase() === 'v') ctx.clipboard.paste('desktop');
    else if (e.shiftKey && e.key === 'F10') openDesktopMenu(area.getBoundingClientRect().left + 60, area.getBoundingClientRect().top + 60, true);
  });

  function rename(node) {
    const el = grid.querySelector(`[data-id="${node.id}"] .dicon-label`);
    if (!el) return;
    const input = document.createElement('textarea');
    input.className = 'rename';
    input.value = node.name;
    input.rows = 2;
    input.spellcheck = false;
    el.replaceWith(input);
    input.focus();
    const dot = node.type === 'folder' || node.type === 'app' ? -1 : node.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : node.name.length);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (!save || !fs.rename(node, input.value.replace(/\n/g, ''))) render();
      area.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') (e.preventDefault(), finish(true));
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  function refresh() {
    grid.style.visibility = 'hidden';
    setTimeout(() => {
      grid.style.visibility = '';
      render();
    }, 140);
  }

  function newItem(type) {
    const n = fs.create('desktop', type);
    select(n.id);
    rename(n);
  }

  async function newShortcut() {
    const apps = ctx.appList().filter((a) => a.id !== 'report');
    const res = await ctx.dialog({
      title: 'Create Shortcut',
      body: `<p>Which app do you want to create a shortcut for?</p>
        <label class="field">Type the location of the item<select name="app">${apps.map((a) => `<option value="${a.id}">${esc(a.baseTitle)}</option>`).join('')}</select></label>`,
      buttons: [{ label: 'Next', value: 'ok', primary: true }, { label: 'Cancel', value: 'cancel' }],
    });
    if (res.value !== 'ok') return;
    const app = res.form.get('app');
    const n = fs.add('desktop', { type: 'app', app, name: ctx.apps[app].baseTitle });
    select(n.id);
  }

  // ---------- menus ----------
  const viewMenu = () => [
    ...Object.entries({ large: 'Large icons', medium: 'Medium icons', small: 'Small icons' }).map(([k, label]) => ({
      label, radio: settings.iconSize === k, shortcut: { large: 'Ctrl+Shift+2', medium: 'Ctrl+Shift+3', small: 'Ctrl+Shift+4' }[k],
      action: () => ((settings.iconSize = k), render()),
    })),
    '-',
    { label: 'Auto arrange icons', checked: settings.autoArrange, action: () => ((settings.autoArrange = !settings.autoArrange), render()) },
    { label: 'Align icons to grid', checked: true, action: () => {} },
    '-',
    { label: 'Show desktop icons', checked: settings.showIcons, action: () => ((settings.showIcons = !settings.showIcons), render()) },
  ];
  const sortMenu = () => Object.entries(SORTS).map(([k, label]) => ({ label, action: () => sortBy(k) }));
  const newMenu = () => [
    { label: 'Folder', glyph: 'new', action: () => newItem('folder') },
    { label: 'Shortcut', action: newShortcut },
    '-',
    { label: 'Compressed (zipped) Folder', action: () => newItem('zip') },
    { label: 'Text Document', action: () => newItem('txt') },
  ];

  function openDesktopMenu(x, y, classic = false) {
    const undo = fs.undo();
    const paste = ctx.clipboard.has();
    if (classic) {
      return ctx.menu(x, y, [
        { label: 'View', sub: viewMenu() },
        { label: 'Sort by', sub: sortMenu() },
        { label: 'Refresh', action: refresh },
        '-',
        { label: 'Paste', disabled: !paste, action: () => ctx.clipboard.paste('desktop') },
        { label: 'Paste shortcut', disabled: !paste, action: () => ctx.clipboard.paste('desktop', true) },
        ...(undo ? [{ label: undo.label, shortcut: 'Ctrl+Z', action: () => fs.runUndo() }] : []),
        '-',
        { label: 'Open in Terminal', action: () => ctx.open('terminal', { cwd: 'desktop' }) },
        '-',
        { label: 'New', sub: newMenu() },
        '-',
        { label: 'Display settings', action: () => ctx.open('settings', 'display') },
        { label: 'Personalize', action: () => ctx.open('settings', 'personalization') },
      ], { classic: true });
    }
    ctx.menu(x, y, [
      ...(paste ? [{ row: [{ glyph: 'paste', title: 'Paste (Ctrl+V)', action: () => ctx.clipboard.paste('desktop') }] }] : []),
      { label: 'View', glyph: 'view', sub: viewMenu() },
      { label: 'Sort by', glyph: 'sort', sub: sortMenu() },
      { label: 'Refresh', glyph: 'refresh', action: refresh },
      ...(undo ? [{ label: undo.label, glyph: 'undo', shortcut: 'Ctrl+Z', action: () => fs.runUndo() }] : []),
      '-',
      { label: 'New', glyph: 'new', sub: newMenu() },
      '-',
      { label: 'Display settings', glyph: 'display', action: () => ctx.open('settings', 'display') },
      { label: 'Personalize', glyph: 'brush', action: () => ctx.open('settings', 'personalization') },
      '-',
      { label: 'Open in Terminal', glyph: 'terminal', action: () => ctx.open('terminal', { cwd: 'desktop' }) },
      '-',
      { label: 'Show more options', glyph: 'more', action: () => openDesktopMenu(x, y, true) },
    ]);
  }

  area.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.closest('.rename')) return;
    const icon = e.target.closest('.dicon');
    if (!icon) return (select([]), openDesktopMenu(e.clientX, e.clientY));
    if (!selected.has(icon.dataset.id)) select(icon.dataset.id);
    ctx.itemMenu(e.clientX, e.clientY, selectedNodes(), { rename });
  });

  render();
  return { render, rename, select };
}
