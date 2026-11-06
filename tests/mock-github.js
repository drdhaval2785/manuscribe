// A stand-in for the part of GitHub's REST API that Manuscribe uses, for the tests: refs, commits, trees, blobs
// and the contents API on an empty repository, with CORS as GitHub sends it. Blob ids are real Git blob SHA-1s.
const http = require('http');
const crypto = require('crypto');

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const blobSha = (buf) => sha1(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf]));

function start(token) {
  const repo = { blobs: new Map(), trees: new Map(), commits: new Map(), refs: new Map(), requests: [] };
  const putBlob = (buf) => { const s = blobSha(buf); repo.blobs.set(s, buf); return s; };
  const putTree = (files) => { const s = sha1(Buffer.from(JSON.stringify([...files].sort()))); repo.trees.set(s, new Map(files)); return s; };
  const putCommit = (c) => { const s = sha1(Buffer.from(JSON.stringify(c) + Math.random())); repo.commits.set(s, c); return s; };
  // for a test to put a file there directly, as another program would
  repo.addFile = (branch, path, content) => {
    const head = repo.refs.get(branch);
    const files = new Map(repo.trees.get(repo.commits.get(head).tree));
    files.set(path, putBlob(Buffer.from(content)));
    repo.refs.set(branch, putCommit({ tree: putTree(files), parents: [head], message: 'added by hand' }));
  };
  repo.files = (branch) => { const h = repo.refs.get(branch); return h ? repo.trees.get(repo.commits.get(h).tree) : new Map(); };

  const server = http.createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { send(204); return; }
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      repo.requests.push(req.method + ' ' + req.url);
      if (req.headers.authorization !== 'Bearer ' + token) { send(401, { message: 'Bad credentials' }); return; }
      const body = raw ? JSON.parse(raw) : null;
      const url = new URL(req.url, 'http://x');
      const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
      if (!m) { send(404, { message: 'Not Found' }); return; }
      const rest = m[3] || '';
      let r;
      if (!rest && req.method === 'GET') { send(200, { default_branch: 'main', private: true, permissions: { push: true } }); return; }
      if ((r = rest.match(/^\/git\/ref\/heads\/(.+)$/)) && req.method === 'GET') {
        const sha = repo.refs.get(decodeURIComponent(r[1]));
        if (!sha) { send(repo.refs.size ? 404 : 409, { message: repo.refs.size ? 'Not Found' : 'Git Repository is empty.' }); return; }
        send(200, { object: { sha } }); return;
      }
      if ((r = rest.match(/^\/git\/refs\/heads\/(.+)$/)) && req.method === 'PATCH') {
        const branch = decodeURIComponent(r[1]);
        const old = repo.refs.get(branch);
        const c = repo.commits.get(body.sha);
        if (!c) { send(422, { message: 'Object does not exist' }); return; }
        if (old && !body.force && !c.parents.includes(old)) { send(422, { message: 'Update is not a fast forward' }); return; }
        repo.refs.set(branch, body.sha);
        send(200, { object: { sha: body.sha } }); return;
      }
      if ((r = rest.match(/^\/git\/commits\/([0-9a-f]+)$/)) && req.method === 'GET') {
        const c = repo.commits.get(r[1]);
        if (!c) { send(404, { message: 'Not Found' }); return; }
        send(200, { sha: r[1], tree: { sha: c.tree }, parents: c.parents.map((p) => ({ sha: p })) }); return;
      }
      if (rest === '/git/commits' && req.method === 'POST') { send(201, { sha: putCommit({ tree: body.tree, parents: body.parents, message: body.message }) }); return; }
      if ((r = rest.match(/^\/git\/trees\/([0-9a-f]+)$/)) && req.method === 'GET') {
        const t = repo.trees.get(r[1]);
        if (!t) { send(404, { message: 'Not Found' }); return; }
        send(200, { sha: r[1], tree: [...t].map(([path, sha]) => ({ path, sha, type: 'blob', mode: '100644' })), truncated: false }); return;
      }
      if (rest === '/git/trees' && req.method === 'POST') {
        const files = new Map(body.base_tree ? repo.trees.get(body.base_tree) : []);
        for (const e of body.tree) {
          if (e.sha === null) files.delete(e.path);
          else if (e.content !== undefined) files.set(e.path, putBlob(Buffer.from(e.content)));
          else files.set(e.path, e.sha);
        }
        send(201, { sha: putTree(files) }); return;
      }
      if (rest === '/git/blobs' && req.method === 'POST') { send(201, { sha: putBlob(Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8')) }); return; }
      if ((r = rest.match(/^\/git\/blobs\/([0-9a-f]+)$/)) && req.method === 'GET') {
        const b = repo.blobs.get(r[1]);
        if (!b) { send(404, { message: 'Not Found' }); return; }
        send(200, { sha: r[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') }); return;
      }
      if ((r = rest.match(/^\/contents\/(.+)$/)) && req.method === 'PUT') {
        const branch = body.branch || 'main';
        const files = new Map(repo.refs.has(branch) ? repo.trees.get(repo.commits.get(repo.refs.get(branch)).tree) : []);
        files.set(decodeURIComponent(r[1]), putBlob(Buffer.from(body.content, 'base64')));
        const c = putCommit({ tree: putTree(files), parents: repo.refs.has(branch) ? [repo.refs.get(branch)] : [], message: body.message });
        repo.refs.set(branch, c);
        send(201, { commit: { sha: c } }); return;
      }
      send(404, { message: 'Not Found: ' + req.method + ' ' + rest });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, repo, close: () => server.close() })));
}

module.exports = { start, blobSha };
