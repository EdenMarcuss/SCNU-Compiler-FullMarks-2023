# -*- coding: utf-8 -*-
"""
build.py — 将 style.css / core.js / presets.js / app.js 组装为单文件 HTML 成品
"""
import io, os

BUILD = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(os.path.join(BUILD, '..', '..', '满分重制版-2026'))

def read(name):
    with io.open(os.path.join(BUILD, name), 'r', encoding='utf-8') as f:
        return f.read()

HTML = u'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>编译原理课程项目 · 满分重制版 (2026)</title>
<style>
__STYLE__
</style>
</head>
<body>
<div class="container">

<header class="hero">
  <h1>编译原理课程项目 · 满分重制版 <span class="badge">2026 重制</span></h1>
  <p>项目一 词法分析器生成器 · 项目二 LL(1) 语法分析器 · 项目三 Mini-C 全流程测试 · 选做 四元式中间代码 — 全部按当年任务书要求实现, 数据与原作业完全兼容</p>
</header>

<div class="tabbar">
  <button class="active" data-page="page1">项目一 · 词法分析器生成器</button>
  <button data-page="page2">项目二 · LL(1) 语法分析器</button>
  <button data-page="page3">项目三 · Mini-C 全流程测试</button>
</div>

<!-- ==================== 项目一 ==================== -->
<section class="tabpage active" id="page1">
  <div class="controls">
    <label>测试语言:</label>
    <select id="lex-lang">
      <option value="tiny">TINY 语言</option>
      <option value="minic">Mini-C 语言</option>
    </select>
    <button class="btn" id="lex-open-regex">📂 打开正则表达式文件</button>
    <button class="btn primary" id="lex-build">⚙ 构建 (正则→NFA→DFA→最小化→C代码)</button>
    <span class="hint">每行格式: 类别 = 正则表达式 | "宏 类别 = 正则" 定义辅助宏 | # 注释</span>
  </div>
  <div id="lex-err"></div>

  <div class="step">
    <div class="step-head"><span class="no">1</span><h3>输入正则表达式文件并解析</h3>
      <div class="why">任务书(1): 以文本文件方式输入语言所有单词的正则表达式, 提供打开文件界面</div></div>
    <div class="step-body">
      <textarea id="lex-regex" rows="7" spellcheck="false"></textarea>
      <div class="stat-row" id="lex-stats"></div>
      <div id="lex-defs"></div>
    </div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">2</span><h3>正则表达式 → NFA (Thompson 构造)</h3>
      <div class="why">任务书(2): 提供窗口查看 NFA (状态转换表呈现)</div></div>
    <div class="step-body">
      <div class="controls" style="margin-bottom:10px; border:none; padding:0">
        <label>查看:</label><select id="lex-nfa-sel"></select>
      </div>
      <div id="lex-nfa"></div>
      <div class="hint" style="margin:8px 0 4px">状态转换图 (绿色双圈为接受状态):</div>
      <div class="graphwrap" id="lex-nfa-graph"></div>
    </div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">3</span><h3>NFA → DFA (子集构造法)</h3>
      <div class="why">任务书(3): 提供窗口查看 DFA (状态转换表呈现)</div></div>
    <div class="step-body"><div id="lex-dfa"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">4</span><h3>DFA 最小化 (划分精化算法)</h3>
      <div class="why">任务书(4): 提供窗口查看最小化 DFA (状态转换表呈现)</div></div>
    <div class="step-body"><div id="lex-mindfa"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">5</span><h3>生成 C 语言词法分析程序</h3>
      <div class="why">任务书(5): 提供窗口查看转换得到的词法分析程序 (C 语言描述)</div></div>
    <div class="step-body">
      <div class="note blue">生成的 C 程序内嵌最小化 DFA 转移表, 采用最大匹配算法, 与本页面执行的扫描逻辑完全一致。当年要求调用 C 编译器编译运行 — 点击"下载 .c"后用任意 gcc / clang / MSVC 即可编译: <b>gcc TINY_lexer.c -o lexer &amp;&amp; ./lexer sample.tny</b></div>
      <div id="lex-ccode"></div>
      <div style="margin-top:8px"><button class="btn" id="lex-dl-c">⬇ 下载生成的 C 词法分析器</button></div>
    </div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">6</span><h3>词法分析测试 (最大匹配扫描)</h3>
      <div class="why">任务书(6)(7): 对源程序进行词法分析, 输出单词编码, 提供窗口查看</div></div>
    <div class="step-body">
      <div class="controls" style="margin-bottom:10px; border:none; padding:0">
        <button class="btn" id="lex-sample">载入示例源程序</button>
        <button class="btn" id="lex-open-src">📂 打开源程序文件</button>
        <button class="btn primary" id="lex-run">▶ 开始词法分析</button>
      </div>
      <textarea id="lex-src" rows="8" spellcheck="false"></textarea>
      <div id="lex-tokens" style="margin-top:10px"></div>
    </div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">7</span><h3>输出 sample.lex (与当年交作业格式一致)</h3>
      <div class="why">任务书(7)(8): 读入 sample.tny, 输出单词编码文件 sample.lex</div></div>
    <div class="step-body">
      <pre class="code lexfile" id="lex-lexfile"></pre>
      <div style="margin-top:8px"><button class="btn" id="lex-dl-lex">⬇ 下载 sample.lex</button></div>
    </div>
  </div>
</section>

