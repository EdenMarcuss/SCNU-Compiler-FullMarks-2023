/*
 * ============================================================
 * 文件名称: core.js
 * 标识符:   CompilerCore
 * 摘要:     编译原理课程项目核心算法库（2026 满分重制版）
 *           第一部分: 正则 -> NFA -> DFA -> 最小化DFA -> C词法分析器生成 -> 词法分析
 *           第二部分: BNF文法 -> 化简 -> 消除左递归/左公因子 -> First/Follow
 *                     -> LL(1)分析表 -> 语法分析(轨迹+树) -> AST -> 四元式(选做)
 * 当前版本: 1.0
 * 完成日期: 2026-11-01
 * 版本历史: v1.0 首次实现全部算法 (2026-11-01)
 * ============================================================
 */
(function (global) {
'use strict';

/* ---------------- 通用工具 ---------------- */
function uniq(a) { return Array.from(new Set(a)); }
function setOf(arr) { return new Set(arr); }
function fmtSet(s) { return '{ ' + Array.from(s).join(', ') + ' }'; }
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }

/* ============================================================
 * 第一部分  正则表达式引擎
 * 正则语法: | 连接 闭包* 正闭包+ 可选? 分组() 字符类[a-z] 区间a..z
 *           转义\. \+ \\ 等 任意字符.  空串ε   宏引用(先前定义的名字)
 * AST 节点: {t:'char',ch} {t:'cls',set,label} {t:'any'} {t:'eps'}
 *           {t:'seq',xs} {t:'alt',xs} {t:'star',x} {t:'plus',x} {t:'opt',x}
 * ============================================================ */

function rangeLabel(set) {
  var chs = Array.from(set).sort();
  // 压缩成区间显示
  var parts = [], i = 0;
  while (i < chs.length) {
    var j = i;
    while (j + 1 < chs.length && chs[j + 1].codePointAt(0) === chs[j].codePointAt(0) + 1) j++;
    if (j === i) parts.push(chs[i]);
    else if (j === i + 1) parts.push(chs[i], chs[j]);
    else parts.push(chs[i] + '..' + chs[j]);
    i = j + 1;
  }
  return parts.join('|');
}

/* 带宏引用的正则解析器 */
function RegexParser(macros) {
  this.macros = macros || {};   // name -> AST
  this.src = ''; this.pos = 0;
}
RegexParser.prototype = {
  error: function (msg) { throw new Error('正则表达式错误(位置' + this.pos + '): ' + msg + '，原文: ' + this.src); },
  peek: function () { return this.src[this.pos]; },
  eof: function () { return this.pos >= this.src.length; },
  parse: function (src) {
    /* 预处理(在原串上扫描, 保留词边界):
       ① 跳过未转义空白(空格仅作分隔)
       ② a..z 区间 → [a-z] 字符类
       ③ 宏名 → \x01宏名\x01 哨兵保护(防止去空格后单词粘连误判) */
    var macros = this.macros;
    function isWC(c) { return /[A-Za-z0-9_]/.test(c); }
    var out = '';
    var i = 0;
    while (i < src.length) {
      var c = src[i];
      if (c === '\\') { out += src.substr(i, 2); i += 2; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      if (isWC(c)) {
        if (src.length - i >= 4 && src[i + 1] === '.' && src[i + 2] === '.' && isWC(src[i + 3])) {
          var lo = c, hi = src[i + 3];
          if (lo.charCodeAt(0) > hi.charCodeAt(0)) throw new Error('字符区间 ' + lo + '..' + hi + ' 起点大于终点');
          out += '[' + lo + '-' + hi + ']'; i += 4; continue;
        }
        var m = src.slice(i).match(/^[A-Za-z0-9_]+/)[0];
        if (macros.hasOwnProperty(m)) out += '\x01' + m + '\x01';
        else out += m; // 非宏的词: 词字符均为安全字面量, 原样保留
        i += m.length; continue;
      }
      out += c; i++;
    }
    this.src = out; this.pos = 0;
    if (!src.trim()) return { t: 'eps' };
    var n = this.parseAlt();
    if (!this.eof()) this.error('存在无法解析的字符 "' + this.peek() + '"');
    return n;
  },
  parseAlt: function () {
    var xs = [this.parseConc()];
    while (!this.eof() && this.peek() === '|') { this.pos++; xs.push(this.parseConc()); }
    return xs.length === 1 ? xs[0] : { t: 'alt', xs: xs };
  },
  parseConc: function () {
    var xs = [];
    while (!this.eof() && this.peek() !== '|' && this.peek() !== ')') xs.push(this.parsePost());
    if (!xs.length) return { t: 'eps' };
    return xs.length === 1 ? xs[0] : { t: 'seq', xs: xs };
  },
  parsePost: function () {
    var x = this.parseAtom();
    while (!this.eof()) {
      var c = this.peek();
      if (c === '*') { this.pos++; x = { t: 'star', x: x }; }
      else if (c === '+') { this.pos++; x = { t: 'plus', x: x }; }
      else if (c === '?') { this.pos++; x = { t: 'opt', x: x }; }
      else break;
    }
    return x;
  },
  parseAtom: function () {
    if (this.eof()) return { t: 'eps' };
    var c = this.peek();
    if (c === '\x01') { // 宏引用(哨兵包裹)
      var j = this.src.indexOf('\x01', this.pos + 1);
      var name = this.src.slice(this.pos + 1, j);
      this.pos = j + 1;
      return this.macros[name];
    }
    if (c === '(') {
      this.pos++; var n = this.parseAlt();
      if (this.peek() !== ')') this.error('缺少右括号');
      this.pos++; return n;
    }
    if (c === '[') return this.parseClass();
    if (c === '\\') { this.pos++; if (this.eof()) this.error('转义符后缺少字符'); return { t: 'char', ch: this.src[this.pos++] }; }
    if (c === '.') { this.pos++; return { t: 'any' }; }
    if (c === 'ε' || c === 'ϵ') { this.pos++; return { t: 'eps' }; }
    if ('|*+?)'.indexOf(c) >= 0) this.error('意外的符号 "' + c + '"');
    // 单字符 或 宏名字(最长匹配)
    if (/[A-Za-z0-9_]/.test(c)) {
      var m = this.src.slice(this.pos).match(/^[A-Za-z0-9_]+/)[0];
      if (this.macros.hasOwnProperty(m)) { this.pos += m.length; return this.macros[m]; }
      // 否则按逐个字符字面量处理
      this.pos++; return { t: 'char', ch: c };
    }
    this.pos++; return { t: 'char', ch: c };
  },
  parseClass: function () {
    this.pos++; // [
    var set = setOf([]);
    if (this.peek() === '^') { this.pos++; /* 支持否定类: 限定在可见ASCII内取补 */ }
    var neg = false;
    var first = this.pos;
    while (!this.eof() && this.peek() !== ']') {
      if (this.peek() === '\\') { this.pos++; set.add(this.src[this.pos++]); continue; }
      if (this.pos + 2 < this.src.length && this.src[this.pos + 1] === '-' && this.src[this.pos + 2] !== ']') {
        var lo = this.src[this.pos], hi = this.src[this.pos + 2];
        if (lo.codePointAt(0) > hi.codePointAt(0)) this.error('字符区间 ' + lo + '-' + hi + ' 起点大于终点');
        for (var cp = lo.codePointAt(0); cp <= hi.codePointAt(0); cp++) set.add(String.fromCodePoint(cp));
        this.pos += 3; continue;
      }
      set.add(this.src[this.pos++]);
    }
    if (this.eof() || this.peek() !== ']') this.error('字符类缺少 ]');
    this.pos++;
    void first; void neg;
    if (!set.size) this.error('空字符类');
    return { t: 'cls', set: set, label: rangeLabel(set) };
  }
};

/* 解析正则表达式文件:
   "名称 = 正则" 定义单词类别(参与扫描, 顺序即优先级)
   "宏 名称 = 正则" 定义辅助宏(仅用于展开, 不作为单词类别, 类似 flex 声明区)
   支持 # 与 // 注释 */
function parseRegexFile(text) {
  var defs = [], macros = {}, seen = {};
  var lines = text.split(/\r\n|\r|\n/);
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    var line = raw.replace(/(^|\s)(#|\/\/).*$/, '').trim();
    if (!line) continue;
    var isMacro = /^宏\s+/.test(line) || /^macro\s+/.test(line);
    if (isMacro) line = line.replace(/^(宏|macro)\s+/, '');
    var m = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!m) throw new Error('第' + (i + 1) + '行格式错误(应为 "名称 = 正则表达式" 或 "宏 名称 = 正则表达式"): ' + raw);
    var name = m[1].trim(), expr = m[2].trim();
    if (!name) throw new Error('第' + (i + 1) + '行类别名为空');
    var p = new RegexParser(macros);
    var node;
    try { node = p.parse(expr); }
    catch (e) { throw new Error('类别 "' + name + '": ' + e.message); }
    if (seen[name]) throw new Error('类别 "' + name + '" 重复定义');
    seen[name] = true;
    macros[name] = node;
    if (!isMacro) defs.push({ name: name, expr: expr, node: node, line: i + 1 });
  }
  if (!defs.length) throw new Error('正则表达式文件为空(至少需要一个单词类别)');
  return defs;
}

/* ---------------- Thompson 构造: AST -> NFA ---------------- */
/* NFA: states: [{id, acceptLine: -1|行号(0基)}], edges: [{from,to,label}]
   label: null 表示 ε; {kind:'char',ch}; {kind:'cls',set,label}; {kind:'any'} */
function nfaFromRegex(node, acceptLine) {
  var st = { states: [], edges: [] };
  function newState(al) { var s = { id: st.states.length, acceptLine: al === undefined ? -1 : al }; st.states.push(s); return s.id; }
  function edge(from, to, label) { st.edges.push({ from: from, to: to, label: label || null }); }
  function build(n, al) {
    var s = newState(), e = newState(al);
    function rec(x, a, b) {
      switch (x.t) {
        case 'eps': edge(a, b, null); break;
        case 'char': edge(a, b, { kind: 'char', ch: x.ch }); break;
        case 'any': edge(a, b, { kind: 'any' }); break;
        case 'cls': edge(a, b, { kind: 'cls', set: x.set, label: x.label }); break;
        case 'seq': {
          var cur = a;
          for (var i = 0; i < x.xs.length; i++) {
            var nxt = (i === x.xs.length - 1) ? b : newState();
            rec(x.xs[i], cur, nxt); cur = nxt;
          }
          break;
        }
        case 'alt': {
          for (var i2 = 0; i2 < x.xs.length; i2++) { var s2 = newState(), e2 = newState(); edge(a, s2, null); edge(e2, b, null); rec(x.xs[i2], s2, e2); }
          break;
        }
        case 'star': {
          var i3 = newState(), o3 = newState();
          edge(a, i3, null); edge(o3, b, null); edge(a, b, null); edge(o3, i3, null);
          rec(x.x, i3, o3);
          break;
        }
        case 'plus': {
          var i4 = newState(), o4 = newState();
          edge(a, i4, null); edge(o4, b, null); edge(o4, i4, null);
          rec(x.x, i4, o4);
          break;
        }
        case 'opt': {
          var i5 = newState(), o5 = newState();
          edge(a, i5, null); edge(o5, b, null); edge(a, b, null);
          rec(x.x, i5, o5);
          break;
        }
      }
    }
    rec(n, s, e);
    return { start: s, end: e };
  }
  var frag = build(node, acceptLine);
  return { states: st.states, edges: st.edges, start: frag.start, end: frag.end };
}

/* 合并多条正则: 新开始状态 ε 指向各条; 各条接受态标行号(优先级) */
function combineNfas(defs) {
  var nfas = defs.map(function (d, i) { return nfaFromRegex(d.node, i); });
  var states = [{ id: 0, acceptLine: -1 }], edges = [], offset = 1;
  nfas.forEach(function (n, i) {
    edges.push({ from: 0, to: n.start + offset, label: null });
    n.states.forEach(function (s) { states.push({ id: s.id + offset, acceptLine: s.acceptLine >= 0 ? i : -1 }); });
    n.edges.forEach(function (e) { edges.push({ from: e.from + offset, to: e.to + offset, label: e.label }); });
    offset += n.states.length;
  });
  return { states: states, edges: edges, start: 0, parts: nfas };
}

/* ε 闭包 */
function epsClosure(nfa, ids) {
  var stack = Array.from(ids), seen = setOf(ids);
  while (stack.length) {
    var id = stack.pop();
    for (var i = 0; i < nfa.edges.length; i++) {
      var e = nfa.edges[i];
      if (e.from === id && !e.label && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
  }
  return seen;
}

function labelKey(l) {
  if (!l) return 'ε';
  if (l.kind === 'char') return l.ch;
  if (l.kind === 'any') return '.';
  return '[' + l.label + ']';
}
function labelMatches(l, ch) {
  if (l.kind === 'char') return l.ch === ch;
  if (l.kind === 'any') return ch !== '\n';
  return l.set.has(ch);
}

/* 子集构造法: NFA -> DFA (按具体字符转移, 字符类展开) */
function nfaToDfa(nfa) {
  var chars = setOf([]);
  nfa.edges.forEach(function (e) {
    if (!e.label) return;
    if (e.label.kind === 'char') chars.add(e.label.ch);
    else if (e.label.kind === 'cls') e.label.set.forEach(function (c) { chars.add(c); });
    else if (e.label.kind === 'any') { for (var cp = 32; cp < 127; cp++) chars.add(String.fromCharCode(cp)); }
  });
  var alphabet = Array.from(chars).sort();
  var dfaStates = [], trans = [];
  function dfaOf(idset) {
    var key = Array.from(idset).sort(function (a, b) { return a - b; }).join(',');
    if (keyToId[key] !== undefined) return keyToId[key];
    var id = dfaStates.length;
    keyToId[key] = id;
    var best = -1;
    idset.forEach(function (nid) { var al = nfa.states[nid].acceptLine; if (al >= 0 && (best < 0 || al < best)) best = al; });
    dfaStates.push({ id: id, nfaIds: idset, acceptLine: best, key: key });
    trans.push({});
    return id;
  }
  var keyToId = {};
  var startSet = epsClosure(nfa, setOf([nfa.start]));
  var startId = dfaOf(startSet);
  var worklist = [startId];
  var STATE_CAP = 5000;
  while (worklist.length) {
    var cur = worklist.shift();
    var curSet = dfaStates[cur].nfaIds;
    alphabet.forEach(function (c) {
      var moves = setOf([]);
      nfa.edges.forEach(function (e) {
        if (e.label && labelMatches(e.label, c) && curSet.has(e.from)) moves.add(e.to);
      });
      if (!moves.size) { trans[cur][c] = -1; return; }
      var cl = epsClosure(nfa, moves);
      var tgt = dfaOf(cl);
      trans[cur][c] = tgt;
      if (tgt === dfaStates.length - 1) {
        if (dfaStates.length > STATE_CAP) throw new Error('DFA 状态数超过上限 ' + STATE_CAP + ', 请检查正则表达式(不要单独使用 . 通配)');
        worklist.push(tgt);
      }
    });
  }
  return { states: dfaStates, trans: trans, alphabet: alphabet, start: startId };
}

/* DFA 最小化: 划分精化(保持接受类别) */
function minimizeDfa(dfa) {
  var n = dfa.states.length;
  var total = n + 1; // +1: 显式死状态(编号 n)
  var DEAD = n;
  var alpha = dfa.alphabet;
  function nxt(state, c) { var t = dfa.trans[state][c]; return t === undefined ? -1 : t; }
  var block = new Array(total);
  for (var i = 0; i < n; i++) block[i] = dfa.states[i].acceptLine < 0 ? 0 : 1 + dfa.states[i].acceptLine;
  block[DEAD] = 0; // 死状态与非接受态同类, 由转移签名区分
  var changed = true, guard = 0;
  while (changed && guard++ < 1000) {
    changed = false;
    var sig = new Array(total);
    for (var s = 0; s < total; s++) {
      var row = [];
      for (var ci = 0; ci < alpha.length; ci++) {
        var t = s === DEAD ? -1 : nxt(s, alpha[ci]);
        row.push(t < 0 ? block[DEAD] : block[t]);
      }
      sig[s] = block[s] + '|' + row.join(',');
    }
    var map = {}, newBlock = new Array(total), nb = 0;
    for (var s2 = 0; s2 < total; s2++) {
      if (map[sig[s2]] === undefined) map[sig[s2]] = nb++;
      newBlock[s2] = map[sig[s2]];
    }
    for (var s3 = 0; s3 < total; s3++) if (newBlock[s3] !== block[s3]) changed = true;
    block = newBlock;
  }
  // 生成最小化 DFA
  var nbStates = Math.max.apply(null, block) + 1;
  var reps = new Array(nbStates).fill(-1);
  for (var s4 = 0; s4 < total; s4++) if (reps[block[s4]] < 0) reps[block[s4]] = s4;
  var states = [], trans = [];
  for (var b = 0; b < nbStates; b++) {
    var rep = reps[b];
    var acc = -1, nfaIds = setOf([]);
    if (rep !== DEAD) {
      acc = dfa.states[rep].acceptLine;
      dfa.states[rep].nfaIds.forEach(function (x) { nfaIds.add(x); });
    }
    states.push({ id: b, acceptLine: acc, nfaIds: nfaIds, isDead: rep === DEAD, members: rep === DEAD ? [DEAD] : dfa.states.filter(function (ds, di) { return block[di] === b; }).map(function (ds) { return ds.id; }) });
  }
  var trans = [];
  for (var b0 = 0; b0 < nbStates; b0++) trans.push({});
  alpha.forEach(function (c) {
    for (var b2 = 0; b2 < nbStates; b2++) {
      var rep2 = reps[b2];
      var t = rep2 === DEAD ? -1 : nxt(rep2, c);
      trans[b2][c] = t < 0 ? block[DEAD] : block[t];
    }
  });
  var start = block[dfa.start];
  return { states: states, trans: trans, alphabet: alpha, start: start, deadBlock: block[DEAD] };
}

/* 压缩显示列: 按整列转移向量的等价性分组(如 a..z 一列) */
function compressDfaColumns(minDfa) {
  var alpha = minDfa.alphabet;
  var groups = [], charToGroup = {};
  alpha.forEach(function (c) {
    var col = minDfa.states.map(function (st) { var t = minDfa.trans[st.id][c]; return t === undefined ? -1 : t; }).join(',');
    var g = null;
    for (var i = 0; i < groups.length; i++) if (groups[i].col === col) { g = groups[i]; break; }
    if (!g) { g = { col: col, chars: [] }; groups.push(g); }
    g.chars.push(c);
    charToGroup[c] = groups.indexOf(g);
  });
  // 组的显示名: 尽量用区间表示
  groups.forEach(function (g, gi) {
    var chs = g.chars;
    if (chs.length === 1) { g.display = chs[0] === ' ' ? "' '" : chs[0]; return; }
    // 找连续区间
    var parts = [], i = 0, sorted = chs.slice().sort();
    while (i < sorted.length) {
      var j = i;
      while (j + 1 < sorted.length && sorted[j + 1].charCodeAt(0) === sorted[j].charCodeAt(0) + 1) j++;
      if (j - i >= 2) parts.push(sorted[i] + '..' + sorted[j]);
      else { parts.push(sorted[i]); if (j === i + 1) parts.push(sorted[j]); }
      i = j + 1;
    }
    g.display = parts.join('|');
  });
  return { groups: groups, charToGroup: charToGroup };
}

/* 用 DFA 对源文本做最大 munch 词法分析 */
function simulateLex(minDfa, text, cfg) {
  var tokens = [], errors = [];
  var pos = 0, line = 1, n = text.length;
  function ch(i) { return text[i]; }
  function move(state, c) {
    var t = minDfa.trans[state][c];
    return t === undefined ? -1 : t;
  }
  function push(cat, lex, ln) { tokens.push({ cat: cat, lexeme: lex, line: ln }); }
  while (pos < n) {
    var c = ch(pos);
    if (c === '\n') { line++; pos++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { pos++; continue; }
    // 块注释
    if (cfg.blockComment && text.startsWith(cfg.blockComment.start, pos)) {
      var endIdx = text.indexOf(cfg.blockComment.end, pos + cfg.blockComment.start.length);
      if (endIdx < 0) { errors.push({ line: line, msg: '块注释未闭合' }); pos = n; }
      else {
        for (var k = pos; k < endIdx + cfg.blockComment.end.length; k++) if (text[k] === '\n') line++;
        pos = endIdx + cfg.blockComment.end.length;
      }
      continue;
    }
    // 行注释
    if (cfg.lineComment && text.startsWith(cfg.lineComment, pos)) {
      var nl = text.indexOf('\n', pos);
      pos = nl < 0 ? n : nl;
      continue;
    }
    // 最大 munch
    var state = minDfa.start, lastAcc = -1, lastPos = -1;
    if (minDfa.states[state].acceptLine >= 0) { lastAcc = minDfa.states[state].acceptLine; lastPos = pos; }
    var p = pos;
    while (p < n) {
      var c2 = ch(p);
      if (c2 === '\n') break;
      var ns = move(state, c2);
      if (ns < 0) break;
      state = ns; p++;
      if (minDfa.states[state].acceptLine >= 0) { lastAcc = minDfa.states[state].acceptLine; lastPos = p; }
    }
    if (lastAcc >= 0) {
      push(cfg.defNames[lastAcc], text.slice(pos, lastPos), line);
      pos = lastPos;
    } else {
      errors.push({ line: line, msg: '无法识别的字符 "' + c + '"' });
      push('ERROR', c, line);
      pos++;
    }
  }
  return { tokens: tokens, errors: errors };
}

/* 生成 sample.lex 格式输出(与原作业格式一致: 代码行回显 + （类别，词素）) */
function makeLexFile(text, tokens) {
  var lines = text.split(/\r\n|\r|\n/);
  var out = [];
  var byLine = {};
  tokens.forEach(function (t) { (byLine[t.line] = byLine[t.line] || []).push(t); });
  lines.forEach(function (l, i) {
    out.push('代码行' + (i + 1) + ':' + l);
    (byLine[i + 1] || []).forEach(function (t) {
      out.push('\t（' + t.cat + '，' + t.lexeme + '）');
    });
  });
  return out.join('\n');
}

/* 生成 C 语言词法分析程序(内嵌最小化DFA转移表) */
function generateCCode(defs, minDfa, cfg, langName) {
  var N = minDfa.states.length;
  var asciiCols = 128;
  function moveCol(state, code) {
    if (code >= 128) return -1;
    var t = minDfa.trans[state][String.fromCharCode(code)];
    return t === undefined ? -1 : t;
  }
  var tableRows = [];
  for (var s = 0; s < N; s++) {
    var row = [];
    for (var c2 = 0; c2 < asciiCols; c2++) row.push(moveCol(s, c2) < 0 ? N : moveCol(s, c2));
    tableRows.push(row.join(','));
  }
  var acc = minDfa.states.map(function (st) { return st.acceptLine < 0 ? -1 : st.acceptLine; });
  var nameArr = cfg.defNames.map(function (nm) { return '"' + nm + '"'; });
  var kw = cfg.defNames.map(function (nm, i) { return '   ' + i + ' = ' + nm; }).join('\n');
  var blockStart = cfg.blockComment ? cfg.blockComment.start.charCodeAt(0) : -1;
  var blockEnd = cfg.blockComment ? cfg.blockComment.end.charCodeAt(0) : -1;
  var lineC = cfg.lineComment ? cfg.lineComment.charCodeAt(0) : -1;
  return '' +
'/* ============================================================\n' +
' * 文件名称: ' + langName + '_lexer.c\n' +
' * 标识符:   TINY_LEXER\n' +
' * 摘要:     由"编译原理课程项目-满分重制版"自动生成的' + langName + '词法分析程序。\n' +
' *           内嵌最小化 DFA 转移表, 采用最大匹配(最长匹配)算法,\n' +
' *           从源文件读入并输出每个单词的编码与词素。\n' +
' *           单词编码表:\n' + kw + '\n' +
' *           死状态(错误)编号: ' + N + '\n' +
' * 当前版本: 1.0\n' +
' * 完成日期: 2026-11-01\n' +
' * 版本历史: v1.0 由系统自动生成\n' +
' * 使用: gcc ' + langName + '_lexer.c -o lexer && ./lexer source.' + (langName === 'TINY' ? 'tny' : 'mxc') + '\n' +
' * ============================================================ */\n' +
'#include <stdio.h>\n' +
'#include <stdlib.h>\n' +
'#include <string.h>\n\n' +
'#define NSTATES ' + N + '      /* 最小化DFA状态数 */\n' +
'#define NCOLS   ' + asciiCols + '     /* ASCII字符列数 */\n' +
'#define DEAD    ' + N + '      /* 死状态(错误) */\n' +
'#define NBLOCK  ' + (cfg.defNames.length) + '    /* 单词类别数 */\n\n' +
'/* 转移表 NEXT[状态][字符]: -1 不存在(用DEAD表示), 其余为后继状态 */\n' +
'static const int NEXT[NSTATES][NCOLS] = {\n' +
tableRows.map(function (r) { return '{' + r + '}'; }).join(',\n') + '\n};\n\n' +
'/* 接受类别表: -1 非接受, 其余为类别编号 */\n' +
'static const int ACCEPT[NSTATES] = {' + acc.join(',') + '};\n\n' +
'/* 类别名称表(按定义顺序, 编号即优先级) */\n' +
'static const char *CATNAME[NBLOCK] = {' + nameArr.join(',') + '};\n\n' +
'/* 函数: main — 读入源文件, 逐词扫描并输出 (编号 类别名 词素)\n' +
' * 输入: argv[1] 为源程序文件路径; 输出: 每行一个单词\n' +
' * 注意: 支持块注释与行注释跳过, 无法识别字符报 ERROR */\n' +
'int main(int argc, char **argv) {\n' +
'    FILE *fp = (argc > 1) ? fopen(argv[1], "r") : stdin;\n' +
'    if (!fp) { fprintf(stderr, "无法打开文件 %s\\n", argv[1]); return 1; }\n' +
'    static char buf[1 << 22];\n' +
'    int len = 0, cch;\n' +
'    while ((cch = fgetc(fp)) != EOF) buf[len++] = (char)cch;\n' +
'    buf[len] = 0;\n' +
'    int pos = 0, state, start, lastAcc, lastPos;\n' +
'    while (pos < len) {\n' +
'        char c = buf[pos];\n' +
'        if (c == \' \' || c == \'\\t\' || c == \'\\r\' || c == \'\\n\') { pos++; continue; }\n' +
((blockStart >= 0) ?
'        if (c == \'' + cfg.blockComment.start + '\') { /* 块注释: 跳到配对结束符 */\n' +
'            char *e = strchr(buf + pos + 1, \'' + cfg.blockComment.end + '\');\n' +
'            if (!e) { printf("ERROR %c\\n", c); break; }\n' +
'            pos = (int)(e - buf) + 1; continue;\n' +
'        }\n' : '') +
((lineC >= 0) ?
'        if (c == \'' + cfg.lineComment + '\') { /* 行注释: 跳到行尾 */\n' +
'            while (pos < len && buf[pos] != \'\\n\') pos++;\n' +
'            continue;\n' +
'        }\n' : '') +
'        state = 0; start = pos; lastAcc = -1; lastPos = -1;\n' +
'        if (ACCEPT[state] >= 0) { lastAcc = ACCEPT[state]; lastPos = pos; }\n' +
'        while (pos < len) {\n' +
'            char cc = buf[pos];\n' +
'            if ((int)cc >= NCOLS) break;\n' +
'            int ns = NEXT[state][(int)cc];\n' +
'            if (ns == DEAD) break;\n' +
'            state = ns; pos++;\n' +
'            if (ACCEPT[state] >= 0) { lastAcc = ACCEPT[state]; lastPos = pos; }\n' +
'        }\n' +
'        if (lastAcc >= 0) {\n' +
'            printf("%d %s %.*s\\n", lastAcc, CATNAME[lastAcc], lastPos - start, buf + start);\n' +
'        } else {\n' +
'            printf("ERROR %c\\n", buf[start]);\n' +
'            pos = start + 1;\n' +
'        }\n' +
'    }\n' +
'    if (fp != stdin) fclose(fp);\n' +
'    return 0;\n' +
'}\n';
}

/* ============================================================
 * 第二部分  文法引擎 (LL(1))
 * 文法: {start, prods:[{lhs, rhs:[symbol], idx}], nts:Set, terms:Set}
 * 符号: 字符串; ε 记为 '' (空串) 或 'ε'/'empty' 统一化
 * ============================================================ */

var EPS = '';

function normalizeFullwidth(s) {
  var map = { '（': '(', '）': ')', '；': ';', '，': ',', '：': ':', '［': '[', '］': ']', '｛': '{', '｝': '}' };
  return s.replace(/[（）；，：［］｛｝]/g, function (c) { return map[c]; });
}

/* 解析 BNF 文法文本: 兼容 -> / → / ::= ; 行号前缀; 跨行 | 续行; ε/empty */
function parseGrammar(text) {
  var raw = normalizeFullwidth(text).split(/\r\n|\r|\n/);
  var ruleTexts = [];
  for (var i = 0; i < raw.length; i++) {
    var line = raw[i].trim();
    if (!line || /^\/\//.test(line) || /^#/.test(line)) continue;
    line = line.replace(/^\d+\s*[\.、\)]?\s*/, ''); // 去行号
    if (line[0] === '|' && ruleTexts.length) ruleTexts[ruleTexts.length - 1] += ' ' + line;
    else ruleTexts.push(line);
  }
  var prods = [], nts = setOf([]), order = [];
  ruleTexts.forEach(function (rt) {
    var m = rt.split(/→|->|::=|⇒/);
    if (m.length < 2) throw new Error('文法行缺少 -> 或 → : ' + rt);
    var lhsM = m[0].trim().match(/^<([^<>]+)>$/);
    var lhs = (lhsM ? lhsM[1] : m[0].trim());
    if (!lhs || /\s/.test(lhs)) throw new Error('文法行左部不合法: ' + rt);
    if (!nts.has(lhs)) { nts.add(lhs); order.push(lhs); }
    var rhsText = m.slice(1).join('→');
    rhsText.split('|').forEach(function (alt) {
      var syms = alt.trim().split(/\s+/).filter(Boolean).map(function (s) {
        // 仅剥离成对的非终结符尖括号: <stmt> -> stmt (不能动 < <= > >= 这些符号)
        var m = s.match(/^<([^<>]+)>$/);
        return m ? m[1] : s;
      });
      syms = syms.map(function (s) { return (s === 'ε' || s === 'ϵ' || s === 'empty' || s === 'EMPTY') ? EPS : s; });
      prods.push({ lhs: lhs, rhs: syms });
    });
  });
  if (!prods.length) throw new Error('未解析到任何产生式');
  var terms = setOf([]);
  prods.forEach(function (p) { p.rhs.forEach(function (s) { if (s !== EPS && !nts.has(s)) terms.add(s); }); });
  var idx = 0;
  prods.forEach(function (p) { p.idx = idx++; });
  return { start: order[0], prods: prods, nts: nts, terms: terms, order: order };
}

/* 文法化简: 删除不产生终结串的非终结符 + 不可达符号 */
function simplifyGrammar(g) {
  // 1. 可产生(能推出终结串)的符号
  var generating = setOf(Array.from(g.terms));
  var changed = true;
  while (changed) {
    changed = false;
    g.prods.forEach(function (p) {
      if (generating.has(p.lhs)) return;
      if (p.rhs.every(function (s) { return s === EPS || generating.has(s); })) { generating.add(p.lhs); changed = true; }
    });
  }
  var removedAlts = [], kept = [];
  g.prods.forEach(function (p) {
    if (p.rhs.every(function (s) { return s === EPS || generating.has(s); })) kept.push(p);
    else removedAlts.push(deepClone(p));
  });
  var nts2 = setOf([]), order2 = [];
  kept.forEach(function (p) { if (!nts2.has(p.lhs)) { nts2.add(p.lhs); order2.push(p.lhs); } });
  // 2. 可达符号
  var reach = setOf([g.start]);
  var ch2 = true;
  while (ch2) {
    ch2 = false;
    kept.forEach(function (p) {
      if (!reach.has(p.lhs)) return;
      p.rhs.forEach(function (s) { if (s !== EPS && nts2.has(s) && !reach.has(s)) { reach.add(s); ch2 = true; } });
    });
  }
  var removedNts = Array.from(nts2).filter(function (n) { return !reach.has(n); });
  var final = kept.filter(function (p) { return reach.has(p.lhs) && p.rhs.every(function (s) { return s === EPS || !nts2.has(s) || reach.has(s); }); });
  var terms2 = setOf([]);
  final.forEach(function (p) { p.rhs.forEach(function (s) { if (s !== EPS && !nts2.has(s)) terms2.add(s); }); });
  var idx = 0;
  final.forEach(function (p) { p.idx = idx++; });
  return {
    result: { start: g.start, prods: final, nts: setOf(Array.from(reach)), terms: terms2, order: order2.filter(function (n) { return reach.has(n); }) },
    removedNts: removedNts, removedAlts: removedAlts
  };
}

/* FIRST/FOLLOW 计算 */
function computeFirst(g) {
  var first = {};
  Array.from(g.nts).forEach(function (n) { first[n] = setOf([]); });
  Array.from(g.terms).forEach(function (t) { first[t] = setOf([t]); });
  var changed = true;
  while (changed) {
    changed = false;
    g.prods.forEach(function (p) {
      // FIRST(α) = 并首符号FIRST; 若全可空则加 ε
      var fs = firstOfSeq(g, p.rhs, first);
      fs.forEach(function (x) { if (!first[p.lhs].has(x)) { first[p.lhs].add(x); changed = true; } });
    });
  }
  return first;
}
function firstOfSeq(g, seq, first) {
  var out = setOf([]);
  for (var i = 0; i < seq.length; i++) {
    var s = seq[i];
    if (s === EPS) continue;
    var fs = first[s] || setOf([s]);
    fs.forEach(function (x) { if (x !== EPS) out.add(x); });
    if (!fs.has(EPS)) return out;
  }
  out.add(EPS);
  return out;
}
function computeFollow(g, first) {
  var follow = {};
  Array.from(g.nts).forEach(function (n) { follow[n] = setOf([]); });
  follow[g.start].add('$');
  var changed = true;
  while (changed) {
    changed = false;
    g.prods.forEach(function (p) {
      for (var i = 0; i < p.rhs.length; i++) {
        var B = p.rhs[i];
        if (B === EPS || !g.nts.has(B)) continue;
        var trailer = firstOfSeq(g, p.rhs.slice(i + 1), first);
        var ch = false;
        trailer.forEach(function (x) {
          if (x === EPS) return;
          if (!follow[B].has(x)) { follow[B].add(x); ch = true; }
        });
        if (trailer.has(EPS)) {
          follow[p.lhs].forEach(function (x) { if (!follow[B].has(x)) { follow[B].add(x); ch = true; } });
        }
        if (ch) changed = true;
      }
    });
  }
  return follow;
}

/* 消除左递归(含间接): 标准算法 */
function eliminateLeftRecursion(g) {
  var nts = g.order.slice();
  var prods = {}; // lhs -> [rhs...]
  nts.forEach(function (n) { prods[n] = []; });
  g.prods.forEach(function (p) { prods[p.lhs].push(p.rhs.slice()); });
  var freshBase = {};
  function freshName(base) {
    var nm = base + "'", i = 2;
    while (prods[nm] || nts.indexOf(nm) >= 0) nm = base + "'" + (i++);
    freshBase[nm] = base;
    return nm;
  }
  for (var i = 0; i < nts.length; i++) {
    var Ai = nts[i];
    for (var j = 0; j < i; j++) {
      var Aj = nts[j];
      var out = [];
      prods[Ai].forEach(function (alt) {
        if (alt.length && alt[0] === Aj) {
          prods[Aj].forEach(function (ajAlt) { out.push(ajAlt.concat(alt.slice(1))); });
        } else out.push(alt);
      });
      prods[Ai] = out;
    }
    // 立即左递归
    var rec = prods[Ai].filter(function (a) { return a.length && a[0] === Ai; });
    if (rec.length) {
      var nonrec = prods[Ai].filter(function (a) { return !(a.length && a[0] === Ai); });
      var nm = freshName(Ai);
      var newAlts = nonrec.map(function (b) { return b.concat(nm); });
      if (!nonrec.length) newAlts = [[nm]];
      prods[Ai] = newAlts;
      prods[nm] = rec.map(function (a) { return a.slice(1).concat(nm); });
      prods[nm].push([EPS]);
      nts.splice(i + 1, 0, nm);
    }
  }
  var newProds = [];
  nts.forEach(function (n) { prods[n].forEach(function (r) { newProds.push({ lhs: n, rhs: r }); }); });
  var ntsSet = setOf(nts), terms2 = setOf([]);
  newProds.forEach(function (p) { p.rhs.forEach(function (s) { if (s !== EPS && !ntsSet.has(s)) terms2.add(s); }); });
  var idx = 0;
  newProds.forEach(function (p) { p.idx = idx++; });
  return { start: g.start, prods: newProds, nts: ntsSet, terms: terms2, order: nts };
}

/* 消除左公因子(含替换展开, 迭代到不动点) */
function leftFactorPass(g) {
  var prods = {}; g.order.forEach(function (n) { prods[n] = []; });
  g.prods.forEach(function (p) { prods[p.lhs].push(p.rhs.slice()); });
  var order = g.order.slice();
  var changed = false, guard = 0;
  function freshName(base) {
    var nm = base + "'", i = 2;
    while (prods[nm] || order.indexOf(nm) >= 0) nm = base + "'" + (i++);
    order.push(nm); prods[nm] = [];
    return nm;
  }
  function firstSets() {
    var gg = rebuild();
    return computeFirst(gg);
  }
  function rebuild() {
    var newProds = [];
    order.forEach(function (n) { (prods[n] || []).forEach(function (r) { newProds.push({ lhs: n, rhs: r }); }); });
    var ntsSet = setOf(order), terms2 = setOf([]);
    newProds.forEach(function (p) { p.rhs.forEach(function (s) { if (s !== EPS && !ntsSet.has(s)) terms2.add(s); }); });
    return { start: g.start, prods: newProds, nts: ntsSet, terms: terms2, order: order };
  }
  for (var oi = 0; oi < order.length; oi++) {
    var A = order[oi];
    var inner = 0;
    while (inner++ < 60) {
      var alts = prods[A];
      if (!alts || alts.length < 2) break;
      // 1) 首符号相同的组 -> 提取最长公共前缀
      var groups = {};
      alts.forEach(function (a) { var k = a.length ? a[0] : EPS; (groups[k] = groups[k] || []).push(a); });
      var factored = false;
      for (var k in groups) {
        var grp = groups[k];
        if (grp.length < 2 || k === EPS) continue;
        var lcp = [];
        outer: for (var d = 0; d < grp[0].length; d++) {
          var sym = grp[0][d];
          for (var gi = 1; gi < grp.length; gi++) if (grp[gi][d] !== sym) break outer;
          lcp.push(sym);
        }
        var nm = freshName(A);
        var suffixes = grp.map(function (a) { return a.slice(lcp.length); });
        var newAlts = alts.filter(function (a) { return grp.indexOf(a) < 0; });
        newAlts.push(lcp.concat(nm));
        prods[A] = newAlts;
        var sa = [];
        suffixes.forEach(function (sf) {
          var r = sf.length ? sf : [EPS];
          if (!sa.some(function (x) { return x.join(' ') === r.join(' '); })) sa.push(r);
        });
        prods[nm] = sa;
        changed = true; factored = true;
        break;
      }
      if (factored) continue;
      // 2) 首符号不同但 FIRST 相交 -> 替换展开较小的非终结符
      var first = firstSets();
      var done = false;
      for (var i = 0; i < alts.length && !done; i++) {
        for (var j2 = i + 1; j2 < alts.length && !done; j2++) {
          var a1 = alts[i], a2 = alts[j2];
          if (!a1.length || !a2.length) continue;
          var X = a1[0], Y = a2[0];
          if (X === Y) continue;
          var f1 = X === EPS ? setOf([EPS]) : (g.nts.has(X) ? (first[X] || setOf([X])) : setOf([X]));
          var f2 = Y === EPS ? setOf([EPS]) : (g.nts.has(Y) ? (first[Y] || setOf([Y])) : setOf([Y]));
          var inter = Array.from(f1).filter(function (x) { return x !== EPS && f2.has(x); });
          if (!inter.length) continue;
          // 选可替换的: 首符号是非终结符且不是自身, 替换产生式数较少者
          var cands = [];
          if (g.nts.has(X) && X !== A) cands.push({ alt: i, nt: X, n: prods[X].length });
          if (g.nts.has(Y) && Y !== A) cands.push({ alt: j2, nt: Y, n: prods[Y].length });
          if (!cands.length) continue;
          cands.sort(function (a, b) { return a.n - b.n; });
          var pick = cands[0];
          var replaced = alts[pick.alt].slice(1);
          var expanded = prods[pick.nt].map(function (r) { return r.concat(replaced); });
          alts = alts.slice(0, pick.alt).concat(alts.slice(pick.alt + 1)).concat(expanded);
          prods[A] = alts;
          changed = true; done = true;
        }
      }
      if (!done) break;
    }
  }
  if (!changed) return { g: g, changed: false };
  var gg = rebuild();
  return { g: gg, changed: true };
}

/* 完整变换: 消左递归 + 提左公因子迭代到不动点 */
function transformGrammar(g) {
  var cur = eliminateLeftRecursion(g);
  var iters = 0;
  for (; iters < 40; iters++) {
    var r = leftFactorPass(cur);
    if (!r.changed) break;
    cur = eliminateLeftRecursion(r.g);
  }
  // 清理不可达(变换残渣)
  var simp = simplifyGrammar(cur);
  return { g: simp.result, iterations: iters + 1 };
}

/* LL(1) 分析表: FIRST 放置优先于 FOLLOW(ε) 放置; 记录冲突及消解方式 */
function buildLL1Table(g) {
  var first = computeFirst(g);
  var follow = computeFollow(g, first);
  var terms = Array.from(g.terms).concat(['$']);
  var M = {}; // nt -> term -> prodIdx
  Array.from(g.nts).forEach(function (n) { M[n] = {}; });
  var conflicts = [];
  g.prods.forEach(function (p) {
    var fs = firstOfSeq(g, p.rhs, first);
    fs.forEach(function (t) {
      if (t === EPS) return;
      if (M[p.lhs][t] !== undefined) {
        conflicts.push({ nt: p.lhs, term: t, prods: [M[p.lhs][t], p.idx], kind: 'FIRST/FIRST 冲突', resolution: '保留先到产生式' });
        return;
      }
      M[p.lhs][t] = p.idx;
    });
  });
  g.prods.forEach(function (p) {
    var fs = firstOfSeq(g, p.rhs, first);
    if (!fs.has(EPS)) return;
    follow[p.lhs].forEach(function (t) {
      if (M[p.lhs][t] === undefined) { M[p.lhs][t] = p.idx; return; }
      // ε 放置遇已占: FIRST 优先 — 悬空 else 就近匹配等
      conflicts.push({ nt: p.lhs, term: t, prods: [M[p.lhs][t], p.idx], kind: 'FIRST/FOLLOW 冲突', resolution: '保留 FIRST 放置(如悬空 else 取就近匹配)' });
    });
  });
  return { table: M, terms: terms, first: first, follow: follow, conflicts: conflicts };
}

/* LL(1) 分析: 返回轨迹 + 分析树; tokens 为文法终结符序列 */
function parseLL1(g, tbl, tokens) {
  var steps = [];
  function makeNode(sym, isTerm, lexeme) { return { sym: sym, isTerm: !!isTerm, lexeme: lexeme || null, children: [] }; }
  var input = tokens.concat(['$']);
  var stack = ['$'];
  var root = makeNode(g.start, false);
  var nodeStack = [root]; // 与符号栈平行(栈顶对齐)
  var ip = 0, sp = 1, stepNo = 1, ok = true, errMsg = null;
  stack.push(g.start);
  function stackStr() { return stack.slice().reverse().join(' '); }
  function inputStr() { var rest = input.slice(ip); return rest.length > 14 ? rest.slice(0, 14).join(' ') + ' …' : rest.join(' '); }
  steps.push({ step: 0, stack: stackStr(), input: inputStr(), action: '初始化' });
  while (ok) {
    if (sp === 0) { break; }
    var X = stack[sp], a = input[ip];
    if (X === '$') {
      if (a === '$') { steps.push({ step: stepNo, stack: stackStr(), input: inputStr(), action: '接受 ✓' }); }
      else { ok = false; errMsg = '期望输入结束, 但遇到 "' + a + '"'; steps.push({ step: stepNo, stack: stackStr(), input: inputStr(), action: '报错: ' + errMsg }); }
      break;
    }
    if (g.terms.has(X)) {
      if (X === a) {
        stack.pop(); sp--; ip++;
        var leaf = nodeStack.pop();
        leaf.lexeme = a;
        steps.push({ step: stepNo, stack: stackStr(), input: inputStr(), action: '匹配 "' + X + '" ✓' });
      } else {
        ok = false; errMsg = '期望 "' + X + '", 实际为 "' + a + '"';
        steps.push({ step: stepNo, stack: stackStr(), input: inputStr(), action: '报错: ' + errMsg });
      }
      stepNo++;
      continue;
    }
    if (g.nts.has(X)) {
      var pi = tbl.table[X][a];
      if (pi === undefined) {
        ok = false; errMsg = 'M[' + X + ', ' + a + '] 为空: 不合语法';
        steps.push({ step: stepNo, stack: stackStr(), input: inputStr(), action: '报错: ' + errMsg });
        break;
      }
      var prod = g.prods[pi];
      stack.pop(); sp--;
      var node = nodeStack.pop();
      var rhs = prod.rhs.length ? prod.rhs : [EPS];
      rhs.forEach(function (s) {
        var cn = makeNode(s, s === EPS || g.terms.has(s));
        if (s === EPS) cn.sym = 'ε';
        node.children.push(cn);
      });
      // 逆序压栈
      for (var i = rhs.length - 1; i >= 0; i--) {
        if (rhs[i] === EPS) continue;
        stack.push(rhs[i]); sp++;
        nodeStack.push(node.children[node.children.length - 1]);
      }
      steps.push({ step: stepNo, stack: stackStr(), input: inputStr(), action: '展开 ' + X + ' → ' + (prod.rhs.length ? prod.rhs.join(' ') : 'ε') });
      stepNo++;
      continue;
    }
    ok = false; errMsg = '栈中出现未知符号 ' + X;
    break;
  }
  return { steps: steps, tree: root, ok: ok, error: errMsg };
}

/* ============================================================
 * 第三部分  语义: 递归下降构建 AST + 四元式(选做内容)
 * ============================================================ */

/* ---- TINY ---- */
function buildTinyAst(tk) {
  var pos = 0;
  function peek() { return tk[pos]; }
  function eat() { return tk[pos++]; }
  function isKw(t, w) { return t && t.cat === '关键词' && t.lexeme === w; }
  function isSym(t, w) { return t && t.cat === '专用符号' && t.lexeme === w; }
  function isCat(t, c) { return t && t.cat === c; }
  function expect(fn, what) {
    var t = peek();
    if (!fn(t)) throw new Error('语法错误(第' + (t ? t.line : '?') + '行): 期望 ' + what + ', 实际 "' + (t ? t.lexeme : 'EOF') + '"');
    return eat();
  }
  function stmtSeq() {
    var stmts = [statement()];
    while (isSym(peek(), ';')) { eat(); stmts.push(statement()); }
    return stmts;
  }
  function statement() {
    var t = peek();
    if (isKw(t, 'if')) return ifStmt();
    if (isKw(t, 'repeat')) return repeatStmt();
    if (isKw(t, 'read')) return readStmt();
    if (isKw(t, 'write')) return writeStmt();
    if (isCat(t, 'identifier')) return assignStmt();
    throw new Error('语法错误(第' + (t ? t.line : '?') + '行): 非法的语句开始 "' + (t ? t.lexeme : 'EOF') + '"');
  }
  function ifStmt() {
    var ln = eat().line;
    var cond = exp();
    expect(function (t) { return isKw(t, 'then'); }, 'then');
    var thenS = stmtSeq(), elseS = null;
    if (isKw(peek(), 'else')) { eat(); elseS = stmtSeq(); }
    expect(function (t) { return isKw(t, 'end'); }, 'end');
    return { kind: 'if', line: ln, cond: cond, then: thenS, els: elseS };
  }
  function repeatStmt() {
    var ln = eat().line;
    var body = stmtSeq();
    expect(function (t) { return isKw(t, 'until'); }, 'until');
    var cond = exp();
    return { kind: 'repeat', line: ln, body: body, cond: cond };
  }
  function assignStmt() {
    var id = eat();
    expect(function (t) { return isSym(t, ':='); }, ':=');
    return { kind: 'assign', line: id.line, name: id.lexeme, exp: exp() };
  }
  function readStmt() { var ln = eat().line; return { kind: 'read', line: ln, name: expect(function (t) { return isCat(t, 'identifier'); }, '标识符').lexeme }; }
  function writeStmt() { var ln = eat().line; return { kind: 'write', line: ln, exp: exp() }; }
  function exp() {
    var l = simpleExp();
    var t = peek();
    if (isSym(t, '<') || isSym(t, '=')) { eat(); return { kind: 'relop', op: t.lexeme, l: l, r: simpleExp(), line: t.line }; }
    return l;
  }
  function simpleExp() {
    var l = term();
    while (isSym(peek(), '+') || isSym(peek(), '-')) { var op = eat().lexeme; l = { kind: 'arith', op: op, l: l, r: term() }; }
    return l;
  }
  function term() {
    var l = factor();
    while (isSym(peek(), '*') || isSym(peek(), '/')) { var op = eat().lexeme; l = { kind: 'arith', op: op, l: l, r: factor() }; }
    return l;
  }
  function factor() {
    var t = peek();
    if (isSym(t, '(')) { eat(); var e = exp(); expect(function (x) { return isSym(x, ')'); }, ')'); return e; }
    if (isCat(t, 'number')) { eat(); return { kind: 'num', val: t.lexeme }; }
    if (isCat(t, 'identifier')) { eat(); return { kind: 'var', name: t.lexeme }; }
    throw new Error('语法错误(第' + (t ? t.line : '?') + '行): 非法的表达式 "' + (t ? t.lexeme : 'EOF') + '"');
  }
  var seq = stmtSeq();
  if (pos < tk.length) throw new Error('第' + tk[pos].line + '行附近有多余输入: "' + tk[pos].lexeme + '"');
  return seq;
}

/* ---- Mini-C ---- */
function buildMiniCAst(tk) {
  var pos = 0;
  function peek(o) { return tk[pos + (o || 0)]; }
  function eat() { return tk[pos++]; }
  function isKw(t, w) { return t && t.cat === '关键词' && t.lexeme === w; }
  function isSym(t, w) { return t && t.cat === '专用符号' && t.lexeme === w; }
  function isCat(t, c) { return t && t.cat === c; }
  function isType(t) { return isKw(t, 'int') || isKw(t, 'float') || isKw(t, 'void'); }
  function expect(fn, what) {
    var t = peek();
    if (!fn(t)) throw new Error('语法错误(第' + (t ? t.line : '?') + '行): 期望 ' + what + ', 实际 "' + (t ? t.lexeme : 'EOF') + '"');
    return eat();
  }
  function program() {
    var defs = [];
    while (pos < tk.length) defs.push(definition());
    if (!defs.length) throw new Error('空程序: 至少需要一个定义');
    return defs;
  }
  function definition() {
    var ty = eat(); // type-indicator
    var id = expect(function (t) { return isCat(t, 'ID'); }, '标识符');
    if (isSym(peek(), '(')) { eat(); var ps = params(); expect(function (t) { return isSym(t, ')'); }, ')'); return { kind: 'func', line: id.line, type: ty.lexeme, name: id.lexeme, params: ps, body: compound() }; }
    // 变量定义
    if (isSym(peek(), '[')) { eat(); var num = expect(function (t) { return isCat(t, 'NUM'); }, 'NUM'); expect(function (t) { return isSym(t, ']'); }, ']'); expect(function (t) { return isSym(t, ';'); }, ';'); return { kind: 'vardef', line: id.line, type: ty.lexeme, name: id.lexeme, array: num.lexeme }; }
    expect(function (t) { return isSym(t, ';'); }, ';');
    return { kind: 'vardef', line: id.line, type: ty.lexeme, name: id.lexeme, array: null };
  }
  function params() {
    if (isSym(peek(), ')')) return [];
    if (isKw(peek(), 'void') && isSym(peek(1), ')')) { eat(); return []; }
    var list = [param()];
    while (isSym(peek(), ',')) { eat(); list.push(param()); }
    return list;
  }
  function param() {
    var ty = eat();
    var id = expect(function (t) { return isCat(t, 'ID'); }, '标识符');
    var arr = false;
    if (isSym(peek(), '[')) { eat(); expect(function (t) { return isSym(t, ']'); }, ']'); arr = true; }
    return { type: ty.lexeme, name: id.lexeme, array: arr };
  }
  function compound() {
    expect(function (t) { return isSym(t, '{'); }, '{');
    var defs = [], stmts = [];
    while (isType(peek())) defs.push(definition());
    while (!isSym(peek(), '}')) { if (pos >= tk.length) throw new Error('缺少 }'); stmts.push(statement()); }
    eat();
    return { defs: defs, stmts: stmts };
  }
  function statement() {
    var t = peek();
    if (isSym(t, '{')) return { kind: 'compound', body: compound() };
    if (isKw(t, 'if')) return condStmt();
    if (isKw(t, 'do')) return dowhileStmt();
    if (isKw(t, 'return')) return returnStmt();
    return exprStmt();
  }
  function condStmt() {
    var ln = eat().line;
    expect(function (t) { return isSym(t, '('); }, '(');
    var e = expression();
    expect(function (t) { return isSym(t, ')'); }, ')');
    var s1 = statement(), s2 = null;
    if (isKw(peek(), 'else')) { eat(); s2 = statement(); }
    return { kind: 'if', line: ln, cond: e, then: s1, els: s2 };
  }
  function dowhileStmt() {
    var ln = eat().line;
    var body = statement();
    expect(function (t) { return isKw(t, 'while'); }, 'while');
    expect(function (t) { return isSym(t, '('); }, '(');
    var e = expression();
    expect(function (t) { return isSym(t, ')'); }, ')');
    expect(function (t) { return isSym(t, ';'); }, ';');
    return { kind: 'dowhile', line: ln, body: body, cond: e };
  }
  function returnStmt() {
    var ln = eat().line;
    if (isSym(peek(), ';')) { eat(); return { kind: 'return', line: ln, exp: null }; }
    var e = expression();
    expect(function (t) { return isSym(t, ';'); }, ';');
    return { kind: 'return', line: ln, exp: e };
  }
  function exprStmt() {
    var t = peek();
    if (isSym(t, ';')) { eat(); return { kind: 'exprstmt', exp: null, line: t.line }; }
    var e = expression();
    expect(function (t2) { return isSym(t2, ';'); }, ';');
    return { kind: 'exprstmt', exp: e, line: t ? t.line : 0 };
  }
  function expression() {
    var t = peek();
    if (isCat(t, 'ID')) {
      var save = pos;
      var v = tryVariable();
      if (v && isSym(peek(), '=')) { eat(); return { kind: 'assign', line: t.line, target: v, exp: expression() }; }
      pos = save;
    }
    return simpleExp();
  }
  function tryVariable() {
    var id = eat();
    if (isSym(peek(), '[')) { eat(); var e = expression(); expect(function (t) { return isSym(t, ']'); }, ']'); return { kind: 'var', name: id.lexeme, index: e, line: id.line }; }
    return { kind: 'var', name: id.lexeme, index: null, line: id.line };
  }
  function simpleExp() {
    var l = additive();
    var t = peek();
    if (t && t.cat === '专用符号' && ['<', '<=', '>', '>=', '==', '!='].indexOf(t.lexeme) >= 0) { eat(); return { kind: 'relop', op: t.lexeme, l: l, r: additive(), line: t.line }; }
    return l;
  }
  function additive() {
    var l = term();
    while (isSym(peek(), '+') || isSym(peek(), '-')) { var op = eat().lexeme; l = { kind: 'arith', op: op, l: l, r: term() }; }
    return l;
  }
  function term() {
    var l = factor();
    while (isSym(peek(), '*') || isSym(peek(), '/') || isSym(peek(), '%')) { var op = eat().lexeme; l = { kind: 'arith', op: op, l: l, r: factor() }; }
    return l;
  }
  function factor() {
    var t = peek();
    if (isSym(t, '(')) { eat(); var e = expression(); expect(function (x) { return isSym(x, ')'); }, ')'); return e; }
    if (isCat(t, 'NUM')) { eat(); return { kind: 'num', val: t.lexeme }; }
    if (isCat(t, 'ID')) {
      eat();
      if (isSym(peek(), '(')) {
        eat();
        var args = [];
        if (!isSym(peek(), ')')) { args.push(expression()); while (isSym(peek(), ',')) { eat(); args.push(expression()); } }
        expect(function (x) { return isSym(x, ')'); }, ')');
        return { kind: 'call', name: t.lexeme, args: args, line: t.line };
      }
      if (isSym(peek(), '[')) { eat(); var ie = expression(); expect(function (x) { return isSym(x, ']'); }, ']'); return { kind: 'var', name: t.lexeme, index: ie }; }
      return { kind: 'var', name: t.lexeme, index: null };
    }
    throw new Error('语法错误(第' + (t ? t.line : '?') + '行): 非法的表达式 "' + (t ? t.lexeme : 'EOF') + '"');
  }
  return program();
}

/* ---- 四元式生成 ---- */
function generateQuadsTiny(program) {
  var quads = [], tempC = 0, labelC = 0;
  function temp() { return 't' + (tempC++); }
  function label() { return 'L' + (labelC++); }
  function emit(op, a1, a2, r) { quads.push({ op: op, a1: a1, a2: a2, r: r }); }
  function genExp(e) {
    switch (e.kind) {
      case 'num': return e.val;
      case 'var': return e.name;
      case 'arith': { var l = genExp(e.l), r = genExp(e.r), t = temp(); emit(e.op, l, r, t); return t; }
      case 'relop': { var l2 = genExp(e.l), r2 = genExp(e.r), t2 = temp(); emit(e.op, l2, r2, t2); return t2; }
    }
    return '?';
  }
  function genSeq(seq) { seq.forEach(function (s) { genStmt(s); }); }
  function genStmt(s) {
    switch (s.kind) {
      case 'assign': { var v = genExp(s.exp); emit(':=', v, '-', s.name); break; }
      case 'read': emit('read', '-', '-', s.name); break;
      case 'write': { var w = genExp(s.exp); emit('write', w, '-', '-'); break; }
      case 'if': {
        var c = genExp(s.cond);
        if (s.els) {
          var Lelse = label(), Lend = label();
          emit('jfalse', c, '-', Lelse);
          genSeq(s.then);
          emit('goto', '-', '-', Lend);
          emit('label', Lelse, '-', '-');
          genSeq(s.els);
          emit('label', Lend, '-', '-');
        } else {
          var Lend2 = label();
          emit('jfalse', c, '-', Lend2);
          genSeq(s.then);
          emit('label', Lend2, '-', '-');
        }
        break;
      }
      case 'repeat': {
        var Lbody = label(), Lend3 = label();
        emit('label', Lbody, '-', '-');
        genSeq(s.body);
        var c3 = genExp(s.cond);
        emit('jfalse', c3, '-', Lbody);
        emit('label', Lend3, '-', '-');
        break;
      }
    }
  }
  genSeq(program);
  return quads;
}

function generateQuadsMiniC(defs) {
  var quads = [], tempC = 0, labelC = 0;
  function temp() { return 't' + (tempC++); }
  function label() { return 'L' + (labelC++); }
  function emit(op, a1, a2, r) { quads.push({ op: op, a1: a1, a2: a2, r: r }); }
  function genExp(e) {
    switch (e.kind) {
      case 'num': return e.val;
      case 'var':
        if (e.index) { var ix = genExp(e.index), t0 = temp(); emit('=[]', e.name, ix, t0); return t0; }
        return e.name;
      case 'arith': { var l = genExp(e.l), r = genExp(e.r), t = temp(); emit(e.op, l, r, t); return t; }
      case 'relop': { var l2 = genExp(e.l), r2 = genExp(e.r), t2 = temp(); emit(e.op, l2, r2, t2); return t2; }
      case 'assign': { var v = genExp(e.exp); assignTo(e.target, v); return v; }
      case 'call': return genCall(e);
    }
    return '?';
  }
  function assignTo(target, val) {
    if (target.index) { var ix = genExp(target.index); emit('[]=', target.name, ix, val); }
    else emit(':=', val, '-', target.name);
  }
  function genCall(e) {
    e.args.forEach(function (a) { emit('param', genExp(a), '-', '-'); });
    var t = temp();
    emit('call', e.name, String(e.args.length), t);
    return t;
  }
  function genStmt(s) {
    switch (s.kind) {
      case 'compound': s.body.stmts.forEach(genStmt); break;
      case 'exprstmt': if (s.exp) genExp(s.exp); break;
      case 'assign': { var v = genExp(s.exp); assignTo(s.target, v); break; }
      case 'if': {
        var c = genExp(s.cond);
        if (s.els) {
          var Lelse = label(), Lend = label();
          emit('jfalse', c, '-', Lelse);
          genStmt(s.then);
          emit('goto', '-', '-', Lend);
          emit('label', Lelse, '-', '-');
          genStmt(s.els);
          emit('label', Lend, '-', '-');
        } else {
          var Lend2 = label();
          emit('jfalse', c, '-', Lend2);
          genStmt(s.then);
          emit('label', Lend2, '-', '-');
        }
        break;
      }
      case 'dowhile': {
        var Lbody = label();
        emit('label', Lbody, '-', '-');
        genStmt(s.body);
        var c3 = genExp(s.cond);
        emit('jtrue', c3, '-', Lbody);
        break;
      }
      case 'return': {
        if (s.exp) { var rv = genExp(s.exp); emit('ret', rv, '-', '-'); }
        else emit('ret', '-', '-', '-');
        break;
      }
    }
  }
  defs.forEach(function (d) {
    if (d.kind === 'func') {
      emit('func', d.name, '-', '-');
      d.body.stmts.forEach(genStmt);
    }
    // 全局变量定义不产生四元式
  });
  return quads;
}

/* ---------------- 导出 ---------------- */
global.CompilerCore = {
  parseRegexFile: parseRegexFile,
  nfaFromRegex: nfaFromRegex,
  combineNfas: combineNfas,
  nfaToDfa: nfaToDfa,
  minimizeDfa: minimizeDfa,
  simulateLex: simulateLex,
  makeLexFile: makeLexFile,
  generateCCode: generateCCode,
  compressDfaColumns: compressDfaColumns,
  labelKey: labelKey,
  parseGrammar: parseGrammar,
  simplifyGrammar: simplifyGrammar,
  eliminateLeftRecursion: eliminateLeftRecursion,
  transformGrammar: transformGrammar,
  computeFirst: computeFirst,
  computeFollow: computeFollow,
  buildLL1Table: buildLL1Table,
  parseLL1: parseLL1,
  buildTinyAst: buildTinyAst,
  buildMiniCAst: buildMiniCAst,
  generateQuadsTiny: generateQuadsTiny,
  generateQuadsMiniC: generateQuadsMiniC,
  EPS: EPS
};

})(typeof window !== 'undefined' ? window : globalThis);
