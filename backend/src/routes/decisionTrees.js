const express = require('express');
const fs = require('fs');
const path = require('path');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { query, run } = require('../db');

const router = express.Router();

// Load decision trees data
const decisionTreesPath = path.join(__dirname, '..', '..', 'data', 'decision-trees.json');
let decisionTreesData = null;
let approvedChanges = new Map(); // treeId -> merged changes

function loadDecisionTrees() {
  try {
    const raw = fs.readFileSync(decisionTreesPath, 'utf-8');
    decisionTreesData = JSON.parse(raw);
    console.log(`[DecisionTree] Loaded ${decisionTreesData.trees.length} decision trees`);
  } catch (err) {
    console.error('[DecisionTree] Failed to load decision trees:', err.message);
    decisionTreesData = { trees: [], checklist: { items: [] } };
  }
}

// Load on startup
loadDecisionTrees();

/**
 * 获取已批准的变更并合并到决策树中
 * 此函数在加载决策树后调用，将数据库中已批准的变更应用到内存数据
 */
async function loadApprovedChanges() {
  try {
    const { rows } = await query(
      `SELECT tree_id, changes FROM tree_change_requests WHERE status = 'approved'`
    );
    approvedChanges.clear();
    for (const row of rows) {
      const treeId = row.tree_id;
      const changes = typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes;
      if (!approvedChanges.has(treeId)) {
        approvedChanges.set(treeId, []);
      }
      approvedChanges.get(treeId).push(changes);
    }
    console.log(`[DecisionTree] Loaded ${rows.length} approved changes`);
  } catch (err) {
    console.error('[DecisionTree] Failed to load approved changes:', err.message);
  }
}

/**
 * 获取合并后的决策树（基础数据 + 已批准的变更）
 */
function getMergedTree(treeId) {
  const baseTree = decisionTreesData.trees.find(t => t.id === treeId);
  if (!baseTree) return null;

  // 深拷贝避免修改基础数据
  const mergedTree = JSON.parse(JSON.stringify(baseTree));

  // 应用已批准的变更
  const changes = approvedChanges.get(treeId);
  if (changes) {
    for (const change of changes) {
      if (change.nodes) {
        Object.assign(mergedTree.nodes, change.nodes);
      }
    }
  }

  return mergedTree;
}

// GET /api/decision-trees - List all trees
router.get('/', (req, res) => {
  if (!decisionTreesData) {
    return res.status(500).json({ error: 'Decision trees data not loaded' });
  }

  const trees = decisionTreesData.trees.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    icon: t.icon,
    startNode: t.startNode,
    nodeCount: Object.keys(t.nodes).length
  }));

  res.json({
    version: decisionTreesData.version,
    trees,
    checklist: {
      id: decisionTreesData.checklist.id,
      name: decisionTreesData.checklist.name,
      itemCount: decisionTreesData.checklist.items.length
    }
  });
});

// GET /api/decision-trees/:id - Get single tree (merged with approved changes)
router.get('/:id', (req, res) => {
  if (!decisionTreesData) {
    return res.status(500).json({ error: 'Decision trees data not loaded' });
  }

  const tree = getMergedTree(req.params.id);
  if (!tree) {
    return res.status(404).json({ error: 'Decision tree not found' });
  }

  res.json(tree);
});

// GET /api/decision-trees/checklist/post-repair - Get post-repair checklist
router.get('/checklist/post-repair', (req, res) => {
  if (!decisionTreesData) {
    return res.status(500).json({ error: 'Decision trees data not loaded' });
  }

  res.json(decisionTreesData.checklist);
});

// ========== 决策树变更审批 API ==========

/**
 * GET /api/decision-trees/pending/list
 * 查看待审批的决策树修改列表（仅管理员）
 * 注意：此路由必须放在 /:id 之前，避免被路径参数匹配
 */
router.get('/pending/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, tree_id, proposed_by, changes, status, created_at
       FROM tree_change_requests
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );

    const requests = rows.map(row => ({
      id: row.id,
      treeId: row.tree_id,
      proposedBy: row.proposed_by,
      changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes,
      status: row.status,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      count: requests.length,
      requests
    });
  } catch (err) {
    console.error('[DecisionTree] List pending changes failed:', err.message);
    res.status(500).json({ error: '获取待审批列表失败' });
  }
});

/**
 * POST /api/decision-trees/:id/propose
 * 提交决策树修改申请（需登录）
 */
router.post('/:id/propose', authMiddleware, async (req, res) => {
  const { id: treeId } = req.params;
  const { changes } = req.body;
  const userId = req.userId;

  if (!changes || typeof changes !== 'object') {
    return res.status(400).json({ error: '缺少 changes 参数' });
  }

  // 校验 treeId 是否存在
  const tree = decisionTreesData.trees.find(t => t.id === treeId);
  if (!tree) {
    return res.status(404).json({ error: 'Decision tree not found' });
  }

  try {
    const result = await run(
      `INSERT INTO tree_change_requests (tree_id, proposed_by, changes, status) VALUES (?, ?, ?, 'pending')`,
      [treeId, userId, JSON.stringify(changes)]
    );

    res.json({
      success: true,
      message: '修改申请已提交，等待审批',
      requestId: result.lastID,
      treeId,
      status: 'pending'
    });
  } catch (err) {
    console.error('[DecisionTree] Propose change failed:', err.message);
    res.status(500).json({ error: '提交申请失败' });
  }
});

/**
 * POST /api/decision-trees/:id/approve
 * 审批通过决策树修改（仅管理员）
 */
router.post('/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  const { id: treeId } = req.params;
  const { requestId } = req.body;
  const adminId = req.userId;

  if (!requestId) {
    return res.status(400).json({ error: '缺少 requestId 参数' });
  }

  try {
    // 更新状态
    const result = await run(
      `UPDATE tree_change_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ${require('../db').now()} WHERE id = ? AND tree_id = ?`,
      [adminId, requestId, treeId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: '未找到该申请或 treeId 不匹配' });
    }

    // 重新加载已批准的变更
    await loadApprovedChanges();

    res.json({
      success: true,
      message: '修改已批准并生效',
      requestId,
      treeId,
      status: 'approved'
    });
  } catch (err) {
    console.error('[DecisionTree] Approve change failed:', err.message);
    res.status(500).json({ error: '审批失败' });
  }
});

/**
 * POST /api/decision-trees/:id/reject
 * 审批拒绝决策树修改（仅管理员）
 */
router.post('/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  const { id: treeId } = req.params;
  const { requestId, reason } = req.body;
  const adminId = req.userId;

  if (!requestId) {
    return res.status(400).json({ error: '缺少 requestId 参数' });
  }

  try {
    const result = await run(
      `UPDATE tree_change_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ${require('../db').now()} WHERE id = ? AND tree_id = ?`,
      [adminId, requestId, treeId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: '未找到该申请或 treeId 不匹配' });
    }

    res.json({
      success: true,
      message: '修改已拒绝',
      requestId,
      treeId,
      status: 'rejected',
      reason: reason || null
    });
  } catch (err) {
    console.error('[DecisionTree] Reject change failed:', err.message);
    res.status(500).json({ error: '拒绝失败' });
  }
});

module.exports = router;
module.exports.loadApprovedChanges = loadApprovedChanges;
module.exports.getMergedTree = getMergedTree;
