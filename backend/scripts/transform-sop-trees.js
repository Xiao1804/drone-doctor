/**
 * SOP 决策树 → RAG 知识文章 transformer
 *
 * 输入:data/decision-trees.json(5 棵决策树 + 1 个维修后检查清单,共 78 节点)
 * 输出:data/knowledge-articles/v2.1/sop-tree-*.md(6 篇)
 *
 * 设计(RAG 友好):
 *   - 剥离 aiMapping / ai 等前端 yes/no 分类字段(对 RAG 无价值)。
 *   - 保留 title / description(how-to 核心)/ criteria(判定标准)/ tools / 分支去向 /
 *     terminal 结论 + 建议 / caseId。
 *   - 每个节点用「### 步骤 N」起段,其下描述/判定/分支不带 # —— chunkContent 遇 ### 切块,
 *     其下段落并入同一 chunk(≤800 字),实现「一节点一 chunk、自包含」,
 *     使 how-to(如「导出飞行日志」「ET7KY08 测试」)能被精确召回。
 *   - frontmatter 用扁平 key: value(import-v21-articles.js 的简单解析器不认多行 YAML),
 *     数组用单行 JSON,id 统一前缀 sop-tree-。
 *
 * 运行(本地,无需容器):node backend/scripts/transform-sop-trees.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..'); // backend/scripts → 项目根 drone-doctor/
const inputPath = path.join(ROOT, 'data', 'decision-trees.json');
const outputDir = path.join(ROOT, 'data', 'knowledge-articles', 'v2.1');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// 每棵树的文章元信息(tree.id → fname / 标题 / 分类 / tags / 概述)
const TREE_META = {
  'tree-damage-assessment': {
    fname: 'sop-tree-damage-assessment',
    title: '定损前通用检查 SOP',
    category_l2: '通用流程',
    fault_type: '通用检查',
    tags: ['定损', '外观检查', '防水标签', '防拆胶', 'SN', 'SOP', '排查流程'],
    desc: '接收无人机后的标准化外观检查流程,6 步确认机身状态并拍照存档,是所有维修前的通用前置流程。',
  },
  'tree-power-on': {
    fname: 'sop-tree-power-on',
    title: '无人机无法开机排查 SOP',
    category_l2: '电源系统',
    fault_type: '电源系统',
    tags: ['无法开机', '电源', '电池', '电调板', '核心板', 'BTB排线', 'DA2', '飞行日志', '大包升级', 'SOP', '排查流程'],
    desc: '按电源键无反应的系统性排查流程:按电源键→数据分析(用 DA2 导出飞行日志)→大包版本→链路/APP 测试;若无法开机则换电池→查 BTB 排线→换电调板→换核心板,逐级定位到电池/电调板/核心板损坏。',
  },
  'tree-link-test': {
    fname: 'sop-tree-link-test',
    title: '机身链路测试故障排查 SOP',
    category_l2: '机身链路',
    fault_type: '机身链路',
    tags: ['链路测试', '整机测试', '报错', '排线', '相机', '云台', 'ET7KY08', 'SOP', '排查流程'],
    desc: '链路/模块检查异常后的定位流程:运行整机链路测试→定位报错模块→检查排线;若涉及相机/云台则进入出图与 ET7KY08 轴臂测试专项。',
  },
  'tree-gimbal': {
    fname: 'sop-tree-gimbal',
    title: '云台故障排查 SOP',
    category_l2: '云台系统',
    fault_type: '云台系统',
    tags: ['云台', '转动异常', '卡顿', '异响', '图像异常', '花屏', '条纹', 'ET7KY08', 'FPC', '清晰度', '异色点', '镜头脏污', 'SOP', '排查流程'],
    desc: '云台故障的专项排查,分两条主线:转动异常(ET7KY08 绕动力测试→轴臂/电机霍尔)与图像异常(花屏/条纹→持续复现判定→相机/FPC;清晰度/异色点→镜头清洁判定)。',
  },
  'tree-battery': {
    fname: 'sop-tree-battery',
    title: '电池故障排查 SOP',
    category_l2: '电源系统',
    fault_type: '电源系统',
    tags: ['电池', '无法充电', '鼓包', '续航异常', 'FU模式', 'Shutdown保护', 'PF永久失效', '电池助手', '充电管家', 'SOP', '排查流程'],
    desc: '电池无法充电/开机/续航异常的排查:外观→装入开机→充电→APP/电池助手检测→低空飞测,覆盖 FU 模式、Shutdown 保护、PF 永久失效、电量过低等结论判定。',
  },
};

const APPLICABLE_MODELS = ['DJI Mini 3', 'DJI Mini 4 Pro', 'DJI Air 3', 'DJI Mavic 3'];

function cleanTitle(t) {
  // 剥离节点 title 自带的「步骤N：」前缀,避免与渲染的「步骤 N：」叠加成「步骤 1：步骤1：…」
  return String(t || '').replace(/^步骤\s*\d+\s*[：:]\s*/, '');
}

