// Stemmatics on a synthetic tradition with a known stemma; lacunae; NEXUS structure; browser timings.
const { launch, checks } = require('./h');
(async () => {
  const { browser, page } = await launch('stemma');
  const T = checks('Stemmatics');
  const res = await page.evaluate(() => {
    const S = ME.Stemma;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const rnd = S.random(11);
    const tree = { ω: ['α', 'β'], α: ['A', 'B', 'α1'], α1: ['C', 'D'], β: ['E', 'F'], A: ['G'] };
    const nchar = 400;
    const text = { ω: new Array(nchar).fill(0) };
    const next = new Array(nchar).fill(1);
    const walk = (x) => { for (const c of tree[x] || []) { text[c] = text[x].map((v, k) => (rnd() < (x === 'A' ? 0.01 : 0.06) ? next[k]++ : v)); walk(c); } };
    walk('ω');
    text.B = text.B.map((v, k) => (rnd() < 0.25 ? text.E[k] : v));
    const taxa = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const chars = [];
    for (let k = 0; k < nchar; k++) {
      const cells = taxa.map((t) => (rnd() < 0.08 ? -1 : text[t][k]));
      const ids = [...new Set(cells.filter((v) => v >= 0))];
      if (ids.length < 2) continue;
      chars.push({ ref: 'u.' + k, unit: 'b' + Math.floor(k / 50), states: ids.map(String), cells: cells.map((v) => (v < 0 ? -1 : ids.indexOf(v))) });
    }
    const m = { taxa, chars };
    const nj = S.nj(S.distances(m));
    const splits = new Set([...S.splits(nj, 7)].map((k) => k.split(',').map((i) => taxa[i]).join('')));
    ok('distance tree finds AG, CD, EF', ['CD', 'EF'].every((x) => splits.has(x)) && [...splits].some((x) => x === 'BCDEF' || x === 'AG'), [...splits]);
    const p = S.parsimony(m, { starts: 5 });
    ok('parsimony is at least as short as the distance tree', p.length <= S.fitch(nj, m).total);
    ok('descriptus screen names G as a copy of A, and nothing else', S.descripti(m).length === 1 && S.descripti(m)[0].copy === 'G' && S.descripti(m)[0].of === 'A');
    const st = S.parseDot('digraph { ω -> α; ω -> β; α -> A; α -> B; α -> α1; α1 -> C; α1 -> D; β -> E; β -> F; A -> G; E -> B [style=dashed] }', taxa);
    const rec = S.reconstruct(m, st);
    let right = 0, known = 0;
    rec.per.forEach((x, k) => { if (x.root.length === 1) { known++; if (x.root[0] === String(text.ω[+chars[k].ref.slice(2)])) right++; } });
    ok('the archetype is reconstructed (' + right + ' of ' + known + ')', right / known > 0.97, [right, known]);
    const lost = S.agreement({ taxa: ['X', 'Y', 'Z'], chars: [{ cells: [-1, -1, 0] }, { cells: [0, 0, 1] }, { cells: [-1, 1, 0] }] });
    ok('two lost witnesses do not agree', lost.sites[0][1] === 1 && lost.same[0][1] === 1);
    const nx = S.nexus({ taxa: ["A'x", 'B', 'C'], chars: Array.from({ length: 20 }, (_, k) => ({ ref: 'r' + k, states: Array.from({ length: k === 5 ? 40 : 3 }, (_, i) => 's' + i), cells: [k % 3, (k + 1) % 3, -1] })) });
    const nchr = +nx.text.match(/NCHAR=(\d+)/)[1];
    const rows = nx.text.split('MATRIX\n')[1].split('\n  ;')[0].split('\n');
    ok('NEXUS rows match NCHAR, a 40-reading variant is left out', rows.every((r) => r.trim().replace(/^'(?:[^']|'')*'\s+/, '').length === nchr) && nx.dropped.length === 1);
    // the plan's sizes, in the browser
    const r2 = S.random(3);
    const big = { taxa: Array.from({ length: 50 }, (_, i) => 'W' + i), chars: [] };
    const rws = [new Array(20000).fill(0)];
    for (let i = 1; i < 50; i++) { const from = rws[Math.floor(r2() * i)]; rws.push(from.map((v) => (r2() < 0.02 ? v + 1 + Math.floor(r2() * 3) : v))); }
    for (let k = 0; k < 20000; k++) { const vals = rws.map((rw) => rw[k]); const ids = [...new Set(vals)]; if (ids.length > 1) big.chars.push({ ref: 'k' + k, states: ids.map(String), cells: vals.map((v) => (r2() < 0.05 ? -1 : ids.indexOf(v))) }); }
    // Chrome's engine is Node's; Firefox's and Safari's are slower at this: ten times, there
    // (and on GitHub's computers, four times slower again than one's own)
    const F = (/Firefox\//.test(navigator.userAgent) || (/AppleWebKit/.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent)) ? 10 : 5) * (window.MANUSCRIBE_CI ? 4 : 1);
    const time = (f) => { const a = performance.now(); const x = f(); return [performance.now() - a, x]; };
    const [td, D] = time(() => S.distances(big));
    const [tn, tr] = time(() => S.nj(D));
    const [tf] = time(() => S.fitch(tr, big));
    ok('50 witnesses: distances, NJ, Fitch within 5x of the Node figures (10x outside Chrome) (' + td.toFixed(0) + ', ' + tn.toFixed(1) + ', ' + tf.toFixed(1) + ' ms)', td < F * 68 && tn < F * 2.4 && tf < F * 4.3);
    return out;
  });
  for (const [n, ok, x] of res) T.check(n, ok, x);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exitCode = 1; });
