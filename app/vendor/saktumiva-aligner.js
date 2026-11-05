/* Generated from Saktumiva 2.0 by Charles Li (GPL-3.0), https://github.com/chchch/saktumiva, commit 132a83e.
   Made by tools/bundle-aligner.mjs. Do not edit by hand. */
window.ME = window.ME || {};
ME.collateEngineSource = function (global) {
  'use strict';
  const __m = {}, __c = {};
  const __r = (n) => { if (__c[n]) return __c[n]; if (!__m[n]) return (__c[n] = {}); const e = (__c[n] = {}); __m[n](e); return e; };
__m["lib/multialign.mjs"] = function (__e) {
const guideTree = __r("lib/tree.mjs").default;
const { affineAlign, alignAlign, charConfig, arrConfig, simpleArrConfig, arrMsaConfig, simpleArrMsaConfig, charMsaConfig } = __r("lib/affine-align.mjs");
 
class multiAligner {
    constructor(configfunc, scoring) {
        //const scoringclone = [...scoring];
        //this.realigndepth = scoringclone.pop();
        const msafunc = configfunc === 'arr' ? arrMsaConfig :
            configfunc === 'arr_simple' ? simpleArrMsaConfig :
            charMsaConfig;
        const pairfunc = configfunc === 'arr' ? arrConfig :
            configfunc === 'arr_simple' ? simpleArrConfig :
            charConfig;
        //this.msafunc = new msafunc(...scoringclone);
        //this.pairfunc = new pairfunc(...scoringclone);
        this.msafunc = new msafunc(scoring);
        this.pairfunc = new pairfunc(scoring);
        this.realigndepth = scoring.realigndepth;
        this.distancefunc = scoring.distancefunc;
        this.ngramsize = scoring.ngramsize;
        this.scalegap = scoring.scalegap;
        this.progress = {
            total: 0,
            cur: 0,
            update: (message,addone = true) => {
                if(typeof postMessage !== 'function') return;
                if(addone) this.progress.cur = this.progress.cur + 1;
                const ret = {progress: this.progress.cur/this.progress.total};
                if(message) ret.message = message;
                postMessage(ret);
            }
        };
    }
    scaleGapSizes(gap,branch1,branch2,len1,len2) {
        const dists = [];
        for(const child1 of branch1) {
          for(const child2 of branch2) {
            dists.push(child1.distanceTo(child2));
          }
        }
        const avgdist = dists.reduce((acc,cur) => acc + cur)/dists.length;
        const gapopen = (this.pairfunc.gap.open - Math.log(Math.min(len1,len2))) * (1 - avgdist);
        const gapex = this.pairfunc.gap.extend * (1 + Math.abs(Math.log(len1/len2)));
        
        return {open: gapopen, extend: gapex};
    }

    align(arr) {
        const texts = arr.map(a => [a.siglum, a.text]).sort((a,b) => a[0].localeCompare(b[0]))
        // sort by siglum for guidetree consistency; order seems to affect tree
        const guidetree = guideTree(texts,this.distancefunc,this.ngramsize);

        this.progress.total = guidetree.descendants().length - guidetree.leaves().length;
        this.progress.cur = 0;

        const textmap = new Map(texts);
        const alignment = this.alignToTree(guidetree,textmap);
        alignment.tree = guidetree.toNeXML();
        
        if(this.realigndepth)
            return this.reAlign(alignment,guidetree,this.realigndepth);
        else
            return alignment;
    }

    alignAppend(alignment, newtexts) {
      // do one at a time
      let curalignment = alignment.map(a => [a.siglum, a.textobj]);
      const toupdate = newtexts.map(a => [a.siglum, a.textobj]);
      for(const [n,newtext] of toupdate.entries()) {
        const oldrow = curalignment.findIndex(el => el[0] === newtext[0]);
        if(oldrow > -1) curalignment.splice(oldrow, 1);
        const res = this.alignAppendOne(curalignment, [newtext]);

        if(n === toupdate.length - 1) return res;

        curalignment = res.alignment.map((el,i) => [res.sigla[i],el]);
      }
    }

    alignAppendOne(alignment,newtexts) {
        /*
        const texts = [...alignment.map(a => [a.siglum,a.textobj]),
                       ...newtexts.map(a => [a.siglum, a.textobj])];
        */
        const texts = [...alignment, ...newtexts];
        const textsflat = texts.map(t => [t[0],t[1].map(w => w.norm).filter(w => w !== '')]).sort((a,b) => a[0].localeCompare(b[0]));
        const guidetree = guideTree(textsflat,this.distancefunc,(this.ngramsize || 3));

        this.progress.total = guidetree.descendants().length - guidetree.leaves().length;
        this.progress.cur = 0;

        const textmap = new Map(texts);
        //const newsigla = new Set(newtexts.map(a => a.siglum));
        const newsigla = new Set(newtexts.map(a => a[0]));
        // TODO: align to closest text, then replace gaps from already aligned version
        const newalignment = this.alignToTree(guidetree,textmap,newsigla);
        this.realigndepth = 0;
        newalignment.tree = guidetree.toNeXML();
        if(this.realigndepth)
            return this.reAlign(newalignment,guidetree,this.realigndepth);
        else
            return newalignment;
    }

    alignToTree(branch,textmap,newtexts = new Set()) {
        if(branch.isLeaf()) {
            //console.log(branch.data.id);
          const ret = {sigla: [branch.data.id], alignment: [textmap.get(branch.data.id)]};
          if(newtexts.size && newtexts.has(branch.data.id))
            ret.updated = true;
          return ret;
        }

        const msa1 = this.alignToTree(branch.children[0],textmap,newtexts);
        const msa2 = this.alignToTree(branch.children[1],textmap,newtexts);

        if(newtexts.size && !msa1.updated && !msa2.updated) {
          return {sigla: [...msa1.sigla, ...msa2.sigla], 
                  alignment: [...msa1.alignment,...msa2.alignment]};
        }

        const scaledgap = this.scalegap ?
          this.scaleGapSizes(this.pairfunc.gap,
                             branch.children[0].leaves(),
                             branch.children[1].leaves(), 
                             msa1.alignment[0].length,
                             msa2.alignment[0].length
                            ) :
          null;

        const updated = newtexts.size ? true : false;

        if(msa1.sigla.length === 1 && msa2.sigla.length === 1) {
            //console.log([msa1.sigla[0],msa2.sigla[0]]);
            this.progress.update();
            
            const opts = {alignment: true, matrix: false};
            if(this.scalegap) opts.gap = {open: scaledgap.open, extend: scaledgap.extend};
            const psa = affineAlign(msa1.alignment[0],
                                    msa2.alignment[0],
                                    this.pairfunc,
                                    opts
                                   );
            return {sigla: [msa1.sigla[0], msa2.sigla[0]], alignment: [psa[0],psa[1]], updated: updated};
        }

        //console.log([...msa1.sigla,...msa2.sigla]);
        this.progress.update();
        /*
        const weights = [branch.children[0].leaves().map(l => l.data.weight),
                         branch.children[1].leaves().map(l => l.data.weight)];
        */
        const opts = {};
        if(this.scalegap) opts.gap = {open: scaledgap.open, extend: scaledgap.extend};
        const msa3 = alignAlign(msa1.alignment,
                                msa2.alignment,
                                this.msafunc,
                                opts
                                //weights
                               );
        return {sigla: [...msa1.sigla,...msa2.sigla], alignment: msa3, updated: updated};
    }

    sumOfPairs(alignment,skip = new Map()) {
        //const comps = alignment.sigla.length * (alignment.sigla.length-1) / 2;
        // Don't need to divide by number of comparisons because it's always the same
        const cols = alignment.alignment[0].length;
        for(let n=0; n < alignment.sigla.length-1; n++) {
            for(let m=n+1; m < alignment.sigla.length; m++) {
                const ids = [alignment.sigla[n],alignment.sigla[m]];
                ids.sort();
                const id = ids.join('');

                if(skip.has(id)) continue;

                skip.set(id, this.pairScore(alignment.alignment[n], alignment.alignment[m]));
            }
        }
        return {
            scores: skip,
            total: [...skip.values()].reduce((acc,cur) => acc + cur,0) / cols
        };
    }

    pairScore(seq1, seq2) {
        let ret = 0;
        let seq1gapopen = false;
        let seq2gapopen = false;
        
        for(let n=0; n<seq1.length; n++ ) {
            const s1 = this.pairfunc.prop ? seq1[n][this.pairfunc.prop] : seq1[n];
            const s2 = this.pairfunc.prop ? seq2[n][this.pairfunc.prop] : seq2[n];
            //if(s1 === '' && s2 === '') continue; // this doesn't work for affine gap penalties
            if(s1 !== '' && s2 !== '') {
              seq1gapopen = false;
              seq2gapopen = false;
              ret = ret + this.pairfunc.scorefn(seq1,n,seq2,n);
            }
            else {
              if(s1 === '') {
                seq2gapopen = false;
                if(!seq1gapopen) {
                    seq1gapopen = true;
                    ret = ret + this.pairfunc.gap.open + this.pairfunc.gap.extend;
                }
                else ret = ret + this.pairfunc.gap.extend;
              }
              if(s2 === '') {
                  seq1gapopen = false;
                  if(!seq2gapopen) {
                      seq2gapopen = true;
                      ret = ret + this.pairfunc.gap.open + this.pairfunc.gap.extend;
                  }
                  else ret = ret + this.pairfunc.gap.extend;
              }
          }
        }
        return ret;
    }
/*
const pairScore2 = (seq1, seq2) => {
    // https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0160043
    let ret = 0;
    const seq1g = [];
    const seq2g = [];

    for(let n=0; n<seq1.length; n++ ) {
        if(!(seq1[n] === '' && seq2[n] === '')) {
            seq1g.push(seq1[n]);
            seq2g.push(seq2[n]);
        }
        if(seq1[n] !== '' && seq2[n] !== '')
            ret = ret + _pairfunc.scorefn(seq1,n,seq2,n);
    }
    for(const gaplength of [...collateGaps(seq1g),...collateGaps(seq2g)])
        ret = ret + _pairfunc.gap.open + _pairfunc.gap.extend * gaplength;

    return ret;
};

const collateGaps = (seq) => {
    const ret = [];
    let cur = null;
    for(let n=0;n<seq.length;n++) {
        if(seq[n] === '')
            if(cur === null)
                cur = 1;
            else cur = cur + 1;
        if(seq[n] !== '' && cur !== null) {
            ret.push(cur);
            cur = null;
        }
    }
    if(cur !== null) ret.push(cur);
    return ret;
};
*/
    reAlignBranch(alignment,sigla1,sigla2,scaledgap) {
        const filterAlignments = (full, part) => {
            const indices = part.sigla.map(s => full.sigla.indexOf(s));
            for(const index of indices)
                part.alignment.push(structuredClone(full.alignment[index]));
            const removesites = [];
            for(let n=0;n<part.alignment[0].length;n++) {
                let allgaps = true;
                for(let m=0;m<part.alignment.length;m++) {
                    const mn = this.pairfunc.prop ? 
                      part.alignment[m][n][this.pairfunc.prop] : 
                      part.alignment[m][n];
                    if(mn !== '') {
                        allgaps = false;
                        break;
                    }
                }
                if(allgaps) removesites.unshift(n);
            }
            for(const site of removesites)
                for(const alignment of part.alignment)
                    alignment.splice(site,1);
        };

        const msa1 = {sigla: sigla1, alignment: []};
        const msa2 = {sigla: sigla2, alignment: []};
        filterAlignments(alignment,msa1);
        filterAlignments(alignment,msa2);

        const opts = {};
        if(scaledgap) opts.gap = {open: scaledgap.open, extend: scaledgap.extend};

        if(msa1.sigla.length === 1 && msa2.sigla.length === 1) {
            //console.log(msa1.sigla[0] + ' vs. ' + msa2.sigla.join(', '));
            opts.alignment = true;
            opts.matrix = false;
            const psa = affineAlign(msa1.alignment[0],
                                    msa2.alignment[0],
                                    this.pairfunc,
                                    opts
                                   );
            return {sigla: [msa1.sigla[0], msa2.sigla[0]], alignment: [psa[0],psa[1]], tree: alignment.tree};
        }

        //console.log(msa1.sigla.join(', ') + ' vs. ' + msa2.sigla.join(', '));
        const msa3 = alignAlign(msa1.alignment,
                                msa2.alignment,
                                this.msafunc,
                                opts
                               );
        return {sigla: [...msa1.sigla,...msa2.sigla], alignment: msa3, tree: alignment.tree};
    }

    reAlign(alignment,tree,maxlevel) {
        //console.log('realigning');

        const originalorder = [...alignment.sigla];

        let sop = this.sumOfPairs(alignment);
        //console.log(sop);

        const levels = [];
        for(const node of tree.descendants()) {
            const arr = levels[node.depth];
            if(arr)
                arr.push(node);
            else
                levels[node.depth] = [node];
        }
        levels.reverse();
        levels.pop();
       
        const sortfn = (a,b) => tree.depthOf(a) > tree.depthOf(b) ? -1 : 1;
        // sometimes the results are better if levels are sorted with shortest to longest depth?
        for(const level of levels)
            level.sort(sortfn);

        const realmax = Math.min(maxlevel,levels.length-1);
        this.progress.total = realmax;
        this.progress.cur = 0;
        this.progress.update('Improving alignment...',false);
        
        //const weightmap = new Map(tree.leaves().map(l => [l.data.id,l.data.weight]));

        for(let n=0;n<=realmax;n++) {
            const level = levels[n];
            //if(!level) break;
            for(const node of level) {
                const curleaves = node.isLeaf() ? [node.id] : node.getLeaves().map(l => l.id);
                curleaves.sort();
                const otherleaves = alignment.sigla.filter(s => !curleaves.includes(s));
                /*
                const weights = [curleaves.map(l => weightmap.get(l)),
                                 otherleaves.map(l => weightmap.get(l))
                                ]; 
                */
                /*
                const dists = [];
                for(const child1 of node.leaves().filter(l => curleaves.includes(l.id))) {
                  for(const child2 of tree.leaves().filter(l => otherleaves.includes(l.id))) {
                    dists.push(child1.distanceTo(child2));
                  }
                }
                const avgdist = dists.reduce((acc,cur) => acc + cur)/dists.length;
                */
                const scaledgap = this.scalegap ?
                  this.scaleGapSizes(this.pairfunc.gap,
                                     node.leaves().filter(l => curleaves.includes(l.id)),
                                     tree.leaves().filter(l => otherleaves.includes(l.id)),
                                     alignment.alignment[0].length,
                                     alignment.alignment[0].length
                                    ) :
                  null;

                const newalignment = this.reAlignBranch(alignment,curleaves,otherleaves,scaledgap);
                
                const changedids = [];
                const skip = new Map(sop.scores);
                for(const curleaf of curleaves) {
                    for(const otherleaf of otherleaves) {
                        const arr = [curleaf,otherleaf];
                        arr.sort();
                        skip.delete(arr.join(''));
                    }
                }
                const newsop = this.sumOfPairs(newalignment,skip);
                //console.log(`level ${n}, SoP: ${newsop.total}`);
                if(newsop.total > sop.total) {
                    alignment = newalignment;
                    sop = newsop;
                }
            }
            this.progress.update();
        }
        //console.log(`final SOP: ${sop.total}`);
        const reordered = [];
        for(const siglum of originalorder)
            reordered.push(alignment.alignment[alignment.sigla.indexOf(siglum)]);
        return {sigla: originalorder, alignment: reordered, tree: alignment.tree};
    }
}
__e.default = multiAligner;


};
__m["lib/tree.mjs"] = function (__e) {
const Patristic = __r("lib/patristic.mjs").default;
const { distanceMatrix: ngramMatrix } = __r("lib/ngrams.mjs");
const { distanceMatrix: NCDMatrix } = __r("lib/ncd.mjs");
const bpe = __r("lib/bpe.mjs").default;

const fixNegativeLengths = root => {
    const go = (par) => { 
        let addon = 0;
        let addto = null;
        for(const child of par.children) {
            if(child.length < 0) {
                addon = 0 - child.length;
                child.length = 0;
            }
            else addto = child;
            if(child.children.length !== 0)
                go(child);
        }
        if(addto) // if addto is null, both children had negative lengths (now zeroed)
            addto.length = addto.length + addon;

    };
    go(root);
};

const weightLeaves = tree => {
  let all = [];
  for(const leaf of tree.leaves()) {
    let par = leaf.parent;
    let weight = 0;
    while(par) {
      weight = weight + par.length/par.leaves().length;
      all.push(weight);
      par = par.parent;
    }
    leaf.data.weight = weight;
  }
  // softmax
  const den = all.map(w => Math.exp(w)).reduce((acc,cur) => acc + cur);
  for(const leaf of tree.leaves()) {// normalize between 1 and 0.8
    leaf.data.weight = Math.exp(leaf.data.weight)/den;
  }
  /*
  const norm = 1/all.reduce((acc,cur) => acc + cur);
  for(const leaf of tree.leaves()) {
    leaf.data.weight = norm * leaf.data.weight;
  }
  */
};

const toNeXML = tree => {
    const otus = tree.leaves().map((o,i) => `<nex:otu id="otu${i}" label="${o.id}"/>`).join('');
    const nodes = tree.descendants().map((o,i) => 
    `<nex:node id="${o._guid}" ${o.id ? 'label="'+o.id+'" otu="otu'+i+'"' : ''} ${i === 0 ? `root="true"` : ''}/>`).join('');
    const edges = tree.links().map((l,i) => `<nex:edge source="${l.source._guid}" target="${l.target._guid}" id="edge${i}" length="${l.target.length}"/>`).join('');
    return `<nex:nexml xmlns:nex="http://www.nexml.org/2009" version="0.9"><nex:otus id="otus1">${otus}</nex:otus><nex:trees otus="otus1" id="trees1"><nex:tree id="guidetree" label="guidetree" xsi:type="nex:FloatTree" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${nodes}${edges}</nex:tree></nex:trees></nex:nexml>`;
};

const bpeMatrix = texts => {
  const sigla = texts.map(t => t[0]);
  const arrs = texts.map(t => t[1]);
  const newarr = bpe(arrs).map((a,n) => [sigla[n],a]);
  return ngramMatrix(newarr,1);
};

const guideTree = (texts,distancefunc,ngramsize,bpeiters) => {
    const matrix = distancefunc === 'ncd' ?
      NCDMatrix(texts) : 
        distancefunc === 'bpe' ?
        bpeMatrix(texts,bpeiters) :    
        ngramMatrix(texts,ngramsize);
    const guidetree = Patristic.parseMatrix(matrix,texts.map(t => t[0]));
    fixNegativeLengths(guidetree);
    //weightLeaves(guidetree);
    guidetree.toNeXML = () => toNeXML(guidetree);

    return guidetree;
};
__e.default = guideTree;


};
__m["lib/patristic.mjs"] = function (__e) {
var k = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function B(v) {
  return v && v.__esModule && Object.prototype.hasOwnProperty.call(v, "default") ? v.default : v;
}
var S = { exports: {} };
(function(v, A) {
  (function(m, D) {
    D(A);
  })(k, function(m) {
    const D = "0.5.7";
    function i(t, r) {
      t || (t = {}), r || (r = (e) => e.children), Object.assign(this, {
        _guid: R(),
        id: t.id || "",
        data: t,
        depth: t.depth || 0,
        height: t.height || 0,
        length: t.length || 0,
        parent: t.parent || null,
        children: r(t) || [],
        value: t.value || 1,
        respresenting: 1
      });
    }
    function R() {
      return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (t) => (t ^ Math.random() * 16 >> t / 4).toString(16));
    }
    i.prototype.addChild = function(t) {
      let r;
      return t instanceof i ? (r = t, r.parent = this) : (t || (t = {}), r = new i(
        Object.assign(t, {
          parent: this
        })
      )), this.children.push(r), r;
    }, i.prototype.addParent = function(t, r) {
      r || (r = []);
      let e;
      return t instanceof i ? e = t : (t || (t = {}), e = new i(Object.assign(t))), r.forEach((n) => n.setParent(e)), e.children = [this].concat(r), this.parent = e, this;
    }, i.prototype.ancestors = function() {
      return this.getAncestors(!0);
    }, i.prototype.clone = function() {
      return N(this.toObject());
    }, i.prototype.consolidate = function() {
      return this.eachAfter((t) => {
        t.isRoot() || t.length >= 5e-4 || (t.parent.id == "" ? t.parent.id = t.id : t.parent.id += "+" + t.id, t.excise());
      }).fixDistances();
    }, i.prototype.copy = function() {
      let t = N(JSON.stringify(this));
      return t.parent = null, t.fixDistances();
    }, i.prototype.count = function() {
      return this.sum(() => 1);
    }, i.prototype.descendants = function() {
      return this.getDescendants(!0);
    }, i.prototype.depthOf = function(t) {
      let r = 0;
      if (typeof t == "string" && (t = this.getDescendant(t)), typeof t > "u")
        throw Error("Cannot compute depth of undefined descendant!");
      let e = t;
      for (; e != this; )
        r += e.length, e = e.parent;
      return r;
    }, i.prototype.distanceBetween = function(t, r) {
      let e = t.getMRCA(r);
      return e.depthOf(t) + e.depthOf(r);
    }, i.prototype.distanceTo = function(t) {
      let r = this.getMRCA(t);
      return r.depthOf(this) + r.depthOf(t);
    }, i.prototype.each = function(t) {
      let r = this, e = [r], n;
      for (; e.length; )
        for (n = e.reverse(), e = []; r = n.pop(); )
          t(r), r.eachChild((s) => e.push(s));
      return this;
    }, i.prototype.eachAfter = function(t) {
      return this.eachChild((r) => r.eachAfter(t)), t(this), this;
    }, i.prototype.eachBefore = function(t) {
      return t(this), this.eachChild((r) => r.eachBefore(t)), this;
    }, i.prototype.eachChild = function(t) {
      return this.children.forEach(t), this;
    }, i.prototype.excise = function() {
      if (this.isRoot() && this.children.length > 1)
        throw new Error("Cannot excise a root Branch with multiple children.");
      return this.eachChild((t) => {
        t.length += this.length, t.parent = this.parent, this.isRoot() || this.parent.children.push(t);
      }), this.parent.children.splice(this.parent.children.indexOf(this), 1), this.parent.representing++, this.parent;
    }, i.prototype.fixDistances = function() {
      let t = 0, r = this.getRoot();
      return r.depth = 0, this.eachBefore((e) => {
        e.isRoot() || (e.depth = e.parent.depth + 1, e.depth > t && (t = e.depth));
      }).eachAfter((e) => {
        e.height = t - e.depth, e.value = e.value + e.children.reduce((n, s) => n + s.value, 0);
      }), this;
    }, i.prototype.fixParenthood = function(t) {
      return this.children.forEach((r) => {
        r.parent || (r.parent = this), r.parent !== this && (r.parent = this), !t && r.children.length > 0 && r.fixParenthood();
      }), this;
    }, i.prototype.flip = function() {
      return this.each((t) => t.rotate());
    }, i.prototype.getAncestors = function(t) {
      let r = t ? [this] : [], e = this;
      for (; e = e.parent; )
        r.push(e);
      return r;
    }, i.prototype.getChild = function(t) {
      if (!1 == "string")
        throw Error("childID is not a String!");
      return this.children.find((r) => r.id === t);
    }, i.prototype.getDescendant = function(t) {
      if (this.id === t)
        return this;
      let r = this.children, e = r.length;
      if (r)
        for (let n = 0; n < e; n++) {
          let s = r[n].getDescendant(t);
          if (s)
            return s;
        }
    }, i.prototype.getDescendants = function(t) {
      let r = t ? [this] : [];
      return this.isLeaf() || this.children.forEach((e) => {
        e.getDescendants(!0).forEach((n) => r.push(n));
      }), r;
    }, i.prototype.getLeafs = function() {
      return this.getLeaves();
    }, i.prototype.getLeaves = function() {
      if (this.isLeaf())
        return [this];
      {
        let t = [];
        return this.children.forEach((r) => {
          r.getLeaves().forEach((e) => t.push(e));
        }), t;
      }
    }, i.prototype.getMRCA = function(t) {
      let r = this;
      for (; !r.hasDescendant(t); ) {
        if (r.isRoot())
          throw Error(
            "Branch and cousin do not appear to share a common ancestor!"
          );
        r = r.parent;
      }
      return r;
    }, i.prototype.getRoot = function() {
      let t = this;
      for (; !t.isRoot(); )
        t = t.parent;
      return t;
    }, i.prototype.hasChild = function(t) {
      if (t instanceof i)
        return this.children.includes(t);
      if (typeof t == "string")
        return this.children.some((r) => r.id === t);
      throw Error(
        `Unknown type of child (${typeof t}) passed to Branch.hasChild!`
      );
    }, i.prototype.hasDescendant = function(t) {
      let r = this.getDescendants();
      if (t instanceof i)
        return r.some((e) => e === t);
      if (typeof t == "string")
        return r.some((e) => e.id === t);
      throw Error("Unknown type of descendant passed to Branch.hasDescendant!");
    }, i.prototype.hasLeaf = function(t) {
      let r = this.getLeaves();
      if (t instanceof i)
        return r.includes(t);
      if (typeof t == "string")
        return r.some((e) => e.id === t);
      throw Error("Unknown type of leaf passed to Branch.hasLeaf.");
    }, i.prototype.invert = function() {
      let t = this.parent;
      if (t) {
        let r = this.parent.length;
        this.parent.length = this.length, this.length = r, this.parent = t.parent, this.children.push(t), t.parent = this, t.children.splice(t.children.indexOf(this), 1);
      } else
        throw Error("Cannot invert root node!");
      return this;
    }, i.prototype.isChildOf = function(t) {
      if (t instanceof i)
        return this.parent === t;
      if (typeof t == "string")
        return this.parent.id === t;
      throw Error("Unknown parent type passed to Branch.isChildOf");
    }, i.prototype.isConsistent = function() {
      return !this.isRoot() && !this.parent.children.includes(this) ? !1 : this.isLeaf() ? !0 : this.children.some((t) => t.parent !== this) ? !1 : this.children.every((t) => t.isConsistent());
    }, i.prototype.isDescendantOf = function(t) {
      return !t || !this.parent ? !1 : this.parent === t || this.parent.id === t ? !0 : this.parent.isDescendantOf(t);
    }, i.prototype.isLeaf = function() {
      return this.children.length === 0;
    }, i.prototype.isolate = function() {
      let t = this.parent.children.indexOf(this);
      return this.parent.children.splice(t, 1), this.setParent(null), this;
    }, i.prototype.isRoot = function() {
      return this.parent === null;
    }, i.prototype.leafs = function() {
      return this.getLeaves();
    }, i.prototype.leaves = function() {
      return this.getLeaves();
    }, i.prototype.links = function() {
      let t = [];
      return this.each((r) => {
        r.isRoot() || t.push({
          source: r.parent,
          target: r
        });
      }), t;
    }, i.prototype.normalize = function(t, r) {
      typeof r != "number" && (r = 1), typeof t != "number" && (t = 0);
      let e = 1 / 0, n = -1 / 0;
      this.each((o) => {
        o.value < e && (e = o.value), o.value > n && (n = o.value);
      });
      let s = (r - t) / (n - e);
      return this.each((o) => o.value = (o.value - e) * s + t);
    }, i.prototype.path = function(t) {
      let r = this, e = [this], n = this.getMRCA(t);
      for (; r !== n; )
        r = r.parent, e.push(r);
      let s = e.length;
      for (r = t; r !== n; )
        e.splice(s, 0, r), r = r.parent;
      return e;
    }, i.prototype.remove = function(t) {
      var e;
      let r = this.getRoot();
      return this.isolate(), t && ((e = this.parent) == null || e.removeIfNoChildren()), r;
    }, i.prototype.removeIfNoChildren = function(t) {
      let r = this.getRoot();
      return this.children.length === 0 && (this.remove(), t || this.parent.removeIfNoChildren()), r;
    }, i.prototype.replace = function(t) {
      let r = this.getRoot();
      this.parent;
      let e = this.parent.children.indexOf(this);
      return this.parent.children.splice(e, 1, t), r;
    }, i.prototype.reroot = function() {
      let t = this, r = [];
      for (; !t.isRoot(); )
        r.push(t), t = t.parent;
      return r.reverse().forEach((e) => e.invert()), this.fixDistances();
    }, i.prototype.rotate = function(t) {
      return this.children ? (this.children.reverse(), this) : this;
    }, i.prototype.setLength = function(t) {
      return this.length = t, this;
    }, i.prototype.setParent = function(t) {
      if (!t instanceof i && t !== null)
        throw Error("Cannot set parent to non-Branch object!");
      return this.parent = t, this;
    }, i.prototype.simplify = function() {
      return this.eachAfter((t) => {
        if (t.children.length == 1) {
          let r = t.children[0];
          r.id == "" ? r.id = t.id : r.id = t.id + "+" + r.id, t.excise();
        }
      }), this.fixDistances();
    }, i.prototype.sort = function(t) {
      return t || (t = (r, e) => r.value - e.value), this.eachBefore((r) => r.children.sort(t));
    }, i.prototype.sources = function(t) {
      let r = this.getMRCA(t);
      return r.depthOf(this) < r.depthOf(t);
    }, i.prototype.sum = function(t) {
      return t || (t = (r) => r.value), this.eachAfter(
        (r) => r.value = t(r) + r.children.reduce((e, n) => e + n.value, 0)
      );
    }, i.prototype.targets = function(t) {
      return t.sources(this);
    }, i.prototype.toJSON = function() {
      return this.toObject();
    }, i.prototype.toMatrix = function() {
      let t = this.getLeaves(), r = t.length, e = new Array(r);
      for (let n = 0; n < r; n++) {
        e[n] = new Array(r), e[n][n] = 0;
        for (let s = 0; s < n; s++) {
          let o = t[n].distanceTo(t[s]);
          e[n][s] = o, e[s][n] = o;
        }
      }
      return {
        matrix: e,
        ids: t.map((n) => n.id)
      };
    }, i.prototype.toNewick = function(t) {
      let r = "";
      return this.isLeaf() || (r += "(" + this.children.map((e) => e.toNewick(!0)).join(",") + ")"), r += this.id, this.length && (r += ":" + I(this.length)), t || (r += ";"), r;
    };
    function I(t) {
      let r = String(t);
      if (Math.abs(t) < 1) {
        let e = parseInt(t.toString().split("e-")[1]);
        if (e) {
          let n = t < 0;
          n && (t *= -1), t *= Math.pow(10, e - 1), r = "0." + new Array(e).join("0") + t.toString().substring(2), n && (r = "-" + r);
        }
      } else {
        let e = parseInt(t.toString().split("+")[1]);
        e > 20 && (e -= 20, t /= Math.pow(10, e), r = t.toString() + new Array(e + 1).join("0"));
      }
      return r;
    }
    i.prototype.toObject = function() {
      let t = {
        id: this.id,
        length: this.length
      };
      return this.children.length > 0 && (t.children = this.children.map((r) => r.toObject())), t;
    }, i.prototype.toString = function(t, r) {
      return t || (t = null), r || (r = 0), JSON.stringify(this, t, r);
    };
    function N(t, r, e, n) {
      r || (r = "id"), e || (e = "length"), n || (n = "children"), typeof t == "string" && (t = JSON.parse(t));
      let s = new i({
        id: t[r],
        length: t[e]
      });
      return t[n] instanceof Array && t[n].forEach((o) => {
        s.addChild(N(o));
      }), s.fixDistances();
    }
    function M(t, r) {
      let e = {}, n = e.N = t.length;
      r || (r = [...Array(n).keys()]), e.cN = e.N, e.D = t, e.labels = r, e.labelToTaxon = {}, e.currIndexToLabel = new Array(n), e.rowChange = new Array(n), e.newRow = new Array(n), e.labelToNode = new Array(2 * n), e.nextIndex = n, e.I = new Array(e.N), e.S = new Array(e.N);
      for (let l = 0; l < e.N; l++) {
        let x = O(e.D[l], l);
        e.S[l] = x, e.I[l] = x.sortIndices;
      }
      e.removedIndices = /* @__PURE__ */ new Set(), e.indicesLeft = /* @__PURE__ */ new Set();
      for (let l = 0; l < n; l++)
        e.currIndexToLabel[l] = l, e.indicesLeft.add(l);
      e.rowSumMax = 0, e.PNewick = "";
      let s, o, f, u, p, d, a, g, y;
      function h(l, x) {
        let C;
        return l < e.N ? (C = new i({ id: e.labels[l], length: x }), e.labelToNode[l] = C) : (C = e.labelToNode[l], C.setLength(x)), C;
      }
      e.rowSums = T(e.D);
      for (let l = 0; l < e.cN; l++)
        e.rowSums[l] > e.rowSumMax && (e.rowSumMax = e.rowSums[l]);
      for (; e.cN > 2; ) {
        ({ minI: s, minJ: o } = E(e)), f = 0.5 * e.D[s][o] + (e.rowSums[s] - e.rowSums[o]) / (2 * e.cN - 4), u = e.D[s][o] - f, p = e.currIndexToLabel[s], d = e.currIndexToLabel[o], a = h(p, f), g = h(d, u), y = new i({ children: [a, g] }), L(e, s, o);
        let l = O(e.D[o], o);
        e.S[o] = l, e.I[o] = l.sortIndices, e.S[s] = e.I[s] = [], e.cN--, e.labelToNode[e.nextIndex] = y, e.currIndexToLabel[s] = -1, e.currIndexToLabel[o] = e.nextIndex++;
      }
      let c = e.indicesLeft.values();
      s = c.next().value, o = c.next().value, p = e.currIndexToLabel[s], d = e.currIndexToLabel[o], f = u = e.D[s][o] / 2, a = h(p, f), g = h(d, u);
      let w = new i({ children: [a, g] });
      return w.fixParenthood(), w.fixDistances();
    }
    function E(t) {
      let r = 1 / 0, e = t.D, n = t.cN, s = n - 2, o = t.S, f = t.I, u = t.rowSums, p = t.removedIndices, d = t.rowSumMax, a, g = -1, y = -1, h;
      for (let c = 0; c < t.N; c++)
        p.has(c) || (h = f[c][0], !p.has(h) && (a = e[c][h] * s - u[c] - u[h], a < r && (r = a, g = c, y = h)));
      for (let c = 0; c < t.N; c++)
        if (!p.has(c)) {
          for (let w = 0; w < o[c].length; w++)
            if (h = f[c][w], !p.has(h)) {
              if (o[c][w] * s - u[c] - d > r)
                break;
              a = e[c][h] * s - u[c] - u[h], a < r && (r = a, g = c, y = h);
            }
        }
      return { minI: g, minJ: y };
    }
    function L(t, r, e) {
      let n = t.D, s = n.length, o = 0, f, u, p = t.removedIndices, d = t.rowSums, a = t.newRow, g = t.rowChange, y = 0;
      p.add(r);
      for (let h = 0; h < s; h++)
        p.has(h) || (f = n[r][h] + n[e][h], u = n[r][e], a[h] = 0.5 * (f - u), o += a[h], g[h] = -0.5 * (f + u));
      for (let h = 0; h < s; h++)
        n[r][h] = -1, n[h][r] = -1, !p.has(h) && (n[e][h] = a[h], n[h][e] = a[h], d[h] += g[h], d[h] > y && (y = d[h]));
      d[r] = 0, d[e] = o, o > y && (y = o), t.rowSumMax = y, t.indicesLeft.delete(r);
    }
    function T(t) {
      let r = t.length, e = new Array(r);
      for (let n = 0; n < r; n++) {
        let s = 0;
        for (let o = 0; o < r; o++)
          typeof parseFloat(t[n][o]) == "number" && (s += t[n][o]);
        e[n] = s;
      }
      return e;
    }
    function O(t, r) {
      typeof r > "u" && (r = -1);
      let e = t.length, n = new Array(e), s = new Array(e), o = 0;
      for (let f = 0; f < e; f++)
        t[f] === -1 || f === r || (n[o] = f, s[o++] = t[f]);
      n.length = o, s.length = o, n.sort((f, u) => t[f] - t[u]), s.sortIndices = n;
      for (let f = 0; f < o; f++)
        s[f] = t[n[f]];
      return s;
    }
    function b(t) {
      let r = [], e = new i(), n = t.split(/\s*(;|\(|\)|,|:)\s*/), s = n.length;
      for (let o = 0; o < s; o++) {
        let f = n[o], u;
        switch (f) {
          case "(":
            u = e.addChild(), r.push(e), e = u;
            break;
          case ",":
            u = r[r.length - 1].addChild(), e = u;
            break;
          case ")":
            e = r.pop();
            break;
          case ":":
            break;
          default:
            let p = n[o - 1];
            p == ")" || p == "(" || p == "," ? e.id = f : p == ":" && (e.length = parseFloat(f));
        }
      }
      return e.fixDistances();
    }
    m.Branch = i, m.parseJSON = N, m.parseMatrix = M, m.parseNewick = b, m.version = D;
  });
})(S, S.exports);
var P = S.exports;
const J = /* @__PURE__ */ B(P);
__e.default = J;


};
__m["lib/bpe.mjs"] = function (__e) {
const bpe = (arrarr,iterations = 600) => {
  let n = 0;
  while(n < iterations) {
    const {newarr: newarr, max: max} = bpe1(arrarr);
    if(max === 1) return newarr;
    arrarr = newarr;
    n = n + 1;
  }
  return arrarr;
};

const bpe1 = arrarr => {
  const statmap = new Map();
  // count
  for(const arr of arrarr) {
    for(let n=0;n<arr.length-1;n++) {
      const gram = [arr[n],arr[n+1]].flat(2).join(''); // in case arr[n] is ['k','ṣ','a'], etc.
      let obj = statmap.get(gram);
      if(!obj) { obj = {count: 0, places: [], grams: [arr[n],arr[n+1]]}; statmap.set(gram, obj); }
      obj.count = obj.count + 1;
      obj.places.push({arr: arr,n: n});
    }
  }
  const max = [...statmap].reduce((acc,cur) => 
    cur[1].count > acc[1].count ? 
      cur : 
      acc,
    [null, {count: 0}]);
   
  if(max[1].count === 1) return {newarr: arrarr, max: 1};

  // merge
  for(const place of max[1].places) {
    place.arr[place.n] = max[0];
    place.arr[place.n + 1] = null;
  }
  const newarr = [];
  for(const arr of arrarr)
    newarr.push(arr.filter(a => a !== null));
  return {newarr: newarr, max: max[1].count};
};
__e.default = bpe;


};
__m["lib/ngrams.mjs"] = function (__e) {
const similarityMatrix = (arrs, n) => {
    const grams = arrs.map(arr => [arr[0], ngrams(arr[1],n)]);
    const collated = collateGrams(grams);
    tfidf(collated);

    //const sortedheader = sortGrams(collated);
    //return gramsToCsv({header: sortedheader, rows: collated.rows});
    return cosineSimilarity(collated.rows);
};

const distanceMatrix = (arrs, n) => {
    const grams = arrs.map(arr => [arr[0], ngrams(arr[1],n)]);
    const collated = collateGrams(grams);
    tfidf(collated);
    return cosineSimilarity(collated.rows, true);
};
const ngrams = (arr, n) => {
    n = parseInt(n);
    const grams = [];
    for(let i=0; i < arr.length - n - 1; i++) {
        const sub = [];
        for(let j=i; j < i + n; j++)
            sub.push(Array.isArray(arr[j]) ? arr[j].join('') : arr[j]);
        grams.push(sub.join(' '));
    }
    const ret = new Map();
    for(const gram of grams) {
        const inmap = ret.get(gram);
        if(inmap)
            ret.set(gram,inmap + 1);
        else
            ret.set(gram,1);
    }
    return ret;
};

/*
 * @param {Array.<{siglum: string, data: Map}>} objs
 */
const collateGrams = arrs => {
    const collated = {header: new Set(), rows: []};
    for(const arr of arrs) {
        for(const newkey of arr[1].keys())
            collated.header.add(newkey);
        collated.rows.push(arr);
    }
    return collated;
};

const tfidf = obj => {
    const docs = obj.rows.length;
    const idf = new Map();
    for(const heading of obj.header) {
        let count = 0;
        for(const row of obj.rows) {
            if(row[1].has(heading))
                count = count + 1;
        }
        idf.set(heading,Math.log(docs/count));

        for(const row of obj.rows) {
            const data = row[1].get(heading);
            if(!data) continue;
            const newdata = Math.log(1 + data) * idf.get(heading);
            row[1].set(heading,newdata);
        }
    }

};

const sortGrams = obj => {
    const ordered = [];
    for(const gram of obj.header) {
        let count = 0;
        for(const row of obj.rows) {
            const cellcount = row[1].get(gram) || 0;
            count = count + cellcount;
        }
        ordered.push([gram,Math.log(count)]);
    }
    ordered.sort((a,b) => b[1] - a[1]);
    return ordered.map(arr => arr[0]);
};

const gramsToCsv = obj => {
    const headings = [...obj.header];
    const csv = [','+headings.map(h => `"${h}"`).join(',')];

    for(const row of obj.rows) {
        const ret = [];
        ret.push(row.siglum);
        for(const heading of headings)
            ret.push(row.data.get(heading) || 0);
        csv.push(ret.join(','));
    }
    return csv.join('\n');
};
/*
const cosineSimilarity = (objs) => {
    const ret = new Map();
    for(let n=0;n<objs.length-1;n++) {
        for(let m=n+1;m<objs.length;m++) {
            const [arr1, arr2] = normalizeArrays(objs[n].data, objs[m].data);
            const similarity = cosinesim(arr1,arr2);
            if(similarity === 0) continue;
            const sigla = [objs[n].siglum,objs[m].siglum];
            sigla.sort();
            ret.set(sigla.join(':'), similarity);
        }
    }
    return ret;
};
*/

const cosineSimilarity = (arrs,distance = false) => {
    const ret = new Array(arrs.length);
    for(let i=0; i< ret.length; i++)
        ret[i] = Array(arrs.length).fill(1);
    for(let n=0;n<arrs.length-1;n++) {
        for(let m=n+1;m<arrs.length;m++) {
            const [arr1, arr2] = normalizeArrays(arrs[n][1], arrs[m][1]);
            const similarity = cosinesim(arr1,arr2);
            ret[n][m] = distance ? 1 - similarity : similarity;
            ret[m][n] = ret[n][m];
        }
    }
    return ret;
};
const normalizeArrays = (map1, map2) => {
    let ret1 = [];
    let ret2 = [];
    for(const [key, val] of map1) {
        ret1.push(val);
        ret2.push(map2.get(key) || 0);
    }
    for(const [key, val] of map2) {
        if(map1.has(key)) continue;
        ret2.push(val);
        ret1.push(0);
    }
    if(ret1.length !== ret2.length) throw new Error('Error!');

    return [ret1, ret2];
};
const cosinesim = (arr1, arr2) => {
    let dotprod = 0;
    let m1 = 0;
    let m2 = 0;
    for(let i=0; i < arr1.length; i++) {
        dotprod = dotprod + (arr1[i] * arr2[i]);
        m1 = m1 + (arr1[i] * arr1[i]);
        m2 = m2 + (arr2[i] * arr2[i]);
    }

    if(m1 === 0 || m2 === 0) return 0; // something went wrong here

    return dotprod / (Math.sqrt(m1) * Math.sqrt(m2));
};
__e.distanceMatrix = distanceMatrix; __e.similarityMatrix = similarityMatrix;


};
__m["lib/ncd.mjs"] = function (__e) {
//import * as fflate from 'https://cdn.skypack.dev/fflate@0.8.2?min';
const fflate = __r("lib/fflate.mjs");

const distanceMatrix = arrs => {
  const comps = new Map();
  for(const arr of arrs) {
    const buf = fflate.strToU8(arr[1].flat(2).join(''));
    const res = fflate.deflateSync(buf,{level: 9});
    comps.set(arr[0],res.length);
  } 
  const ret = [];
  for(let n=0;n<arrs.length;n++) ret.push([]);

  for(const [n,arr1] of arrs.entries()) {
    for(const [m,arr2] of arrs.entries()) {
      const buf = fflate.strToU8(arr1[1].flat(2).join('') + arr2[1].flat(2).join(''));
      const res = fflate.deflateSync(buf,{level: 9});
      const s1 = comps.get(arr1[0]);
      const s2 = comps.get(arr2[0]);
      ret[n][m] = (res.length - Math.min(s1,s2)) / Math.max(s1,s2);
    }
  }
  return ret;
};
__e.distanceMatrix = distanceMatrix;


};
__m["lib/affine-align.mjs"] = function (__e) {
const {charSplit, aksaraSplit, graphemeSplit} = __r("lib/split.mjs");
const {GridMixin} = __r("lib/structurae/grid.js");

// TODO: substitution matrix
const scorechar = ({match = 1, mismatch = -1, missing = '‡', prop = null}) => (s1,i,s2,j) => {
    const a = prop ? s1[i][prop] : s1[i];
    const b = prop ? s2[j][prop] : s2[j];
    if(a === b) return match;
    if(a === '' || b === '') return match - 0.5; // TODO: add gap extension penalty instead
    if(a === missing || b === missing) return 0;
    //if(a === missing || b === missing) return mismatch/2; // TODO: specify this penalty?
    //if(a === '' && b === ' ') return 1;
    //if(a === ' ' && b === '') return 1;
    //if(a === '' || b === '') return -2;
    //if(getType(a,iast) !== getType(b,iast)) return mismatch - 0.5;
    return mismatch;
};

const scorearr = ({match = 1, mismatch = -1, gap_open = -2, gap_extend = -0.5, missing = '‡', prop = null}) => {
	const charfn = scorechar({match: match, mismatch: mismatch, missing: missing, prop: prop});
	const charconf = new charConfig({match: match, mismatch: mismatch, missing: missing, gap_open: gap_open, gap_extend: gap_extend, prop: null});
  const arrEq = (a,b,len) => {
    var i;
    for(i = len; i-- !== 0;)
      if(a[i] !== b[i]) return false;
      return true;
  };

	return (s1,i,s2,j) => {
		const a = prop ? s1[i][prop] : s1[i];
		const b = prop ? s2[j][prop] : s2[j];
		const alen = a.length;
		const blen = b.length;
		if(alen === 0 && blen === 0) return match; // TODO: maybe something else
		//if(alen === 0 || blen === 0) return mismatch; // TODO: better idea?
    if(alen === blen && arrEq(a,b,alen)) return match;
    if(a === '' || b === '') return match + gap_extend;
		const score = alen === 1 && blen === 1 ?
			charfn(a,0,b,0) :
			affineAlign(a,b,charconf,{alignment: false}) / Math.max(alen,blen);
		return score;
	};
};

const scorearr_simple = ({match = 1, mismatch = -1, missing = '‡', prop = null}) => (s1,i,s2,j) => {
    const a = prop ? s1[i][prop] : s1[i];
    const b = prop ? s2[j][prop] : s2[j];
    const alen = a.length;
    const blen = b.length;
    if(alen === 0 && blen === 0) return match; // TODO: maybe something else
    //if(alen === 0 || blen === 0) return mismatch; // TODO: better idea?
    if(alen !== blen) return mismatch;

    if(a[0] === missing || b[0] === missing) return match/2; // TODO: specify this penalty

    for(let n=0;n<alen;n++)
        if(a[n] !== b[n]) return mismatch;

    return match;
};

const scoremsa = scorefn => (arr1,i,arr2,j/*,weights*/) => {
  let score = 0;
  let divisor = 0;
  for(const [n,s1] of arr1.entries()) {
    for(const [m,s2] of arr2.entries()) { 
      //const newscore = weights ? scorefn(s1,i,s2,j) * weights[0][n] * weights[1][m] :
      //                           scorefn(s1,i,s2,j);
      const newscore = scorefn(s1,i,s2,j);
      score = score + newscore;
      divisor = divisor + 1;
    }
  }
  return score/divisor; // divisor shouldn't be 0
};

/*
const AlignConfig = function(scorefn, gap_open, gap_extend, gap_skip_initial) {
    this.scorefn = scorefn;
    this.gap = {
        open: gap_open,
        extend: gap_extend,
        skip_initial: gap_skip_initial
    };
};
*/
const assignScores = (config, scorefn, scoring, type='simple') => {
    config.match = scoring.match; // this is for estimateSize
    config.mismatch = scoring.mismatch;
    config.prop = scoring.prop;
    config.gap = {
        open: scoring.gap_open,
        extend: scoring.gap_extend,
        skip_initial: scoring.gap_skip_initial
    };
    const scorecfg = {
        match: scoring.match, 
        mismatch: scoring.mismatch,
        prop: scoring.prop
    };
    if(type !== 'simple') {
      scorecfg.gap_open = scoring.gap_open;
      scorecfg.gap_extend = scoring.gap_extend;
    }
    return scorefn(scorecfg);
};

const arrConfig = function(scoring) {
    this.scorefn = assignScores(this,scorearr,scoring,'extended');
};
const arrMsaConfig = function(scoring) {
    const scorefn = assignScores(this,scorearr,scoring,'extended');
    this.scorefn = scoremsa(scorefn);
};
const simpleArrConfig = function(scoring) {
    this.scorefn = assignScores(this,scorearr_simple,scoring);
};
const simpleArrMsaConfig = function(scoring) {
    const scorefn = assignScores(this,scorearr_simple,scoring);
    this.scorefn = scoremsa(scorefn);
};
const charConfig = function(scoring) {
  this.scorefn = assignScores(this,scorechar,scoring);
};
const charMsaConfig = function(scoring) {
  const scorefn = assignScores(this,scorechar,scoring);
  this.scorefn = scoremsa(scorefn);
};

if(typeof Float16Array === 'undefined') var Float16Array = Float32Array;

const Float16Grid = GridMixin(Float16Array);
const Float32Grid = GridMixin(Float32Array);
const Float64Grid = GridMixin(Float64Array);
const Uint8Grid = GridMixin(Uint8Array);

const estimateSize = (len1, len2, config) => {
    const len = Math.max(len1,len2);
    const mut = Math.max(
        Math.abs(config.match),
        Math.abs(config.mismatch),
        Math.abs( (config.gap.open + config.gap.extend)/2 )
        );
    const tot = len * mut;
    if(tot < 65504) return Float16Grid;
    if(tot < 3.4e38) return Float32Grid;
    return Float64Grid;
};

const affineAlign = (s1arr,
                     s2arr,
                     config = new charConfig({match: 1, mismatch: -1, gap_open: -2, gap_extend: -0.25,skip_initial: false}),
                     options = {
                         alignment: true,
                         matrix: false,
                         gap: null
                        }
                     ) => {
    const UP   = 1;
    const LEFT = 2;
    const UL   = 3;
    const START = -Infinity;

    const s1len = s1arr.length;
    const s2len = s2arr.length;
    
    const [gapopen,gapextend] = options.gap ? 
      [options.gap.open, options.gap.extend] :
      [config.gap.open, config.gap.extend];

    // initialize matrix
    const ArrayType = estimateSize(s1len+1,s2len+1,{...config.gap, gap: {open: gapopen, extend: gapextend}});
    const mat    = ArrayType.create(s1len+1,s2len+1);
    const igap   = ArrayType.create(s1len+1,s2len+1);
    const jgap   = ArrayType.create(s1len+1,s2len+1);
    const direc  = Uint8Grid.create(s1len+1,s2len+1);
    /* 
    const isGap = (arr, n) => {
      const test = config.prop ?
        arr[n][config.prop] : arr[n];
      if(Array.isArray(test) && test[0] === '') return true;
      if(test !== '') return true;
      return false;
    }
    */
    for(let i=0; i<s1len+1; i++) {
        if(i === 0) {
            mat.setValue(0,0,0);
            igap.setValue(0,0,0);
            jgap.setValue(0,0,0);
            //direc.setValue(0,0,0); // 0 by default; should not be needed
        }
        else {
            const score = config.gap.skip_initial ?  
                gapextend * i :
                gapopen + gapextend * i;
            mat.setValue(i,0,score);
            igap.setValue(i,0,score);
            jgap.setValue(i,0,i === 0 ? 0 : START); //i === 0 ? 0 : null;
            direc.setValue(i,0,UP);
        }
    }
    for(let j=1; j<s2len+1; j++) {
        // no gap opening penalty at the beginning
        const score = config.gap.skip_initial ? 
            gapextend * j :
            gapopen + gapextend * j;
        mat.setValue(0,j,score);
        igap.setValue(0,j,START); // null;
        jgap.setValue(0,j,score);
        direc.setValue(0,j,LEFT);
    }

    // calculate scores
    for(let i=1; i<s1len+1; i++) {
        for(let j=1; j<s2len+1; j++) {
            let ulscore = mat.getValue(i-1,j-1) + config.scorefn(s1arr,i-1,s2arr,j-1);
            
            // no gap opening penalty at the bottom row
            const bottomrow = config.gap.skip_initial && j === s2len;
            //const igapadd = scoreGap(s1arr,i-1,config.gap.open,config.prop);
            const igapopen = bottomrow ? 
                mat.getValue(i-1,j) :
                mat.getValue(i-1,j) + gapopen;
                //mat.getValue(i-1,j) + igapadd;

            const previgap = igap.getValue(i-1,j);
            /* // START is -Infinity, so previgap will always be smaller
            const igapmax = previgap !== START ? 
                Math.max(igapopen,previgap) + config.gap.extend : igapopen + config.gap.extend;
            */
            const igapmax = Math.max(igapopen,previgap) + gapextend;

            // no gap opening penalty at the last column
            const lastcol = config.gap.skip_initial && i === s1len;
            const freeopenj = s1arr[i-1] === '⊔';
            //const jgapadd = scoreGap(s2arr,j-1,config.gap.open,config.prop);
            const jgapopen = lastcol ?  
                mat.getValue(i,j-1) :
                mat.getValue(i,j-1) + gapopen;
                //mat.getValue(i,j-1) + jgapadd;
           
            const prevjgap = jgap.getValue(i,j-1);
            /*
            const jgapmax = prevjgap !== START ?
                Math.max(jgapopen,prevjgap) + config.gap.extend : jgapopen + config.gap.extend;
            */
            const jgapmax = Math.max(jgapopen,prevjgap) + gapextend;
            /* 
            const curigap = isGap(s1arr,i-1);
            const curjgap = isGap(s2arr,j-1);
            const maxval = curigap ?
              Math.max(ulscore,jgapmax) : curjgap ?
              Math.max(ulscore,igapmax) :
              Math.max(ulscore,igapmax,jgapmax);
            */
            const maxval = Math.max(ulscore,igapmax,jgapmax);

            mat.setValue(i,j,maxval);
            igap.setValue(i,j,igapmax);
            jgap.setValue(i,j,jgapmax);

            if(maxval === ulscore) direc.setValue(i,j,UL);
            else if(maxval === igapmax) direc.setValue(i,j,UP);
            else if(maxval === jgapmax) direc.setValue(i,j,LEFT);
        }
    }
    
    if(options.alignment !== true)
            return mat.getValue(s1len,s2len);
    // traceback
    const chars = [[],[]];
    var I = s1len;
    var J = s2len;
    const gapel = () => {
      if(config.prop) {
        const ret = {};
        ret[config.prop] = '';
        return ret;
      }
      else return '';
    };
    let curpath = [s1len,s2len];
    const path = [curpath];
    while(I > 0 || J > 0) {
        switch (direc.getValue(I,J)) {
        case UP:
            I--;
            chars[0].push(s1arr[I]);
            chars[1].push(gapel());
            if(options.matrix) {
				curpath = [curpath[0]-1,curpath[1]];
				path.push(curpath);
			}
            break;
        case LEFT:
            J--;
            chars[0].push(gapel());
            chars[1].push(s2arr[J]);
			if(options.matrix) {
				curpath = [curpath[0],curpath[1]-1];
				path.push(curpath);
			}
            break;
        case UL:
            I--;
            J--;
            chars[0].push(s1arr[I]);
            chars[1].push(s2arr[J]);
			if(options.matrix) {
				curpath = [curpath[0]-1,curpath[1]-1];
				path.push(curpath);
			}
            break;
        default: break;
        }
    }
    chars[0].reverse();
    chars[1].reverse();
    path.reverse();

    // TODO: Semantic cleanup
    // 1. "syād vyutkramaḥ sthāno" vs "s________________thāno"
    //    move single characters preceded by space to other side of gap

    if(options.matrix)
        return [...chars,mat.getValue(s1len,s2len),mat.toArrays(),new Set(path.map(p => p.join(',')))];
    else
        return [...chars,mat.getValue(s1len,s2len)];
        
};

const scoreGap = (arr,n,gapopen,prop=null) => {
    const test = prop ? arr[n][prop] : arr[n];
    if(Array.isArray(test) && test[0] !== '') return gapopen;
    else if(test !== '') return gapopen;
    return 0;
};

const scoreMsaGap = (arr,n,gapopen,prop=null) => {
    let score = 0;
    for(const c of arr) {
      const test = prop ? c[n][prop] : c[n];
      if(Array.isArray(test) && test[0] !== '') score = score + gapopen;
      else if(test !== '') score = score + gapopen;
    }
    return score/arr.length;
};

const alignAlign = (p1arr,
                     p2arr,
                     config = new charMsaConfig({match: 1, mismatch: -1, gap_open: -2, gap_extend: -0.25,skip_initial: false}),
                     options = {
                      gap: null
                     }
                   ) => {
    const UP   = 1;
    const LEFT = 2;
    const UL   = 3;
    const START = -Infinity;

    const p1len = p1arr[0].length;
    const p2len = p2arr[0].length;

    const [gapopen,gapextend] = options.gap ? 
      [options.gap.open, options.gap.extend] :
      [config.gap.open, config.gap.extend];

    // initialize matrix
    const ArrayType = estimateSize(p1len+1,p2len+1,{...config.gap, gap: {open: gapopen, extend: gapextend}});
    const mat    = ArrayType.create(p1len+1,p2len+1);
    const igap   = ArrayType.create(p1len+1,p2len+1);
    const jgap   = ArrayType.create(p1len+1,p2len+1);
    const direc  = Uint8Grid.create(p1len+1,p2len+1);
    /*
    const isGap = (arr, n) => {
      for(const row of arr) {
        const test = config.prop ? row[n][config.prop] : row[n];
        if(Array.isArray(test) && test[0] !== '') return false;
        else if(test !== '') return false;
      }
      return true;
    };
    */
    for(let i=0; i<p1len+1; i++) {
        if(i === 0) {
            mat.setValue(0,0,0);
            igap.setValue(0,0,0);
            jgap.setValue(0,0,0);
            //direc.setValue(0,0,0); // previously null
        }
        else {
            const score = config.gap.skip_initial ? 
                gapextend * i :
                gapopen + gapextend * i;
            mat.setValue(i,0,score);
            igap.setValue(i,0,score);
            jgap.setValue(i,0,i === 0 ? 0 : START);
            direc.setValue(i,0,UP);
        }
    }
    for(let j=1; j<p2len+1; j++) {
        // no gap opening penalty at the beginning
        const score = config.gap.skip_initial ? 
            gapextend * j :
            gapopen + gapextend * j;
        mat.setValue(0,j,score);
        igap.setValue(0,j,START);
        jgap.setValue(0,j,score);
        direc.setValue(0,j,LEFT);
    }

    // calculate scores
    for(let i=1; i<p1len+1; i++) {
        for(let j=1; j<p2len+1; j++) {
            let ulscore = mat.getValue(i-1,j-1) + config.scorefn(p1arr,i-1,p2arr,j-1/*,weights*/);
            // no gap opening penalty at the bottom row

            //const igapadd = scoreMsaGap(p1arr,i-1,config.gap.open,config.prop);
            const bottomrow = config.gap.skip_initial && j === p2len;
            const igapopen = bottomrow ? 
                mat.getValue(i-1,j) :
                mat.getValue(i-1,j) + gapopen;
                //mat.getValue(i-1,j) + igapadd;

            const previgap = igap.getValue(i-1,j);
            /*
            const igapmax = previgap !== START ?
                Math.max(igapopen,previgap) + config.gap.extend : igapopen + config.gap.extend;
            */
            const igapmax = Math.max(igapopen,previgap) + gapextend;

            // no gap opening penalty at the last column
            //const jgapadd = scoreMsaGap(p2arr,j-1,config.gap.open,config.prop);
            const lastcol = config.gap.skip_initial && i === p1len;
            const jgapopen = lastcol ? 
                mat.getValue(i,j-1) :
                mat.getValue(i,j-1) + gapopen;
                //mat.getValue(i,j-1) + jgapadd;
           
            const prevjgap = jgap.getValue(i,j-1);
            /*
            const jgapmax = prevjgap !== START ?
                Math.max(jgapopen,prevjgap) + config.gap.extend : jgapopen + config.gap.extend;
            */
            const jgapmax = Math.max(jgapopen,prevjgap) + gapextend;
            /*
            const curigap = isGap(p1arr,i-1);
            const curjgap = isGap(p2arr,j-1);
            const maxval = curigap ?
              Math.max(ulscore,jgapmax) : curjgap ?
              Math.max(ulscore,igapmax) :
              Math.max(ulscore,igapmax,jgapmax);
            */
            const maxval = Math.max(ulscore,igapmax,jgapmax);

            mat.setValue(i,j,maxval);
            igap.setValue(i,j,igapmax);
            jgap.setValue(i,j,jgapmax);

            if( maxval === ulscore) direc.setValue(i,j,UL);
            else if( maxval === igapmax) direc.setValue(i,j,UP);
            else if( maxval === jgapmax) direc.setValue(i,j,LEFT);

        }
    }

    // traceback
    const chars1 = new Array(p1arr.length);
    for(let n=0;n<p1arr.length;n++)
        chars1[n] = [];
    const chars2 = new Array(p2arr.length);
    for(let n=0;n<p2arr.length;n++)
        chars2[n] = [];
    var I = p1len;
    var J = p2len;
    const gapel = () => {
      if(config.prop) {
        const ret = {};
        ret[config.prop] = '';
        return ret;
      }
      else return '';
    };
    while(I > 0 || J > 0) {
        switch (direc.getValue(I,J)) {
        case UP:
            I--;
            for(let n=0;n<chars1.length;n++)
                chars1[n].unshift(p1arr[n][I]);
            for(const char2 of chars2)
                char2.unshift(gapel());
            break;
        case LEFT:
            J--;
            for(const char1 of chars1)
                char1.unshift(gapel());
            for(let n=0;n<chars2.length;n++)
                chars2[n].unshift(p2arr[n][J]);
            break;
        case UL:
            I--;
            J--;
            for(let n=0;n<chars1.length;n++)
                chars1[n].unshift(p1arr[n][I]);
            for(let n=0;n<chars2.length;n++)
                chars2[n].unshift(p2arr[n][J]);
            break;
        default: break;
        }
    }

    //return [[...chars1,...chars2],mat[p1len][p2len]];
    return [...chars1,...chars2];
        
};
__e.affineAlign = affineAlign; __e.alignAlign = alignAlign; __e.charConfig = charConfig; __e.arrConfig = arrConfig; __e.simpleArrConfig = simpleArrConfig; __e.arrMsaConfig = arrMsaConfig; __e.simpleArrMsaConfig = simpleArrMsaConfig; __e.charMsaConfig = charMsaConfig;


};
__m["lib/split.mjs"] = function (__e) {
const spaceSplit = str => {
    const split = str.split(/(\s+)/g);
    const ret = split.reduce((acc,cur,i) => {
        if(i === 0) {
            acc.push(cur);
            return acc;
        }

        const last = acc.slice(-1)[0];

        if(cur.trim() === '')
            acc[acc.length - 1] = last + cur;
        else {
            if(last.trim() == '') // if the first cell is a space
                acc[acc.length - 1] = last + cur;
            else
                acc.push(cur);
        }
        return acc;
    },[]);

    return ret;
};

const CharSet = function({vowels,consonants,postvowels,gap}) {
    this.vowels = new Set(vowels);
    this.consonants = new Set(consonants);
    this.postvowels = new Set(postvowels);
    this.gap = gap;

    this.lengthMap = new Map();
    for(const c of [...vowels,...consonants,...postvowels,gap]) {
        const existing = this.lengthMap.get(c.length);
        if(existing) existing.add(c);
        else this.lengthMap.set(c.length,new Set([c]));
    }
    this.maxLength = Math.max(...this.lengthMap.keys());
    
};

const iast = new CharSet({
    vowels: ['a','ā','i','ī','u','ū','o','ō','e','ē','ai','au','ṛ','ṝ','l̥','l̥̄'],
    consonants: ['k','kh','g','gh','ṅ','c','ch','j','jh','ñ','ṭ','ṭh','ḍ','ḍh','ṇ','t','th','d','dh','n','p','ph','b','bh','m','y','r','l','v','ś','ṣ','s','h','ḻ','ḷ','ḷh','ṟ','ṉ','n̆','m̆'],
    postvowels: ['ṃ','ḥ','ḵ'],
    gap: '‡'
});

const slpish = new CharSet({
    vowels: ['a','ā','i','ī','u','ū','o','ō','e','ē','E','O','ṛ','ṝ','l̥','l̥̄'],
    consonants: ['k','K','g','G','ṅ','c','C','j','J','ñ','ṭ','Ṭ','ḍ','Ḍ','ṇ','t','T','d','D','n','p','P','b','B','m','y','r','l','v','ś','ṣ','s','h','ḻ','ḷ','Ḷ','ṟ','ṉ','n̆','m̆'],
    postvowels: ['ṃ','ḥ','ḵ'],
    gap: '‡'
});

const wylie = new CharSet({
    vowels: ['a','ā','i','ī','u','ū','o','ō','e','ē','ai','au','ṛ','ṝ','l̥','l̥̄'],
    consonants: ['\'','k','kh','g','gh','ng','c','ch','j','jh','ny','ṭ','ṭh','ḍ','ḍh','ṇ','t','th','d','dh','n','p','ph','b','bh','m','ts','tsh','dz','w','zh','z','y','r','l','sh','ṣ','s','h'],
    postvowels: ['ṃ','ḥ'],
    gap: '‡'
});

const wylish = new CharSet({
    vowels: ['a','ā','i','ī','u','ū','o','ō','e','ē','E','O','ṛ','ṝ','l̥','l̥̄'],
    consonants: ['\'','k','K','g','G','ṅ','c','C','j','J','ñ','ṭ','Ṭ','ḍ','Ḍ','ṇ','t','T','d','D','n','p','P','b','B','m','ŧ','Ŧ','đ','w','Z','z','y','r','l','ś','ṣ','s','h'],
    postvowels: ['ṃ','ḥ'],
    gap: '‡'
});

const charType = {
    consonant: Symbol('consonant'),
    vowel: Symbol('vowel'),
    mark: Symbol('mark'),
    gap: Symbol('gap'),
    other: Symbol('other')
};

const getType = (str, charset) => {
    if(charset.consonants.has(str))
        return charType.consonant;
    if(charset.vowels.has(str))
        return charType.vowel;
    if(charset.postvowels.has(str))
        return charType.mark;
    if(charset.gap === str)
        return charType.gap;
    return null;
};

const charSplit = (str,charset = iast) => {
    const ret = [];
    let start = 0;
    while(start < str.length) {
        const slice = str.slice(start,start + charset.maxLength);
        const found = findChar(slice,charset);
        if(found === null) {
            ret.push(slice[0]);
            start = start + 1;
        }
        else {
            ret.push(found);
            start = start + found.length;
        }
    }
    return ret;
};

const graphemeSplit = (str,charset = iast) => {
    const ret = [];
    let cache = [];
    let prevtype = null;
    let start = 0;
    while(start < str.length) {
        const slice = str.slice(start,start + charset.maxLength);
        const found = findChar(slice,charset);
        if(found === null) {
            cache.push(slice[0]);
            start = start + 1;
            prevtype = charType.other;
        }
        else {
            start = start + found.length;

            const curtype = getType(found,charset);
            if(curtype === charType.consonant ||
               curtype === charType.gap ||
               curtype === charType.vowel && prevtype !== charType.consonant ||
               curtype !== charType.other && prevtype === charType.other //||
               //curtype === charType.postvowel && prevtype === charType.consonant
              ) {
                if(cache.length !== 0) ret.push(cache);
                cache = [found];
            }
            else
                cache.push(found);

            prevtype = curtype;
        }
    }

    ret.push(cache);

    return ret;
};

const aksaraSplit = (str,charset = iast) => {
    const ret = [];
    let cache = [];
    let prevtype = null;
    let start = 0;
    while(start < str.length) {
        const slice = str.slice(start,start + charset.maxLength);
        const found = findChar(slice,charset);
        if(found === null) {
            cache.push(slice[0]);
            start = start + 1;
            prevtype = charType.other;
        }
        else {
            start = start + found.length;

            const curtype = getType(found,charset);
            if(curtype === charType.consonant && prevtype !== charType.consonant ||
               curtype === charType.gap ||
               curtype === charType.vowel && prevtype !== charType.consonant ||
               curtype !== charType.other && prevtype === charType.other //||
               //curtype === charType.postvowel && prevtype === charType.consonant
              ) {
                if(cache.length !== 0) ret.push(cache);
                cache = [found];
            }
            else
                cache.push(found);

            prevtype = curtype;
        }
    }

    ret.push(cache);

    return ret;
};

const findChar = (str,charset) => {
    let length = str.length;
    let slice = str;
    while(length > 0) {
        const found = charset.lengthMap.get(length).has(slice);
        if(found) return slice;
        else {
            length = length-1;
            slice = slice.slice(0,-1);
        }
    }
    return null;
    //throw new Error(`You messed up at ${str}.`);
};

/*
const teststr = 'jñānadayāsindhōḥ';
console.log(charSplit(teststr, iast));
console.log(graphemeSplit(teststr, iast));
console.log(aksaraSplit(teststr, iast));
*/
__e.spaceSplit = spaceSplit; __e.aksaraSplit = aksaraSplit; __e.charSplit = charSplit; __e.graphemeSplit = graphemeSplit; __e.iast = iast; __e.slpish = slpish; __e.wylie = wylie; __e.wylish = wylish; __e.getType = getType;


};
__m["lib/structurae/grid.js"] = function (__e) {
const { getLog2 } = __r("lib/structurae/utilities.js");
/**
 * Creates a Grid class extending a given Array-like class.
 */
function GridMixin(Base) {
    /**
     * Extends built-in indexed collections to handle 2 dimensional data.
     */
    return class Grid extends Base {
        constructor() {
            super(...arguments);
            Object.defineProperty(this, "size", {
                enumerable: true,
                configurable: true,
                writable: true,
                value: 0
            });
        }
        static get [Symbol.species]() {
            return Base;
        }
        /**
         * Number of columns in the grid.
         */
        get columns() {
            return 1 << this.size;
        }
        /**
         * Specifies the number of columns of the grid.
         */
        set columns(columns) {
            this.size = getLog2(columns);
        }
        /**
         * Number of rows in the grid.
         */
        get rows() {
            //@ts-ignore 2339
            return this.length >> this.size;
        }
        /**
         * Creates a grid of specified dimensions.
         *
         * @param rows the amount of rows
         * @param columns the amount of columns
         * @return a new grid
         */
        static create(rows, columns = 1) {
            const offset = getLog2(columns);
            const length = rows << offset;
            const grid = new this(length);
            grid.size = offset;
            return grid;
        }
        /**
         * Creates a grid from an array of arrays.
         *
         * @param arrays the array of arrays
         * @return a new grid
         */
        static fromArrays(arrays) {
            const rows = arrays.length;
            // find longest array to get the column size
            let columns = arrays[0].length; // if !arrays[0].length
            for (let i = 0; i < rows; i++) {
                if (arrays[i].length > columns)
                    columns = arrays[i].length;
            }
            const offset = getLog2(columns);
            columns = 1 << offset;
            // create grid of the required length
            const grid = this.create(rows, columns);
            // fill the grid with values from arrays
            for (let i = 0; i < rows; i++) {
                const rowId = i << offset;
                for (let j = 0; j < arrays[i].length; j++) {
                    grid[rowId + j] = arrays[i][j];
                }
            }
            return grid;
        }
        /**
         * Returns the length of the underlying Array required to hold the grid of specified dimensions.
         *
         * @param rows the amount of rows
         * @param columns the amount of columns
         * @return the required length
         */
        static getLength(rows, columns = 1) {
            return rows << getLog2(columns);
        }
        getCoordinates(index) {
            return [index >> this.size, index & ((1 << this.size) - 1)];
        }
        /**
         * Returns the index of an element at given coordinates.
         *
         * @param rows the row index
         * @param columns the column index
         * @return the element index
         */
        getIndex(row, column = 1) {
            return (row << this.size) + column;
        }
        /**
         * Returns the element at given coordinates.
         *
         * @param rows the row index
         * @param columns the column index
         * @return the element
         */
        getValue(row, column) {
            return this[this.getIndex(row, column)];
        }
        /**
         * Sets the element at given coordinates.
         *
         * @param rows the row index
         * @param columns the column index
         * @param value the element
         * @return the grid
         */
        setValue(row, column, value) {
            this[this.getIndex(row, column)] = value;
            return this;
        }
        /**
         * Creates an array of arrays representing rows of the grid.
         *
         * @return an array of arrays
         */
        toArrays() {
            const { rows, columns, size } = this;
            const result = [];
            for (let i = 0; i < rows; i++) {
                const rowOffset = i << size;
                result[i] = [];
                for (let j = 0; j < columns; j++) {
                    result[i][j] = this[rowOffset + j];
                }
            }
            return result;
        }
    };
}

__e.GridMixin = GridMixin;
};
__m["lib/structurae/utilities.js"] = function (__e) {
/**
 * Lookup table for powers of 2
 */
const log2 = {
    1: 0,
    2: 1,
    4: 2,
    8: 3,
    16: 4,
    32: 5,
    64: 6,
    128: 7,
    256: 8,
    512: 9,
    1024: 10,
    2048: 11,
    4096: 12,
    8192: 13,
    16384: 14,
    32768: 15,
    65536: 16,
    131072: 17,
    262144: 18,
    524288: 19,
    1048576: 20,
    2097152: 21,
    4194304: 22,
    8388608: 23,
    16777216: 24,
    33554432: 25,
    67108864: 26,
    134217728: 27,
    268435456: 28,
    536870912: 29,
    1073741824: 30,
    2147483648: 31,
};
/**
 * Counts set bits in a given number.
 *
 * @param value the number
 * @return the amount of set bits
 */
function popCount32(value) {
    const a = value - ((value >> 1) & 0x55555555);
    const b = (a & 0x33333333) + ((a >> 2) & 0x33333333);
    return (((b + (b >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
}
/**
 * Returns the index of the Least Significant Bit in a number.
 *
 * @param value the number
 * @return the index of LSB
 */
function getLSBIndex(value) {
    if (value === 2147483648)
        return 31;
    return log2[value & -value];
}
/**
 * Returns the minimum amount of bits necessary to hold a given number.
 *
 * @param number the number
 * @return the amount of bits necessary
 */
function getBitSize(number) {
    if (number < 281474976710656)
        return (Math.log2(number) | 0) + 1;
    const n = BigInt(number);
    const [zero, one, two] = [BigInt(0), BigInt(1), BigInt(2)];
    let high = BigInt(53);
    let low = BigInt(48);
    while (high - low > one) {
        const mid = (high + low) / two;
        const maskHigh = (one << high) - (one << mid);
        if ((maskHigh & n) > zero) {
            low = mid;
        }
        else {
            high = mid;
        }
    }
    return Number(low + one);
}
function getLog2(value) {
    return Math.ceil(Math.log2(value));
}

__e.popCount32 = popCount32;
__e.getLSBIndex = getLSBIndex;
__e.getBitSize = getBitSize;
__e.getLog2 = getLog2;
__e.log2 = log2;
};

  global.CollateEngine = { MultiAligner: __r('lib/multialign.mjs').default };
};
