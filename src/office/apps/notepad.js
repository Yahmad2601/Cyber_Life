import { esc, h } from '../util.js';

// Notepad for .txt and .csv files on the Mirror OS file system.
export function createNotepad(ctx) {
  const { fs } = ctx;
  let file = null; // fs node, or null for an unsaved "Untitled"
  let dirty = false;
  let wrap = true;
  let statusBar = true;

  const el = h(`<div class="np-app">
      <nav class="np-menu"><button data-m="file">File</button><button data-m="edit">Edit</button><button data-m="view">View</button></nav>
      <textarea spellcheck="false" aria-label="Text editor"></textarea>
      <footer class="np-status"><span class="pos">Ln 1, Col 1</span><span>100%</span><span>Windows (CRLF)</span><span>UTF-8</span></footer></div>`);
  const ta = el.querySelector('textarea');

  const name = () => (file ? file.name : 'Untitled');
  const retitle = () => ctx.setTitle('notepad', `${dirty ? '*' : ''}${name()} - Notepad`);

  function load(node) {
    file = node;
    ta.value = node ? node.content || '' : '';
    dirty = false;
    ta.readOnly = !!node?.readOnly;
    retitle();
    pos();
  }

  async function save(as = false) {
    if (file?.readOnly) as = true;
    if (!file || as) {
      const folders = ['desktop', 'documents', 'downloads'];
      const res = await ctx.dialog({
        title: 'Save as',
        body: `<label class="field">File name<input name="name" value="${esc(file && !file.readOnly ? file.name : '*.txt')}"></label>
          <label class="field">Save in<select name="folder">${folders.map((f) => `<option value="${f}">${fs.get(f).name}</option>`).join('')}</select></label>`,
        buttons: [{ label: 'Save', value: 'ok', primary: true }, { label: 'Cancel', value: 'cancel' }],
      });
      if (res.value !== 'ok') return false;
      let fname = String(res.form.get('name') || '').replace(/^\*/, '').trim() || 'Untitled';
      if (!/\.\w+$/.test(fname)) fname += '.txt';
      const type = fname.toLowerCase().endsWith('.csv') ? 'csv' : 'txt';
      file = fs.add(res.form.get('folder'), { type, name: fname, content: ta.value });
    } else {
      file.content = ta.value;
      fs.touch(file);
    }
    dirty = false;
    retitle();
    return true;
  }

  // Closing with unsaved changes asks first, like the real thing.
  async function confirmDiscard() {
    if (!dirty) return true;
    const res = await ctx.dialog({
      title: 'Notepad',
      body: `<p>Do you want to save changes to ${esc(name())}?</p>`,
      buttons: [{ label: 'Save', value: 'save', primary: true }, { label: "Don't save", value: 'no' }, { label: 'Cancel', value: 'cancel' }],
    });
    if (res.value === 'cancel') return false;
    if (res.value === 'save') return save();
    return true;
  }

  function pos() {
    const before = ta.value.slice(0, ta.selectionStart).split('\n');
    el.querySelector('.pos').textContent = `Ln ${before.length}, Col ${before.at(-1).length + 1}`;
  }

  ta.addEventListener('input', () => {
    if (!dirty) (dirty = true), retitle();
    pos();
  });
  ta.addEventListener('keyup', pos);
  ta.addEventListener('click', pos);
  ta.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') (e.preventDefault(), save(e.shiftKey));
    if (e.key === 'F5') (e.preventDefault(), insert(ctx.stamp(ctx.now())));
  });

  function insert(text) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  }

  el.querySelector('.np-menu').addEventListener('click', (e) => {
    const m = e.target.closest('[data-m]')?.dataset.m;
    if (!m) return;
    const r = e.target.getBoundingClientRect();
    const menus = {
      file: [
        { label: 'New', shortcut: 'Ctrl+N', action: async () => (await confirmDiscard()) && load(null) },
        { label: 'Open…', shortcut: 'Ctrl+O', action: () => ctx.open('explorer', 'documents') },
        { label: 'Save', shortcut: 'Ctrl+S', action: () => save() },
        { label: 'Save as', shortcut: 'Ctrl+Shift+S', action: () => save(true) },
        '-',
        { label: 'Close window', shortcut: 'Ctrl+W', action: () => ctx.close('notepad') },
      ],
      edit: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => (ta.focus(), document.execCommand('undo')) },
        '-',
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => (ta.focus(), document.execCommand('cut')) },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => (ta.focus(), document.execCommand('copy')) },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => (ta.focus(), navigator.clipboard?.readText().then(insert).catch(() => {})) },
        '-',
        { label: 'Select all', shortcut: 'Ctrl+A', action: () => (ta.focus(), ta.select()) },
        { label: 'Time/Date', shortcut: 'F5', action: () => insert(ctx.stamp(ctx.now())) },
      ],
      view: [
        { label: 'Status bar', checked: statusBar, action: () => ((statusBar = !statusBar), (el.querySelector('.np-status').hidden = !statusBar)) },
        { label: 'Word wrap', checked: wrap, action: () => ((wrap = !wrap), ta.classList.toggle('nowrap', !wrap)) },
      ],
    };
    ctx.menu(r.left, r.bottom + 2, menus[m]);
  });

  load(null);
  return {
    id: 'notepad', name: 'Notepad', title: 'Untitled - Notepad', el, size: [640, 460], offsetX: 120,
    async onOpen(node) {
      if (node && node !== file) {
        if (!(await confirmDiscard())) return;
        load(node);
      }
      ta.focus({ preventScroll: true });
      if (node) (ta.setSelectionRange(0, 0), (ta.scrollTop = 0));
    },
    beforeClose: confirmDiscard,
  };
}
