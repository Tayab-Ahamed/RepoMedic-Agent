/**
 * scorer.js — Aggregates all skill results into the final health report.
 */

const GRADE_MAP = [
  { min: 90, grade: 'A', label: 'Excellent — Production Ready' },
  { min: 80, grade: 'B', label: 'Good — Minor Issues' },
  { min: 70, grade: 'C', label: 'Fair — Needs Attention' },
  { min: 60, grade: 'D', label: 'Poor — Significant Gaps' },
  { min: 50, grade: 'E', label: 'Weak — High Risk' },
  { min: 0,  grade: 'F', label: 'Critical — Do Not Ship' },
];

function grade(score) {
  return GRADE_MAP.find(g => score >= g.min) || GRADE_MAP[GRADE_MAP.length - 1];
}

function severityWeight(s) {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

function buildTopIssues(allFindings) {
  const scored = allFindings
    .filter(f => f.severity)
    .map(f => ({ ...f, _weight: severityWeight(f.severity) }))
    .sort((a, b) => b._weight - a._weight);

  // Deduplicate by title similarity
  const seen = new Set();
  const unique = scored.filter(f => {
    const key = f.title?.substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 5).map((f, i) => ({
    rank: i + 1,
    id: f.id,
    title: f.title,
    severity: f.severity,
    skill: f.skill,
    file: f.file || null,
    one_liner: f.impact?.split('.')[0] + '.' || f.title
  }));
}

function buildQuickWins(allFindings) {
  const quickWins = allFindings.filter(f =>
    (f.severity === 'low' || f.severity === 'medium') &&
    (f.auto_fixable === true || (f.remediation && (
      f.remediation.includes('npm install') ||
      f.remediation.includes('npm update') ||
      f.remediation.includes('Add') ||
      f.remediation.includes('Create')
    )))
  );
  return quickWins.slice(0, 5).map(f => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    skill: f.skill,
    action: f.remediation?.split('\n')[0] || f.remediation
  }));
}

function buildRiskRadar(allFindings, repoAnalysis) {
  const risks = [];

  const highSecFinds = allFindings.filter(f => f.skill === 'security-scan' && f.severity === 'high');
  if (highSecFinds.length > 0) {
    risks.push({
      id: 'RISK-001',
      title: `${highSecFinds.length} high-severity secret(s) exposed`,
      probability: 'high',
      impact: 'critical',
      scenario: 'Exposed credentials can be scraped by bots scanning GitHub within minutes. Immediate account compromise is likely if keys are active.'
    });
  }

  const criticalTestFinds = allFindings.filter(f => f.skill === 'test-analysis' && f.severity === 'high');
  if (criticalTestFinds.length > 0) {
    risks.push({
      id: 'RISK-002',
      title: 'Critical paths (auth/payment) have no test coverage',
      probability: 'high',
      impact: 'high',
      scenario: 'Any code change to authentication or payment flows ships without automated validation. A regression could silently allow unauthorized access or failed transactions.'
    });
  }

  if (!repoAnalysis?.has_lockfile) {
    risks.push({
      id: 'RISK-003',
      title: 'No lockfile — dependency versions unpinned',
      probability: 'medium',
      impact: 'high',
      scenario: 'Next npm install could pull a breaking update or, in a supply-chain attack, a malicious package version.'
    });
  }

  const depHighFinds = allFindings.filter(f => f.skill === 'dependency-analysis' && f.severity === 'high' && f.cve_pattern);
  if (depHighFinds.length > 0) {
    risks.push({
      id: 'RISK-004',
      title: `${depHighFinds.length} known CVE pattern(s) in dependencies`,
      probability: 'medium',
      impact: 'high',
      scenario: `Packages with known CVE patterns are in use: ${depHighFinds.map(f => f.package).join(', ')}. Exploitation depends on usage context.`
    });
  }

  if (!repoAnalysis?.has_ci) {
    risks.push({
      id: 'RISK-005',
      title: 'No CI/CD — code ships without automated checks',
      probability: 'high',
      impact: 'medium',
      scenario: 'Every commit to main goes directly to production without running tests, linting, or security checks. Quality and security regressions ship silently.'
    });
  }

  return risks.slice(0, 5);
}

function buildRecommendations(allFindings, breakdown) {
  const recs = [];

  if (breakdown.security < 15) {
    recs.push('Address all high-severity security findings immediately — rotate any exposed credentials before anything else');
  }
  if (breakdown.tests < 12) {
    recs.push('Add tests for authentication and payment flows — these are your highest-risk untested paths');
  }
  if (breakdown.docs < 12) {
    recs.push('Complete the README with installation, usage, and configuration sections — it is the first impression for every contributor');
  }
  if (breakdown.dependencies < 10) {
    recs.push('Run npm audit and update flagged packages — generate a lockfile if missing');
  }
  if (breakdown.code_quality < 18) {
    recs.push('Add .gitignore, configure a CI/CD pipeline, and set up automated linting to enforce code standards');
  }

  // Always include these high-value recs if not already covered
  if (!recs.some(r => r.includes('Dependabot'))) {
    recs.push('Configure Dependabot (.github/dependabot.yml) to receive automated weekly dependency update PRs');
  }
  if (!recs.some(r => r.includes('SECURITY'))) {
    recs.push('Add SECURITY.md to define your vulnerability disclosure process and responsible reporting channel');
  }

  return recs.slice(0, 7);
}

