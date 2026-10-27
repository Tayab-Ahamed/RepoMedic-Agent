import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { analyzeRepo } from '../analyzers/repoAnalyzer.js';
import { readFiles } from '../tools/fileReader.js';
import { fetchRepo } from '../tools/repoFetch.js';

test('fetchRepo honors the branch option when the URL has no tree ref', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    if (String(url).includes('/git/trees/')) {
      return new Response(JSON.stringify({
        tree: [{ type: 'blob', path: 'README.md', size: 12, sha: 'fixture' }],
        truncated: false
      }));
    }
    return new Response('release notes');
  });

  const result = await fetchRepo({
    source: 'https://github.com/example/project',
    branch: 'release',
    include_content: true
  });

  assert.equal(result.branch, 'release');
  assert.ok(requests[0].includes('/git/trees/release?'));
  assert.ok(requests[1].includes('/project/release/README.md'));
  assert.equal(result.tree[0].content, 'release notes');
});

test('fetchRepo keeps an explicit URL tree ref ahead of the branch option', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    tree: [],
    truncated: false
  })));

  const result = await fetchRepo({
    source: 'https://github.com/example/project/tree/develop',
    branch: 'release'
  });

  assert.equal(result.branch, 'develop');
});


async function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = join(root, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf-8');
  }
}

test('fetchRepo normalizes local paths and reads hidden dotfiles', async (t) => {
  const repoDir = await mkdtemp(join(tmpdir(), 'repomedic-fetch-'));
  t.after(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  await writeFiles(repoDir, {
    '.npmrc': `//registry.npmjs.org/:${['_auth', 'Token'].join('')}=\${NPM_TOKEN}\n`,
    '.github/workflows/validate.yml': 'name: Validate\n',
    'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2),
    'src/service.js': [
      '/** Adds two values. */',
      'export function add(a, b) {',
      '  return a + b;',
      '}',
      ''
    ].join('\n')
  });

  const fetchResult = await fetchRepo({
    source: repoDir,
    include_content: true,
    content_extensions: ['.js', '.json']
  });

  assert.ok(fetchResult.tree.some((file) => file.path === '.github/workflows/validate.yml'));
  assert.ok(fetchResult.tree.some((file) => file.path === '.npmrc' && typeof file.content === 'string'));

  const packageJson = JSON.parse(fetchResult.tree.find((file) => file.path === 'package.json').content);
  const repoAnalysis = analyzeRepo(fetchResult, packageJson);
  assert.equal(repoAnalysis.has_ci, true);

  const { results } = await readFiles({
    files: ['src/service.js'],
    in_memory_contents: {
      'src/service.js': fetchResult.tree.find((file) => file.path === 'src/service.js').content
    },
    extract_exports: true
  });

  assert.equal(results[0].exports[0].name, 'add');
  assert.equal(results[0].exports[0].has_jsdoc, true);
});
