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
   * 获取智能体状态
   */
  getStatus() {
    return {
      name: '无人机医生',
      version: process.env.APP_VERSION || require('../../package.json').version,
      llmConfigured: !!(process.env.DEEPSEEK_API_KEY || process.env.ZHIPU_API_KEY),
      systemPromptLength: this.SYSTEM_PROMPT.length,
      memoryDepth: this.MEMORY_DEPTH,
    };
  }
}

module.exports = new AgentService();
