'use strict';
/* The edition in the shape of the Distributed Text Services API, version 1.0 (https://dtsapi.org): the entry point,
   collections, navigation and documents, as static files. A static folder cannot answer queries, so the URI
   templates here name files, not queries: each navigation file holds the whole tree of its resource (as down=-1
   would), and each citation block has a document of its own, wrapped in dts:wrapper. */
(function (ME) {
  const DTS = {};
  const CONTEXT = 'https://dtsapi.org/context/v1.0.json';
  const V = '1.0';
  const json = (o) => JSON.stringify(o, null, 1) + '\n';
  const enc = (s) => encodeURIComponent(s);

  // what kind of unit a block is: verse if it scans, else a paragraph
  const citeType = (b) => (ME.Metre && ME.Metre.identify(b.text.trim()).metre ? 'verse' : 'paragraph');

  /* -> [{name, data}], under dir. works: [{work, built}] as Release.works gives them. */
  DTS.files = function (ed, works, dir) {
    const base = dir || 'dts/';
    const out = [];
    const idOf = (work) => (ed.doi ? 'https://doi.org/' + ed.doi.replace(/^https?:\/\/doi\.org\//, '') : 'urn:manuscribe:' + ed.id) + ':' + work.id;
    const templates = (work) => {
      const r = enc(idOf(work));
      return { collection: 'collection/' + r + '.json', navigation: 'navigation/' + r + '.json', document: 'document/' + r + '{/ref}.xml' };
    };
    const dc = { title: [{ lang: 'en', value: ed.title || 'Edition' }], creator: ed.editor ? [ed.editor] : [], date: ed.issued ? ed.issued.date : undefined, rights: ed.licence || undefined, description: [{ lang: 'en', value: ME.Publish.citation(ed) }] };
    const resource = (work, built) => {
      const types = [...new Set(built.map(citeType))];
      return Object.assign({ '@id': idOf(work), '@type': 'Resource', dtsVersion: V, title: (ed.title || 'Edition') + ': ' + work.title, totalParents: 1, totalChildren: 0, dublinCore: dc, mediaTypes: ['application/tei+xml'] }, templates(work), {
        citationTrees: [{ '@type': 'CitationTree', citeStructure: types.map((t) => ({ '@type': 'CiteStructure', citeType: t })) }],
      });
    };
    out.push({ name: base + 'index.json', data: json({ '@context': CONTEXT, dtsVersion: V, '@id': './', '@type': 'EntryPoint', collection: 'collection/{id}.json', navigation: 'navigation/{resource}.json', document: 'document/{resource}{/ref}.xml' }) });
    const rootId = 'urn:manuscribe:' + ed.id;
    out.push({ name: base + 'collection/' + enc(rootId) + '.json', data: json({ '@context': CONTEXT, dtsVersion: V, '@id': rootId, '@type': 'Collection', title: ed.title || 'Edition', description: ME.Publish.citation(ed), totalParents: 0, totalChildren: works.length, dublinCore: dc, collection: 'collection/' + enc(rootId) + '.json', member: works.map(({ work, built }) => resource(work, built)) }) });
    for (const { work, built } of works) {
      const res = resource(work, built);
      out.push({ name: base + 'collection/' + enc(idOf(work)) + '.json', data: json(Object.assign({ '@context': CONTEXT }, res)) });
      out.push({ name: base + 'navigation/' + enc(idOf(work)) + '.json', data: json({ '@context': CONTEXT, dtsVersion: V, '@type': 'Navigation', '@id': 'navigation/' + enc(idOf(work)) + '.json', resource: res,
        member: built.map((b) => ({ identifier: b.table.unit, '@type': 'CitableUnit', level: 1, parent: null, citeType: citeType(b) })) }) });
      const tei = ME.Apparatus.tei(ed, built, work);
      out.push({ name: base + 'document/' + enc(idOf(work)) + '.xml', data: tei });
      for (const b of built) {
        const one = ME.Apparatus.tei(ed, [b], work);
        const body = (one.match(/<body>([\s\S]*)<\/body>/) || [null, ''])[1].trim();
        out.push({ name: base + 'document/' + enc(idOf(work)) + '/' + enc(b.table.unit) + '.xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<dts:wrapper xmlns:dts="https://w3id.org/api/dts#" xmlns="http://www.tei-c.org/ns/1.0">\n' + body + '\n</dts:wrapper>\n' });
      }
    }
    return out;
  };

  ME.DTS = DTS;
})(window.ME);
