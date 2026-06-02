const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const ANALYZER_SCRIPT = path.join(__dirname, '../scripts/fcs_f8_ulog_analyzer.py');
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
const ANALYZER_TIMEOUT_MS = Number(process.env.FLIGHT_LOG_ANALYZER_TIMEOUT_MS || 180000);

function runAnalyzer(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [ANALYZER_SCRIPT, '--input', filePath], {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('飞行日志解析超时，请确认文件是否完整或稍后重试'));
    }, ANALYZER_TIMEOUT_MS);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `解析进程退出码 ${code}`;
        reject(new Error(message));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`飞行日志解析结果格式异常：${error.message}`));
      }
    });
  });
}

async function analyzeFlightLog(file) {
  if (!file || !file.path) {
    throw new Error('请上传 .ulg 飞行日志原文件');
  }

  const ext = path.extname(file.originalname || file.path).toLowerCase();
  if (ext !== '.ulg') {
    throw new Error('当前仅支持华科尔 FCS-F8 标准 ULog .ulg 原始日志');
  }

  const result = await runAnalyzer(file.path);
  return {
    ...result,
    originalName: file.originalname,
    parsedAt: new Date().toISOString(),
  };
}

async function removeUploadedFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[FlightLog] failed to remove upload:', error.message);
    }
  }
}

module.exports = {
  analyzeFlightLog,
  removeUploadedFile,
};
