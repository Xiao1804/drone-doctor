const fs = require('fs');
const path = require('path');

function normalizeCandidate(filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
}

function resolveFaultCasesFile() {
  const candidates = [
    process.env.FAULT_CASES_FILE,
    path.join(__dirname, '../../data/fault-cases-enhanced.json'),
    path.join(__dirname, '../../../data/fault-cases-enhanced.json')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = normalizeCandidate(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return normalizeCandidate(candidates[candidates.length - 1]);
}

module.exports = {
  resolveFaultCasesFile
};
