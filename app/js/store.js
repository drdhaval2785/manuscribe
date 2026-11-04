'use strict';
/* Persistence in the browser: IndexedDB holds projects, their PDFs (as Blobs) and rolling
   backups. If IndexedDB is unavailable (some browsers on file://), projects fall back to
   localStorage and the PDF has to be re-selected each session. */
(function (ME) {
  // The name the project had when these stores were first made. It must stay: changing it would
  // leave everything people have already saved in this browser out of reach.
  const DB_NAME = 'lipikara';
  const DB_VERSION = 1;
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
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          r.onblocked = () => reject(new Error('blocked'));
        });
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
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

    async listBackups(projectId) {
      if (fallback) return [];
      const all = await req(tx('backups').index('project').getAll(projectId));
      return all.sort((a, b) => b.when - a.when);
    },
  };

  ME.Store = Store;
})(window.ME);
