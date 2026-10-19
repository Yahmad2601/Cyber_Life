import { esc, GLYPH } from '../util.js';

// Mirror OS context menus. Items:
//   '-'                                        separator
//   { label, glyph, shortcut, action }         command
//   { label, sub: [...] }                      submenu
//   { label, checked: bool } / { radio: bool } toggles (shown with ✓ or •)
//   { row: [{ glyph, title, action }] }        icon row at the top (cut/copy/rename/delete)
let current = null;

export function closeMenu() {
  current?.remove();
  current = null;
}

export function openMenu(host, x, y, items, { classic = false } = {}) {
  closeMenu();
  const root = document.createElement('div');
  root.className = 'ctx-layer';
  host.appendChild(root);
  current = root;
  const hostBox = host.getBoundingClientRect();
  const panel = build(items, classic);
  root.appendChild(panel);
  place(panel, x - hostBox.left, y - hostBox.top, hostBox);

  function build(list, classicStyle) {
    const m = document.createElement('div');
    m.className = `ctx${classicStyle ? ' classic' : ''}`;
    m.setAttribute('role', 'menu');
    const hasMarks = list.some((it) => typeof it === 'object' && (it.glyph || 'checked' in it || 'radio' in it));
    for (const it of list) {
      if (it === '-') {
        m.insertAdjacentHTML('beforeend', '<div class="ctx-sep"></div>');
        continue;
      }
      if (it.row) {
        const row = document.createElement('div');
        row.className = 'ctx-row';
        for (const b of it.row) {
          const btn = document.createElement('button');
          btn.innerHTML = GLYPH[b.glyph];
          btn.title = b.title;
          btn.disabled = !!b.disabled;
          btn.addEventListener('click', () => (closeMenu(), b.action?.()));
          row.appendChild(btn);
        }
        m.appendChild(row);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'ctx-item';
      btn.setAttribute('role', 'menuitem');
      btn.disabled = !!it.disabled;
      const mark = it.checked ? GLYPH.check : it.radio ? GLYPH.dot : it.glyph && !classicStyle ? GLYPH[it.glyph] : '';
      btn.innerHTML = `${hasMarks || classicStyle ? `<span class="ctx-mark">${mark}</span>` : ''}<span class="ctx-label">${esc(it.label)}</span>${
        it.shortcut ? `<span class="ctx-key">${esc(it.shortcut)}</span>` : ''
      }${it.sub ? `<span class="ctx-arrow">${GLYPH.chevRight}</span>` : ''}`;
      if (it.sub) {
        let subEl = null;
        const openSub = () => {
          m.querySelectorAll(':scope > .ctx-item.open').forEach((o) => o !== btn && o._close?.());
          if (subEl) return;
          btn.classList.add('open');
          subEl = build(it.sub, classicStyle);
          root.appendChild(subEl);
          const r = btn.getBoundingClientRect();
          const w = subEl.offsetWidth;
          const left = r.right + w - 2 > hostBox.right ? r.left - w + 2 : r.right - 2;
          place(subEl, left - hostBox.left, r.top - hostBox.top - 4, hostBox, true);
          btn._close = () => {
            subEl?.remove();
            subEl = null;
            btn.classList.remove('open');
          };
        };
        btn.addEventListener('mouseenter', openSub);
        btn.addEventListener('click', openSub);
      } else {
        btn.addEventListener('mouseenter', () => m.querySelectorAll(':scope > .ctx-item.open').forEach((o) => o._close?.()));
        btn.addEventListener('click', () => {
          closeMenu();
          it.action?.();
        });
      }
      m.appendChild(btn);
    }
    return m;
  }

  function place(el, x, y, box, exact = false) {
    const w = el.offsetWidth, hh = el.offsetHeight;
    let left = exact ? x : x + w > box.width - 4 ? x - w : x;
    let top = y + hh > box.height - 4 ? Math.max(4, exact ? box.height - hh - 4 : y - hh) : y;
    el.style.left = `${Math.max(4, Math.min(left, box.width - w - 4))}px`;
    el.style.top = `${top}px`;
  }

  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.ctx')) closeMenu();
  });
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!e.target.closest('.ctx')) closeMenu();
  });
  return root;
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
