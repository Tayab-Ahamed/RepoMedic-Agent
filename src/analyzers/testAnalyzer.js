/**
 * testAnalyzer.js — Test coverage proxy analyzer.
 */

import { extname } from 'node:path';

const TEST_FILE_PATTERNS = [
  /__tests__\//, /\/tests?\//, /\/spec\//, /\/e2e\//,
  /\.test\.(js|ts|jsx|tsx|mjs)$/, /\.spec\.(js|ts|jsx|tsx|mjs)$/
];

const CRITICAL_PATH_PATTERNS = [
  { label: 'Authentication/Authorization', re: /\/(auth|session|jwt|oauth|login|permission|guard)\.(js|ts)$/ },
  { label: 'Payment/Billing',              re: /\/(payment|billing|stripe|checkout|invoice|subscription)\.(js|ts)$/ },
  { label: 'API Route Handlers',           re: /\/(routes?|controllers?|handlers?|api)\/((?!index)[^/]+)\.(js|ts)$/ },
  { label: 'Data Models',                  re: /\/(models?|schema|entities?|db)\/((?!index)[^/]+)\.(js|ts)$/ },
  { label: 'Middleware',                   re: /\/middleware\/[^/]+\.(js|ts)$/ },
  { label: 'Config/Environment',           re: /\/(config|env|settings)\.(js|ts)$/ },
];