function nodeTitle(nodes, id) {
  if (!id) return '(结束)';
  const n = nodes[id];
  return n ? cleanTitle(n.title) : id;
}

// BFS 排序:从 startNode 出发,主流程节点排在前,保证文档线性可读
function orderNodes(nodes, startId) {
  const visited = new Set();
  const order = [];
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes[id];
    if (!node) continue;
    order.push(node);
    const next = [];
    if (node.yes && node.yes.goto) next.push(node.yes.goto);
    if (node.no && node.no.goto) next.push(node.no.goto);
    if (node.next && node.next.goto) next.push(node.next.goto);
    next.forEach((n) => {
      if (!visited.has(n)) queue.push(n);
    });
  }
  return order;
}

function renderNode(node, idx, nodes) {
  const L = [];
  L.push(`### 步骤 ${idx}：${cleanTitle(node.title)}`);
  L.push('');
  if (node.description) {
    L.push(node.description);
    L.push('');
  }
  if (node.type === 'question' && node.criteria) {
    L.push(`**判定标准**：${node.criteria}`);
    L.push('');
  }
  const meta = [];
  if (node.tools && node.tools.length) meta.push(`**工具**：${node.tools.join('、')}`);
  if (node.estimatedTime) meta.push(`**预计耗时**：${node.estimatedTime}`);
  if (meta.length) {
    L.push(meta.join('  '));
    L.push('');
  }

  if (node.type === 'question') {
    L.push(`- ${node.yes ? node.yes.label : '✅ 是'} → 进入「${nodeTitle(nodes, node.yes && node.yes.goto)}」`);
    L.push(`- ${node.no ? node.no.label : '❌ 否'} → 进入「${nodeTitle(nodes, node.no && node.no.goto)}」`);
    L.push('');
  } else if (node.type === 'action' && node.next) {
    L.push(`- ${node.next.label} → 进入「${nodeTitle(nodes, node.next.goto)}」`);
    L.push('');
  } else if (node.type === 'terminal') {
    if (node.conclusion) L.push(`**定损结论**：${node.conclusion}`);
    if (node.recommendation) L.push(`**建议操作**：${node.recommendation}`);
    if (node.caseId) L.push(`**关联故障案例**：${node.caseId}`);
    L.push('');
  }
  return L.join('\n');
}

function renderConclusions(ordered) {
  const terms = ordered.filter((n) => n.type === 'terminal');
  if (!terms.length) return '';
  const L = ['## 定损结论速查', ''];
  L.push('本流程可能得出的定损结论与建议操作汇总:');
  L.push('');
  terms.forEach((t) => {
    const tail = t.caseId ? `(案例 ${t.caseId})` : '';
    L.push(`- **${t.conclusion || t.title}**：${t.recommendation || ''} ${tail}`);
  });
  L.push('');
  return L.join('\n');
}

