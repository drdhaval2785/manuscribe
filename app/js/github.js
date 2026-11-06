'use strict';
/* An edition kept in a GitHub repository, through GitHub's REST API, which answers a page from any origin.
   The editor pastes a token; it stays in memory unless they ask for it to be remembered on this computer.
   Each send is one commit of the package's files, made only on top of what was last fetched or sent, so two
   editors never overwrite each other: whoever is behind fetches and merges first. PDFs are never sent. */
(function (ME) {
  const { Edition } = ME;
  const G = { API: 'https://api.github.com', token: null };
  const KEY = 'manuscribe.github.token';

  G.loadToken = () => { if (!G.token) { try { G.token = localStorage.getItem(KEY) || null; } catch (e) { /* not kept */ } } return G.token; };
  G.setToken = (t, remember) => {
    G.token = (t || '').trim() || null;
    try { if (remember && G.token) localStorage.setItem(KEY, G.token); else localStorage.removeItem(KEY); } catch (e) { /* not kept */ }
  };
  G.remembered = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };

  async function api(method, path, body) {
    if (!G.token) throw new Error('Paste a GitHub token first');
    let res;
    try {
      res = await fetch(G.API + path, { method, cache: 'no-store', headers: Object.assign({ Authorization: 'Bearer ' + G.token, Accept: 'application/vnd.github+json' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error('GitHub could not be reached: ' + e.message); }
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch (e) { /* no body */ }
      const err = new Error(res.status === 401 ? 'GitHub did not accept the token' : res.status === 409 && /empty/i.test(msg) ? 'The repository is empty' : 'GitHub said ' + res.status + (msg ? ': ' + msg : ''));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? {} : res.json();
  }

  const repoPath = (c) => '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo);
  const prefixOf = (c) => (c.folder ? c.folder.replace(/^\/+|\/+$/g, '') + '/' : '');
  // the files Manuscribe owns in the folder: only these are replaced or removed
  const OWNED = (name) => /^(edition\.json|manifest\.json|README\.txt|witnesses\/|collation\/|profiles\/|output\/)/.test(name);
  G.refuse = (name, data) => /\.pdf$/i.test(name) || typeof data !== 'string';

  // A file's id in Git: SHA-1 of "blob <length>\0<bytes>".
  G.gitSha = async function (textData) {
    const body = new TextEncoder().encode(textData);
    const headBytes = new TextEncoder().encode('blob ' + body.length + '\0');
    const all = new Uint8Array(headBytes.length + body.length);
    all.set(headBytes); all.set(body, headBytes.length);
    const d = await crypto.subtle.digest('SHA-1', all);
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  };

  G.check = async function (c) {
    const repo = await api('GET', repoPath(c));
    if (!repo) throw new Error('No repository ' + c.owner + '/' + c.repo + ' that this token can see');
    return { branch: c.branch || repo.default_branch || 'main', canPush: !repo.permissions || !!repo.permissions.push, private: !!repo.private };
  };

  async function remoteTree(c) {
    let ref;
    try { ref = await api('GET', repoPath(c) + '/git/ref/heads/' + encodeURIComponent(c.branch)); } catch (e) { if (e.status === 409) return null; throw e; }
    if (!ref) return null;
    const head = ref.object.sha;
    const commit = await api('GET', repoPath(c) + '/git/commits/' + head);
    const tree = await api('GET', repoPath(c) + '/git/trees/' + commit.tree.sha + '?recursive=1');
    const prefix = prefixOf(c);
    const files = new Map();
    for (const x of tree.tree) if (x.type === 'blob' && x.path.startsWith(prefix)) files.set(x.path.slice(prefix.length), x.sha);
    return { head, tree: commit.tree.sha, files };
  }

  /* Sends the edition as one commit. Refused if the repository has moved on since this copy last fetched or
     sent: fetch and merge first. -> {commit, changed} */
  G.push = async function (ed, message) {
    const c = ed.github;
    if (!c || !c.owner || !c.repo) throw new Error('Say which repository first');
    const { files } = await Edition.buildPackage(ed);
    const refused = files.filter((f) => G.refuse(f.name, f.data));
    if (refused.length) throw new Error('PDFs and other binary files are never sent to GitHub: ' + refused.map((f) => f.name).join(', '));
    const prefix = prefixOf(c);
    let remote = await remoteTree(c);
    if (!remote) {
      // an empty repository has no branch yet: one file through the contents API makes it
      const readme = files.find((f) => f.name === 'README.txt');
      await api('PUT', repoPath(c) + '/contents/' + encodeURIComponent(prefix + 'README.txt').replace(/%2F/g, '/'), { message: 'Start the edition', content: btoa(unescape(encodeURIComponent(readme.data))), branch: c.branch });
      remote = await remoteTree(c);
      if (!remote) throw new Error('The branch ' + c.branch + ' could not be made');
      c.lastCommit = remote.head;
    }
    if (c.lastCommit ? remote.head !== c.lastCommit : remote.files.has('edition.json')) {
      const err = new Error('The repository has changes this copy has not seen. Fetch and merge them first, then send.');
      err.behind = true;
      throw err;
    }
    const entries = [];
    const here = new Set(files.map((f) => f.name));
    for (const f of files) {
      const sha = await G.gitSha(f.data);
      if (remote.files.get(f.name) === sha) continue;
      if (f.data.length > 500000) {
        const blob = await api('POST', repoPath(c) + '/git/blobs', { content: f.data, encoding: 'utf-8' });
        entries.push({ path: prefix + f.name, mode: '100644', type: 'blob', sha: blob.sha });
      } else entries.push({ path: prefix + f.name, mode: '100644', type: 'blob', content: f.data });
    }
    for (const name of remote.files.keys()) if (OWNED(name) && !here.has(name)) entries.push({ path: prefix + name, mode: '100644', type: 'blob', sha: null });
    // the manifest names when it was made, so on its own it is no change
    if (entries.every((e) => e.path === prefix + 'manifest.json')) entries.length = 0;
    let commit = remote.head;
    if (entries.length) {
      const tree = await api('POST', repoPath(c) + '/git/trees', { base_tree: remote.tree, tree: entries });
      const made = await api('POST', repoPath(c) + '/git/commits', { message: message || 'Changes to the edition', tree: tree.sha, parents: [remote.head] });
      await api('PATCH', repoPath(c) + '/git/refs/heads/' + encodeURIComponent(c.branch), { sha: made.sha, force: false });
      commit = made.sha;
    }
    c.lastCommit = commit;
    c.lastSync = Date.now();
    await Edition.remember(ed, { files: new Map(files.map((f) => [f.name, f.data])), manifest: null });
    await Edition.save(ed);
    return { commit, changed: entries.length };
  };

  const decode = (b64) => { const bin = atob(b64.replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

  /* The edition as the repository has it, as package files. Files this copy already has are not fetched again.
     PDFs found there are left where they are and named. -> {zip: Map(name -> bytes or text), head, refused} */
  G.fetch = async function (c, local) {
    const remote = await remoteTree(c);
    if (!remote) throw new Error('The repository has no branch ' + c.branch + ' yet');
    if (!remote.files.has('edition.json')) throw new Error('There is no edition in ' + c.owner + '/' + c.repo + (c.folder ? '/' + c.folder : ''));
    const mineBy = new Map();
    for (const [name, data] of local || []) mineBy.set(name, data);
    const zip = new Map();
    const refused = [];
    for (const [name, sha] of remote.files) {
      if (/\.pdf$/i.test(name)) { refused.push(name); continue; }
      if (!OWNED(name)) continue;
      const have = mineBy.get(name);
      if (typeof have === 'string' && (await G.gitSha(have)) === sha) { zip.set(name, have); continue; }
      const blob = await api('GET', repoPath(c) + '/git/blobs/' + sha);
      zip.set(name, blob.encoding === 'base64' ? decode(blob.content) : blob.content);
    }
    return { zip, head: remote.head, refused };
  };

  ME.GitHub = G;
})(window.ME);
