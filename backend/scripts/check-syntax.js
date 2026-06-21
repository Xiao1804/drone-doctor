#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOTS = ['src', 'tests', 'migrations', 'scripts'];
const failures = [];
let checked = 0;

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (entry === 'node_modules') continue;
      walk(path.join(target, entry));
    }
    return;
  }

  if (!target.endsWith('.js')) return;
  checked += 1;
  const result = spawnSync(process.execPath, ['--check', target], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failures.push({ target, output: result.stderr || result.stdout });
  }
}

for (const root of ROOTS) walk(path.resolve(root));

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`Syntax check failed: ${failure.target}\n${failure.output}\n`);
  }
  process.exit(1);
}

process.stdout.write(`Syntax check passed: ${checked} JavaScript files\n`);
