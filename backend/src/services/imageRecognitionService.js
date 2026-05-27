const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

/**
 * 图片识别服务
 * 支持多种场景：故障部位识别、APP报错截图识别、设备型号识别、飞行日志截图分析
 */

class ImageRecognitionService {
  constructor() {
    this.qwenApiKey = process.env.QWEN_API_KEY;
    this.qwenApiBase = process.env.QWEN_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1';
    this.qwenVisionModel = process.env.QWEN_VISION_MODEL || 'qwen-vl-max'; // 通义千问视觉模型
    this.kimiApiKey = process.env.KIMI_API_KEY;
    this.kimiApiBase = process.env.KIMI_API_BASE || 'https://api.moonshot.cn/v1';
    this.kimiVisionModel = process.env.KIMI_VISION_MODEL || 'moonshot-v1-32k-vision-preview';
  }

  /**
   * 识别图片
   * @param {string} imagePath - 图片路径
   * @param {string} scenario - 识别场景（fault/error/model/log）
   * @returns {Object} 识别结果
   */
  async recognizeImage(imagePath, scenario = 'fault') {
    if (!this.qwenApiKey && !this.kimiApiKey) {
      throw new Error('未配置图片识别API Key。请在环境变量中设置 QWEN_API_KEY 或 KIMI_API_KEY。');
    }

    try {
      // 读取图片并转换为base64
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);
      
      // 根据场景构建prompt
      const prompt = this.buildPrompt(scenario);
      
      // 优先使用通义千问VL API，否则使用Kimi Vision API
      if (this.qwenApiKey) {
        return await this.recognizeWithQwen(base64Image, mimeType, prompt, scenario);
      } else {
        return await this.recognizeWithKimi(base64Image, mimeType, prompt, scenario);
      }

    } catch (error) {
      console.error('Image recognition error:', error.response?.data || error.message);
      throw new Error('图片识别失败: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * 使用通义千问VL API识别图片
   */
  async recognizeWithQwen(base64Image, mimeType, prompt, scenario) {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      {
        model: this.qwenVisionModel,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { image: `data:${mimeType};base64,${base64Image}` },
                { text: prompt }
              ]
            }
          ]
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.qwenApiKey}`
        },
        timeout: 60000
      }
    );

    const result = response.data.output.choices[0].message.content[0].text;
    return this.parseResult(result, scenario);
  }

  /**
   * 使用Kimi Vision API识别图片
   */
  async recognizeWithKimi(base64Image, mimeType, prompt, scenario) {
    const response = await axios.post(
      `${this.kimiApiBase}/chat/completions`,
      {
        model: this.kimiVisionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: 'text', text: prompt }
            ]
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.kimiApiKey}`
        },
        timeout: 60000
      }
    );

    const result = response.data.choices[0].message.content;
    return this.parseResult(result, scenario);
  }

  /**
   * 根据场景构建prompt
   */
  buildPrompt(scenario) {
    const prompts = {
      fault: `你是一位专业的无人机故障诊断专家。请仔细分析这张无人机故障部位的照片，识别以下信息：

1. 故障部位：识别照片中显示的是无人机的哪个部件（如电机、螺旋桨、云台、电池、传感器、机臂、起落架等）

2. 故障类型：判断该部件出现了什么问题（如损坏、变形、断裂、磨损、烧毁、进水、堵塞等）

3. 严重程度：评估故障的严重程度（轻微/中等/严重）

4. 可能原因：分析导致该故障的可能原因

5. 维修建议：提供初步的维修或更换建议

请输出JSON格式：
{
  "component": "故障部位",
  "faultType": "故障类型",
  "severity": "严重程度",
  "possibleCauses": ["原因1", "原因2"],
  "repairSuggestion": "维修建议",
  "needProfessionalRepair": true/false
}`,

      error: `你是一位专业的无人机故障诊断专家。请仔细分析这张APP报错截图，识别以下信息：

1. 错误代码：识别截图中显示的错误代码（如Error 40001、E001等）

2. 错误提示：识别截图中显示的错误提示信息

3. 错误类型：判断错误属于哪个系统（如动力系统、导航系统、图传系统、传感器系统等）

4. 可能原因：分析导致该错误的可能原因

5. 解决方案：提供解决该错误的具体步骤

请输出JSON格式：
{
  "errorCode": "错误代码",
  "errorMessage": "错误提示",
  "errorType": "错误类型",
  "possibleCauses": ["原因1", "原因2"],
  "solutions": ["解决方案1", "解决方案2"],
  "needProfessionalRepair": true/false
}`,

      model: `你是一位专业的无人机品牌识别专家。请仔细分析这张无人机照片，识别以下信息：

1. 品牌：识别无人机的品牌（如大疆、道通、极飞、零零科技、普宙、哈博森、亿航等）

2. 型号：识别无人机的具体型号（如Mavic 3、EVO II、P100等）

3. 系列：识别无人机所属系列（如Mavic系列、EVO系列、P系列等）

4. 类型：判断无人机类型（消费级/行业级/植保机/载人机）

5. 特征：描述识别出的关键特征

请输出JSON格式：
{
  "brand": "品牌",
  "model": "型号",
  "series": "系列",
  "type": "类型",
  "features": ["特征1", "特征2"],
  "confidence": "识别置信度（高/中/低）"
}`,

      log: `你是一位专业的无人机飞行数据分析专家。请仔细分析这张飞行日志截图，识别以下信息：

1. 异常数据：识别日志中的异常数据或警告信息

2. 异常类型：判断异常属于哪个系统（如动力系统、导航系统、电池系统等）

3. 发生时间：识别异常发生的时间点

4. 可能原因：分析导致异常的可能原因

5. 影响评估：评估异常对飞行安全的影响

请输出JSON格式：
{
  "anomalies": [
    {
      "type": "异常类型",
      "time": "发生时间",
      "description": "异常描述",
      "severity": "严重程度"
    }
  ],
  "possibleCauses": ["原因1", "原因2"],
  "impactAssessment": "影响评估",
  "recommendations": ["建议1", "建议2"]
}`
    };

    return prompts[scenario] || prompts.fault;
  }

  /**
   * 解析识别结果
   */
  parseResult(result, scenario) {
    try {
      // 尝试提取JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // 如果无法解析，返回原始结果
      return {
        rawText: result,
        scenario: scenario
      };
    } catch (error) {
      console.error('Parse result error:', error);
      return {
        rawText: result,
        scenario: scenario,
        parseError: true
      };
    }
  }

  /**
   * 获取MIME类型
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * 删除临时文件
   */
  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    } catch (error) {
      console.error('Delete file error:', error);
    }
  }
}

// 单例模式
const imageRecognitionService = new ImageRecognitionService();

module.exports = imageRecognitionService;
