/*
 * test.mjs — 全链路自动化测试 (node)
 * 覆盖: 项目一(TINY词法) / 项目二(TINY语法) / 项目三(Mini-C全流程) / 选做(四元式)
 */
import './core.js';
import './presets.js';
import fs from 'fs';

const core = globalThis.CompilerCore;
const P = globalThis.Presets;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '\n    ' + String(detail).split('\n').join('\n    ') : '')); }
}

function buildLexer(lang) {
  const cfg = P.LANGS[lang];
  const defs = core.parseRegexFile(cfg.regexText);
  const nfas = core.combineNfas(defs);
  const dfa = core.nfaToDfa(nfas);
  const min = core.minimizeDfa(dfa);
  const simCfg = { defNames: defs.map(d => d.name), ...cfg.commentCfg };
  return { defs, nfas, dfa, min, simCfg, cfg };
}

console.log('========== 项目一: TINY 词法分析器生成器 ==========');
{
  const L = buildLexer('tiny');
  check('正则文件解析: 4 个单词类别(宏不参与)', L.defs.length === 4, L.defs.map(d => d.name).join(','));
  check('合并 NFA 状态数 > 0', L.nfas.states.length > 0, L.nfas.states.length);
  check('DFA 状态数 > 0', L.dfa.states.length > 0, L.dfa.states.length);
  check('最小化 DFA 状态数 <= DFA 状态数', L.min.states.length <= L.dfa.states.length, `${L.dfa.states.length} -> ${L.min.states.length}`);

  const r = core.simulateLex(L.min, P.SAMPLE_TNY, L.simCfg);
  check('sample.tny 词法无错误', r.errors.length === 0, JSON.stringify(r.errors));
  const cats = r.tokens.map(t => t.cat);
  check('识别出关键词 read', cats.includes('关键词') && r.tokens.some(t => t.lexeme === 'read'));
  check('识别出 :=', r.tokens.some(t => t.lexeme === ':=' && t.cat === '专用符号'));
  check('识别出 number 0', r.tokens.some(t => t.lexeme === '0' && t.cat === 'number'));
  check('identifier fact', r.tokens.some(t => t.lexeme === 'fact' && t.cat === 'identifier'));
  check('注释被跳过(无 Sample 词)', !r.tokens.some(t => t.lexeme === 'Sample'));

  // 与原 sample.lex 对比: 按行核对（类别,词素）序列
  const lexText = core.makeLexFile(P.SAMPLE_TNY, r.tokens);
  const orig = fs.readFileSync(new URL('../../sample.lex', import.meta.url), 'utf-8');
  function parseLexFormat(txt) {
    const seq = [];
    txt.split(/\r?\n/).forEach(line => {
      const m = line.match(/^[ \t]*（(.+?)，(.*)）$/);
      if (m) seq.push(m[1] + ',' + m[2]);
    });
    return seq;
  }
  const a = parseLexFormat(lexText), b = parseLexFormat(orig);
  check('与当年 sample.lex 词素序列完全一致', JSON.stringify(a) === JSON.stringify(b),
    '我的(' + a.length + '): ' + a.slice(0, 20).join(' | ') + '\n    原来的(' + b.length + '): ' + b.slice(0, 20).join(' | '));

  // 生成 C 代码
  const cCode = core.generateCCode(L.defs, L.min, L.simCfg, 'TINY');
  check('C 代码生成包含转移表', cCode.includes('static const int NEXT'));
  fs.writeFileSync(new URL('./out_tiny_lexer.c', import.meta.url), cCode);
}

console.log('========== 项目二: TINY LL(1) 语法分析 ==========');
{
  const g0 = core.parseGrammar(P.TINY_GRAMMAR);
  check('TINY 文法解析: 15 个非终结符 / 29 条产生式右部', g0.order.length === 15 && g0.prods.length === 29, g0.order.length + ' 个非终结符, ' + g0.prods.length + ' 条产生式');
  const simp = core.simplifyGrammar(g0);
  check('文法化简: 无需删除(无用符号为 0)', simp.removedNts.length === 0 && simp.removedAlts.length === 0, JSON.stringify([simp.removedNts, simp.removedAlts.map(p => p.lhs + '->' + p.rhs.join(' '))]));
  const tr = core.transformGrammar(g0);
  check('变换完成(消左递归+提左公因子)', tr.g.prods.length > 0, '迭代 ' + tr.iterations + ' 轮, 最终 ' + tr.g.prods.length + ' 条产生式');
  // 验证无左递归
  const first = core.computeFirst(tr.g);
  let hasLL = true;
  const tbl = core.buildLL1Table(tr.g);
  const hardConflicts = tbl.conflicts.filter(c => c.kind === 'FIRST/FIRST 冲突');
  check('LL(1) 表无 FIRST/FIRST 冲突', hardConflicts.length === 0, JSON.stringify(hardConflicts.slice(0, 3)));

  // 词法 -> 文法终结符序列
  const L = buildLexer('tiny');
  const r = core.simulateLex(L.min, P.SAMPLE_TNY, L.simCfg);
  const terms = r.tokens.map(t => {
    if (t.cat === '关键词' || t.cat === '专用符号') return t.lexeme;
    if (t.cat === 'identifier') return 'identifier';
    if (t.cat === 'number') return 'number';
    throw new Error('未知类别 ' + t.cat);
  });
  const pr = core.parseLL1(tr.g, tbl, terms);
  check('LL(1) 分析接受 sample.lex', pr.ok, pr.error);
  check('分析轨迹 >= 20 步', pr.steps.length >= 20, pr.steps.length);
  check('分析树根为 program', pr.tree.sym === 'program');

  const ast = core.buildTinyAst(r.tokens);
  const astStr = JSON.stringify(ast);
  check('TINY AST: if/repeat/assign/read/write 全覆盖(含嵌套)',
    ['"if"', '"repeat"', '"assign"', '"read"', '"write"'].every(k => astStr.includes(k)));
  const quads = core.generateQuadsTiny(ast);
  check('四元式生成: 含乘法与条件跳转', quads.some(q => q.op === '*') && quads.some(q => q.op === 'jfalse'), quads.length + ' 条');
}

