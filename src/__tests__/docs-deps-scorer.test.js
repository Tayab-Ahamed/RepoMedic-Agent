import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeDependencies } from '../analyzers/depAnalyzer.js';
import { analyzeDocs } from '../analyzers/docAnalyzer.js';
import { assembleReport, formatConsoleReport } from '../analyzers/scorer.js';
import { analyzeTests } from '../analyzers/testAnalyzer.js';
import { parseDependencies } from '../tools/dependencyParser.js';

test('docs, deps, tests, and scorer produce a coherent report', async () => {
  const tree = [
    { path: 'README.md', extension: '.md' },
    { path: 'SECURITY.md', extension: '.md' },
    { path: 'CONTRIBUTING.md', extension: '.md' },
    { path: 'CODE_OF_CONDUCT.md', extension: '.md' },
    { path: 'CHANGELOG.md', extension: '.md' },
    { path: 'LICENSE', extension: '' },
    { path: 'package.json', extension: '.json' },
    { path: 'package-lock.json', extension: '.json' },
    { path: 'src/index.js', extension: '.js' },
    { path: 'src/__tests__/index.test.js', extension: '.js' }
  ];

  const packageJson = {
    name: 'fixture',
    version: '1.0.0',
    type: 'module',
    scripts: {
      test: 'node --test src/__tests__/*.test.js',
      'test:coverage': 'node --test --experimental-test-coverage src/__tests__/*.test.js'
    },
    dependencies: {
      chalk: '^5.3.0'
    }
  };

  const fileContents = {
    'README.md': [
      '# Fixture',
      '',
      'A small project.',
      '',
      '## Installation',
      '',
      'Run `npm install`.',
      '',
      '## Usage',
      '',
      'Run `npm test`.',
      '',
      '## Configuration',
      '',
      'No environment variables are required.',
      '',
      '## Contributing',
      '',
      'Open a pull request.',
      '',
      '## License',
      '',
      'MIT'
    ].join('\n'),
    'package.json': JSON.stringify(packageJson, null, 2),
    'src/__tests__/index.test.js': [
      "import assert from 'node:assert/strict';",
      "import test from 'node:test';",
      "import { createReport } from '../index.js';",
      '',
      "test('placeholder', () => {",
      '  assert.equal(typeof createReport, "function");',
      '});',
      ''
    ].join('\n')
  };

  const docs = analyzeDocs({
    tree,
    fileContents,
    sourceFileResults: [
      {
        path: 'src/index.js',
        exports: [{ name: 'createReport', has_jsdoc: true }]
      }
    ],
    packageJson
  });

  const tests = analyzeTests({ tree, fileContents, packageJson });
  const deps = await analyzeDependencies({
    tree,
    fileContents,
    check_registry: false
  });

  const parsedDeps = await parseDependencies(fileContents['package.json'], {
    check_registry: false
  });

  assert.equal(parsedDeps.total_dependencies, 1);
  assert.equal(tests.framework, 'node:test');
  assert.equal(tests.has_coverage_config, true);
  assert.equal(docs.readme.path, 'README.md');
  assert.equal(docs.jsdoc.documented, 1);
  assert.ok(deps.dep_score >= 10);

  const report = assembleReport({
    repoAnalysis: {
      repo: 'fixture',
      branch: 'main',
      total_files: tree.length,
      primary_language: 'JavaScript',
      frameworks: [],
      architecture: 'flat',
      code_quality_score: 24,
      findings: []
    },
    securityResult: {
      security_score: 20,
      findings: []
    },
    docResult: docs,
    testResult: tests,
    depResult: deps,
    repoFetchResult: {
      repo: 'fixture',
      branch: 'main'
    }
  });

  const consoleOutput = formatConsoleReport(report);
  assert.equal(report.meta.repo, 'fixture');
  assert.match(consoleOutput, /RepoMedic Health Report/);
  assert.match(consoleOutput, new RegExp(String(report.score)));
});
