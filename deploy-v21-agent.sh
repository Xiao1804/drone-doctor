#!/bin/bash
# v2.1 智能体部署脚本

set -e

PROJECT_DIR="/root/drone-doctor"

echo "🚀 v2.1 智能体部署开始"
echo "=============================="

cd "$PROJECT_DIR"

# 1. 创建后端服务文件
echo "📝 创建智能体服务文件..."

cat > "$PROJECT_DIR/backend/src/services/llmService.js" << 'LLM_EOF'
/**
 * v2.1 大语言模型服务
 * 支持 DeepSeek、豆包等多种模型
 */

const axios = require('axios');

class LLMService {
  constructor() {
    // 优先使用 DeepSeek
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    this.deepseekApiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
    this.deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    
    // 备用：豆包/智谱
    this.zhipuApiKey = process.env.ZHIPU_API_KEY;
    this.zhipuApiBase = process.env.ZHIPU_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
    this.zhipuModel = process.env.ZHIPU_MODEL || 'GLM-4-Flash';
  }

  /**
   * 调用大模型
   */
  async chat(messages, options = {}) {
    const { temperature = 0.7, maxTokens = 1000, model } = options;

    if (this.deepseekApiKey) {
      console.log('[LLM] Using DeepSeek');
      return this._chatDeepSeek(messages, { temperature, maxTokens, model });
    }

    if (this.zhipuApiKey) {
      console.log('[LLM] Using Zhipu');
      return this._chatZhipu(messages, { temperature, maxTokens, model });
    }

    console.warn('[LLM] No LLM configured, using mock response');
    return this._mockChat(messages);
  }

  /**
   * DeepSeek 模型调用
   */
  async _chatDeepSeek(messages, options = {}) {
    const { temperature = 0.7, maxTokens = 1000, model } = options;

    try {
      const response = await axios.post(
        `${this.deepseekApiBase}/chat/completions`,
        {
          model: model || this.deepseekModel,
          messages,
          temperature,
          max_tokens: maxTokens,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.deepseekApiKey}`,
          },
          timeout: 30000,
        }
      );

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
        model: response.data.model,
      };
    } catch (error) {
      console.error('[LLM] DeepSeek error:', error.message);
      throw new Error(`DeepSeek调用失败: ${error.message}`);
    }
  }

  /**
   * 豆包/智谱模型调用
   */
  async _chatZhipu(messages, options = {}) {
    const { temperature = 0.7, maxTokens = 1000, model } = options;

    try {
      const response = await axios.post(
        `${this.zhipuApiBase}/chat/completions`,
        {
          model: model || this.zhipuModel,
          messages,
          temperature,
          max_tokens: maxTokens,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.zhipuApiKey}`,
          },
          timeout: 30000,
        }
      );

      return {
        content: response.data.choices[0].message.content,
        usage: response.data.usage,
        model: response.data.model,
      };
    } catch (error) {
      console.error('[LLM] Zhipu error:', error.message);
      throw new Error(`智谱调用失败: ${error.message}`);
    }
  }

  /**
   * Mock 响应（无 API Key 时使用）
   */
  async _mockChat(messages) {
    const lastMessage = messages[messages.length - 1].content;

    return {
      content: `这是一个模拟响应。您的问题是：${lastMessage}\n\n（提示：请配置 DEEPSEEK_API_KEY 或 ZHIPU_API_KEY 环境变量以启用真实大模型）`,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: 'mock-model',
    };
  }
}

module.exports = new LLMService();
LLM_EOF

cat > "$PROJECT_DIR/backend/src/services/knowledgeRetrievalService.js" << 'KR_EOF'
/**
 * v2.1 知识库检索服务
 * 基于 pgvector 向量检索 + v2.1 knowledge_articles 表
 */

const { query } = require('../db');
const vectorService = require('./vectorService');
const embeddingService = require('./embeddingService');

class KnowledgeRetrievalService {
  constructor() {
    this.EMBEDDING_DIM = 512;
  }

