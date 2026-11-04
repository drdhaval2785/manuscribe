'use strict';
/* Export as one self-contained HTML page: the folios one below the other, looking as they do in
   the typing area. The look (ME.FOLIO_CSS), the measuring (ME.folioLayoutSource) and the font are
   copied into the page, so that it needs no other file. */
(function (ME) {
  const { U, Model, Editor, Export } = ME;

  // a page opened from disk cannot fetch the font file; a script holding it can be loaded
  const loadFont = () => new Promise((resolve) => {
    if (ME.FONT) { resolve(ME.FONT); return; }
    const s = U.el('script', { src: 'fonts/tiro-regular.base64.js' });
    s.onload = () => resolve(ME.FONT || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  const EDITING_ATTRS = ['contenteditable', 'spellcheck', 'autocapitalize', 'autocorrect', 'data-a', 'data-c', 'data-t', 'data-num', 'data-i'];

  function folioMarkup(project, entry, pageSize) {
    const g = Editor.typingGeom(project, entry, pageSize);
    const rules = Editor.ruleXs(g);
    const folio = Editor.buildFolio(project, entry, g);
    U.$$('.box-tag', folio).forEach((x) => x.remove());
    const sides = Editor.collectNotes(folio);
    let k = 0;
    for (const [side, items] of Object.entries(sides)) {
      const host = folio.querySelector('.margin-' + side);
      for (const it of items) {
        const el = Editor.marginNote(it);
        it.chip.dataset.m = el.dataset.m = String(++k);
        host.appendChild(el);
      }
    }
    folio.querySelector('.margin-foot').hidden = !sides.foot.length;
    for (const n of [folio, ...folio.querySelectorAll('*')]) for (const a of EDITING_ATTRS) n.removeAttribute(a);
    folio.dataset.g = JSON.stringify({ type: g.type, aspect: g.aspect, lines: g.lines, boxes: g.boxes, rules: { left: rules.left, right: rules.right }, scale: project.settings.textScale || 1 });
    return folio.outerHTML;
  }

  const VIEW_CSS = `
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { background: var(--bg); }
body { margin: 0; color: var(--ink); font: 14px/1.45 var(--ui); }
.view-bar {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 8px 24px;
  background: var(--chrome); color: var(--chrome-ink);
}
.view-title { font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.view-bar select { margin-left: auto; flex: none; font: 600 13px var(--ui); padding: 3px 6px; border-radius: 7px; }
main { padding: 20px 24px 60vh; overflow-x: auto; } /* the last folio can come up to the top too */
.leaf { padding-bottom: 34px; scroll-margin-top: 54px; }
.leaf h2 { margin: 0 auto 8px; font: 650 13px var(--ui); color: var(--muted); }
.folio .line, .folio .chip, .mnote sup { cursor: inherit; }
.line:hover, .line.mline:hover, .margin-foot .mline:hover { background: none; }
.box:hover { outline: none; }
.t-subst:hover, .t-choice:hover { background: none; }
`;

  // runs in the exported page
  function viewer() {
    const F = ME.FolioLayout;
    const folios = Array.from(document.querySelectorAll('.folio'));
    const geom = (f) => f._g || (f._g = JSON.parse(f.dataset.g));
    function finish(f) {
      if (f._done) return;
      f._done = true;
      for (const line of f.querySelectorAll('.line:not(.mline)')) { line.style.removeProperty('--fit'); F.fit(line); F.placeSignMarks(line); }
      for (const line of f.querySelectorAll('.mline')) F.placeSignMarks(line);
      const sides = {};
      for (const side of ['top', 'bottom', 'left', 'right']) {
        sides[side] = Array.from(f.querySelector('.margin-' + side).children).map((el) => ({ el, chip: f.querySelector('.chip[data-m="' + el.dataset.m + '"]') }));
      }
      F.margins(f, geom(f), geom(f).rules, sides);
    }
    // measuring every line of a long manuscript takes time: each folio is measured as it comes near
    const near = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) finish(e.target); }, { rootMargin: '150% 0px' });
    function layout() {
      const w = Math.max(320, document.querySelector('main').clientWidth - 48);
      for (const f of folios) {
        near.unobserve(f);
        f._done = false;
        F.size(f, geom(f), w, geom(f).scale);
        const foot = f.querySelector('.margin-foot');
        f.style.marginBottom = foot.hidden ? '' : foot.offsetHeight + 14 + 'px';
        const h = f.parentNode.querySelector('h2');
        h.style.width = w + 'px';
        near.observe(f);
      }
    }
    let t = 0;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 150); });
    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    // the folio list follows the reading
    const pick = document.getElementById('jump');
    pick.addEventListener('change', () => document.getElementById(pick.value).scrollIntoView());
    const here = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) pick.value = e.target.id; }, { rootMargin: '-50% 0px -50% 0px' });
    document.querySelectorAll('.leaf').forEach((x) => here.observe(x));
  }

  // what is read as code in a <script> must not close it
  const inScript = (src) => src.replace(/<\/(script)/gi, '<\\/$1');

  // opts: {folios: [labels] | null}. -> {html, folios, font}
  Export.html = async function (project, opts) {
    const o = opts || {};
    const pageSizes = (ME.App && ME.App.pageSizes) || {};
    const seen = new Set();
    const entries = Model.entries(project).filter((e) => {
      if (seen.has(e.label) || (o.folios && !o.folios.includes(e.label))) return false;
      seen.add(e.label);
      return project.pages[e.label] && Model.pageHasContent(project.pages[e.label]);
    });
    if (!entries.length) return { html: '', folios: 0, font: true };
    const font = await loadFont();
    const m = project.meta;
    const title = (m.title || 'Untitled') + (m.siglum ? ' · ' + m.siglum : '');
    const leaves = entries.map((e, k) => '<section class="leaf" id="f' + k + '"><h2>Folio ' + U.escHtml(e.label) + '</h2>' + folioMarkup(project, e, pageSizes[e.pdfPage] || (project.pdf && project.pdf.size)) + '</section>');
    const options = entries.map((e, k) => '<option value="f' + k + '">' + U.escHtml(e.label) + '</option>').join('');
    const html = '<!doctype html>\n<html lang="sa">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '<title>' + U.escHtml(title) + '</title>\n'
      + '<meta name="generator" content="Manuscribe">\n'
      + (font ? '<!-- The font embedded below is Tiro Devanagari Sanskrit.\n' + font.licence.replace(/--+/g, '-') + '\n-->\n'
        + "<style>@font-face { font-family: 'Tiro Devanagari Sanskrit'; src: url('data:font/ttf;base64," + font.base64 + "') format('truetype'); }</style>\n" : '')
      + '<style>' + ME.FOLIO_CSS + VIEW_CSS + '</style>\n</head>\n<body>\n'
      + '<header class="view-bar"><span class="view-title">' + U.escHtml(title + (m.author ? ' — ' + m.author : '')) + '</span>'
      + '<select id="jump" title="Go to a folio side">' + options + '</select></header>\n'
      + '<main>\n' + leaves.join('\n') + '\n</main>\n'
      + '<script>\nwindow.ME = {};\n(' + inScript(ME.folioLayoutSource.toString()) + ')(window.ME);\n(' + inScript(viewer.toString()) + ')();\n</' + 'script>\n</body>\n</html>\n';
    return { html, folios: entries.length, font: !!font };
  };
})(window.ME);
