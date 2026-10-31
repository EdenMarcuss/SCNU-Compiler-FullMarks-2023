/*
 * 文件名称: app.js — 界面装配与交互
 * 摘要:     项目一(词法分析器生成器) / 项目二(LL(1)语法分析器) / 项目三(Mini-C全流程)
 * 版本: 1.0   日期: 2026-11-01
 */
(function () {
'use strict';
var C = window.CompilerCore, P = window.Presets;

/* ================= 通用工具 ================= */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function download(name, text) {
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}
/* 读本地文件: 优先 UTF-8, 失败回退 GBK(兼容老作业文件) */
function readTextFile(file, cb) {
  var r = new FileReader();
  r.onload = function () {
    var buf = r.result;
    try { cb(new TextDecoder('utf-8', { fatal: true }).decode(buf)); }
    catch (e) {
      try { cb(new TextDecoder('gbk').decode(buf)); }
      catch (e2) { cb(new TextDecoder('utf-8').decode(buf)); }
    }
  };
  r.readAsArrayBuffer(file);
}
function tableHTML(headers, rows, opts) {
  opts = opts || {};
  var h = '<div class="tablewrap"><table class="data">';
  if (opts.caption) h += '<caption class="cap">' + esc(opts.caption) + '</caption>';
  h += '<thead><tr>' + headers.map(function (x, i) { return '<th' + ((opts.monoCols || []).indexOf(i) >= 0 ? ' class="mono"' : '') + '>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>';
  rows.forEach(function (r) {
    h += '<tr>' + r.map(function (cell, i) {
      if (cell && cell.__html) return '<td' + (cell.cls ? ' class="' + cell.cls + '"' : '') + '>' + cell.v + '</td>';
      return '<td' + ((opts.monoCols || []).indexOf(i) >= 0 ? ' class="mono"' : '') + (cell === '' || cell == null ? ' class="empty"' : '') + '>' + esc(cell == null ? '—' : cell) + '</td>';
    }).join('') + '</tr>';
  });
  return h + '</tbody></table></div>';
}
function H(v, cls) { return { __html: true, v: v, cls: cls || '' }; }

/* 语法树 SVG (紧凑布局) */
function treeSVG(root, opt) {
  opt = opt || {};
  var nodes = [], edges = [], leafX = 0;
  (function walk(n, depth) {
    var id = nodes.length;
    nodes.push({ n: n, depth: depth, x: 0, w: Math.max(34, String(n.sym).length * 11 + 12) });
    var my = id;
    if (!n.children.length) nodes[my].x = leafX++;
    else {
      var kids = n.children.map(function (ch) { return walk(ch, depth + 1); });
      nodes[my].x = (nodes[kids[0]].x + nodes[kids[kids.length - 1]].x) / 2;
      kids.forEach(function (k) { edges.push([my, k]); });
    }
    return my;
  })(root, 0);
  var U = opt.ux || 58, UY = opt.uy || 62, PAD = 40;
  var maxD = Math.max.apply(null, nodes.map(function (n) { return n.depth; }));
  var W = Math.max((leafX) * U + PAD * 2, 320), Ht = (maxD + 1) * UY + PAD * 1.4;
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + Ht + '" width="' + W + '" height="' + Ht + '">';
  edges.forEach(function (e) {
    var a = nodes[e[0]], b = nodes[e[1]];
    s += '<line x1="' + (PAD + a.x * U) + '" y1="' + (PAD + a.depth * UY + 14) + '" x2="' + (PAD + b.x * U) + '" y2="' + (PAD + b.depth * UY - 2) + '" stroke="#b8c4d6" stroke-width="1.2"/>';
  });
  nodes.forEach(function (nd) {
    var x = PAD + nd.x * U, y = PAD + nd.depth * UY;
    var label = nd.n.sym === C.EPS ? 'ε' : String(nd.n.sym);
    var isT = nd.n.isTerm;
    var fill = isT ? '#e5f6eb' : '#e8effd', stroke = isT ? '#4caf7d' : '#7ea6f0', tcol = isT ? '#1c7a44' : '#1d4fc4';
    s += '<g><rect x="' + (x - nd.w / 2) + '" y="' + (y - 12) + '" width="' + nd.w + '" height="22" rx="6" fill="' + fill + '" stroke="' + stroke + '"/>';
    s += '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="11.5" fill="' + tcol + '">' + esc(label) + '</text></g>';
  });
  return s + '</svg>';
}

/* 自动机状态图(圆周布局, 状态数过多时不画) */
function automataSVG(nfa, name) {
  var nCount = nfa.states.length;
  if (nCount > 60) return '<div class="note">状态数 ' + nCount + ' 过多, 仅提供转换表视图</div>';
  var R = Math.max(140, nCount * 5.5), W = R * 2 + 160, Ht = R * 2 + 120;
  var cx = W / 2, cy = Ht / 2;
  var pos = nfa.states.map(function (st, i) {
    var ang = (i / nCount) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R };
  });
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + Ht + '" width="' + Math.min(W, 900) + '">';
  nfa.edges.forEach(function (e) {
    if (e.from === e.to) return;
    var a = pos[e.from], b = pos[e.to];
    var mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12, my = (a.y + b.y) / 2 - (b.x - a.x) * 0.12;
    var lbl = e.label ? (e.label.kind === 'char' ? e.label.ch : e.label.kind === 'cls' ? '[' + e.label.label + ']' : '.') : 'ε';
    s += '<path d="M' + a.x + ' ' + a.y + ' Q' + mx + ' ' + my + ' ' + b.x + ' ' + b.y + '" fill="none" stroke="' + (e.label ? '#9db2cc' : '#c9a8e8') + '" stroke-width="1"/>';
    if (nCount <= 34) s += '<text x="' + ((a.x + b.x) / 2 + (b.y - a.y) * 0.2) + '" y="' + ((a.y + b.y) / 2 - (b.x - a.x) * 0.2) + '" font-size="9" fill="#7c8aa0" text-anchor="middle">' + esc(lbl) + '</text>';
  });
  nfa.states.forEach(function (st, i) {
    var p = pos[i], acc = st.acceptLine >= 0;
    s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="11" fill="' + (acc ? '#e5f6eb' : '#fff') + '" stroke="' + (acc ? '#4caf7d' : '#8b98ab') + '" stroke-width="1.4"/>';
    if (acc) s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="7.5" fill="none" stroke="#4caf7d" stroke-width="1"/>';
    if (nCount <= 40) s += '<text x="' + p.x + '" y="' + (p.y + 3.5) + '" font-size="9.5" text-anchor="middle" fill="#3b4657">' + i + '</text>';
  });
  var st0 = pos[nfa.start];
  s += '<circle cx="' + (st0.x - 34) + '" cy="' + st0.y + '" r="3.5" fill="#2563eb"/><line x1="' + (st0.x - 30) + '" y1="' + st0.y + '" x2="' + (st0.x - 12) + '" y2="' + st0.y + '" stroke="#2563eb" stroke-width="1.6"/>';
  return s + '</svg>';
}

/* ================= 项目一: 词法分析器生成器 ================= */
var lexState = { lang: 'tiny', built: null };

function buildLexerNow(langKey, regexText) {
  var cfgBase = P.LANGS[langKey];
  var defs = C.parseRegexFile(regexText);
  var combined = C.combineNfas(defs);
  var perLine = defs.map(function (d, i) { return C.nfaFromRegex(d.node, i); });
  var dfa = C.nfaToDfa(combined);
  var min = C.minimizeDfa(dfa);
  var simCfg = { defNames: defs.map(function (d) { return d.name; }), blockComment: cfgBase.commentCfg.blockComment, lineComment: cfgBase.commentCfg.lineComment };
  var cCode = C.generateCCode(defs, min, simCfg, cfgBase.name);
  return { defs: defs, combined: combined, perLine: perLine, dfa: dfa, min: min, simCfg: simCfg, cCode: cCode, langKey: langKey };
}
function lexRun(built, src) { return C.simulateLex(built.min, src, built.simCfg); }

function renderLexAutomataTable(nfa, container, defName) {
  var labels = [];
  nfa.edges.forEach(function (e) { if (!e.label) { if (labels.indexOf('ε') < 0) labels.push('ε'); } else { var k = C.labelKey(e.label); if (labels.indexOf(k) < 0) labels.push(k); } });
  var byState = {};
  nfa.edges.forEach(function (e) {
    var k = e.label ? C.labelKey(e.label) : 'ε';
    (byState[e.from] = byState[e.from] || {})[k] = (byState[e.from][k] || []).concat(e.to);
  });
  var accName = function (line) { return line < 0 ? '' : (defName === 'combined' ? lexState.built.defs[line].name : defName); };
  var rows = nfa.states.map(function (st) {
    var row = [{ __html: true, v: st.id + (accName(st.acceptLine) ? ' →' : ''), cls: st.acceptLine >= 0 ? 'acc' : '' }];
    labels.forEach(function (lk) {
      var ts = (byState[st.id] || {})[lk];
      row.push(ts ? ts.join(',') : '');
    });
    row.push(H(accName(st.acceptLine) ? '<b>' + esc(accName(st.acceptLine)) + '</b>' : '', st.acceptLine >= 0 ? 'acc' : ''));
    return row;
  });
  container.innerHTML = tableHTML(['状态'].concat(labels, ['类别']), rows, { monoCols: labels.map(function (_, i) { return i + 1; }) });
}

function renderDfaTable(min, container, defs) {
  var comp = C.compressDfaColumns(min);
  var rows = min.states.map(function (st) {
    var row = [{ __html: true, v: '<b>' + st.id + '</b>', cls: st.acceptLine >= 0 ? 'acc' : '' }];
    comp.groups.forEach(function (g) {
      var t = min.trans[st.id][g.chars[0]];
      t = (t === undefined) ? -1 : t;
      var dead = (t === min.deadBlock);
      row.push({ __html: true, v: t < 0 || dead ? '⊘' : t, cls: st.acceptLine >= 0 ? 'acc' : (dead ? '' : '') });
    });
    row.push(H(st.acceptLine >= 0 ? '<b>' + esc(defs[st.acceptLine].name) + '</b>' : (st.isDead ? '⊘死' : ''), st.acceptLine >= 0 ? 'acc' : ''));
    return row;
  });
  container.innerHTML = tableHTML(['状态'].concat(comp.groups.map(function (g) { return g.display; }), ['类别']), rows, { caption: '状态转换表 (⊘ 为死状态; 列已按等价转移合并, 如 a..z)' });
}

function renderLexPanels() {
  var b = lexState.built;
  if (!b) return;
  var langName = P.LANGS[b.langKey].name;
  /* 1 正则表 */
  var rows = b.defs.map(function (d, i) { return [i + 1, d.name, d.expr]; });
  $('lex-defs').innerHTML = tableHTML(['单词编码', '类别', '正则表达式'], rows, { monoCols: [2] });
  $('lex-stats').innerHTML =
    '<div class="stat">NFA 状态数<b>' + b.combined.states.length + '</b></div>' +
    '<div class="stat">DFA 状态数<b>' + b.dfa.states.length + '</b></div>' +
    '<div class="stat">最小化DFA 状态数<b>' + b.min.states.length + '</b></div>' +
    '<div class="stat">单词类别数<b>' + b.defs.length + '</b></div>';
  /* 2 NFA */
  renderLexAutomataSelect();
  /* 3/4 DFA 表 */
  renderDfaTable(b.dfa, $('lex-dfa'), b.defs);
  renderDfaTable(b.min, $('lex-mindfa'), b.defs);
  /* 5 C 代码 */
  $('lex-ccode').innerHTML = '<pre class="code">' + esc(b.cCode) + '</pre>';
  /* 6/7 测试区复位 */
  $('lex-src').value = P.LANGS[b.langKey].sampleSource;
  runLexTest();
}
function renderLexAutomataSelect() {
  var b = lexState.built;
  var sel = $('lex-nfa-sel');
  sel.innerHTML = '<option value="combined">合并 NFA (总表)</option>' + b.defs.map(function (d, i) { return '<option value="' + i + '">单独 NFA: ' + esc(d.name) + '</option>'; }).join('');
  drawLexNfa();
}
function drawLexNfa() {
  var b = lexState.built, sel = $('lex-nfa-sel'), v = sel.value;
  if (v === 'combined') {
    renderLexAutomataTable(b.combined, $('lex-nfa'), 'combined');
    $('lex-nfa-graph').innerHTML = automataSVG({ states: b.combined.states, edges: b.combined.edges, start: b.combined.start }, '合并NFA');
  } else {
    var i = +v;
    renderLexAutomataTable(b.perLine[i], $('lex-nfa'), b.defs[i].name);
    $('lex-nfa-graph').innerHTML = automataSVG(b.perLine[i], b.defs[i].name);
  }
}
function runLexTest() {
  var b = lexState.built;
  if (!b) return;
  var src = $('lex-src').value;
  var r = lexRun(b, src);
  var codeBase = 0;
  var rows = r.tokens.map(function (t, i) {
    var isErr = t.cat === 'ERROR';
    return [i + 1, t.line, isErr ? 'ERROR' : codeBase + b.defs.indexOf(b.defs.filter(function (d) { return d.name === t.cat; })[0]) + 1, H(isErr ? '<span class="errline">ERROR</span>' : esc(t.cat), isErr ? 'err-cell' : ''), H('<span class="' + (isErr ? 'errline' : '') + '">' + esc(t.lexeme) + '</span>', 'mono')];
  });
  $('lex-tokens').innerHTML = (r.errors.length ? '<div class="note">' + esc('发现 ' + r.errors.length + ' 处词法错误: ' + r.errors.slice(0, 5).map(function (e) { return '第' + e.line + '行 ' + e.msg; }).join('; ')) + '</div>' : '<div class="okline">✓ 词法分析完成, 无错误, 共 ' + r.tokens.length + ' 个单词</div>') +
    tableHTML(['序号', '行号', '单词编码', '类别', '词素'], rows, {});
  $('lex-lexfile').innerHTML = '<pre class="code lexfile">' + esc(C.makeLexFile(src, r.tokens)) + '</pre>';
}

function initTab1() {
  var sel = $('lex-lang');
  sel.onchange = function () { $('lex-regex').value = P.LANGS[sel.value].regexText; };
  $('lex-build').onclick = function () {
    try {
      lexState.built = buildLexerNow(sel.value, $('lex-regex').value);
      $('lex-err').innerHTML = '';
      renderLexPanels();
    } catch (e) { $('lex-err').innerHTML = '<div class="note">' + esc(e.message) + '</div>'; }
  };
  $('lex-nfa-sel').onchange = drawLexNfa;
  $('lex-run').onclick = runLexTest;
  $('lex-sample').onclick = function () { $('lex-src').value = P.LANGS[sel.value].sampleSource; runLexTest(); };
  $('lex-open-src').onclick = function () { pickFile(function (name, text) { $('lex-src').value = text; runLexTest(); }); };
  $('lex-open-regex').onclick = function () { pickFile(function (name, text) { $('lex-regex').value = text; }); };
  $('lex-dl-c').onclick = function () { if (lexState.built) download(P.LANGS[lexState.built.langKey].name + '_lexer.c', lexState.built.cCode); };
  $('lex-dl-lex').onclick = function () { if (lexState.built) download('sample.lex', C.makeLexFile($('lex-src').value, lexRun(lexState.built, $('lex-src').value).tokens)); };
  $('lex-regex').value = P.LANGS.tiny.regexText;
  $('lex-build').click();
}
var fileInput = null;
function pickFile(cb) {
  if (!fileInput) { fileInput = document.createElement('input'); fileInput.type = 'file'; document.body.appendChild(fileInput); }
  fileInput.onchange = function () { if (fileInput.files[0]) readTextFile(fileInput.files[0], function (t) { cb(fileInput.files[0].name, t); }); };
  fileInput.click();
}

/* ================= 项目二: LL(1) 语法分析器 ================= */
var graState = { lang: 'tiny', g0: null, simp: null, tr: null, tbl: null };

function buildGrammarNow(langKey, text) {
  var g0 = C.parseGrammar(text);
  var simp = C.simplifyGrammar(g0);
  var tr = C.transformGrammar(g0);
  var tbl = C.buildLL1Table(tr.g);
  return { g0: g0, simp: simp, tr: tr, tbl: tbl, langKey: langKey };
}
function grammarTableRows(g) {
  var byLhs = {};
  g.prods.forEach(function (p) { (byLhs[p.lhs] = byLhs[p.lhs] || []).push(p.rhs); });
  var rows = [], i = 1;
  g.order.forEach(function (lhs) {
    (byLhs[lhs] || []).forEach(function (rhs) {
      rows.push([i++, lhs, rhs.length ? rhs.join(' ') : 'ε']);
    });
  });
  return rows;
}
function renderGrammarPanels() {
  var s = graState;
  if (!s.tr) return;
  $('gra-orig').innerHTML = tableHTML(['序号', '非终结符', '产生式'], grammarTableRows(s.g0), { monoCols: [2] });
  var removedRows = [];
  s.simp.removedNts.forEach(function (n) { removedRows.push([n, '不可达 / 推不出终结串']); });
  s.simp.removedAlts.forEach(function (p) { removedRows.push([p.lhs + ' → ' + (p.rhs.join(' ') || 'ε'), '含无用符号']); });
  $('gra-simp').innerHTML = (removedRows.length ?
    tableHTML(['被删除的产生式/符号', '原因'], removedRows, {}) :
    '<div class="okline">✓ 该文法不含无用符号(所有非终结符都能推出终结串且均可从开始符号到达), 化简后与原文法相同</div>') +
    tableHTML(['序号', '非终结符', '产生式'], grammarTableRows(s.simp.result), { monoCols: [2] });
  $('gra-transform').innerHTML =
    '<div class="hint">共迭代 ' + s.tr.iterations + ' 轮(消除左递归 ⇄ 提取左公因子/替换展开), 变换后 ' + s.tr.g.prods.length + ' 条产生式:</div>' +
    tableHTML(['序号', '非终结符', '产生式'], grammarTableRows(s.tr.g), { monoCols: [2] });
  var nts = s.tr.g.order;
  $('gra-first').innerHTML = tableHTML(['非终结符', 'FIRST 集合'], nts.map(function (n) {
    var f = s.tbl.first[n] || new Set();
    var arr = Array.from(f).filter(function (x) { return x !== C.EPS; });
    return [n, '{ ' + arr.join(', ') + (f.has(C.EPS) ? (arr.length ? ', ε' : 'ε') : '') + ' }'];
  }), {});
  $('gra-follow').innerHTML = tableHTML(['非终结符', 'FOLLOW 集合'], nts.map(function (n) {
    return [n, '{ ' + Array.from(s.tbl.follow[n] || []).join(', ') + ' }'];
  }), {});
  /* LL(1) 表 */
  var terms = s.tbl.terms;
  var rows = nts.map(function (n) {
    var row = [{ __html: true, v: '<b>' + esc(n) + '</b>' }];
    terms.forEach(function (t) {
      var pi = s.tbl.table[n][t];
      if (pi === undefined) row.push('');
      else {
        var p = s.tr.g.prods[pi];
        var txt = (p.rhs.length ? p.rhs.join(' ') : 'ε');
        row.push({ __html: true, v: esc(n + '→' + txt), cls: '' });
      }
    });
    return row;
  });
  var confNote = '';
  if (s.tbl.conflicts.length) {
    confNote = '<div class="note">发现 ' + s.tbl.conflicts.length + ' 处冲突, 均已按规则自动消解(详见下): <br>' +
      s.tbl.conflicts.map(function (c) { return '• M[' + esc(c.nt) + ', ' + esc(c.term) + ']: ' + esc(c.kind) + ' — ' + esc(c.resolution); }).join('<br>') + '</div>';
  } else {
    confNote = '<div class="okline">✓ LL(1) 分析表无任何冲突, 文法为严格的 LL(1) 文法</div>';
  }
  $('gra-table-note').innerHTML = confNote;
  $('gra-table').innerHTML = tableHTML(['非终结符'].concat(terms), rows, { caption: 'LL(1) 预测分析表 M[A, a]' });
  resetParsePanels();
}
function tokensToTerminals(tokens) {
  return tokens.map(function (t) {
    if (t.cat === 'ERROR') throw new Error('存在无法识别的单词: ' + t.lexeme);
    if (t.cat === '关键词' || t.cat === '专用符号') return t.lexeme;
    if (t.cat === 'identifier') return 'identifier';
    if (t.cat === 'number') return 'number';
    if (t.cat === 'ID') return 'ID';
    if (t.cat === 'NUM') return 'NUM';
    throw new Error('未知单词类别: ' + t.cat);
  });
}
/* 从 sample.lex 文本解析出 token 流 (兼容当年的输出格式) */
function parseLexFileFormat(text) {
  var tokens = [];
  text.split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^[ \t]*（(.+?)，(.*)）\s*$/);
    if (m) tokens.push({ cat: m[1], lexeme: m[2] });
  });
  return tokens;
}
function runParse(withTokens) {
  var s = graState, out = $('gra-parse-out');
  try {
    var pr = C.parseLL1(s.tr.g, s.tbl, withTokens);
    var traceRows = pr.steps.map(function (st) { return [st.step, H('<span class="mono">' + esc(st.stack) + '</span>'), H('<span class="mono">' + esc(st.input) + '</span>'), H(pr.ok || st.action.indexOf('报错') < 0 ? esc(st.action) : '<span class="errline">' + esc(st.action) + '</span>')]; });
    out.innerHTML =
      (pr.ok ? '<div class="okline">✓ 语法分析成功: 该单词串是 ' + esc(s.tr.g.start) + ' 的合法句子</div>'
             : '<div class="errline">✗ 语法分析失败: ' + esc(pr.error || '') + '</div>') +
      '<div class="hint" style="margin:6px 0">分析过程 (共 ' + pr.steps.length + ' 步):</div>' +
      tableHTML(['步骤', '分析栈', '剩余输入', '动作'], traceRows, {}) +
      '<div class="hint" style="margin:10px 0 6px">LL(1) 分析树 (变换后文法, 非终结符蓝框 / 终结符绿框):</div>' +
      '<div class="graphwrap">' + treeSVG(pr.tree) + '</div>' + renderSemantic(withTokens);
  } catch (e) {
    out.innerHTML = '<div class="errline">' + esc(e.message) + '</div>';
  }
}
/* 由文法终结符反查词法 token 时的关键词表 (TINY + Mini-C) */
var KW_WORDS = { if: 1, then: 1, else: 1, end: 1, repeat: 1, until: 1, read: 1, write: 1, int: 1, float: 1, void: 1, do: 1, while: 1, return: 1 };
function renderSemantic(tokens) {
  var s = graState;
  var lang = P.LANGS[s.langKey];
  if (!lang.astBuilder) return '';
  try {
    var tk = tokens.map(function (sym) {
      /* 反查: 由文法终结符构造词法 token 供语义分析 */
      if (sym === 'identifier') return { cat: 'identifier', lexeme: 'id' };
      if (sym === 'number') return { cat: 'number', lexeme: '0' };
      if (sym === 'ID') return { cat: 'ID', lexeme: 'id' };
      if (sym === 'NUM') return { cat: 'NUM', lexeme: '0' };
      return { cat: KW_WORDS[sym] ? '关键词' : '专用符号', lexeme: sym };
    });
    /* 语义分析使用真实词素更佳: 若输入来自词法分析则直接用原始 token */
    if (runParse.lastRawTokens && runParse.lastRawTokens.length === tokens.length) tk = runParse.lastRawTokens;
    var ast, quads, title;
    if (lang.astBuilder === 'tiny') { ast = C.buildTinyAst(tk); quads = C.generateQuadsTiny(ast); title = 'TINY'; }
    else { ast = C.buildMiniCAst(tk); quads = C.generateQuadsMiniC(ast); title = 'Mini-C'; }
    var quadRows = quads.map(function (q, i) { return [i + 1, q.op, q.a1, q.a2, q.r]; });
    return '<div class="hint" style="margin:10px 0 6px">抽象语法树 (AST):</div><div class="graphwrap">' + treeSVG({ sym: 'program', isTerm: false, children: ast.map(function (d) { return astNodeToTree(d); }) }) + '</div>' +
      '<div style="margin:10px 0 6px"><span class="badge green">选做内容</span> <b>' + title + ' 中间代码 — 四元式</b> <span class="hint">(共 ' + quads.length + ' 条)</span></div>' +
      tableHTML(['序号', '算符 op', 'arg1', 'arg2', 'result'], quadRows, { monoCols: [1, 2, 3, 4] });
  } catch (e) {
    return '<div class="note">语义分析(选做)未执行: ' + esc(e.message) + '</div>';
  }
}
function astNodeToTree(d) {
  function label(n) {
    switch (n.kind) {
      case 'if': return 'if-stmt'; case 'repeat': return 'repeat-stmt'; case 'assign': return 'assign-stmt';
      case 'read': return 'read ' + (n.name || ''); case 'write': return 'write-stmt';
      case 'func': return 'func ' + (n.name || ''); case 'vardef': return 'var ' + (n.name || '');
      case 'dowhile': return 'do-while'; case 'return': return 'return'; case 'compound': return '{...}';
      case 'exprstmt': return 'expr;'; case 'relop': return n.op || 'relop'; case 'arith': return n.op || 'op';
      case 'num': return 'num ' + (n.val || ''); case 'var': return 'var ' + (n.name || '') + (n.index ? '[]' : '');
      case 'call': return 'call ' + (n.name || ''); case 'seq': return 'stmt-seq';
      default: return n.kind;
    }
  }
  var kids = [];
  Object.keys(d).forEach(function (k) {
    if (k === 'kind' || k === 'line' || k === 'name' || k === 'val' || k === 'op' || k === 'array' || k === 'type') return;
    var v = d[k];
    if (Array.isArray(v)) v.forEach(function (x) { if (x && x.kind) kids.push(astNodeToTree(x)); });
    else if (v && typeof v === 'object' && v.kind) kids.push(astNodeToTree(v));
  });
  return { sym: label(d), isTerm: kids.length === 0 && ['num', 'var', 'call', 'read'].indexOf(d.kind) >= 0, children: kids };
}
function resetParsePanels() {
  $('gra-parse-out').innerHTML = '<div class="hint">选择输入后点击"开始语法分析"</div>';
}
function initTab2() {
  var sel = $('gra-lang');
  sel.onchange = function () { $('gra-text').value = P.LANGS[sel.value].grammarText; };
  $('gra-build').onclick = function () {
    try {
      graState.langKey = sel.value;
      Object.assign(graState, buildGrammarNow(sel.value, $('gra-text').value));
      $('gra-err').innerHTML = '';
      renderGrammarPanels();
    } catch (e) { $('gra-err').innerHTML = '<div class="note">' + esc(e.message) + '</div>'; }
  };
  $('gra-open').onclick = function () { pickFile(function (n, t) { $('gra-text').value = t; }); };
  $('gra-run-src').onclick = function () {
    var L = buildLexerNow(sel.value, P.LANGS[sel.value].regexText);
    var r = lexRun(L, $('gra-src').value);
    if (r.errors.length) { $('gra-parse-out').innerHTML = '<div class="errline">词法错误: ' + esc(JSON.stringify(r.errors.slice(0, 3))) + '</div>'; return; }
    runParse.lastRawTokens = r.tokens;
    runParse(tokensToTerminals(r.tokens));
  };
  $('gra-run-lex').onclick = function () {
    pickFile(function (n, t) {
      try {
        var toks = parseLexFileFormat(t);
        if (!toks.length) throw new Error('未能从文件中解析出（类别，词素）格式的单词, 请确认是 sample.lex 格式');
        runParse.lastRawTokens = toks;
        runParse(tokensToTerminals(toks));
      } catch (e) { $('gra-parse-out').innerHTML = '<div class="errline">' + esc(e.message) + '</div>'; }
    });
  };
  $('gra-src').value = P.LANGS.tiny.sampleSource;
  $('gra-text').value = P.LANGS.tiny.grammarText;
  $('gra-build').click();
}

