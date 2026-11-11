'use strict';
/* Modal dialogs and form building. */
(function (ME) {
  const { U } = ME;
  const UI = {};

  UI.isModalOpen = () => !!document.querySelector('.modal-backdrop');

  /* A row of controls (a flex row that wraps) that folds: when the row does not fit on one line, its last children go
     into a ⋯ menu at its end, one by one, until it does or only the first `keep` are left; measured again whenever
     the row changes size (a phone turned, a window narrowed), and everything comes back when there is room.
     -> the menu element */
  UI.foldRow = function (row, opts) {
    const keep = (opts && opts.keep) || 0;
    const items = U.el('div', { class: 'menu-items' });
    const menu = U.el('details', { class: 'menu fold-menu', hidden: true }, U.el('summary', { class: 'btn small', title: 'More' }, '⋯'), items);
    const all = [...row.children];
    row.appendChild(menu);
    let busy = false;
    const fit = () => {
      if (busy || !row.isConnected) return;
      busy = true;
      try {
        // everything back in the row; then, while it wraps, the last ones out
        for (const c of all) if (c.parentNode !== row) row.insertBefore(c, menu);
        menu.hidden = true;
        menu.open = false;
        const tallest = () => Math.max(1, ...all.filter((c) => c.parentNode === row).map((c) => c.getBoundingClientRect().height));
        const wraps = () => row.getBoundingClientRect().height > tallest() * 1.6;
        for (let k = all.length - 1; k >= keep && wraps(); k--) { menu.hidden = false; items.insertBefore(all[k], items.firstChild); }
      } finally { busy = false; }
    };
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(row);
    requestAnimationFrame(fit);
    menu.fit = fit;
    return menu;
  };

  // on a phone the longer explanations are clamped to two lines (app.css): a tap opens one, another closes it
  document.addEventListener('click', (e) => {
    if (!ME.Device || !ME.Device.narrow() || !e.target.closest) return;
    const p = e.target.closest('p.help');
    if (p && !e.target.closest('a, button, input, select, label, summary')) p.classList.toggle('open');
  });

  /* A menu (details.menu) opens under its button, to the right; one that would run past the right edge of the screen
     (on a phone, a menu at the right of a bar) opens leftwards instead. */
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('menu') || !d.open) return;
    const items = d.querySelector('.menu-items');
    if (!items) return;
    items.classList.remove('flip');
    const r = items.getBoundingClientRect();
    if (r.right > window.innerWidth - 4 && r.left > window.innerWidth / 3) items.classList.add('flip');
  }, true);
  UI.translitBadge = () => ''; // set by the app: the active typing scheme

  // buttons: [{label, value, kind: 'primary'|'danger'|'ghost', validate?: () => bool}]
  UI.modal = function ({ title, body, buttons, wide, className, onOpen }) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const backdrop = U.el('div', { class: 'modal-backdrop' });
      const dlg = U.el('div', { class: 'modal' + (wide ? ' wide' : '') + (className ? ' ' + className : ''), role: 'dialog', 'aria-modal': 'true' });
      const head = U.el('div', { class: 'modal-head' }, U.el('h2', null, title || ''), U.el('button', { class: 'icon-btn', title: 'Close (Esc)', onclick: () => close(null) }, '×'));
      const bodyEl = U.el('div', { class: 'modal-body' });
      if (body) bodyEl.appendChild(typeof body === 'function' ? body() : body);
      const foot = U.el('div', { class: 'modal-foot' });
      let primary = null;
      for (const b of buttons || [{ label: 'Close', value: null }]) {
        const btn = U.el('button', { class: 'btn ' + (b.kind || ''), type: 'button' }, b.label);
        btn.addEventListener('click', () => {
          if (b.validate && !b.validate()) return;
          close(typeof b.value === 'function' ? b.value() : b.value);
        });
        if (b.left) btn.classList.add('left');
        foot.appendChild(btn);
        if (b.kind === 'primary') primary = btn;
      }
      dlg.append(head, bodyEl, foot);
      backdrop.appendChild(dlg);
      document.body.appendChild(backdrop);

      function close(v) {
        backdrop.remove();
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
        resolve(v);
      }
      function onKey(e) {
        // a part of the dialog that has something of its own to leave first says so: data-escape="own"
        if (e.key === 'Escape') { if (e.target.closest && e.target.closest('[data-escape="own"]')) return; e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Enter' && primary && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !e.target.closest('.no-enter')) {
          e.preventDefault(); e.stopPropagation(); primary.click();
        }
      }
      document.addEventListener('keydown', onKey, true);
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(null); });
      requestAnimationFrame(() => {
        const f = dlg.querySelector('[data-focus]') || dlg.querySelector('input:not([type=checkbox]):not([type=file]), textarea, select');
        if (f) { f.focus(); try { if (f.select) f.select(); } catch (e) { /* not selectable */ } }
        if (onOpen) onOpen(dlg, close);
      });
    });
  };

  UI.confirm = async function (message, { title = 'Please confirm', ok = 'OK', danger = false } = {}) {
    const r = await UI.modal({
      title, body: U.el('p', { class: 'confirm-text' }, message),
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }],
    });
    return !!r;
  };

  UI.prompt = async function (title, label, value, { validate, help } = {}) {
    const input = U.el('input', { type: 'text', value: value || '', 'data-focus': true });
    const err = U.el('div', { class: 'field-error' });
    const body = U.el('div', null, U.el('label', { class: 'field' }, U.el('span', null, label), input), help ? U.el('p', { class: 'help' }, help) : null, err);
    return UI.modal({
      title, body,
      buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }, {
        label: 'OK', kind: 'primary', value: () => input.value.trim(),
        validate: () => { const m = validate ? validate(input.value.trim()) : null; err.textContent = m || ''; return !m; },
      }],
    });
  };

  /* fields: [{n, label, type: text|number|select|combo|textarea|checkbox|choices, options, labels, def, focus, help, required}] */
  UI.form = function (fields, values) {
    const el = U.el('div', { class: 'form' });
    const getters = {};
    let listId = 0;
    for (const f of fields) {
      const v = values && values[f.n] !== undefined ? values[f.n] : (f.def !== undefined ? f.def : '');
      let input;
      if (f.type === 'select') {
        // a value not in the list (e.g. from an imported transcription) stays selectable
        const opts = (f.options || []).map(String).includes(String(v)) ? f.options || [] : (f.options || []).concat(v);
        input = U.el('select', null, opts.map((o, i) => U.el('option', { value: o, selected: String(o) === String(v) }, (f.labels && f.labels[i]) || o || '—')));
        getters[f.n] = () => input.value;
      } else if (f.type === 'textarea') {
        input = U.el('textarea', { rows: f.rows || 3 });
        input.value = v;
        getters[f.n] = () => input.value;
      } else if (f.type === 'checkbox') {
        input = U.el('input', { type: 'checkbox', checked: !!v });
        getters[f.n] = () => input.checked;
      } else if (f.type === 'choices') {
        // free text plus one-click choices (e.g. metamark signs)
        input = U.el('input', { type: 'text', value: v });
        const chips = U.el('div', { class: 'choices' }, (f.options || []).map((o) => U.el('button', { type: 'button', class: 'choice', onclick: () => { input.value = o; input.focus(); } }, o)));
        getters[f.n] = () => input.value;
        el.appendChild(U.el('label', { class: 'field' }, U.el('span', null, f.label), input, chips));
        if (f.focus) input.setAttribute('data-focus', '');
        continue;
      } else {
        input = U.el('input', { type: f.type === 'number' ? 'number' : 'text', value: v, min: f.type === 'number' ? '0' : null });
        if (f.type === 'combo' && f.options) {
          const id = 'dl-' + Date.now().toString(36) + '-' + (listId++);
          input.setAttribute('list', id);
          el.appendChild(U.el('datalist', { id }, f.options.filter((o) => o !== '').map((o) => U.el('option', { value: o }))));
        }
        getters[f.n] = () => input.value.trim();
      }
      if (f.focus) input.setAttribute('data-focus', '');
      if (f.placeholder) input.setAttribute('placeholder', f.placeholder);
      input.dataset.n = f.n;
      // text in the manuscript's language is typed with the chosen transliteration scheme
      const badge = f.translit ? U.el('span', { class: 'tl-badge' }, UI.translitBadge()) : null;
      if (f.translit) input.dataset.translit = '1';
      const lab = U.el('label', { class: 'field' + (f.type === 'checkbox' ? ' check' : '') },
        f.type === 'checkbox' ? input : null, U.el('span', null, f.label, badge), f.type === 'checkbox' ? null : input);
      if (f.help) lab.appendChild(U.el('small', { class: 'help' }, f.help));
      el.appendChild(lab);
    }
    return {
      el,
      values() { const o = {}; for (const k of Object.keys(getters)) o[k] = getters[k](); return o; },
    };
  };

  ME.UI = UI;
})(window.ME);
