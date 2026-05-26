const fs = require('fs').promises;
const { resolveFaultCasesFile } = require('../utils/faultCasesFile');

const CASES_FILE = resolveFaultCasesFile();

/**
 * 获取所有案例
 */
exports.getAllCases = async (req, res) => {
  try {
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    
    res.json({
      success: true,
      total: cases.length,
      cases: cases
    });
  } catch (error) {
    console.error('Get cases error:', error);
    res.status(500).json({ error: '获取案例失败' });
  }
};

/**
 * 获取单个案例
 */
exports.getCase = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    
    const caseItem = cases.find(c => c.id === id);
    
    if (!caseItem) {
      return res.status(404).json({ error: '案例不存在' });
    }
    
    res.json({
      success: true,
      case: caseItem
    });
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({ error: '获取案例失败' });
  }
};

/**
 * 添加新案例
 */
exports.addCase = async (req, res) => {
  try {
    const newCase = req.body;
    
    // 验证必填字段
    const requiredFields = ['faultType', 'symptom', 'keywords', 'applicableModels', 'possibleCauses', 'troubleshootingSteps'];
    for (const field of requiredFields) {
      if (!newCase[field]) {
        return res.status(400).json({ error: `缺少必填字段: ${field}` });
      }
    }
    
    // 读取现有案例
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    
    // 生成新ID
    const maxId = Math.max(...cases.map(c => parseInt(c.id.replace('F', ''))));
    newCase.id = `F${String(maxId + 1).padStart(3, '0')}`;
    
    // 添加审核信息
    newCase.source = newCase.source || '用户反馈';
    newCase.sourceDetail = newCase.sourceDetail || '用户提交，待审核';
    newCase.credibility = newCase.credibility || 'C';
    newCase.verifiedBy = '待审核';
    newCase.verifiedAt = new Date().toISOString().split('T')[0];
    newCase.reviewStatus = 'pending';
    newCase.tags = newCase.tags || [];
    newCase.relatedCases = newCase.relatedCases || [];
    
    // 添加到案例库
    cases.push(newCase);
    
    // 保存文件
    await fs.writeFile(CASES_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    
    res.json({
      success: true,
      message: '案例已添加，等待审核',
      case: newCase
    });
  } catch (error) {
    console.error('Add case error:', error);
    res.status(500).json({ error: '添加案例失败' });
  }
};

/**
 * 更新案例
 */
exports.updateCase = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // 读取现有案例
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    
    // 查找案例
    const index = cases.findIndex(c => c.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: '案例不存在' });
    }
    
    // 更新案例（保留不可修改的字段）
    const protectedFields = ['id', 'verifiedBy', 'verifiedAt', 'reviewStatus'];
    protectedFields.forEach(field => {
      delete updates[field];
    });
    
    cases[index] = { ...cases[index], ...updates };
    
    // 保存文件
    await fs.writeFile(CASES_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    
    res.json({
      success: true,
      message: '案例已更新',
      case: cases[index]
    });
  } catch (error) {
    console.error('Update case error:', error);
    res.status(500).json({ error: '更新案例失败' });
  }
};

/**
 * 审核案例
 */
exports.reviewCase = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewer, credibility, comment } = req.body;
    
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: '无效的审核状态' });
    }
    
    // 读取现有案例
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    
    // 查找案例
    const index = cases.findIndex(c => c.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: '案例不存在' });
    }
    
    // 更新审核信息
    cases[index].reviewStatus = status;
    cases[index].verifiedBy = reviewer || '技术团队';
    cases[index].verifiedAt = new Date().toISOString().split('T')[0];
    
    if (credibility) {
      cases[index].credibility = credibility;
    }
    
    if (comment) {
      cases[index].reviewComment = comment;
    }
    
    // 保存文件
    await fs.writeFile(CASES_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    
    res.json({
      success: true,
      message: `案例已${status === 'approved' ? '通过' : status === 'rejected' ? '拒绝' : '待审核'}`,
      case: cases[index]
    });
  } catch (error) {
    console.error('Review case error:', error);
    res.status(500).json({ error: '审核案例失败' });
  }
};

/**
 * 删除案例
 */
exports.deleteCase = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 读取现有案例
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    let cases = JSON.parse(data);
    
    // 查找案例
    const index = cases.findIndex(c => c.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: '案例不存在' });
    }
    
    // 删除案例
    cases.splice(index, 1);
    
    // 保存文件
    await fs.writeFile(CASES_FILE, JSON.stringify(cases, null, 2), 'utf-8');
    
    res.json({
      success: true,
      message: '案例已删除'
    });
  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({ error: '删除案例失败' });
  }
};

/**
 * 搜索案例
 */
exports.searchCases = async (req, res) => {
  try {
    const { keyword, faultType, model, credibility, status } = req.query;
    
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    let cases = JSON.parse(data);
    
    // 关键词搜索
    if (keyword) {
      cases = cases.filter(c => 
        c.symptom.includes(keyword) ||
        c.keywords.some(k => k.includes(keyword)) ||
        c.faultType.includes(keyword)
      );
    }
    
    // 故障类型过滤
    if (faultType) {
      cases = cases.filter(c => c.faultType === faultType);
    }
    
    // 机型过滤
    if (model) {
      cases = cases.filter(c => c.applicableModels.includes(model));
    }
    
    // 可信度过滤
    if (credibility) {
      cases = cases.filter(c => c.credibility === credibility);
    }
    
    // 审核状态过滤
    if (status) {
      cases = cases.filter(c => c.reviewStatus === status);
    }
    
    res.json({
      success: true,
      total: cases.length,
      cases: cases
    });
  } catch (error) {
    console.error('Search cases error:', error);
    res.status(500).json({ error: '搜索案例失败' });
  }
};

/**
 * 获取统计信息
 */
exports.getStats = async (req, res) => {
  try {
    const data = await fs.readFile(CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    
    // 故障类型统计
    const faultTypeStats = {};
    cases.forEach(c => {
      faultTypeStats[c.faultType] = (faultTypeStats[c.faultType] || 0) + 1;
    });
    
    // 来源统计
    const sourceStats = {};
    cases.forEach(c => {
      sourceStats[c.source] = (sourceStats[c.source] || 0) + 1;
    });
    
    // 可信度统计
    const credibilityStats = {};
    cases.forEach(c => {
      credibilityStats[c.credibility] = (credibilityStats[c.credibility] || 0) + 1;
    });
    
    // 审核状态统计
    const reviewStats = {};
    cases.forEach(c => {
      reviewStats[c.reviewStatus] = (reviewStats[c.reviewStatus] || 0) + 1;
    });
    
    res.json({
      success: true,
      total: cases.length,
      faultTypeStats,
      sourceStats,
      credibilityStats,
      reviewStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: '获取统计信息失败' });
  }
};
