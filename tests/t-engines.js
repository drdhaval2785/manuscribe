// The methods of lining up witnesses: each keeps every token in order on hard random text, gives the same table twice,
// and survives a very long block; changing method marks blocks out of date and leaves what the editor locked alone;
// editions that never chose keep their tables.
const { launch, checks } = require('./h');
const { LANGS, make, buildInPage } = require('./languages');
(async () => {
  const { browser, page } = await launch('engines');
  const T = checks('Methods of collation');
  await buildInPage(page, LANGS.en, make('en', 4, 4, 20), 20);
  const res = await page.evaluate(async () => {
    const { Collate, CollateEdit: E } = ME;
    const out = [];
    const ok = (n, c, x) => out.push([n, !!c, x]);
    const IDS = ['saktumiva', 'poa', 'base'];
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    // few letters, chunks moved about: what most tempts an aligner into crossing its own lines
    const witness = (text) => {
      let w = text.slice();
      for (let i = 0; i < 1 + rnd(3); i++) { const a = rnd(w.length + 1), len = rnd(8); const cut = w.splice(a, len); w.splice(rnd(w.length + 1), 0, ...cut); }
      w = w.map((t) => (rnd(8) ? t : 'abc'[rnd(3)])).filter(() => rnd(10));
      return w.length ? w : ['a'];
    };
    for (const id of IDS.slice(1)) {
      let bad = null;
      for (let run = 0; run < 40 && !bad; run++) {
        const text = Array.from({ length: 1 + rnd(50) }, () => 'abc'[rnd(3)]);
        const rows = Array.from({ length: 2 + rnd(9) }, (_, i) => ({ label: 'W' + i, n: witness(text) }));
        try {
          const r = await Collate.align(rows, { engine: id });
          for (const s of rows) { const c = r.cols[s.label]; if (c.some((x, k) => (k && x <= c[k - 1]) || x < 0 || x >= r.ncols)) bad = [run, s.label, c]; }
        } catch (e) { bad = [run, e.message]; }
      }
      ok(id + ': every token kept, in order, on 40 hard random blocks', !bad, bad);
    }
    const rows = ['the quick brown fox jumps over the lazy dog', 'the quick fox jumped over a lazy dog today', 'the quick brown foxes jumped over the dog today'].map((t, i) => ({ label: 'ABC'[i], n: t.split(' ') }));
    for (const id of IDS) {
      const a = await Collate.align(rows, { engine: id }), b = await Collate.align(rows, { engine: id });
      ok(id + ': the same input gives the same table', JSON.stringify(a) === JSON.stringify(b), a);
    }
    const on = await Collate.align(rows, { engine: 'base', settings: { base: 'B' } });
    const at = (r, l, word) => r.cols[l][rows.find((x) => x.label === l).n.indexOf(word)];
    ok('against a base: each witness is placed by the named base', at(on, 'A', 'quick') === at(on, 'B', 'quick') && at(on, 'C', 'quick') === at(on, 'B', 'quick') && at(on, 'A', 'dog') === at(on, 'B', 'dog'), on);
    const poa = await Collate.align(rows, { engine: 'poa' });
    ok('all together: a word any earlier witness has is matched', at(poa, 'A', 'quick') === at(poa, 'C', 'quick') && at(poa, 'A', 'over') === at(poa, 'B', 'over') && at(poa, 'C', 'over') === at(poa, 'A', 'over'), poa);
    // a very long block: 3 witnesses of 40,000 tokens, one lacking 5,000 of them
    const long = Array.from({ length: 40000 }, () => 'w' + rnd(400));
    const longRows = [{ label: 'A', n: long }, { label: 'B', n: long.slice(0, 15000).concat(long.slice(20000)) }, { label: 'C', n: long.map((t) => (rnd(20) ? t : 'x')) }];
    for (const id of ['poa', 'base']) {
      const a = performance.now();
      try {
        const r = await Collate.align(longRows, { engine: id });
        const late = longRows[1].n.length - 1;
        ok(id + ': a block of 40,000 tokens (' + ((performance.now() - a) / 1000).toFixed(1) + ' s), the text after a lacuna of 5,000 lined up', r.cols.A[39999] === r.cols.B[late] && r.cols.A[14000] === r.cols.B[14000], [r.cols.A[39999], r.cols.B[late]]);
      } catch (e) { ok(id + ': a block of 40,000 tokens', false, e.message); }
    }
    ok('the estimate grows with the witnesses only linearly for the new methods', Collate.estimateSeconds([{ n: new Array(1000) }, { n: new Array(1000) }], 'poa') * 2 === Collate.estimateSeconds(new Array(4).fill({ n: new Array(1000) }), 'poa'));

    // an edition
    const { ed, list } = window.lang;
    ed.collate = ed.collate || {};
    await Collate.run(ed, list, 'main', {});
    const sums = async () => [...(await Collate.summaries(ed.id)).values()].filter((s) => s.work === 'main');
    const keyWas = (await sums())[0].paramsKey;
    const expected = { tool: 'saktumiva-multialign', version: '132a83e', config: 'arr_simple', after: 'close-gaps@1' };
    ok('an edition that has not chosen keeps Saktumiva, recorded as it always was', Object.entries(expected).every(([k, v]) => JSON.parse(keyWas).aligner[k] === v) && JSON.parse(keyWas).aligner.scoring.gap_open === -2 && !('engine' in JSON.parse(keyWas).aligner), keyWas);
    const current = async () => { const a = []; for (const s of await sums()) a.push(Collate.isCurrent(ed, list.map((x) => ({ w: x.w, p: x.p })), s)); return a; };
    ok('its blocks are up to date', (await current()).every((x) => x === true), await current());
    // what the editor has locked, before the method changes
    const first = (await sums())[0];
    const rec = await ME.Store.getCollation(first.key);
    const lockFrom = rec.table.colIds[2], lockTo = rec.table.colIds[6];
    E.perform(rec.table, { op: 'lock', from: lockFrom, to: lockTo });
    const before = rec.table.order.map((l) => { const g = Collate.grid(rec.table)[rec.table.order.indexOf(l)]; const s = rec.table.states[l]; return Array.from(g.slice(2, 7)).map((k) => (k < 0 ? '' : s.n[k])).join('|'); });
    await Collate.saveTable(ed, rec);
    ed.collate.engine = 'poa';
    ok('a change of method marks the blocks as needing collation', (await current()).every((x) => x === false));
    const fresh = list.map((x) => ({ w: x.w, p: x.p }));
    const r1 = await Collate.run(ed, fresh, 'main', {});
    ok('collating with the new method does them all', r1.done.length === (await sums()).length && !r1.kept.length, r1);
    const again = await ME.Store.getCollation(first.key);
    ok('the method is recorded on the table', again.table.params.aligner.tool === 'manuscribe-poa' && again.table.tree === null, again.table.params.aligner);
    const g2 = Collate.grid(again.table), lk = again.table.locks[0], c1 = again.table.colIds.indexOf(lk && lk.from), c2 = again.table.colIds.indexOf(lk && lk.to);
    const after = rec.table.order.map((l) => { const s = again.table.states[l], g = g2[again.table.order.indexOf(l)]; return Array.from(g.slice(c1, c2 + 1)).map((k) => (k < 0 ? '' : s.n[k])).join('|'); });
    ok('what the editor locked stays as it was', c1 >= 0 && JSON.stringify(after) === JSON.stringify(before), [before, after]);
    ok('and they are then up to date', (await current()).every((x) => x === true), await current());
    // base: the most trusted witness, and the key follows it
    ed.collate.engine = 'base';
    const trust = Collate.trustOrder(ed);
    await Collate.run(ed, fresh, 'main', {});
    const bt = await ME.Store.getCollation((await sums())[1].key); // not the block with the lock, which keeps its rows
    ok('against a base: by default the most trusted witness, first of the rows', bt.table.params.aligner.base === trust[0] && bt.table.order[0] === trust[0], [bt.table.params.aligner, bt.table.order]);
    ed.collate.base = trust[1];
    ok('naming another base marks the blocks', (await current()).every((x) => x === false));
    // one block its own way
    delete ed.collate.base;
    await Collate.run(ed, fresh, 'main', {});
    const blockKey = 'main\u0000' + first.unit;
    ed.collate.blocks = { [blockKey]: { engine: 'saktumiva' } };
    const r2 = await Collate.run(ed, fresh, 'main', {});
    ok('one block can have its own method; the others keep theirs', r2.done.length === 1 && r2.done[0] === first.unit && r2.kept.length >= 1, r2);
    delete ed.collate.blocks;
    delete ed.collate.engine;

    // the choice, as the editor makes it
    const wait = (f) => new Promise((done, fail) => { const t0 = performance.now(); const tick = () => { if (f()) done(); else if (performance.now() - t0 > 15000) fail(new Error('waited in vain: ' + f)); else setTimeout(tick, 30); }; tick(); });
    const sel = (l) => [...document.querySelectorAll('select')].find((x) => x.getAttribute('aria-label') === l);
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const METHOD = 'How to line up the witnesses';
    ok('the method statement names Saktumiva for an edition that has not chosen', /the aligner of Saktumiva 2\.0 by Charles Li/.test(Collate.methodSentence(ed)), Collate.methodSentence(ed));
    let dialog = ME.CollateView.comparison(ed, list, null);
    await wait(() => sel(METHOD));
    await wait(() => /\(/.test(sel(METHOD).options[0].textContent));
    ok('each method shows how long it would take', [...sel(METHOD).options].every((x) => /\((a moment|about \d+ (s|min))\)/.test(x.textContent)), [...sel(METHOD).options].map((x) => x.textContent));
    ok('the edition shows Saktumiva until it chooses', sel(METHOD).value === 'saktumiva');
    set(sel(METHOD), 'base');
    await wait(() => sel('The base text'));
    ok('the choice is kept on the edition', ed.collate.engine === 'base', ed.collate);
    set(sel('The base text'), trust[1]);
    await wait(() => ed.collate.base === trust[1]);
    ok('the method statement says what was done', Collate.methodSentence(ed).includes(trust[1] + ' as a base text'), Collate.methodSentence(ed));
    document.querySelector('.modal-foot .btn').click();
    await dialog;
    // one block, from its own view
    delete ed.collate.engine; delete ed.collate.base;
    await Collate.run(ed, fresh, 'main', {});
    const all = await sums(), other = all[2], stay = await ME.Store.getCollation(all[1].key);
    const table = (await ME.Store.getCollation(other.key)).table;
    let closed = false;
    const lining = ME.CollateView.lineUpAgain(ed, list, 'main', table, () => { closed = true; });
    await wait(() => sel(METHOD));
    set(sel(METHOD), 'poa');
    document.querySelector('.modal-foot .btn.primary').click();
    const did = await lining;
    const now = await ME.Store.getCollation(other.key), still = await ME.Store.getCollation(all[1].key);
    ok('Line up again: that block alone, by the method chosen', did && closed && now.table.params.aligner.tool === 'manuscribe-poa' && JSON.stringify(still.table.states) === JSON.stringify(stay.table.states) && still.table.params.aligner.tool === 'saktumiva-multialign', now.table.params.aligner);
    ok('and it is up to date, the others too', (await current()).every((x) => x === true), await current());
    ok('the statement says some blocks went another way', /some blocks by another method/.test(Collate.methodSentence(ed)), Collate.methodSentence(ed));
    return out;
  });
  for (const [n, ok, x] of res) T.check(n, ok, x);
  T.done(page);
  await browser.close();
})().catch((e) => { console.log('  FAIL crashed :: ' + e.message); process.exit(1); });