function buildSummary(score, gradeInfo, breakdown, allFindings, repoAnalysis) {
  const highCount = allFindings.filter(f => f.severity === 'high').length;
  const medCount = allFindings.filter(f => f.severity === 'medium').length;
  const repo = repoAnalysis?.repo || 'this repository';

  let summary = `${repo} scores ${score}/100 (${gradeInfo.grade} — ${gradeInfo.label}). `;

  if (highCount > 0) {
    summary += `There are ${highCount} high-severity finding${highCount > 1 ? 's' : ''} that require immediate attention. `;
  }

  const weakest = Object.entries(breakdown).sort((a, b) => (a[1] / getMax(a[0])) - (b[1] / getMax(b[0])))[0];
  summary += `The weakest area is ${weakest[0].replace('_', ' ')} (${weakest[1]}/${getMax(weakest[0])} points). `;

  if (score >= 80) {
    summary += 'Overall health is solid — focus on addressing the remaining issues incrementally.';
  } else if (score >= 60) {
    summary += 'Meaningful improvements are needed before this codebase is considered production-grade.';
  } else {
    summary += 'Significant remediation is required. Address high-severity findings before the next deployment.';
  }

  return summary;
}

function getMax(dimension) {
  return { code_quality: 25, docs: 20, security: 20, tests: 20, dependencies: 15 }[dimension] || 100;
}

/**
 * Assemble the final health report.
 */
export function assembleReport({
  repoAnalysis,
  securityResult,
  docResult,
  testResult,
  depResult,
  repoFetchResult
}) {
  const breakdown = {
    code_quality:  repoAnalysis.code_quality_score,
    docs:          docResult.docs_score,
    security:      securityResult.security_score,
    tests:         testResult.test_score,
    dependencies:  depResult.dep_score
  };

  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  const gradeInfo = grade(score);

  const allFindings = [
    ...repoAnalysis.findings,
    ...securityResult.findings,
    ...docResult.findings,
    ...testResult.findings,
    ...depResult.findings
  ];

  const topIssues = buildTopIssues(allFindings);
  const quickWins = buildQuickWins(allFindings);
  const risks = buildRiskRadar(allFindings, repoAnalysis);
  const recommendations = buildRecommendations(allFindings, breakdown);
  const summary = buildSummary(score, gradeInfo, breakdown, allFindings, repoAnalysis);

  return {
    meta: {
      repo: repoAnalysis.repo || repoFetchResult?.repo || 'unknown',
      branch: repoAnalysis.branch || repoFetchResult?.branch || null,
      analyzed_at: new Date().toISOString(),
      agent_version: '0.2.0',
      total_files_analyzed: repoAnalysis.total_files,
      total_findings: allFindings.length,
      primary_language: repoAnalysis.primary_language,
      frameworks: repoAnalysis.frameworks,
      architecture: repoAnalysis.architecture
    },
    score,
    grade: gradeInfo.grade,
    label: gradeInfo.label,
    breakdown,
    issues: allFindings,
    recommendations,
    ai_insights: {
      top_issues: topIssues,
      quick_wins: quickWins,
      risks
    },
    summary
  };
}

/**
 * Format a human-readable report summary to stdout.
 */
export function formatConsoleReport(report) {
  const { score, grade, label, breakdown, meta, ai_insights } = report;
  const highCount = report.issues.filter(i => i.severity === 'high').length;
  const medCount  = report.issues.filter(i => i.severity === 'medium').length;
  const lowCount  = report.issues.filter(i => i.severity === 'low').length;

  function bar(val, max, len = 10) {
    const filled = Math.round((val / max) * len);
    return '█'.repeat(filled) + '░'.repeat(len - filled);
  }

  const lines = [
    '',
    '╔════════════════════════════════════════════╗',
    '║        🏥  RepoMedic Health Report          ║',
    '╠════════════════════════════════════════════╣',
    `║  Repo:     ${(meta.repo || 'unknown').padEnd(32)}║`,
    `║  Score:    ${String(score).padEnd(3)}/100  Grade: ${grade}  (${label.substring(0,16).padEnd(16)})║`,
    `║  Findings: ${String(highCount)} high, ${String(medCount)} medium, ${String(lowCount)} low`.padEnd(45) + '║',
    '╠════════════════════════════════════════════╣',
    `║  Code Quality   ${bar(breakdown.code_quality,  25)}  ${String(breakdown.code_quality).padStart(2)}/25  ║`,
    `║  Documentation  ${bar(breakdown.docs,          20)}  ${String(breakdown.docs).padStart(2)}/20  ║`,
    `║  Security       ${bar(breakdown.security,      20)}  ${String(breakdown.security).padStart(2)}/20  ║`,
    `║  Tests          ${bar(breakdown.tests,         20)}  ${String(breakdown.tests).padStart(2)}/20  ║`,
    `║  Dependencies   ${bar(breakdown.dependencies,  15)}  ${String(breakdown.dependencies).padStart(2)}/15  ║`,
    '╠════════════════════════════════════════════╣',
  ];

  if (ai_insights.top_issues.length > 0) {
    lines.push('║  🔴 TOP ISSUES:                              ║');
    for (const issue of ai_insights.top_issues.slice(0, 3)) {
      const title = issue.title.substring(0, 38);
      lines.push(`║  ${issue.rank}. ${title.padEnd(40)}║`);
    }
    lines.push('╠════════════════════════════════════════════╣');
  }

  if (ai_insights.quick_wins.length > 0) {
    lines.push('║  ✅ QUICK WINS:                              ║');
    for (const win of ai_insights.quick_wins.slice(0, 3)) {
      const title = win.title.substring(0, 40);
      lines.push(`║  • ${title.padEnd(40)}║`);
    }
    lines.push('╠════════════════════════════════════════════╣');
  }

  lines.push(`║  ${report.summary.substring(0, 44).padEnd(44)}║`);
  lines.push('╚════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}
