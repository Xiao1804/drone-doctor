/**
 * v2.1 大语言模型服务
 * 支持 DeepSeek、豆包等多种模型
 */

const axios = require('axios');

class LLMService {
  constructor() {
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    this.deepseekApiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com';
    this.deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    this.zhipuApiKey = process.env.ZHIPU_API_KEY;
    this.zhipuApiBase = process.env.ZHIPU_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';
    this.zhipuModel = process.env.ZHIPU_MODEL || 'GLM-4-Flash';
    this.qwenApiKey = process.env.QWEN_API_KEY;
    this.qwenApiBase = process.env.QWEN_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.qwenModel = process.env.QWEN_MODEL || 'qwen-plus';
  }

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
    if (this.qwenApiKey) {
      console.log('[LLM] Using Qwen');
      return this._chatOpenAICompatible(messages, { 
        apiKey: this.qwenApiKey,
        apiBase: this.qwenApiBase,
        model: model || this.qwenModel,
        temperature, maxTokens,
        name: 'Qwen'
      });
    }
    console.warn('[LLM] No LLM configured, using mock response');
    return this._mockChat(messages);
  }

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

  async _mockChat(messages) {
    const lastMessage = messages[messages.length - 1].content;
    return {
      content: `这是一个模拟响应。您的问题是：${lastMessage}\n\n（提示：请配置 DEEPSEEK_API_KEY、ZHIPU_API_KEY 或 QWEN_API_KEY 环境变量以启用真实大模型）`,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: 'mock-model',
    };
  }

  async _chatOpenAICompatible(messages, options) {
    const { apiKey, apiBase, model, temperature = 0.7, maxTokens = 1000, name } = options;
    try {
      const response = await axios.post(
        `${apiBase}/chat/completions`,
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
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
      console.error(`[LLM] ${name} error:`, error.message);
      throw new Error(`${name}调用失败: ${error.message}`);
    }
  }
}

module.exports = new LLMService();