function renderTree(tree) {
  const meta = TREE_META[tree.id];
  const nodes = tree.nodes;
  const ordered = orderNodes(nodes, tree.startNode);
  const conclusions = ordered.filter((n) => n.type === 'terminal').map((n) => n.conclusion || n.title);

  const L = [];
  L.push(`# ${meta.title}`);
  L.push('');
  L.push(`> ${meta.desc}`);
  L.push('');
  L.push('## 适用场景');
  L.push('');
  L.push(`${tree.description}。可能的定损结论包括：${conclusions.join('、')}。`);
  L.push('');
  L.push('## 排查步骤');
  L.push('');
  ordered.forEach((node, i) => {
    L.push(renderNode(node, i + 1, nodes));
  });

  const conc = renderConclusions(ordered);
  if (conc) L.push(conc);

  const cases = [...new Set(ordered.map((n) => n.caseId).filter(Boolean))];
  if (cases.length) {
    L.push('## 关联故障案例');
    L.push('');
    L.push(`本 SOP 引用的故障案例编号：${cases.join('、')}`);
    L.push('');
  }

  return L.join('\n');
}

function frontmatter(meta) {
  const tags = JSON.stringify(meta.tags);
  const models = JSON.stringify(APPLICABLE_MODELS);
  return [
    '---',
    `id: ${meta.fname}`,
    `title: ${meta.title}`,
    `category_l1: A10`,
    `category_l2: ${meta.category_l2}`,
    `applicable_models: ${models}`,
    `fault_type: ${meta.fault_type}`,
    `difficulty: 3`,
    `need_professional: false`,
    `tags: ${tags}`,
    `layer: rule`,
    `status: review`,
    `confidence: high`,
    `evidence_type: fact`,
    `risk_level: normal`,
    `source_type: manual`,
    `ai_generated: false`,
    '---',
    '',
  ].join('\n');
}

// ---- 主流程:渲染 5 棵树 ----
let count = 0;
for (const tree of data.trees) {
  const meta = TREE_META[tree.id];
  if (!meta) {
    console.warn(`跳过未知决策树: ${tree.id}`);
    continue;
  }
  const md = frontmatter(meta) + renderTree(tree) + '\n';
  const fp = path.join(outputDir, meta.fname + '.md');
  fs.writeFileSync(fp, md, 'utf8');
  console.log(`wrote ${path.relative(ROOT, fp)} (${md.length} chars)`);
  count++;
}

// ---- 第 6 篇:维修后检查清单 ----
const chk = data.checklist;
const chkMeta = {
  fname: 'sop-tree-post-repair-checklist',
  title: '维修完成后综合检查清单',
  category_l2: '维修后检查',
  fault_type: '维修后检查',
  tags: ['维修后检查', '测试矩阵', '链路测试', 'APP测试', '大包版本', 'DA2', '防水标签', '线扣方向', 'SN录件', '维修记录', 'checklist'],
  desc: '所有故障修复完成后必须执行的 8 项综合检查,全部通过才能交付。',
};
const chkL = [];
chkL.push(frontmatter(chkMeta));
chkL.push(`# ${chkMeta.title}`);
chkL.push('');
chkL.push(`> ${chkMeta.desc}`);
chkL.push('');
chkL.push('## 检查项');
chkL.push('');
chk.items.forEach((item, i) => {
  const req = item.required ? '必查' : '条件必查';
  const cond = item.condition ? `(条件:${item.condition})` : '';
  chkL.push(`### ${i + 1}. ${item.text}`);
  chkL.push('');
  chkL.push(`**类型**：${req}${cond}`);
  chkL.push('');
});
const chkMd = chkL.join('\n') + '\n';
const chkPath = path.join(outputDir, chkMeta.fname + '.md');
fs.writeFileSync(chkPath, chkMd, 'utf8');
console.log(`wrote ${path.relative(ROOT, chkPath)} (${chkMd.length} chars)`);
count++;

console.log(`\n完成:写入 ${count} 篇文章到 ${path.relative(ROOT, outputDir)}`);
