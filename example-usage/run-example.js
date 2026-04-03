#!/usr/bin/env node
/**
 * RepoMedic — Demo Runner
 *
 * Runs the agent against a real public GitHub repository and prints the full report.
 * Uses the express.js repo as a canonical test target.
 *
 * Usage:
 *   node example-usage/run-example.js
 *   node example-usage/run-example.js --repo https://github.com/your/repo
 *   node example-usage/run-example.js --offline   (uses bundled mock data)
 */

import { runAnalysis }       from '../src/index.js';
import { formatConsoleReport } from '../src/analyzers/scorer.js';
import { writeFile }         from 'fs/promises';
import { join, dirname }     from 'path';
import { fileURLToPath }     from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DEMO_REPO = 'https://github.com/expressjs/express';

async function runDemo() {
  const args = process.argv.slice(2);
  const repoFlag = args.findIndex(a => a === '--repo' || a === '-r');
  const isOffline = args.includes('--offline');

  const targetRepo = repoFlag !== -1 ? args[repoFlag + 1] : DEFAULT_DEMO_REPO;

  console.log('\n' + '═'.repeat(55));
  console.log('  🏥 RepoMedic — Hackathon Demo Run');
  console.log('═'.repeat(55));
  console.log(`  Target: ${targetRepo}`);
  console.log('═'.repeat(55) + '\n');

  if (isOffline) {
    // Load pre-bundled mock report for offline demos
    const { default: mockReport } = await import('./sample-report.json', { assert: { type: 'json' } });
    console.log(formatConsoleReport(mockReport));
    console.log('\n✅ Demo complete (offline mode — showing sample report)\n');
    return;
  }

  try {
    console.log('Starting analysis pipeline...\n');
    const startTime = Date.now();

    const report = await runAnalysis({
      repo: targetRepo,
      branch: 'main',
      check_registry: true,
      onProgress: (msg, icon) => {
        console.log(`  ${icon || '→'} ${msg}`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Console display
    console.log(formatConsoleReport(report));

    // Save to file
    const outputPath = join(__dirname, 'live-report.json');
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log('━'.repeat(55));
    console.log(`  ⏱  Analysis completed in ${elapsed}s`);
    console.log(`  📁  Full JSON report: example-usage/live-report.json`);
    console.log(`  📊  Score: ${report.score}/100 (${report.grade} — ${report.label})`);
    console.log(`  🔍  Total findings: ${report.meta.total_findings}`);
    console.log('━'.repeat(55) + '\n');

    // Print top 5 issues summary
    if (report.ai_insights.top_issues.length > 0) {
      console.log('🔴 TOP 5 ISSUES:');
      for (const issue of report.ai_insights.top_issues) {
        const sev = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${issue.rank}. ${sev} [${issue.severity.toUpperCase()}] ${issue.title}`);
        console.log(`      → ${issue.one_liner}`);
      }
      console.log('');
    }

    if (report.ai_insights.quick_wins.length > 0) {
      console.log('✅ QUICK WINS:');
      for (const win of report.ai_insights.quick_wins) {
        console.log(`  • ${win.title}`);
        if (win.action) console.log(`    Action: ${win.action.substring(0, 80)}`);
      }
      console.log('');
    }

    if (report.ai_insights.risks.length > 0) {
      console.log('⚠️  RISK RADAR:');
      for (const risk of report.ai_insights.risks) {
        console.log(`  • [${risk.probability.toUpperCase()} probability / ${risk.impact.toUpperCase()} impact] ${risk.title}`);
      }
      console.log('');
    }

  } catch (err) {
    console.error(`\n❌ Demo failed: ${err.message}`);
    console.error('   Try running with --offline to see a sample report.');
    console.error('   Or check your internet connection and try again.\n');
    process.exit(1);
  }
}

runDemo();
