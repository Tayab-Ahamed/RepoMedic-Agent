import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';

import { runAnalysis } from '../index.js';

async function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = join(root, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf-8');
  }
}

test('runAnalysis recognizes hidden automation files in local repos', async (t) => {
  const repoDir = await mkdtemp(join(tmpdir(), 'repomedic-analysis-'));
  t.after(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  await writeFiles(repoDir, {
    '.gitignore': 'node_modules/\ncoverage/\n',
    '.github/workflows/validate.yml': 'name: Validate\n',
    '.github/dependabot.yml': 'version: 2\nupdates: []\n',
    'README.md': '# Fixture\n\n## Installation\n\n## Usage\n\n## Configuration\n\n## Contributing\n',
    'SECURITY.md': '# Security\n',
    'CONTRIBUTING.md': '# Contributing\n',
    'CODE_OF_CONDUCT.md': '# Code of Conduct\n',
    'LICENSE': 'MIT\n',
    'CHANGELOG.md': '# Changelog\n',
    'package-lock.json': '{}\n',
    'package.json': JSON.stringify({
      name: 'fixture-repo',
      version: '1.0.0',
      type: 'module',
      engines: { node: '>=18' },
      scripts: {
        test: 'node --test src/__tests__/*.test.js',
        'test:coverage': 'node --test --experimental-test-coverage src/__tests__/*.test.js'
      }
    }, null, 2),
    'src/index.js': 'export function sum(a, b) { return a + b; }\n',
    'src/__tests__/index.test.js': [
      "import assert from 'node:assert/strict';",
      "import test from 'node:test';",
      "import { sum } from '../index.js';",
      '',
      "test('sum', () => {",
      '  assert.equal(sum(1, 2), 3);',
      '});',
      ''
    ].join('\n')
  });

  const report = await runAnalysis({
    repo: repoDir,
    check_registry: false,
  });

  assert.equal(report.meta.repo, basename(repoDir));
  assert.equal(report.issues.some((issue) => issue.title === 'No CI/CD configuration found'), false);
  assert.equal(report.issues.some((issue) => issue.title === 'Dependabot not configured'), false);
  assert.equal(report.issues.some((issue) => issue.title === 'No testing framework detected'), false);
  assert.ok(report.breakdown.security >= 18);
  assert.ok(report.breakdown.tests >= 10);
});
