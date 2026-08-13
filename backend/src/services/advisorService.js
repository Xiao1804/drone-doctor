/**
 * 无人机选购参谋智能体服务
 * 克隆自 agentService.js，独立系统提示词 + 选购知识库隔离
 * 核心功能：
 * - 反向交互式选购咨询（一次问一项、给建议选项）
 * - 选购知识库 RAG 检索（category_l1='purchase' 隔离）
 * - 推荐时声明信息来源与时效性
 */

const llmService = require('./llmService');
const knowledgeRetrievalService = require('./knowledgeRetrievalService');

class AdvisorService {
  constructor() {
    this.SYSTEM_PROMPT = `你是"无人机选购参谋"，一位专业的无人机选购顾问。你的任务不是直接推荐，而是通过对话一项一项帮用户把需求问清楚，再给推荐。

## 核心交互规则
1. 每次只问用户一个问题，等用户回答完再问下一个，不要一次抛出多个问题。
2. 每个问题给用户2到3个建议选项，但最终以用户的回答为准，不要替用户做决定。
3. 如果用户说"不知道"或"随便"，你基于常见情况给一个建议范围，并说明理由，让用户确认或调整。
4. 如果用户的回答含糊或影响推荐方向（比如"都想要""偶尔""看情况""差不多"），不要直接记下来进下一项，先追问一个限定性问题。举例：用户说"室内也想飞"，你要追问"室内是高频场景还是偶尔玩玩"；用户说"都想要"，你要追问"如果预算只够选两项，优先保哪个"。追问完再进下一项。
5. 问完需求后，把用户的回答整理成一张表格给用户看。整理表格时，如果发现需求之间、或需求与预算之间有矛盾，必须在表格下方单独列出"需要你确认的矛盾点"，每个矛盾点给一个你的建议倾向，让用户在确认环节就有机会调整需求。
6. 推荐时给用户2到3款机型，每款包括型号、为什么适配、最大的短板、同价位替代款、一句话购买建议。如果需求或预算有矛盾，直接指出并给调整建议。

## 信息来源规则
推荐前必须声明："以下机型信息基于知识库中的公开资料，参数和价格可能已变动，请以厂商最新报价和本地经销商实际成交价为准。"每个推荐机型尽量标注信息来源。

## 领域限制
- 只回答与无人机选购相关的问题
- 对于维修、考证等非选购问题，礼貌引导："我是选购参谋，主要帮你选机型。维修问题建议使用网站的维修诊断功能。"

## 回答风格
- 先理解用户需求，再结合知识库推荐
- 结构化回答，便于阅读
- 不确定的信息坦诚告知，不要编造参数或价格

## 需要问清楚的需求维度（根据用户情况灵活调整，不固定顺序）
1. 使用者类型：新手还是有经验的玩家，有没有执照
2. 预算区间：含不含配件
3. 主要用途：航拍、短视频、测绘、植保、巡检、吊运等
4. 必须功能：避障、图传、续航、画质等
5. 使用环境：城市、野外、海边、室内、山地等
6. 作业规模（工业级）：面积、距离、频率

现在开始对话！`;

    this.MEMORY_DEPTH = 10; // 记住最近10轮对话
    this.KNOWLEDGE_CATEGORY = 'purchase'; // 选购知识库隔离标记
  }

  /**
   * 选购参谋对话
   * @param {string} userInput - 用户输入
   * @param {Array} conversationHistory - 对话历史
   * @param {object} options - 配置选项
   */
  async chat(userInput, conversationHistory = [], options = {}) {
    try {
      const { useRAG = true, topK = 5 } = options;

      // 1. 检索选购知识库（隔离 category_l1='purchase'）
      let knowledgeContext = '';
      let sources = [];

      if (useRAG) {
        const retrieval = await knowledgeRetrievalService.retrieve(userInput, topK, {
          category_l1: this.KNOWLEDGE_CATEGORY,
        });
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
        sources: sources.slice(0, 5),
        usage: llmResponse.usage,
        model: llmResponse.model,
      };
    } catch (error) {
      console.error('[Advisor] Chat error:', error);
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

## 知识库检索结果（机型参考，优先使用）
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
      name: '无人机选购参谋',
      version: process.env.APP_VERSION || require('../../package.json').version,
      llmConfigured: !!(process.env.DEEPSEEK_API_KEY || process.env.ZHIPU_API_KEY),
      systemPromptLength: this.SYSTEM_PROMPT.length,
      memoryDepth: this.MEMORY_DEPTH,
    };
  }
}

module.exports = new AdvisorService();
