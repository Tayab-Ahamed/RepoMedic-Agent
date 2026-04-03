/**
 * fileReader.js
 * Reads and parses files from a local or in-memory file tree.
 * Extracts exports, headings, and basic code metrics.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const EXPORT_PATTERNS = [
  { type: 'function',   re: /^export\s+(?:async\s+)?function\s+(\w+)/m },
  { type: 'class',      re: /^export\s+class\s+(\w+)/m },
  { type: 'const',      re: /^export\s+const\s+(\w+)/m },
  { type: 'default',    re: /^export\s+default\s+(?:function|class)?\s*(\w*)/m },
  { type: 'type',       re: /^export\s+(?:type|interface)\s+(\w+)/m },
];

const JSDOC_RE = /\/\*\*[\s\S]*?\*\//g;

function extractExports(content) {
  const lines = content.split('\n');
  const exports = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { type, re } of EXPORT_PATTERNS) {
      const m = line.match(re);
      if (m) {
        // Check if previous non-empty line has JSDoc close */
        let has_jsdoc = false;
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          if (lines[j].trim() === '') continue;
          if (lines[j].trim().endsWith('*/')) { has_jsdoc = true; }
          break;
        }
        exports.push({ name: m[1] || '(default)', type, line: i + 1, has_jsdoc });
      }
    }
  }
  return exports;
}

function extractMarkdownHeadings(content) {
  const headings = [];
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  });
  return headings;
}

/**
 * Read and analyze a list of files.
 * @param {object} options
 * @param {string[]} options.files - file paths relative to repo_path
 * @param {string} options.repo_path - base path (local) or null
 * @param {object} options.in_memory_contents - { path: content } map (for GitHub-fetched repos)
 * @param {boolean} options.extract_exports
 * @param {boolean} options.extract_headings
 * @returns {Promise<object>}
 */
export async function readFiles({
  files = [],
  repo_path = null,
  in_memory_contents = {},
  extract_exports = false,
  extract_headings = false,
  max_file_size_kb = 256
} = {}) {
  const results = [];

  for (const filePath of files) {
    let content = null;

    // Try in-memory first (GitHub fetched)
    if (in_memory_contents[filePath] !== undefined) {
      content = in_memory_contents[filePath];
    } else if (repo_path) {
      try {
        const fullPath = join(repo_path, filePath);
        const buf = await readFile(fullPath);
        if (buf.length > max_file_size_kb * 1024) {
          results.push({ path: filePath, error: 'File too large, skipped' });
          continue;
        }
        content = buf.toString('utf-8');
      } catch (e) {
        results.push({ path: filePath, error: e.message });
        continue;
      }
    }

    if (content === null) {
      results.push({ path: filePath, error: 'Content not available' });
      continue;
    }

    const ext = filePath.split('.').pop()?.toLowerCase();
    const isJS = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext);
    const isMD = ['md', 'mdx', 'rst'].includes(ext);

    const result = {
      path: filePath,
      content,
      size_bytes: Buffer.byteLength(content, 'utf-8'),
      line_count: content.split('\n').length
    };

    if (extract_exports && isJS) {
      result.exports = extractExports(content);
    }
    if (extract_headings && isMD) {
      result.headings = extractMarkdownHeadings(content);
    }

    results.push(result);
  }

  return { results };
}

/**
 * Quick helper: get content of a single file from a tree.
 */
export function getFileContent(tree, filePath) {
  const node = tree.find(f => f.path === filePath || f.path.endsWith('/' + filePath));
  return node?.content || null;
}

/**
 * Find files matching a pattern in a tree.
 */
export function findFiles(tree, pattern) {
  if (typeof pattern === 'string') {
    return tree.filter(f => f.path.includes(pattern));
  }
  if (pattern instanceof RegExp) {
    return tree.filter(f => pattern.test(f.path));
  }
  return [];
}
