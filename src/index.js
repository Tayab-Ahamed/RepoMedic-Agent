#!/usr/bin/env node
/**
 * RepoMedic Agent — Main Orchestrator
 * Runs all 6 skills in sequence and outputs a full health report.
 *
 * Usage:
 *   node src/index.js --repo https://github.com/owner/repo
 *   node src/index.js --repo ./local/path --output report.json
 *   node src/index.js --repo https://github.com/owner/repo --pat ghp_xxx
 */

import { fetchRepo }        from './tools/repoFetch.js';
import { analyzeRepo }      from './analyzers/repoAnalyzer.js';
import { analyzeSecurity }  from './analyzers/securityAnalyzer.js';
import { analyzeDocs }      from './analyzers/docAnalyzer.js';
import { analyzeTests }     from './analyzers/testAnalyzer.js';
import { analyzeDependencies } from './analyzers/depAnalyzer.js';
import { assembleReport, formatConsoleReport } from './analyzers/scorer.js';
import { readFiles } from './tools/fileReader.js';
import { writeFile } from 'fs/promises';
import { parseArgs } from 'util';

// ─── CLI Argument Parsing ─────────────────────────────────────────────────

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      repo:          { type: 'string',  short: 'r' },
      branch:        { type: 'string',  short: 'b', default: 'main' },
      pat:           { type: 'string',  short: 'p' },
      output:        { type: 'string',  short: 'o' },
      'no-registry': { type: 'boolean', default: false },
      json:          { type: 'boolean', short: 'j', default: false },
      help:          { type: 'boolean', short: 'h', default: false },
    },
    strict: false
  });
  return values;
}

function printHelp() {
  console.log(`
🏥 RepoMedic — Repository Health Agent

USAGE
  node src/index.js [options]

OPTIONS
  --repo,   -r  <url|path>   GitHub URL or local path (required)
  --branch, -b  <branch>     Branch to analyze (default: main)
  --pat,    -p  <token>      GitHub PAT for private repos
  --output, -o  <file>       Save JSON report to file
  --json,   -j               Print raw JSON only (no UI)
  --no-registry              Skip npm registry checks (faster, offline mode)
  --help,   -h               Show this help

EXAMPLES
  node src/index.js --repo https://github.com/expressjs/express
  node src/index.js --repo ./my-project --output report.json
  node src/index.js --repo https://github.com/org/private-repo --pat ghp_xxx
  `);
}

// ─── Progress Logger ──────────────────────────────────────────────────────

function log(msg, icon = '→') {
  const time = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`  ${icon} [${time}] ${msg}`);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────

export async function runAnalysis({
  repo,
  branch = 'main',
  pat,
  check_registry = true,
  onProgress = () => {}
}) {
  if (!repo) throw new Error('--repo is required. Use --help for usage.');

  // ── Step 1: Fetch Repository ───────────────────────────────────────────
  onProgress('Fetching repository structure...', '📡');
  const fetchResult = await fetchRepo({
    source: repo,
    branch,
    github_pat: pat,
    max_files: 800,
    include_content: true,
    content_extensions: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
                         '.json', '.yaml', '.yml', '.md', '.env', '.npmrc', '.gitignore']
  });

  // Build in-memory content map
  const fileContents = {};
  for (const file of fetchResult.tree) {
    if (file.content !== undefined) fileContents[file.path] = file.content;
  }

  onProgress(`Fetched ${fetchResult.total_files} files from ${fetchResult.repo}`, '✅');

  // ── Step 2: Parse package.json ─────────────────────────────────────────
  let packageJson = null;
  if (fileContents['package.json']) {
    try { packageJson = JSON.parse(fileContents['package.json']); } catch { /* ignore */ }
  }

  // ── Skill 1: Repo Analysis ─────────────────────────────────────────────
  onProgress('Running skill: repo-analysis...', '🔍');
  const repoAnalysis = analyzeRepo(fetchResult, packageJson);

  // ── Skill 2: Security Scan ─────────────────────────────────────────────
  onProgress('Running skill: security-scan (SecretSweep)...', '🔒');
  const securityResult = analyzeSecurity({ tree: fetchResult.tree, fileContents });

  // ── Skill 3: Doc Analysis ──────────────────────────────────────────────
  onProgress('Running skill: doc-analysis (DocDrift)...', '📝');
  // For JSDoc analysis, read source files with export extraction
  const sourceFilePaths = fetchResult.tree
    .filter(f => ['.js', '.ts', '.jsx', '.tsx'].includes(f.extension) && !f.path.includes('test') && !f.path.includes('spec'))
    .map(f => f.path)
    .slice(0, 100);
  const { results: sourceFileResults } = await readFiles({
    files: sourceFilePaths,
    in_memory_contents: fileContents,
    extract_exports: true
  });
  const docResult = analyzeDocs({
    tree: fetchResult.tree,
    fileContents,
    sourceFileResults,
    packageJson
  });

  // ── Skill 4: Test Analysis ─────────────────────────────────────────────
  onProgress('Running skill: test-analysis...', '🧪');
  const testResult = analyzeTests({ tree: fetchResult.tree, fileContents, packageJson });

  // ── Skill 5: Dependency Analysis ──────────────────────────────────────
  onProgress('Running skill: dependency-analysis...', '📦');
  const depResult = await analyzeDependencies({
    tree: fetchResult.tree,
    fileContents,
    check_registry
  });

  // ── Skill 6: Scoring ───────────────────────────────────────────────────
  onProgress('Running skill: scoring (assembling report)...', '📊');
  const report = assembleReport({
    repoAnalysis,
    securityResult,
    docResult,
    testResult,
    depResult,
    repoFetchResult: fetchResult
  });

  return report;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────

async function main() {
  const args = parseCliArgs();

  if (args.help || (!args.repo && !args.r)) {
    printHelp();
    process.exit(0);
  }

  const repo = args.repo || args.r;
  if (!repo) {
    console.error('Error: --repo is required.');
    printHelp();
    process.exit(1);
  }

  if (!args.json) {
    console.log('\n🏥 RepoMedic — Repository Health Analyzer');
    console.log('━'.repeat(50));
  }

  try {
    const report = await runAnalysis({
      repo,
      branch: args.branch || 'main',
      pat: args.pat,
      check_registry: !args['no-registry'],
      onProgress: (msg, icon) => {
        if (!args.json) log(msg, icon);
      }
    });

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatConsoleReport(report));
    }

    if (args.output) {
      await writeFile(args.output, JSON.stringify(report, null, 2), 'utf-8');
      if (!args.json) console.log(`\n📁 Full report saved to: ${args.output}\n`);
    }

    // Exit with non-zero if grade is D or below
    const badGrades = ['D', 'E', 'F'];
    process.exit(badGrades.includes(report.grade) ? 1 : 0);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.code) console.error(`   Code: ${err.code}`);
    process.exit(2);
  }
}

main();
