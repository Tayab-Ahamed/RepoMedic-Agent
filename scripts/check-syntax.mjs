#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOTS = ['src', 'example-usage', 'scripts'];
const JS_EXTENSIONS = new Set(['.js', '.mjs']);

async function collectFiles(dir, results = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, results);
      continue;
    }

    const extension = fullPath.slice(fullPath.lastIndexOf('.'));
    if (JS_EXTENSIONS.has(extension)) {
      results.push(fullPath);
    }
  }

  return results;
}

async function main() {
  const files = [];
  for (const root of ROOTS) {
    await collectFiles(root, files);
  }

  let hasErrors = false;
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

await main();
