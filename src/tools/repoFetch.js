/**
 * repoFetch.js
 * Fetches repository file trees from GitHub REST API or local filesystem.
 * Zero system dependencies — uses Node.js built-ins + fetch API (Node 18+).
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, relative, extname, basename } from 'path';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm',
  '.ttf', '.woff', '.woff2', '.eot',
  '.mp4', '.mp3', '.wav', '.mov', '.avi',
  '.db', '.sqlite', '.sqlite3'
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', 'coverage', '__pycache__', '.idea', '.vscode'
]);

/**
 * Parse GitHub URL into owner/repo/branch.
 * @param {string} url
 * @returns {{ owner: string, repo: string, branch: string }}
 */
function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:\/|$)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2], branch: match[3] || 'main' };
}

/**
 * Build GitHub API request headers.
 */
function githubHeaders(pat) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'repomedic-agent/0.2.0'
  };
  if (pat) headers['Authorization'] = `token ${pat}`;
  return headers;
}

/**
 * Fetch file tree from GitHub API using git trees endpoint.
 */
async function fetchGitHubTree(owner, repo, branch, pat, maxFiles = 500) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, { headers: githubHeaders(pat) });

  if (res.status === 404) throw Object.assign(new Error('Repository not found'), { code: 'REPO_NOT_FOUND' });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Authentication required'), { code: 'AUTH_REQUIRED' });
  if (res.status === 429) throw Object.assign(new Error('Rate limited'), { code: 'RATE_LIMITED' });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const files = (data.tree || [])
    .filter(item => item.type === 'blob')
    .slice(0, maxFiles)
    .map(item => ({
      path: item.path,
      type: 'file',
      size: item.size || 0,
      extension: extname(item.path).toLowerCase(),
      sha: item.sha
    }));

  return {
    truncated: data.truncated || false,
    files
  };
}

/**
 * Fetch file content from GitHub.
 */
async function fetchGitHubFileContent(owner, repo, branch, filePath, pat) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  const res = await fetch(url, { headers: githubHeaders(pat) });
  if (!res.ok) return null;
  return res.text();
}

/**
 * Walk local filesystem recursively.
 */
async function walkLocalDir(dirPath, baseDir, maxFiles, results = []) {
  if (results.length >= maxFiles) return;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) break;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkLocalDir(join(dirPath, entry.name), baseDir, maxFiles, results);
    } else if (entry.isFile()) {
      const fullPath = join(dirPath, entry.name);
      const relPath = relative(baseDir, fullPath);
      let fileSize = 0;
      try {
        const s = await stat(fullPath);
        fileSize = s.size;
      } catch { /* ignore */ }
      results.push({
        path: relPath,
        fullPath,
        type: 'file',
        size: fileSize,
        extension: extname(entry.name).toLowerCase()
      });
    }
  }
  return results;
}

/**
 * Main fetch function — handles GitHub and local paths.
 *
 * @param {object} options
 * @param {string} options.source - GitHub URL or local path
 * @param {string} [options.branch]
 * @param {string} [options.github_pat]
 * @param {number} [options.max_files]
 * @param {boolean} [options.include_content]
 * @param {string[]} [options.content_extensions]
 * @returns {Promise<object>} Structured repository tree result
 */
export async function fetchRepo({
  source,
  branch = 'main',
  github_pat,
  max_files = 500,
  include_content = false,
  content_extensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.yaml', '.yml', '.md', '.env']
} = {}) {
  const isGitHub = source.startsWith('https://github.com') || source.startsWith('http://github.com');

  if (isGitHub) {
    const { owner, repo, branch: urlBranch } = parseGitHubUrl(source);
    const effectiveBranch = urlBranch || branch;
    const repoId = `${owner}/${repo}`;

    // Try main, then master if branch not explicitly set
    let treeResult;
    let resolvedBranch = effectiveBranch;
    try {
      treeResult = await fetchGitHubTree(owner, repo, effectiveBranch, github_pat, max_files);
    } catch (err) {
      if (err.code === 'REPO_NOT_FOUND' && effectiveBranch === 'main') {
        try {
          treeResult = await fetchGitHubTree(owner, repo, 'master', github_pat, max_files);
          resolvedBranch = 'master';
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    let tree = treeResult.files;
    const errors = [];

    // Optionally fetch content for selected files
    if (include_content) {
      const filesToFetch = tree.filter(f =>
        content_extensions.includes(f.extension) &&
        !BINARY_EXTENSIONS.has(f.extension) &&
        f.size < 256 * 1024 // 256KB limit
      );

      for (const file of filesToFetch) {
        try {
          const content = await fetchGitHubFileContent(owner, repo, resolvedBranch, file.path, github_pat);
          if (content !== null) file.content = content;
        } catch (e) {
          errors.push(`Failed to fetch ${file.path}: ${e.message}`);
        }
      }
    }

    return {
      repo: repoId,
      source_type: 'github',
      branch: resolvedBranch,
      fetched_at: new Date().toISOString(),
      total_files: tree.length,
      truncated: treeResult.truncated,
      tree,
      errors
    };

  } else {
    // Local path
    const { existsSync } = await import('fs');
    if (!existsSync(source)) {
      throw Object.assign(new Error(`Local path not found: ${source}`), { code: 'LOCAL_PATH_NOT_FOUND' });
    }

    const files = await walkLocalDir(source, source, max_files, []);
    let tree = files.map(f => ({
      path: f.path,
      type: f.type,
      size: f.size,
      extension: f.extension
    }));

    if (include_content) {
      for (const file of tree) {
        if (content_extensions.includes(file.extension) && !BINARY_EXTENSIONS.has(file.extension) && file.size < 256 * 1024) {
          try {
            file.content = await readFile(join(source, file.path), 'utf-8');
          } catch { /* skip unreadable */ }
        }
      }
    }

    return {
      repo: source,
      source_type: 'local',
      branch: null,
      fetched_at: new Date().toISOString(),
      total_files: tree.length,
      truncated: tree.length >= max_files,
      tree,
      errors: []
    };
  }
}