/* ================= 项目三: Mini-C 全流程 ================= */
function runMiniCAll() {
  var out = $('mc-out');
  var report = [];
  function add(item, ok, detail) { report.push({ item: item, ok: ok, detail: detail }); }
  try {
    /* 1 词法 */
    var L = buildLexerNow('minic', P.MINIC_REGEX);
    add('Mini-C 正则表达式 → NFA → DFA → 最小化DFA', true, 'NFA ' + L.combined.states.length + ' 状态 / DFA ' + L.dfa.states.length + ' 状态 / 最小化 ' + L.min.states.length + ' 状态');
    var r = lexRun(L, P.SAMPLE_MINIC);
    add('自编 Mini-C 源程序词法分析', r.errors.length === 0, r.tokens.length + ' 个单词, ' + r.errors.length + ' 个错误');
    var lexText = C.makeLexFile(P.SAMPLE_MINIC, r.tokens);
    /* 2 语法 */
    var G = buildGrammarNow('minic', P.MINIC_GRAMMAR);
    add('Mini-C BNF 文法 → 化简/消左递归/提左公因子', true, '29 条原文法 → ' + G.tr.g.prods.length + ' 条 LL(1) 文法, 迭代 ' + G.tr.iterations + ' 轮');
    var hard = G.tbl.conflicts.filter(function (c) { return c.kind === 'FIRST/FIRST 冲突'; });
    add('LL(1) 分析表构造', hard.length === 0, hard.length === 0 ? '无 FIRST/FIRST 冲突; 悬空 else 按就近匹配消解' : hard.length + ' 处未消解冲突');
    var pr = C.parseLL1(G.tr.g, G.tbl, tokensToTerminals(r.tokens));
    add('LL(1) 语法分析 + 语法树', pr.ok, pr.ok ? '分析成功, ' + pr.steps.length + ' 步' : pr.error);
    /* 3 语义 + 四元式 */
    var ast = C.buildMiniCAst(r.tokens);
    var quads = C.generateQuadsMiniC(ast);
    add('AST 构建 + 四元式生成(选做)', quads.length > 0, quads.length + ' 条四元式');
    /* 汇总渲染 */
    var allOk = report.every(function (x) { return x.ok; });
    out.innerHTML =
      '<div class="' + (allOk ? 'okline' : 'errline') + '" style="font-size:15px">' + (allOk ? '✓ Mini-C 全流程测试全部通过' : '✗ 存在失败项') + '</div>' +
      tableHTML(['测试项', '结果', '说明'], report.map(function (x) {
        return [x.item, H(x.ok ? '<b style="color:var(--ok)">通过</b>' : '<b style="color:var(--err)">失败</b>'), x.detail];
      }), {}) +
      '<div class="hint" style="margin:12px 0 6px">① 词法分析输出 (sample.lex 同款格式, 前 60 行):</div>' +
      '<pre class="code" style="max-height:260px">' + esc(lexText.split('\n').slice(0, 60).join('\n')) + '\n...</pre>' +
      '<div class="hint" style="margin:12px 0 6px">② LL(1) 分析树:</div><div class="graphwrap">' + treeSVG(pr.tree) + '</div>' +
      '<div class="hint" style="margin:12px 0 6px">③ 抽象语法树:</div><div class="graphwrap">' + treeSVG({ sym: 'program', isTerm: false, children: ast.map(function (d) { return astNodeToTree(d); }) }) + '</div>' +
      '<div style="margin:12px 0 6px"><span class="badge green">选做内容</span> <b>四元式中间代码</b>:</div>' +
      tableHTML(['#', 'op', 'arg1', 'arg2', 'result'], quads.map(function (q, i) { return [i + 1, q.op, q.a1, q.a2, q.r]; }), { monoCols: [1, 2, 3, 4] });
  } catch (e) {
    out.innerHTML = '<div class="errline">测试中断: ' + esc(e.message) + '</div>' +
      tableHTML(['测试项', '结果', '说明'], report.map(function (x) { return [x.item, H(x.ok ? '通过' : '失败'), x.detail]; }), {});
  }
}
function initTab3() {
  $('mc-run').onclick = runMiniCAll;
  $('mc-src').value = P.SAMPLE_MINIC;
}

/* ================= 标签页切换与启动 ================= */
function initTabs() {
  var btns = document.querySelectorAll('.tabbar button');
  btns.forEach(function (b) {
    b.onclick = function () {
      btns.forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      document.querySelectorAll('.tabpage').forEach(function (p) { p.classList.remove('active'); });
      $(b.dataset.page).classList.add('active');
    };
  });
}
document.addEventListener('DOMContentLoaded', function () {
  initTabs();
  initTab1();
  initTab2();
  initTab3();
});
})();
