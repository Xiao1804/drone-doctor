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
 * 带严格输入校验，防止 SQL 注入
 * @param {number[]} vector
 * @returns {string} '[0.1,0.2,...]'
 */
function vectorToSql(vector) {
  // 校验：必须是数组
  if (!Array.isArray(vector)) {
    throw new Error(`vectorToSql: expected array, got ${typeof vector}`);
  }

  // 校验：维度必须匹配
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `vectorToSql: expected dimension ${EMBEDDING_DIM}, got ${vector.length}`
    );
  }

  // 校验：每个元素必须是有限数字
  const formatted = vector.map((v, i) => {
    const num = Number(v);
    if (!Number.isFinite(num)) {
      throw new Error(
        `vectorToSql: element at index ${i} is not a finite number (got ${v})`
      );
    }
    return num.toFixed(6);
  });

  return '[' + formatted.join(',') + ']';
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
 * 分块策略：将文章内容切分为多个 chunk
 * @param {string} content - 文章内容
 * @param {string} strategy - 分块策略 ('fault_diagnosis', 'knowledge', 'api_doc', 'quiz')
 * @returns {Array<{index: number, text: string, type: string, strategy: string}>}
 */
function chunkContent(content, strategy = 'fault_diagnosis') {
  if (!content) return [];

  const chunks = [];
  const maxChunkSize = strategy === 'api_doc' ? 500 : strategy === 'quiz' ? 1000 : 800;

  // 简单分块策略（v2.1 基础实现）
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());

  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // 检测标题
    const isHeading = trimmedPara.match(/^#{1,6}\s+/) || trimmedPara.match(/^[一二三四五六七八九十]+、/);
    const chunkType = isHeading ? 'heading' : 'paragraph';

    // 如果当前 chunk 加上新段落超过限制，则保存当前 chunk
    if (currentChunk.length + trimmedPara.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        type: 'paragraph',
        strategy,
      });
      currentChunk = '';
    }

    // 如果是大标题且当前 chunk 有内容，则先保存
    if (isHeading && currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        type: 'paragraph',
        strategy,
      });
      currentChunk = '';
    }

    // 添加到当前 chunk
    currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
  }

  // 添加最后一个 chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex++,
      text: currentChunk.trim(),
      type: 'paragraph',
      strategy,
    });
  }

  return chunks;
}

/**
 * 生成知识文章的所有 chunk 及其 embeddings
 * @param {string} articleId - 文章 ID
 * @param {string} content - 文章内容
 * @param {string} strategy - 分块策略
 * @param {Object} db - 数据库连接
 * @returns {Promise<Array>}
 */
async function embedArticleChunks(articleId, content, strategy = 'fault_diagnosis', db = null) {
  const chunks = chunkContent(content, strategy);

  if (chunks.length === 0) {
    return [];
  }

  // 生成所有 chunk 的 embeddings
  const chunkTexts = chunks.map(c => c.text);
  const embeddings = await generateEmbedding(chunkTexts);

  // 组合结果
  const embeddedChunks = chunks.map((chunk, index) => ({
    article_id: articleId,
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    chunk_embedding: embeddings[index],
    chunk_type: chunk.type,
    chunk_strategy: chunk.strategy,
    token_count: null, // 可选：添加 token 计数
  }));

  return embeddedChunks;
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
  chunkContent,
  embedArticleChunks,
  EMBEDDING_DIM,
};