<!-- ==================== 项目二 ==================== -->
<section class="tabpage" id="page2">
  <div class="controls">
    <label>测试语言:</label>
    <select id="gra-lang">
      <option value="tiny">TINY 文法</option>
      <option value="minic">Mini-C 文法</option>
    </select>
    <button class="btn" id="gra-open">📂 打开 BNF 文法文件</button>
    <button class="btn primary" id="gra-build">⚙ 构建 (化简→消左递归→First/Follow→LL(1)表)</button>
    <span class="hint">每行: 左部 -> 右部 | 右部 … | ε / empty 表示空串 | # 注释 | 兼容全角标点与行号前缀</span>
  </div>
  <div id="gra-err"></div>

  <div class="step">
    <div class="step-head"><span class="no">1</span><h3>输入 BNF 文法文件</h3>
      <div class="why">任务书(1): 以文本文件方式输入语言所有语法对应的 BNF 文法</div></div>
    <div class="step-body"><textarea id="gra-text" rows="7" spellcheck="false"></textarea>
      <div id="gra-orig" style="margin-top:10px"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">2</span><h3>文法化简</h3>
      <div class="why">任务书(2): 以表格形式输出文法化简后的结果</div></div>
    <div class="step-body"><div id="gra-simp"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">3</span><h3>消除左递归 + 消除左公共因子</h3>
      <div class="why">任务书(3): 以表格形式输出消除左公共因子和左递归之后的文法</div></div>
    <div class="step-body"><div id="gra-transform"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">4</span><h3>FIRST 集</h3>
      <div class="why">任务书(4): 求改造后文法每个非终结符号的 First 集合 (表格呈现)</div></div>
    <div class="step-body"><div id="gra-first"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">5</span><h3>FOLLOW 集</h3>
      <div class="why">任务书(4): 求改造后文法每个非终结符号的 Follow 集合 (表格呈现)</div></div>
    <div class="step-body"><div id="gra-follow"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">6</span><h3>LL(1) 预测分析表</h3>
      <div class="why">任务书(5): 构造 LL(1) 分析表 (表格呈现)</div></div>
    <div class="step-body"><div id="gra-table-note"></div><div id="gra-table"></div></div>
  </div>

  <div class="step">
    <div class="step-head"><span class="no">7</span><h3>LL(1) 语法分析 + 语法树 + 语义(选做)</h3>
      <div class="why">任务书(6)(7): LL(1) 分析并生成语法树(树状呈现); 测试 sample.lex</div></div>
    <div class="step-body">
      <div class="controls" style="margin-bottom:10px; border:none; padding:0">
        <button class="btn primary" id="gra-run-src">▶ 分析源程序 (自动先词法分析)</button>
        <button class="btn" id="gra-run-lex">📂 分析 sample.lex 文件</button>
        <span class="hint">源程序会先用项目一的词法分析器转成单词编码, 再做 LL(1) 语法分析 — 两个项目就此串联</span>
      </div>
      <textarea id="gra-src" rows="7" spellcheck="false"></textarea>
      <div id="gra-parse-out" style="margin-top:12px"></div>
    </div>
  </div>
</section>

<!-- ==================== 项目三 ==================== -->
<section class="tabpage" id="page3">
  <div class="controls">
    <button class="btn primary" id="mc-run">▶ 一键运行 Mini-C 全流程测试 (词法→语法→语义→四元式)</button>
    <span class="hint">任务书项目三: 以 Mini-C 词法+语法测试整个项目, 源程序按任务书要求自行编写</span>
  </div>
  <div class="step">
    <div class="step-head"><span class="no">0</span><h3>自己编写的 Mini-C 测试源程序</h3>
      <div class="why">覆盖: 变量/数组/函数/递归/if-else/do-while/浮点数/注释</div></div>
    <div class="step-body"><textarea id="mc-src" rows="10" spellcheck="false" readonly></textarea></div>
  </div>
  <div id="mc-out"></div>
</section>

<footer>
  编译原理课程项目 (2023 任务书) · 2026 满分重制版 · 必做内容全部完成 + 选做内容(四元式)完成 · 测试数据: TINY 词法/语法 + Mini-C 词法/语法<br>
  核心算法: Thompson 构造 · 子集构造法 · 划分精化最小化 · 最大匹配扫描 · 文法化简 · 左递归/左公因子消除 · FIRST/FOLLOW · LL(1) 预测分析 · 语义翻译
</footer>

</div>
<script>
__CORE__
</script>
<script>
__PRESETS__
</script>
<script>
__APP__
</script>
</body>
</html>
'''

def main():
    style = read('style.css')
    core = read('core.js')
    presets = read('presets.js')
    app = read('app.js')
    html = (HTML.replace(u'__STYLE__', style)
                .replace(u'__CORE__', core)
                .replace(u'__PRESETS__', presets)
                .replace(u'__APP__', app))
    if not os.path.exists(OUT_DIR):
        os.makedirs(OUT_DIR)
    out_path = os.path.join(OUT_DIR, u'编译原理课程项目-满分重制版.html')
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    # 同步写出两个测试源文件 (任务书要求的交付物)
    with io.open(os.path.join(OUT_DIR, 'sample.tny'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(extract_array(presets, 'SAMPLE_TNY'))
    with io.open(os.path.join(OUT_DIR, u'自己编写的mini-c源程序.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(extract_array(presets, 'SAMPLE_MINIC'))
    print('OK ->', out_path, len(html), 'chars')

import re
def extract_array(src, varname):
    """从 presets.js 源码中提取 var NAME = [ 'a', 'b' ].join('\\n') 的拼接字符串"""
    m = re.search(r'var ' + varname + r' = \[(.*?)\]\.join', src, re.S)
    body = m.group(1)
    parts = re.findall(r"'((?:[^'\\]|\\.)*)'", body)
    def unesc(s):
        return s.replace("\\'", "'").replace('\\\\', '\\').replace('\\t', '\t')
    return '\n'.join(unesc(p) for p in parts)

if __name__ == '__main__':
    main()
