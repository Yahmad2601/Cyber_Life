import { esc, h, logo, GLYPH } from '../util.js';

const NAV = [
  { id: 'home', label: 'Home', icon: 'explorer' },
  '-',
  { id: 'desktop', label: 'Desktop', icon: 'folder' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'downloads', label: 'Downloads', icon: 'folder' },
  '-',
  { id: 'thispc', label: 'This PC', icon: 'explorer' },
  { id: 'recycle', label: 'Recycle Bin', icon: 'recycle' },
];

// File Explorer over the Mirror OS file system.
export function createExplorer(ctx) {
  const { fs } = ctx;
  let loc = 'home';
  const back = [];
  let selected = new Set();
  let query = '';

  const el = h(`<div class="fx-app">
      <div class="fx-top">
        <button class="fx-nav" data-go="back" title="Back">${GLYPH.back}</button>
        <button class="fx-nav" data-go="up" title="Up">${GLYPH.up}</button>
        <div class="fx-addr"></div>
        <label class="fx-search">${GLYPH.search}<input placeholder="Search" aria-label="Search"></label>
      </div>
      <div class="fx-cmd"></div>
      <div class="fx-main"><nav class="fx-side"></nav><div class="fx-list" tabindex="-1"></div></div>
      <footer class="fx-status"></footer></div>`);
  const list = el.querySelector('.fx-list');
  const search = el.querySelector('.fx-search input');

  const isFolder = (id) => !['home', 'thispc'].includes(id);
  const title = (id) => (id === 'home' ? 'Home' : id === 'thispc' ? 'This PC' : fs.get(id).name);

  function crumbs() {
    if (!isFolder(loc) || fs.get(loc).root) return [loc];
    const out = [];
    for (let n = fs.get(loc); n; n = n.parent ? fs.get(n.parent) : null) out.unshift(n.id);
    return out;
  }

  function entries() {
    if (loc === 'home') return ['desktop', 'documents', 'downloads'].map(fs.get);
    if (loc === 'thispc') return ['desktop', 'documents', 'downloads'].map(fs.get);
    const items = fs.children(loc).filter((n) => !query || n.name.toLowerCase().includes(query));
    return items.sort((a, b) => (b.type === 'folder') - (a.type === 'folder') || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  function render() {
    const inBin = loc === 'recycle';
    el.querySelector('.fx-addr').innerHTML = `${logo(loc === 'recycle' ? 'recycle' : isFolder(loc) ? 'folder' : 'explorer', 'sm')}${crumbs()
      .map((id) => `<button data-loc="${id}">${esc(title(id))}</button>`)
      .join(`<span class="sep">${GLYPH.chevRight}</span>`)}`;
    el.querySelector('.fx-side').innerHTML = NAV.map((n) =>
      n === '-' ? '<hr>' : `<button data-loc="${n.id}" class="${n.id === loc ? 'on' : ''}">${logo(n.icon, 'sm')}<span>${n.label}</span></button>`,
    ).join('');
    const one = selected.size === 1;
    el.querySelector('.fx-cmd').innerHTML = inBin
      ? `<button data-cmd="empty">${GLYPH.delete}<span>Empty Recycle Bin</span></button><button data-cmd="restore" ${selected.size ? '' : 'disabled'}>${GLYPH.restore}<span>Restore the selected items</span></button>`
      : `<button data-cmd="new" ${isFolder(loc) ? '' : 'disabled'}>${GLYPH.new}<span>New</span></button><i></i>
         <button data-cmd="cut" title="Cut" ${selected.size ? '' : 'disabled'}>${GLYPH.cut}</button>
         <button data-cmd="copy" title="Copy" ${selected.size ? '' : 'disabled'}>${GLYPH.copy}</button>
         <button data-cmd="paste" title="Paste" ${ctx.clipboard.has() && isFolder(loc) ? '' : 'disabled'}>${GLYPH.paste}</button>
         <button data-cmd="rename" title="Rename" ${one ? '' : 'disabled'}>${GLYPH.rename}</button>
         <button data-cmd="delete" title="Delete" ${selected.size ? '' : 'disabled'}>${GLYPH.delete}</button>`;

    const rows = entries();
    if (loc === 'home' || loc === 'thispc') {
      list.innerHTML = `<h4>${loc === 'home' ? 'Quick access' : 'Folders'}</h4><div class="fx-tiles">${rows
        .map((n) => `<button class="fx-tile" data-id="${n.id}">${logo('folder')}<span><b>${esc(n.name)}</b><small>${fs.children(n.id).length} items</small></span></button>`)
        .join('')}</div>${
        loc === 'thispc'
          ? `<h4>Devices and drives</h4><div class="fx-drive">${logo('explorer')}<div><b>Local Disk (C:)</b><div class="meter"><span style="width:62%"></span></div><small>181 GB free of 476 GB</small></div></div>`
          : `<h4>Recent</h4>${table(ctx.recentFiles())}`
      }`;
    } else {
      list.innerHTML = rows.length ? table(rows) : `<p class="fx-empty">${inBin ? 'The Recycle Bin is empty.' : query ? 'No items match your search.' : 'This folder is empty.'}</p>`;
    }
    const count = rows.length;
    el.querySelector('.fx-status').textContent = `${count} item${count === 1 ? '' : 's'}${selected.size ? `  |  ${selected.size} item${selected.size === 1 ? '' : 's'} selected` : ''}`;
  }

  function table(rows) {
    const bin = loc === 'recycle';
    return `<table class="fx-table"><thead><tr><th>Name</th><th>${bin ? 'Original location' : 'Date modified'}</th><th>Type</th><th>Size</th></tr></thead><tbody>${rows
      .map(
        (n) => `<tr data-id="${n.id}" class="${selected.has(n.id) ? 'sel' : ''}"><td>${logo(fs.icon(n), 'sm')}<span class="nm">${esc(n.name)}</span></td>
          <td>${bin ? esc(fs.path(fs.get(n.from))) : ctx.stamp(n.modified)}</td><td>${esc(fs.typeName(n))}</td><td>${fs.size(n)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  }

  function go(id, push = true) {
    if (id === loc) return render();
    if (push) back.push(loc);
    loc = id;
    selected = new Set();
    query = '';
    search.value = '';
    ctx.setTitle('explorer', title(id));
    render();
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-loc],[data-go],[data-cmd]');
    if (!t) return;
    if (t.dataset.loc) go(t.dataset.loc);
    if (t.dataset.go === 'back' && back.length) go(back.pop(), false);
    if (t.dataset.go === 'up') go(isFolder(loc) && !fs.get(loc).root ? fs.get(loc).parent : 'thispc');
    const cmd = t.dataset.cmd;
    const nodes = [...selected].map(fs.get);
    if (cmd === 'new') {
      const r = t.getBoundingClientRect();
      ctx.menu(r.left, r.bottom, [
        { label: 'Folder', glyph: 'new', action: () => fs.create(loc, 'folder') },
        { label: 'Text Document', action: () => fs.create(loc, 'txt') },
        { label: 'Compressed (zipped) Folder', action: () => fs.create(loc, 'zip') },
      ]);
    }
    if (cmd === 'cut' || cmd === 'copy') ctx.clipboard.set(nodes, cmd);
    if (cmd === 'paste') ctx.clipboard.paste(loc);
    if (cmd === 'rename') renameInline(nodes[0]);
    if (cmd === 'delete') fs.remove(nodes);
    if (cmd === 'empty') emptyBin();
    if (cmd === 'restore') fs.restore(nodes);
  });

  async function emptyBin() {
    const n = fs.children('recycle').length;
    if (!n) return;
    const res = await ctx.dialog({ title: 'Delete Multiple Items', body: `<p>Are you sure you want to permanently delete these ${n} items?</p>`, buttons: [{ label: 'Yes', value: 'yes', primary: true }, { label: 'No', value: 'no' }] });
    if (res.value === 'yes') fs.emptyBin();
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return (selected = new Set()), render();
    if (e.ctrlKey) selected.has(row.dataset.id) ? selected.delete(row.dataset.id) : selected.add(row.dataset.id);
    else selected = new Set([row.dataset.id]);
    render();
  });
  list.addEventListener('dblclick', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const n = fs.get(row.dataset.id);
    if (n.type === 'folder') go(n.id);
    else if (loc !== 'recycle') ctx.openNode(n);
  });
  list.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const row = e.target.closest('[data-id]');
    if (row) {
      if (!selected.has(row.dataset.id)) (selected = new Set([row.dataset.id])), render();
      const nodes = [...selected].map(fs.get);
      if (loc === 'recycle')
        return ctx.menu(e.clientX, e.clientY, [
          { label: 'Restore', glyph: 'restore', action: () => fs.restore(nodes) },
          { label: 'Delete', glyph: 'delete', action: () => emptyBin() },
          '-',
          { label: 'Properties', glyph: 'props', action: () => ctx.properties(nodes[0]) },
        ]);
      return ctx.itemMenu(e.clientX, e.clientY, nodes, { rename: renameInline, inFolder: (id) => go(id) });
    }
    if (!isFolder(loc)) return;
    ctx.menu(e.clientX, e.clientY, [
      { label: 'View', glyph: 'view', sub: [{ label: 'Details', radio: true }] },
      { label: 'Sort by', glyph: 'sort', sub: [{ label: 'Name', radio: true }] },
      { label: 'Refresh', glyph: 'refresh', action: render },
      ...(ctx.clipboard.has() ? [{ label: 'Paste', glyph: 'paste', action: () => ctx.clipboard.paste(loc) }] : []),
      '-',
      { label: 'New', glyph: 'new', sub: [{ label: 'Folder', action: () => fs.create(loc, 'folder') }, '-', { label: 'Text Document', action: () => fs.create(loc, 'txt') }] },
      '-',
      { label: 'Properties', glyph: 'props', action: () => ctx.properties(fs.get(loc)) },
      '-',
      { label: 'Open in Terminal', glyph: 'terminal', action: () => ctx.open('terminal', { cwd: loc }) },
    ]);
  });
  list.addEventListener('keydown', (e) => {
    const nodes = [...selected].map(fs.get);
    if (e.key === 'Delete' && nodes.length) fs.remove(nodes);
    if (e.key === 'F2' && nodes.length === 1) renameInline(nodes[0]);
    if (e.key === 'Backspace' && back.length) go(back.pop(), false);
  });
  search.addEventListener('input', () => ((query = search.value.toLowerCase()), render()));

  function renameInline(node) {
    const cell = list.querySelector(`[data-id="${node.id}"] .nm`);
    if (!cell) return;
    const input = document.createElement('input');
    input.className = 'rename';
    input.value = node.name;
    cell.replaceWith(input);
    input.focus();
    const dot = node.type === 'folder' ? -1 : node.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : node.name.length);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (!save || !fs.rename(node, input.value)) render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  fs.on(() => {
    if (isFolder(loc) && !fs.get(loc)) loc = 'home';
    selected = new Set([...selected].filter((id) => fs.get(id)));
    render();
  });
  render();
  return {
    id: 'explorer', name: 'File Explorer', title: 'File Explorer', el, size: [820, 520], offsetX: 60,
    onOpen(arg) {
      if (arg) go(arg);
      else render();
    },
  };
}
