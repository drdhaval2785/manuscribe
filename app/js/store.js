'use strict';
/* Persistence in the browser: IndexedDB holds projects, their PDFs (as Blobs) and rolling
   backups. If IndexedDB is unavailable (some browsers on file://), projects fall back to
   localStorage and the PDF has to be re-selected each session. */
(function (ME) {
  // The name the project had when these stores were first made. It must stay: changing it would
  // leave everything people have already saved in this browser out of reach.
  const DB_NAME = 'lipikara';
  const DB_VERSION = 6;
  const BACKUP_EVERY_MS = 20 * 60 * 1000;
  const BACKUPS_KEPT = 25;
  let db = null;
  let fallback = false;

  function req(r) {
    return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  function tx(store, mode = 'readonly') { return db.transaction(store, mode).objectStore(store); }

  const Store = {
    get fallback() { return fallback; },

    async open() {
      try {
        if (!window.indexedDB) throw new Error('no indexedDB');
        db = await new Promise((resolve, reject) => {
          const r = indexedDB.open(DB_NAME, DB_VERSION);
          r.onupgradeneeded = () => {
            const d = r.result;
            if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('pdfs')) d.createObjectStore('pdfs');
            if (!d.objectStoreNames.contains('backups')) {
              const b = d.createObjectStore('backups', { keyPath: 'key' });
              b.createIndex('project', 'project');
            }
            if (!d.objectStoreNames.contains('editions')) d.createObjectStore('editions', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('fonts')) d.createObjectStore('fonts', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('merges')) d.createObjectStore('merges', { keyPath: 'id' }).createIndex('edition', 'edition');
            if (!d.objectStoreNames.contains('collations')) {
              const c = d.createObjectStore('collations', { keyPath: 'key' });
              c.createIndex('edition', 'edition');
            }
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          // another tab still holds the old database: wait for it, since falling back to
          // localStorage here would make every project look lost
          r.onblocked = () => { Store.blocked = true; alert('Manuscribe needs to update its storage. Please close its other tabs; your work is safe.'); };
        });
        db.onversionchange = () => { db.close(); location.reload(); };
        if (navigator.storage && navigator.storage.persist) Store.persistAsked = navigator.storage.persist().catch(() => false);
      } catch (e) {
        console.warn('IndexedDB unavailable, using localStorage', e);
        fallback = true;
      }
    },

    async listProjects() {
      if (fallback) {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('lipikara.project.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* skip */ } }
        }
        return out.sort((a, b) => (b.modified || 0) - (a.modified || 0));
      }
      const all = await req(tx('projects').getAll());
      return all.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    },

    async getProject(id) {
      if (fallback) { const s = localStorage.getItem('lipikara.project.' + id); return s ? JSON.parse(s) : null; }
      return req(tx('projects').get(id));
    },

    async putProject(p) {
      if (fallback) { localStorage.setItem('lipikara.project.' + p.id, JSON.stringify(p)); return; }
      await req(tx('projects', 'readwrite').put(p));
      await Store.maybeBackup(p);
    },

    async deleteProject(id) {
      if (fallback) { localStorage.removeItem('lipikara.project.' + id); return; }
      await req(tx('projects', 'readwrite').delete(id));
      await req(tx('pdfs', 'readwrite').delete(id));
      const keys = await req(tx('backups').index('project').getAllKeys(id));
      const s = tx('backups', 'readwrite');
      for (const k of keys) s.delete(k);
    },

    async listEditions() {
      if (fallback) {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith('lipikara.edition.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* skip */ } }
        }
        return out.sort((a, b) => (b.modified || 0) - (a.modified || 0));
      }
      const all = await req(tx('editions').getAll());
      return all.sort((a, b) => (b.modified || 0) - (a.modified || 0));
    },

    async getEdition(id) {
      if (fallback) { const s = localStorage.getItem('lipikara.edition.' + id); return s ? JSON.parse(s) : null; }
      return req(tx('editions').get(id));
    },

    async putEdition(ed) {
      if (fallback) { localStorage.setItem('lipikara.edition.' + ed.id, JSON.stringify(ed)); return; }
      await req(tx('editions', 'readwrite').put(ed));
    },

    async deleteEdition(id) {
      if (fallback) { localStorage.removeItem('lipikara.edition.' + id); return; }
      await req(tx('editions', 'readwrite').delete(id));
      await Store.deleteCollations(id);
    },

    // Fonts the editor gives for printing: {id, name, format, data (base64)}
    async getFont(id) { if (fallback) return null; return req(tx('fonts').get(id)); },
    async putFont(f) { if (fallback) return false; await req(tx('fonts', 'readwrite').put(f)); return true; },
    async deleteFont(id) { if (fallback) return; await req(tx('fonts', 'readwrite').delete(id)); },

    // Both copies of an edition as they were before a merge, kept until the editor deletes them: {id, edition, when, by, mine, theirs}
    async listMerges(edition) { if (fallback) return []; return (await req(tx('merges').index('edition').getAll(edition))).sort((a, b) => b.when - a.when); },
    async putMerge(m) { if (fallback) return false; await req(tx('merges', 'readwrite').put(m)); return true; },
    async deleteMerge(id) { if (fallback) return; await req(tx('merges', 'readwrite').delete(id)); },

    // Text packs for the concordance: {id, name, licence, source, lines}
    async listPacks() { if (fallback) return []; return req(tx('packs').getAll()); },
    async putPack(pk) { if (fallback) return false; await req(tx('packs', 'readwrite').put(pk)); return true; },
    async deletePack(id) { if (fallback) return; await req(tx('packs', 'readwrite').delete(id)); },

    // Collation tables, one per citation block of a work. Without IndexedDB they do not fit: browsers
    // give localStorage a few MB, and a table can always be made again.
    async listCollations(edition) {
      if (fallback) return [];
      return req(tx('collations').index('edition').getAll(edition));
    },

    async getCollation(key) {
      if (fallback) return null;
      return req(tx('collations').get(key));
    },

    async putCollation(rec) {
      if (fallback) return false;
      await req(tx('collations', 'readwrite').put(rec));
      return true;
    },

    async deleteCollation(key) {
      if (fallback) return;
      await req(tx('collations', 'readwrite').delete(key));
    },

    async deleteCollations(edition) {
      if (fallback) return;
      const keys = await req(tx('collations').index('edition').getAllKeys(edition));
      const s = tx('collations', 'readwrite');
      for (const k of keys) s.delete(k);
    },

    async putPdf(id, blob) {
      if (fallback) return false;
      try { await req(tx('pdfs', 'readwrite').put(blob, id)); return true; } catch (e) { console.warn(e); return false; }
    },

    async getPdf(id) {
      if (fallback) return null;
      return req(tx('pdfs').get(id));
    },

    async maybeBackup(p) {
      const last = Store._lastBackup[p.id] || 0;
      if (Date.now() - last < BACKUP_EVERY_MS) return;
      Store._lastBackup[p.id] = Date.now();
      try {
        await req(tx('backups', 'readwrite').put({ key: p.id + '@' + Date.now(), project: p.id, when: Date.now(), data: JSON.stringify(p) }));
        const keys = await req(tx('backups').index('project').getAllKeys(p.id));
        if (keys.length > BACKUPS_KEPT) {
          const s = tx('backups', 'readwrite');
          keys.sort().slice(0, keys.length - BACKUPS_KEPT).forEach((k) => s.delete(k));
        }
      } catch (e) { console.warn('backup failed', e); }
    },
    _lastBackup: {},

    // what the browser promises about this data, for showing to the user
    async status() {
      const out = { limited: fallback, persisted: false, usedMB: null, quotaMB: null };
      if (!navigator.storage) return out;
      await Store.persistAsked;
      if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted().catch(() => false);
      if (navigator.storage.estimate) {
        const e = await navigator.storage.estimate().catch(() => ({}));
        if (e.quota) { out.usedMB = Math.round(e.usage / 1048576); out.quotaMB = Math.round(e.quota / 1048576); }
      }
      return out;
    },

    // whatever the time since the last one; false if this browser cannot keep backups
    async backupNow(p) {
      if (fallback) return false;
      Store._lastBackup[p.id] = 0;
      await Store.maybeBackup(p);
      return true;
    },

    async listBackups(projectId) {
      if (fallback) return [];
      const all = await req(tx('backups').index('project').getAll(projectId));
      return all.sort((a, b) => b.when - a.when);
    },
  };

  ME.Store = Store;
})(window.ME);