const ANTI_PATTERNS = [
  { label: 'Empty test body',          re: /(?:it|test)\s*\([^,]+,\s*\(\s*\)\s*=>\s*\{\s*\}\)/g,  severity: 'high'   },
  { label: 'No assertions in test',    re: /(?:it|test)\s*\([^,]+,\s*(?:async\s*)?\(\)\s*=>\s*\{(?:(?!expect|assert).)*\}\s*\)/gs, severity: 'high' },
  { label: 'Focused test (only)',      re: /(?:describe|it|test)\.only\s*\(/g,                      severity: 'medium' },
  { label: 'Skipped test',             re: /(?:describe|it|test)\.skip\s*\(/g,                      severity: 'low'    },
  { label: 'console.log in test',      re: /console\.log\s*\(/g,                                    severity: 'low'    },
  { label: 'Hardcoded sleep/wait',     re: /setTimeout\s*\([^,]+,\s*\d{3,}/g,                       severity: 'medium' },
  { label: 'Snapshot-only test',       re: /expect\([^)]+\)\.toMatchSnapshot\(\)/g,                 severity: 'low'    },
];

const FRAMEWORK_MARKERS = {
  jest:    ['jest', '@jest/globals'],
  vitest:  ['vitest'],
  mocha:   ['mocha'],
  jasmine: ['jasmine'],
  ava:     ['ava'],
  tap:     ['tap', 'node:test'],
};

function isTestFile(path) {
  return TEST_FILE_PATTERNS.some(p => p.test(path));
}

function extractImports(content) {
  const imports = new Set();
  // ESM
  [...content.matchAll(/import\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g)]
    .forEach(m => imports.add(m[1]));
  // CJS
  [...content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .forEach(m => imports.add(m[1]));
  return imports;
}

function normalizeImportPath(importPath, testFilePath) {
  if (!importPath.startsWith('.')) return null;
  // Relative import — resolve roughly
  const parts = testFilePath.split('/');
  parts.pop(); // remove filename
  const resolved = importPath.replace(/^\.\//, '').replace(/^\.\.\//, '../');
  return resolved.replace(/\.(js|ts|jsx|tsx)$/, '');
}

function detectFramework(packageJson) {
  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  const testScript = packageJson?.scripts?.test || '';

  if (testScript.includes('node --test')) {
    return 'node:test';
  }

  for (const [fw, markers] of Object.entries(FRAMEWORK_MARKERS)) {
    if (markers.some(m => deps[m])) return fw;
  }
  return null;
}

function hasTestScript(packageJson) {
  const testScript = packageJson?.scripts?.test || '';
  if (!testScript) return false;
  return !testScript.includes('echo') && !testScript.includes('no test');
}

function hasCoverageConfig(packageJson) {
  const scripts = packageJson?.scripts || {};
  return Object.values(scripts).some(s =>
    s.includes('--coverage') ||
    s.includes('--test-coverage') ||
    s.includes('--experimental-test-coverage') ||
    s.includes('c8') ||
    s.includes('nyc')
  );
}

/**
 * Analyze test coverage.
 */
export function analyzeTests({ tree, fileContents = {}, packageJson = null }) {
  const findings = [];
  let findingCounter = 1;
  const paths = tree.map(f => f.path);

  const sourceFiles = paths.filter(p => {
    const ext = extname(p);
    return ['.js', '.ts', '.jsx', '.tsx'].includes(ext) && !isTestFile(p) &&
      !p.includes('node_modules') && !p.includes('dist/') && !p.includes('build/') &&
      !p.endsWith('/cli.js');
  });

  const testFiles = paths.filter(p => isTestFile(p));
  const framework = detectFramework(packageJson);
  const testScriptPresent = hasTestScript(packageJson);
  const coverageConfigured = hasCoverageConfig(packageJson);

  // No test framework
  if (!framework && testFiles.length === 0) {
    findings.push({
      id: `TEST-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'test-analysis', severity: 'high',
      title: 'No testing framework detected',
      impact: 'Zero automated tests means every change is manually verified (or not). Bugs ship undetected.',
      remediation: 'Install Jest: npm install --save-dev jest. Add "test": "jest" to package.json scripts. Create your first test at src/__tests__/index.test.js.'
    });
  }

  // No test script
  if (!testScriptPresent && framework) {
    findings.push({
      id: `TEST-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'test-analysis', severity: 'medium',
      title: 'Test framework installed but no test script in package.json',
      impact: 'CI/CD systems use "npm test" by convention. A missing test script means automated pipelines cannot run tests.',
      remediation: 'Add "test": "jest --passWithNoTests" (or vitest, mocha) to scripts in package.json.'
    });
  }

  if (!coverageConfigured && framework) {
    findings.push({
      id: `TEST-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'test-analysis', severity: 'low',
      title: 'No coverage reporting configured',
      impact: 'Without coverage metrics you have no visibility into which code is actually exercised by tests.',
      remediation: 'Add --coverage flag to your test script, or configure c8/nyc as a coverage reporter.'
    });
  }

  // Proxy coverage via import mapping
  const testedSourceFiles = new Set();
  const antiPatternFindings = [];

  for (const testPath of testFiles) {
    const content = fileContents[testPath];
    if (!content) continue;

    const imports = extractImports(content);
    for (const imp of imports) {
      if (imp.startsWith('.')) {
        // Map relative import back to source
        const parts = testPath.split('/');
        parts.pop();
        let resolved = imp;
        resolved = resolved.replace(/\.(js|ts|jsx|tsx)$/, '');
        testedSourceFiles.add(resolved);
        // Also try to match by basename
        const base = resolved.split('/').pop();
        const match = sourceFiles.find(sf => sf.replace(/\.(js|ts|jsx|tsx)$/, '').endsWith('/' + base) || sf.replace(/\.(js|ts|jsx|tsx)$/, '') === base);
        if (match) testedSourceFiles.add(match.replace(/\.(js|ts|jsx|tsx)$/, ''));
      }
    }

    // Anti-patterns
    for (const ap of ANTI_PATTERNS) {
      const re = new RegExp(ap.re.source, ap.re.flags);
      if (re.test(content)) {
        antiPatternFindings.push({
          id: `TEST-${String(findingCounter++).padStart(3, '0')}`,
          skill: 'test-analysis', severity: ap.severity,
          title: `Test anti-pattern: ${ap.label}`,
          file: testPath,
          impact: 'Anti-patterns in tests create false confidence — the test suite passes but provides no real protection.',
          remediation: ap.label === 'Focused test (only)' ? 'Remove .only() from tests before committing. Use it only during local debugging.' :
            ap.label === 'Empty test body' ? 'Implement the empty test or remove it. An empty test always passes and is worse than no test.' :
            'Address the anti-pattern to ensure tests provide real coverage.'
        });
      }
    }
  }

  // Critical path coverage
  for (const criticalPath of CRITICAL_PATH_PATTERNS) {
    const criticalFiles = sourceFiles.filter(sf => criticalPath.re.test(sf));
    for (const cf of criticalFiles) {
      const cfBase = cf.replace(/\.(js|ts|jsx|tsx)$/, '').split('/').pop();
      const isTested = testFiles.some(tf => {
        const content = fileContents[tf] || '';
        return content.includes(cfBase) || tf.includes(cfBase);
      }) || testedSourceFiles.has(cf.replace(/\.(js|ts|jsx|tsx)$/, ''));

      if (!isTested) {
        findings.push({
          id: `TEST-${String(findingCounter++).padStart(3, '0')}`,
          skill: 'test-analysis', severity: 'high',
          title: `Critical path untested: ${criticalPath.label} (${cf})`,
          file: cf,
          impact: `${criticalPath.label} has no test coverage. A regression here could cause silent data loss, authentication bypass, or financial errors.`,
          remediation: `Create a test file at ${cf.replace(/\.(js|ts)$/, '.test.$1')}. Cover: happy path, error handling, and edge cases.`,
          suggested_test_cases: [
            `should handle valid input correctly`,
            `should throw/return error on invalid input`,
            `should handle edge case: null/undefined input`,
            `should behave correctly under concurrent requests`
          ]
        });
      }
    }
  }

  findings.push(...antiPatternFindings);

  // Calculate test score (0-20)
  const proxyCoverage = sourceFiles.length > 0 ? testedSourceFiles.size / sourceFiles.length : 0;
  let testScore = 0;
  if (testFiles.length === 0) {
    testScore = 0;
  } else {
    testScore = Math.round(proxyCoverage * 14);
    if (framework && testScriptPresent) testScore += 3;
    if (coverageConfigured) testScore += 2;
    if (antiPatternFindings.length === 0) testScore += 1;
  }
  for (const f of findings) {
    if (f.severity === 'high') testScore -= 3;
    else if (f.severity === 'medium') testScore -= 1;
  }
  testScore = Math.max(0, Math.min(20, testScore));

  return {
    test_score: testScore,
    framework: framework || 'none detected',
    total_test_files: testFiles.length,
    total_source_files: sourceFiles.length,
    proxy_coverage: Math.round(proxyCoverage * 100) / 100,
    has_coverage_config: coverageConfigured,
    findings
  };
}
