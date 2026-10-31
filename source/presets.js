/*
 * 文件名称: presets.js — 预设测试数据 (TINY 与 Mini-C)
 * 摘要: 内嵌任务书要求的全部测试数据, 同时生成独立测试文件
 */
(function (global) {
'use strict';

var TINY_REGEX = [
  '# ============================================',
  '# TINY 语言单词的正则表达式',
  '# "宏 名称 = 正则"  定义辅助宏(不作为单词类别)',
  '# "名称 = 正则"     定义单词类别(顺序即优先级)',
  '# 语法: | 连接  * 闭包  + 正闭包  ? 可选  ( ) 分组',
  '#       a..z 区间  [a-z] 字符类  \\+ 转义  ε 空串',
  '# ============================================',
  '宏 letter    = a..z | A..Z',
  '宏 digit     = 0..9',
  '关键词    = if | then | else | end | repeat | until | read | write',
  '专用符号  = \\+ | - | \\* | / | < | = | \\( | \\) | ; | :=',
  'identifier = letter ( letter | digit )*',
  'number    = digit digit*'
].join('\n');

var MINIC_REGEX = [
  '# ============================================',
  '# Mini-C 语言单词的正则表达式',
  '# 关键字必须小写; // 为行注释',
  '# ============================================',
  '宏 letter    = a..z | A..Z',
  '宏 digit     = 0..9',
  '关键词    = else | if | int | float | return | void | do | while',
  '专用符号  = <= | >= | == | != | \\+ | - | \\* | / | % | < | > | = | ; | , | \\( | \\) | \\[ | \\] | \\{ | \\}',
  'ID        = ( _ | letter ) ( _ | letter | digit )*',
  'NUM       = digit digit* ( \\. digit digit* )?'
].join('\n');

var TINY_GRAMMAR = [
  '# ============================================',
  '# BNF 中的 TINY 文法 (Louden)',
  '# 非终结符 -> 产生式右部 | 右部 ...',
  '# ============================================',
  'program -> stmt-sequence',
  'stmt-sequence -> stmt-sequence ; statement | statement',
  'statement -> if-stmt | repeat-stmt | assign-stmt | read-stmt | write-stmt',
  'if-stmt -> if exp then stmt-sequence end | if exp then stmt-sequence else stmt-sequence end',
  'repeat-stmt -> repeat stmt-sequence until exp',
  'assign-stmt -> identifier := exp',
  'read-stmt -> read identifier',
  'write-stmt -> write exp',
  'exp -> simple-exp comparison-op simple-exp | simple-exp',
  'comparison-op -> < | =',
  'simple-exp -> simple-exp addop term | term',
  'addop -> + | -',
  'term -> term mulop factor | factor',
  'mulop -> * | /',
  'factor -> ( exp ) | number | identifier'
].join('\n');

/* Mini-C 文法: 与任务书 29 条 BNF 一致(全角标点已归一化) */
var MINIC_GRAMMAR = [
  '# Mini-C 的 BNF 语法 (任务书 29 条)',
  'program -> definition-list',
  'definition-list -> definition-list definition | definition',
  'definition -> variable-definition | function-definition',
  'variable-definition -> type-indicator ID ; | type-indicator ID [ NUM ] ;',
  'type-indicator -> int | float | void',
  'function-definition -> type-indicator ID ( parameters ) compound-stmt',
  'parameters -> parameter-list | void',
  'parameter-list -> parameter-list , parameter | parameter',
  'parameter -> type-indicator ID | type-indicator ID [ ]',
  'compound-stmt -> { local-definitions statement-list }',
  'local-definitions -> local-definitions variable-definition | empty',
  'statement-list -> statement-list statement | empty',
  'statement -> expression-stmt | compound-stmt | condition-stmt | dowhile-stmt | return-stmt',
  'expression-stmt -> expression ; | ;',
  'condition-stmt -> if ( expression ) statement | if ( expression ) statement else statement',
  'dowhile-stmt -> do statement while ( expression ) ;',
  'return-stmt -> return ; | return expression ;',
  'expression -> variable = expression | simple-expression',
  'variable -> ID | ID [ expression ]',
  'simple-expression -> additive-expression relop additive-expression | additive-expression',
  'relop -> <= | < | > | >= | == | !=',
  'additive-expression -> additive-expression addop term | term',
  'addop -> + | -',
  'term -> term mulop factor | factor',
  'mulop -> * | / | %',
  'factor -> ( expression ) | variable | call | NUM',
  'call -> ID ( arguments )',
  'arguments -> argument-list | empty',
  'argument-list -> argument-list , expression | expression'
].join('\n');

var SAMPLE_TNY = [
  '{ Sample program',
  '  in TINY language -',
  '  computes factorial',
  '}',
  'read x; { input an integer }',
  'if 0 < x then { don\'t compute if x <= 0 }',
  '  fact := 1;',
  '  repeat',
  '    fact := fact * x;',
  '    x := x - 1',
  '  until x = 0;',
  '  write fact  { output  factorial of x }',
  'end',
  ''
].join('\n');

/* 自己编写的 Mini-C 测试源程序 (任务书项目三要求自编) */
var SAMPLE_MINIC = [
  '// ============================================',
  '// 自己编写的 Mini-C 测试源程序',
  '// 覆盖: 变量/数组定义、函数调用、递归、',
  '//       if-else、do-while、算术与关系运算、注释',
  '// ============================================',
  '',
  'int fact(int x) {',
  '    if (x <= 1) return 1;',
  '    return x * fact(x - 1);',
  '}',
  '',
  'float sum(float a[], int n) {',
  '    float s;',
  '    int i;',
  '    s = 0.0;',
  '    i = 0;',
  '    do {',
  '        s = s + a[i];',
  '        i = i + 1;',
  '    } while (i < n);',
  '    return s;',
  '}',
  '',
  'void main(void) {',
  '    int n;',
  '    int r;',
  '    float arr[3];',
  '    float total;',
  '    arr[0] = 1.5;',
  '    arr[1] = 2.5;',
  '    arr[2] = 3.0;',
  '    n = 5;',
  '    do {',
  '        n = n - 1;',
  '    } while (n > 2);',
  '    if (n % 2 != 0) r = fact(n);',
  '    else r = fact(n + 1);',
  '    total = sum(arr, 3);',
  '    ;',
  '}'
].join('\n');

/* 语言配置 */
var LANGS = {
  tiny: {
    key: 'tiny', name: 'TINY',
    regexText: TINY_REGEX, grammarText: TINY_GRAMMAR,
    sampleSource: SAMPLE_TNY, sampleExt: 'tny',
    commentCfg: { blockComment: { start: '{', end: '}' } },
    astBuilder: 'tiny'
  },
  minic: {
    key: 'minic', name: 'Mini-C',
    regexText: MINIC_REGEX, grammarText: MINIC_GRAMMAR,
    sampleSource: SAMPLE_MINIC, sampleExt: 'mxc',
    commentCfg: { lineComment: '//' },
    astBuilder: 'minic'
  }
};

global.Presets = { TINY_REGEX: TINY_REGEX, MINIC_REGEX: MINIC_REGEX, TINY_GRAMMAR: TINY_GRAMMAR, MINIC_GRAMMAR: MINIC_GRAMMAR, SAMPLE_TNY: SAMPLE_TNY, SAMPLE_MINIC: SAMPLE_MINIC, LANGS: LANGS };
})(typeof window !== 'undefined' ? window : globalThis);
