jest.mock('axios');

const axios = require('axios');
const deepSeekService = require('../src/services/deepSeekService');
const { ImageRecognitionService } = require('../src/services/imageRecognitionService');

describe('AI provider configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('uses the current DeepSeek text endpoint and disables thinking', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '{"answer":"ok"}' } }] },
    });

    const content = await deepSeekService.chatCompletion({
      config: deepSeekService.getConfig(),
      messages: [{ role: 'user', content: 'return json' }],
      responseFormat: { type: 'json_object' },
    });

    expect(content).toBe('{"answer":"ok"}');
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        model: 'deepseek-v4-flash',
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-deepseek-key' }),
      })
    );
  });

  test('uses the standard Zhipu API for GLM image recognition', async () => {
    process.env.ZHIPU_API_KEY = 'test-zhipu-key';
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '{"component":"motor"}' } }] },
    });

    const service = new ImageRecognitionService();
    const result = await service.recognizeWithGLM('base64-data', 'image/png', 'inspect', 'fault');

    expect(result).toEqual({ component: 'motor' });
    expect(axios.post).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      expect.objectContaining({
        model: 'glm-4.6v-flash',
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'data:image/png;base64,base64-data' } },
              { type: 'text', text: 'inspect' },
            ],
          },
        ],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-zhipu-key' }),
      })
    );
  });
});
