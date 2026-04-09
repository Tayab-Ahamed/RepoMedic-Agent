#!/usr/bin/env node
/**
 * RepoMedic demo runner.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatConsoleReport } from '../src/analyzers/scorer.js';
import { runAnalysis } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEMO_REPO = 'https://github.com/expressjs/express';

async function runDemo() {
  const args = process.argv.slice(2);
  const repoFlag = args.findIndex((arg) => arg === '--repo' || arg === '-r');
  const isOffline = args.includes('--offline');
  const targetRepo = repoFlag !== -1 ? args[repoFlag + 1] : DEFAULT_DEMO_REPO;

  console.log('\n' + '='.repeat(55));
  console.log('  RepoMedic demo');
  console.log('='.repeat(55));
  console.log(`  Target: ${targetRepo}`);
  console.log('='.repeat(55) + '\n');

  if (isOffline) {
    const mockReport = JSON.parse(
      await readFile(join(__dirname, 'sample-report.json'), 'utf-8')
    );

    console.log(formatConsoleReport(mockReport));
    console.log('\nDemo complete (offline mode)\n');
    return;
  }

  try {
    console.log('Starting analysis pipeline...\n');
    const startTime = Date.now();

    const report = await runAnalysis({
      repo: targetRepo,
      branch: 'main',
      check_registry: true,
      onProgress: (message, icon) => {
        console.log(`  ${icon || '->'} ${message}`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outputPath = join(__dirname, 'live-report.json');

    console.log(formatConsoleReport(report));
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log('-'.repeat(55));
    console.log(`  Analysis completed in ${elapsed}s`);
    console.log('  Full JSON report: example-usage/live-report.json');
    console.log(`  Score: ${report.score}/100 (${report.grade})`);
    console.log(`  Total findings: ${report.meta.total_findings}`);
    console.log('-'.repeat(55) + '\n');

    if (report.ai_insights.top_issues.length > 0) {
      console.log('Top issues:');
      for (const issue of report.ai_insights.top_issues) {
        console.log(`  ${issue.rank}. [${issue.severity.toUpperCase()}] ${issue.title}`);
        console.log(`     ${issue.one_liner}`);
      }
      console.log('');
    }

    if (report.ai_insights.quick_wins.length > 0) {
      console.log('Quick wins:');
      for (const win of report.ai_insights.quick_wins) {
        console.log(`  - ${win.title}`);
        if (win.action) {
          console.log(`    Action: ${win.action.substring(0, 80)}`);
        }
      }
      console.log('');
    }

    if (report.ai_insights.risks.length > 0) {
      console.log('Risk radar:');
      for (const risk of report.ai_insights.risks) {
        console.log(`  - [${risk.probability.toUpperCase()} / ${risk.impact.toUpperCase()}] ${risk.title}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`\nDemo failed: ${err.message}`);
    console.error('Try running with --offline to see the bundled sample report.');
    console.error('If you expected a live run, check internet access and try again.\n');
    process.exit(1);
  }
}

await runDemo();