  /**
   * 检索相关知识
   * @param {string} query - 用户查询
   * @param {number} topK - 返回结果数
   * @param {object} filters - 过滤条件
   */
  async retrieve(query, topK = 5, filters = {}) {
    try {
      // 1. 生成查询向量
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // 2. 检索 v2.1 knowledge_chunks
      let chunks;
      try {
        chunks = await this._retrieveFromV2(queryEmbedding, topK, filters);
        console.log(`[KnowledgeRetrieval] Retrieved ${chunks.length} chunks from v2`);
      } catch (v2Error) {
        console.warn('[KnowledgeRetrieval] v2 retrieve failed, falling back to v1:', v2Error.message);
        chunks = await this._retrieveFromV1(queryEmbedding, topK);
      }

      // 3. 获取关联的文章信息
      const articles = await this._getArticlesForChunks(chunks);

      // 4. 合并结果
      const results = {
        query,
        chunks,
        articles,
        sources: chunks.length > 0 ? 'v2.1' : 'v1',
      };

      return results;
    } catch (error) {
      console.error('[KnowledgeRetrieval] Error:', error);
      return { query, chunks: [], articles: [], error: error.message };
    }
  }

  /**
   * 从 v2.1 knowledge_chunks 检索
   */
  async _retrieveFromV2(queryEmbedding, topK, filters = {}) {
    const vecStr = embeddingService.vectorToSql(queryEmbedding);

    let whereClause = '';
    const params = [];

    if (filters.category_l1) {
      whereClause += ' AND ka.category_l1 = $1';
      params.push(filters.category_l1);
    }
    if (filters.layer) {
      whereClause += ' AND ka.layer = $2';
      params.push(filters.layer);
    }
    if (filters.status) {
      whereClause += ' AND ka.status = $3';
      params.push(filters.status);
    }
    if (filters.confidence) {
      whereClause += ' AND ka.confidence = $4';
      params.push(filters.confidence);
    }

    const sql = `
      SELECT 
        kc.id,
        kc.article_id,
        kc.chunk_index,
        kc.chunk_text,
        kc.chunk_type,
        kc.chunk_strategy,
        1 - (kc.chunk_embedding <=> '${vecStr}'::vector) AS similarity,
        ka.title,
        ka.category_l1,
        ka.category_l2,
        ka.layer,
        ka.status,
        ka.confidence
      FROM knowledge_chunks kc
      JOIN knowledge_articles ka ON kc.article_id = ka.id
      WHERE true
        ${whereClause}
      ORDER BY kc.chunk_embedding <=> '${vecStr}'::vector
      LIMIT $${params.length + 1}
    `;

    params.push(topK);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * 从 v1 fault_case_embeddings 检索（fallback）
   */
  async _retrieveFromV1(queryEmbedding, topK) {
    return await vectorService.searchSimilarCases(queryEmbedding, topK);
  }

  /**
   * 获取 chunk 对应的完整文章
   */
  async _getArticlesForChunks(chunks) {
    if (chunks.length === 0) return [];

    const articleIds = [...new Set(chunks.map(c => c.article_id || c.case_id))];

    if (articleIds.length === 0) return [];

    const placeholders = articleIds.map((_, i) => `$${i + 1}`).join(',');

    const result = await query(
      `SELECT * FROM knowledge_articles WHERE id IN (${placeholders})`,
      articleIds
    );

    return result.rows;
  }

  /**
   * 按知识文章检索（非向量）
   */
  async getArticlesByIds(ids) {
    if (!ids || ids.length === 0) return [];

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    const result = await query(
      `SELECT * FROM knowledge_articles WHERE id IN (${placeholders})`,
      ids
    );

    return result.rows;
  }

  /**
   * 按分类获取文章列表
   */
  async getArticlesByCategory(categoryL1, categoryL2 = null, limit = 20) {
    let sql = `
      SELECT * FROM knowledge_articles
      WHERE category_l1 = $1
    `;
    const params = [categoryL1];

    if (categoryL2) {
      sql += ` AND category_l2 = $2`;
      params.push(categoryL2);
      sql += ` LIMIT $3`;
      params.push(limit);
    } else {
      sql += ` LIMIT $2`;
      params.push(limit);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    const [articlesCount, chunksCount, categories] = await Promise.all([
      query('SELECT COUNT(*) FROM knowledge_articles'),
      query('SELECT COUNT(*) FROM knowledge_chunks'),
      query(`
        SELECT category_l1, COUNT(*) 
        FROM knowledge_articles 
        GROUP BY category_l1 
        ORDER BY COUNT(*) DESC
      `),
    ]);

    return {
      articlesCount: articlesCount.rows[0].count,
      chunksCount: chunksCount.rows[0].count,
      categories: categories.rows,
    };
  }
}

module.exports = new KnowledgeRetrievalService();
KR_EOF

cat > "$PROJECT_DIR/backend/src/services/agentService.js" << 'AGENT_EOF'
/**
 * v2.1 无人机智能体服务
 * 核心功能：
 * - 知识库 RAG 检索
 * - 无人机领域对话
 * - 拒绝无关问题
 * - 上下文记忆
 */

const llmService = require('./llmService');
const knowledgeRetrievalService = require('./knowledgeRetrievalService');

class AgentService {
  constructor() {
    this.SYSTEM_PROMPT = `你是"无人机医生"，一名专业的无人机维修与飞行技术专家。

## 角色设定
- 你的定位：专业、可信赖的无人机维修助手
- 你的知识领域：覆盖无人机全生命周期（选型、组装、飞行、维护、维修、考证、行业应用）
- 你的回答风格：专业、简洁、实用，避免过于技术化的术语

## 核心规则
### 1. 领域限制
- 只回答与无人机相关的问题
- 对于无关问题，礼貌拒绝："抱歉，我只专注于无人机领域的问题，无法回答这个话题。请提问无人机相关的内容。"

### 2. 回答风格
- 先理解用户问题，再结合知识库回答
- 回答应结构化，便于阅读
- 提供实用性的解决建议
- 不确定的问题，坦诚告知，不要编造

### 3. 知识库使用
- 使用检索到的知识库内容作为回答基础
- 引用知识库时，可以说"根据我们的知识库..."
- 不要直接暴露知识库的内部结构

### 4. 安全提醒
- 涉及飞行安全的问题，优先强调安全操作规范
- 建议用户在专业指导下进行维修

## 回答模板
### 故障诊断类
1. 问题理解
2. 可能原因（按可能性排序）
3. 排查步骤
4. 解决方案

### 技术咨询类
1. 问题解答
2. 注意事项
3. 相关建议

现在开始对话！`;

    this.MEMORY_DEPTH = 10; // 记住最近10轮对话
  }

  /**
   * 智能体对话
   * @param {string} userInput - 用户输入
   * @param {Array} conversationHistory - 对话历史
   * @param {object} options - 配置选项
   */
  async chat(userInput, conversationHistory = [], options = {}) {
    try {
      const { useRAG = true, topK = 5 } = options;

      // 1. 检索知识库
      let knowledgeContext = '';
      let sources = [];

      if (useRAG) {
        const retrieval = await knowledgeRetrievalService.retrieve(userInput, topK);
        sources = retrieval.articles;
        
        if (retrieval.chunks.length > 0) {
          knowledgeContext = this._formatKnowledgeContext(retrieval.chunks);
        }
      }

      // 2. 构建提示
      const messages = this._buildMessages(userInput, conversationHistory, knowledgeContext);

      // 3. 调用大模型
      const llmResponse = await llmService.chat(messages, {
        temperature: 0.7,
        maxTokens: 1500,
      });

      // 4. 返回结果
      return {
        success: true,
        reply: llmResponse.content,
        sources: sources.slice(0, 5), // 最多返回5个参考来源
        usage: llmResponse.usage,
        model: llmResponse.model,
      };
    } catch (error) {
      console.error('[Agent] Chat error:', error);
      return {
        success: false,
        error: '抱歉，我遇到了一些问题。请稍后重试。',
        details: error.message,
      };
    }
  }

  /**
   * 构建提示消息
   */
  _buildMessages(userInput, conversationHistory = [], knowledgeContext = '') {
    const messages = [];

    // 1. 系统提示
    let systemPrompt = this.SYSTEM_PROMPT;
    if (knowledgeContext) {
      systemPrompt += `

## 知识库检索结果（优先参考）
${knowledgeContext}
`;
    }

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // 2. 对话历史（截取最近 n 轮）
    const recentHistory = conversationHistory.slice(-this.MEMORY_DEPTH);
    messages.push(...recentHistory);

    // 3. 当前用户输入
    messages.push({
      role: 'user',
      content: userInput,
    });

    return messages;
  }

  /**
   * 格式化知识库上下文
   */
  _formatKnowledgeContext(chunks) {
    if (chunks.length === 0) return '';

    return chunks.map((chunk, i) => {
      const title = chunk.title || `参考信息 ${i + 1}`;
      const similarity = chunk.similarity ? `(相似度: ${chunk.similarity.toFixed(2)})` : '';
      
      return `
## ${title} ${similarity}
${chunk.chunk_text || chunk.content || ''}
`;
    }).join('\n');
  }

  /**
   * 简单测试：判断是否是无人机领域问题
   */
  isDroneRelated(query) {
    const keywords = [
      '无人机', 'drone', 'uav', '多旋翼', '四旋翼', '大疆', 'dji',
      '飞行', '飞控', '电调', '电机', '螺旋桨', '桨叶',
      '电池', '充电器', '图传', '摄像头', '云台',
      'GPS', '定位', '信号', '遥控器', '遥控器',
      '炸机', '坠机', '维修', '故障', '排查',
      '考证', 'CAAC', 'AOPA', '执照',
      '航拍', '植保', '巡检', '测绘',
    ];

    const lowerQuery = query.toLowerCase();
    return keywords.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
  }

  /**
   * 获取智能体状态
   */
  getStatus() {
    return {
      name: '无人机医生',
      version: '2.1',
      llmConfigured: !!(process.env.DEEPSEEK_API_KEY || process.env.ZHIPU_API_KEY),
      systemPromptLength: this.SYSTEM_PROMPT.length,
      memoryDepth: this.MEMORY_DEPTH,
    };
  }
}

module.exports = new AgentService();
AGENT_EOF

# 创建智能体路由
cat > "$PROJECT_DIR/backend/src/routes/agent.js" << 'ROUTE_EOF'
/**
 * v2.1 无人机智能体 API
 */

const express = require('express');
const router = express.Router();
const agentService = require('../services/agentService');
const knowledgeRetrievalService = require('../services/knowledgeRetrievalService');

/**
 * POST /api/agent/chat
 * 智能体对话接口
 */
router.post('/chat', async (req, res) => {
  try {
    const {
      message,
      conversationHistory = [],
      options = {},
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message 不能为空' });
    }

    const result = await agentService.chat(message, conversationHistory, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Agent Route] Chat error:', error);
    res.status(500).json({
      success: false,
      error: '智能体对话失败',
      details: error.message,
    });
  }
});

/**
 * GET /api/agent/status
 * 获取智能体状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = agentService.getStatus();
    
    // 获取知识库统计
    const knowledgeStats = await knowledgeRetrievalService.getStats();

    res.json({
      success: true,
      ...status,
      knowledge: knowledgeStats,
    });
  } catch (error) {
    console.error('[Agent Route] Status error:', error);
    res.status(500).json({
      success: false,
      error: '获取状态失败',
      details: error.message,
    });
  }
});

/**
 * POST /api/agent/retrieve
 * 知识库检索接口
 */
router.post('/retrieve', async (req, res) => {
  try {
    const { query, topK = 5, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query 不能为空' });
    }

    const retrieval = await knowledgeRetrievalService.retrieve(query, topK, filters);

    res.json({
      success: true,
      ...retrieval,
    });
  } catch (error) {
    console.error('[Agent Route] Retrieve error:', error);
    res.status(500).json({
      success: false,
      error: '检索失败',
      details: error.message,
    });
  }
});

module.exports = router;
ROUTE_EOF

# 更新 app.js
echo "🔧 更新 app.js..."

# 备份原 app.js
cp "$PROJECT_DIR/backend/src/app.js" "$PROJECT_DIR/backend/src/app.js.backup"

# 检查是否已经添加了智能体路由
if ! grep -q "agentRoutes" "$PROJECT_DIR/backend/src/app.js"; then
  # 在 require 部分添加
  sed -i '/const couponRoutes/i\const agentRoutes = require('\''./routes/agent'\'');' "$PROJECT_DIR/backend/src/app.js"
  
  # 在路由部分添加
  sed -i '/app.use.*coupon/a\app.use('\''/api/agent'\'', agentRoutes);' "$PROJECT_DIR/backend/src/app.js"
fi

# 重启服务
echo "🔄 重启服务..."
cd "$PROJECT_DIR"
docker compose --env-file .env.tencent -f docker-compose.tencent.yml restart backend

# 等待服务健康
echo "⏳ 等待服务健康..."
sleep 20

echo "🎉 v2.1 智能体部署完成！"
echo "========================================="
echo "📚 新增 API："
echo "   - POST /api/agent/chat - 智能体对话"
echo "   - GET  /api/agent/status - 获取状态"
echo "   - POST /api/agent/retrieve - 知识库检索"
echo ""
echo "🔑 配置提示："
echo "   - 请在 .env.tencent 中配置："
echo "   - DEEPSEEK_API_KEY 或 ZHIPU_API_KEY"
echo "   - API 才能正常工作"
echo ""
echo "🌐 测试地址：http://81.71.39.150"
