import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { analyzeRepo } from '../analyzers/repoAnalyzer.js';
import { readFiles } from '../tools/fileReader.js';
import { fetchRepo } from '../tools/repoFetch.js';

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
