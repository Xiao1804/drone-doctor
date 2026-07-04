const axios = require('axios');

const DEFAULT_API_BASE = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';

function getConfig(env = process.env) {
  return {
    apiKey: env.DEEPSEEK_API_KEY,
    apiBase: (env.DEEPSEEK_API_BASE || DEFAULT_API_BASE).replace(/\/$/, ''),
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

async function chatCompletion({
  messages,
  temperature = 0.2,
  maxTokens = 500,
  timeout = 30000,
  responseFormat,
  config = getConfig(),
}) {
  if (!config.apiKey) {
    const error = new Error('DeepSeek API is not configured');
    error.code = 'DEEPSEEK_NOT_CONFIGURED';
    throw error;
  }

  const body = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await axios.post(
    `${config.apiBase}/chat/completions`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      timeout,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('DeepSeek API returned an empty response');
  }

  return content;
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  getConfig,
  chatCompletion,
};