console.log('========== 项目三: Mini-C 全流程 ==========');
{
  const L = buildLexer('minic');
  check('Mini-C 正则解析: 4 个单词类别(宏不参与)', L.defs.length === 4);
  const r = core.simulateLex(L.min, P.SAMPLE_MINIC, L.simCfg);
  check('Mini-C 源程序词法无错误', r.errors.length === 0, JSON.stringify(r.errors.slice(0, 3)));
  check('识别 <= 与 %', r.tokens.some(t => t.lexeme === '<=') && r.tokens.some(t => t.lexeme === '%'));
  check('识别浮点数 0.0', r.tokens.some(t => t.lexeme === '0.0' && t.cat === 'NUM'));
  check('行注释被跳过', !r.tokens.some(t => t.lexeme.includes('覆盖')));

  const g0 = core.parseGrammar(P.MINIC_GRAMMAR);
  check('Mini-C 文法: 29+ 条产生式', g0.prods.length >= 29, g0.prods.length);
  const tr = core.transformGrammar(g0);
  const tbl = core.buildLL1Table(tr.g);
  const hard = tbl.conflicts.filter(c => c.kind === 'FIRST/FIRST 冲突');
  check('Mini-C 变换后无 FIRST/FIRST 冲突', hard.length === 0, JSON.stringify(hard.slice(0, 5), null, 1));
  const dangling = tbl.conflicts.filter(c => c.kind === 'FIRST/FOLLOW 冲突');
  console.log('    (悬空 else 冲突自动消解: ' + dangling.length + ' 处 — 就近匹配)');

  const terms = r.tokens.map(t => {
    if (t.cat === '关键词' || t.cat === '专用符号') return t.lexeme;
    if (t.cat === 'ID') return 'ID';
    if (t.cat === 'NUM') return 'NUM';
    throw new Error('未知类别 ' + t.cat);
  });
  const pr = core.parseLL1(tr.g, tbl, terms);
  check('Mini-C LL(1) 分析接受自编源程序', pr.ok, pr.error);

  const ast = core.buildMiniCAst(r.tokens);
  check('Mini-C AST: 函数/数组/do-while/递归调用',
    ast.length >= 3 && ast.some(d => d.kind === 'func') &&
    JSON.stringify(ast).includes('"index"') && JSON.stringify(ast).includes('dowhile'));
  const quads = core.generateQuadsMiniC(ast);
  check('Mini-C 四元式: call/param/[]=/jtrue', quads.some(q => q.op === 'call') && quads.some(q => q.op === 'param') && quads.some(q => q.op === '[]=') && quads.some(q => q.op === 'jtrue'), quads.length + ' 条');
  fs.writeFileSync(new URL('./out_quads.txt', import.meta.url), quads.map((q, i) => `${i + 1}: (${q.op}, ${q.a1}, ${q.a2}, ${q.r})`).join('\n'));
}

console.log('========== 边界与健壮性 ==========');
{
  const L = buildLexer('tiny');
  const r = core.simulateLex(L.min, 'read x; $ @9 #bad', L.simCfg);
  check('非法字符报 ERROR 且不崩溃', r.errors.length >= 2, JSON.stringify(r.errors));
  try { core.parseRegexFile('letter = z..a'); check('区间起大于终报错', false, '未抛出'); }
  catch (e) { check('区间起大于终报错', /起点大于终点/.test(e.message)); }
  try { core.parseGrammar('program syntax error'); check('文法缺箭头报错', false, '未抛出'); }
  catch (e) { check('文法缺箭头报错', /缺少/.test(e.message)); }
  const g1 = core.parseGrammar('S -> a S b | ε');
  const tr1 = core.transformGrammar(g1);
  const tbl1 = core.buildLL1Table(tr1.g);
  const p1 = core.parseLL1(tr1.g, tbl1, ['a', 'a']);
  check('简单文法 S->aSb|ε 分析被拒(aabb缺尾)', !p1.ok);
  const p2 = core.parseLL1(tr1.g, tbl1, ['a', 'a', 'b', 'b']);
  check('简单文法 S->aSb|ε 分析接受 aabb', p2.ok, p2.error);
}

console.log('\n========== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ==========');
process.exit(fail ? 1 : 0);
