// A tiny in-memory file system for Mirror OS: Desktop, Documents, Downloads
// and the Recycle Bin. Nodes are plain objects; listeners re-render views.

const TYPE_NAMES = {
  folder: 'File folder', txt: 'Text Document', csv: 'CSV File', pdf: 'PDF Document', zip: 'Compressed (zipped) Folder',
  app: 'Shortcut', recycle: 'System folder',
};
const EXT = { txt: '.txt', csv: '.csv', pdf: '.pdf', zip: '.zip' };

export function createFs({ user, now }) {
  const nodes = new Map();
  const listeners = new Set();
  let seq = 0;
  let lastUndo = null; // { label, run }

  const home = `C:\\Users\\${user}`;
  const ROOTS = {
    desktop: { name: 'Desktop', path: `${home}\\Desktop` },
    documents: { name: 'Documents', path: `${home}\\Documents` },
    downloads: { name: 'Downloads', path: `${home}\\Downloads` },
    recycle: { name: 'Recycle Bin', path: 'Recycle Bin' },
  };
  for (const [id, r] of Object.entries(ROOTS)) nodes.set(id, { id, name: r.name, type: 'folder', root: true, parent: null, modified: now() });

  const emit = () => listeners.forEach((fn) => fn());

  function add(parent, props) {
    const node = { modified: now(), created: now(), ...props, id: `n${++seq}`, parent };
    nodes.set(node.id, node);
    emit();
    return node;
  }

  function children(folderId) {
    return [...nodes.values()].filter((n) => n.parent === folderId);
  }

  // "New folder", "New folder (2)", ...
  function uniqueName(parent, base, ext = '') {
    const taken = new Set(children(parent).map((n) => n.name.toLowerCase()));
    for (let i = 1; ; i++) {
      const name = `${base}${i > 1 ? ` (${i})` : ''}${ext}`;
      if (!taken.has(name.toLowerCase())) return name;
    }
  }

  function create(parent, type) {
    const base = type === 'folder' ? 'New folder' : type === 'zip' ? 'New Compressed (zipped) Folder' : 'New Text Document';
    return add(parent, { type, name: uniqueName(parent, base, EXT[type] || ''), content: '' });
  }

  function rename(node, name) {
    name = name.trim();
    if (!name || name === node.name) return false;
    if (children(node.parent).some((n) => n !== node && n.name.toLowerCase() === name.toLowerCase())) name = uniqueName(node.parent, name);
    const old = node.name;
    node.name = name;
    node.modified = now();
    lastUndo = { label: 'Undo Rename', run: () => ((node.name = old), emit()) };
    emit();
    return true;
  }

  function remove(list) {
    list = [].concat(list).filter((n) => n.type !== 'recycle' && !n.root);
    if (!list.length) return;
    for (const n of list) Object.assign(n, { from: n.parent, parent: 'recycle', deletedAt: now() });
    lastUndo = { label: 'Undo Delete', run: () => (list.forEach(restoreOne), emit()) };
    emit();
  }
  function restoreOne(n) {
    if (n.parent !== 'recycle') return;
    n.parent = n.from;
    delete n.from;
  }
  function restore(list) {
    [].concat(list).forEach(restoreOne);
    emit();
  }
  function emptyBin() {
    for (const n of children('recycle')) nodes.delete(n.id);
    emit();
  }

  function size(n) {
    if (n.type === 'folder' || n.type === 'recycle') return '';
    if (n.type === 'app') return '2 KB';
    if (n.size) return n.size;
    const kb = Math.max(n.content ? 1 : 0, Math.ceil((n.content || '').length / 1024));
    return `${kb} KB`;
  }

  function path(n) {
    if (n.root) return ROOTS[n.id].path;
    if (n.parent === 'recycle') return `Recycle Bin\\${n.name}`;
    return `${path(nodes.get(n.parent))}\\${n.name}`;
  }

  return {
    ROOTS, home,
    get: (id) => nodes.get(id),
    add, children, create, rename, remove, restore, emptyBin, size, path,
    typeName: (n) => TYPE_NAMES[n.type] || 'File',
    icon: (n) => (n.type === 'app' ? n.app : n.type === 'recycle' ? 'recycle' : n.type),
    undo: () => lastUndo,
    runUndo() {
      const u = lastUndo;
      lastUndo = null;
      u?.run();
    },
    touch: (n) => ((n.modified = now()), emit()),
    on: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
}
