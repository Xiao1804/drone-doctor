const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Load decision trees data
const decisionTreesPath = path.join(__dirname, '..', '..', 'data', 'decision-trees.json');
let decisionTreesData = null;

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

// GET /api/decision-trees/:id - Get single tree
router.get('/:id', (req, res) => {
  if (!decisionTreesData) {
    return res.status(500).json({ error: 'Decision trees data not loaded' });
  }

  const tree = decisionTreesData.trees.find(t => t.id === req.params.id);
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

module.exports = router;
