const { pipeline, env } = require('@xenova/transformers');

/**
 * Embedding 服务
 * 使用 bge-small-zh-v1.5 ONNX 模型（~50MB，CPU推理）
 * 输出 512 维向量，用于中文语义检索
 */

// 配置 transformers.js 使用本地模型（避免运行时下载）
env.localModelPath = process.env.LOCAL_MODEL_PATH || './models';
env.allowRemoteModels = false;
env.allowLocalModels = true;

let embedder = null;
let isLoading = false;
let loadPromise = null;

// 模型配置
const MODEL_NAME = 'Xenova/bge-small-zh-v1.5';
const EMBEDDING_DIM = 512;

/**
 * 初始化 embedding 模型（单例，延迟加载）
 */
async function initEmbedder() {
  if (embedder) return embedder;
  if (loadPromise) return loadPromise;

  isLoading = true;
  console.log(`[Embedding] Loading local model ${MODEL_NAME} from ${env.localModelPath}...`);

  loadPromise = pipeline('feature-extraction', MODEL_NAME, {
    quantized: true, // 使用量化模型，更小更快
  }).then(model => {
    embedder = model;
    isLoading = false;
    console.log('[Embedding] Model loaded successfully');
    return model;
  }).catch(err => {
    isLoading = false;
    loadPromise = null;
    console.error('[Embedding] Failed to load model:', err.message);
    throw err;
  });

  return loadPromise;
}

/**
 * 生成文本的 embedding 向量
 * @param {string|string[]} texts - 输入文本（支持批量）
 * @returns {number[][]} 向量数组，每个向量 512 维
 */
async function generateEmbedding(texts) {
  const model = await initEmbedder();

  const inputTexts = Array.isArray(texts) ? texts : [texts];

  // 清洗文本
  const cleanedTexts = inputTexts.map(t =>
    String(t)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 512)
  );

  // 逐个处理（避免 batch 处理时的维度问题）
  const embeddings = [];
  for (const text of cleanedTexts) {
    const result = await model(text, {
      pooling: 'mean',
      normalize: true,
    });
    embeddings.push(Array.from(result.data));
  }

  return Array.isArray(texts) ? embeddings : embeddings[0];
}

/**
 * 将向量数组转为 PostgreSQL vector 字符串格式
 * @param {number[]} vector
 * @returns {string} '[0.1,0.2,...]'
 */
function vectorToSql(vector) {
  return '[' + vector.map(v => Number(v).toFixed(6)).join(',') + ']';
}

/**
 * 计算两个向量的余弦相似度
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} 0-1
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 获取模型状态
 */
function getStatus() {
  return {
    model: MODEL_NAME,
    dim: EMBEDDING_DIM,
    loaded: !!embedder,
    loading: isLoading,
  };
}

module.exports = {
  initEmbedder,
  generateEmbedding,
  vectorToSql,
  cosineSimilarity,
  getStatus,
  EMBEDDING_DIM,
};
