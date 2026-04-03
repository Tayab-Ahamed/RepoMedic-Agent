/**
 * repoAnalyzer.js
 * Classifies and maps the repository structure.
 * Returns REPO_ANALYSIS_RESULT for downstream skills.
 */

import { extname, basename, dirname } from 'path';

const SOURCE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const DOC_EXTS    = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc']);
const CONFIG_EXTS = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.env']);
const TEST_PATTERNS  = [/__tests__/, /\/tests?\//, /\/spec\//, /\.test\./, /\.spec\./, /\/e2e\//];
const CI_PATTERNS    = [/\.github\/workflows/, /\.circleci/, /\.gitlab-ci/, /Jenkinsfile/, /\.travis\.yml/, /bitbucket-pipelines/];
const DOCKER_PATTERNS = [/Dockerfile/, /docker-compose/];
const SECRET_RISK    = [/\.env$/, /\.env\./, /\.pem$/, /\.key$/, /id_rsa/];

function classifyFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath).toLowerCase();
  const pathLower = filePath.toLowerCase();

  if (SECRET_RISK.some(p => p.test(pathLower))) return 'secret-risk';
  if (CI_PATTERNS.some(p => p.test(pathLower))) return 'cicd';
  if (DOCKER_PATTERNS.some(p => p.test(name))) return 'docker';
  if (TEST_PATTERNS.some(p => p.test(pathLower))) return 'tests';
  if (SOURCE_EXTS.has(ext)) return 'source';
  if (DOC_EXTS.has(ext)) return 'docs';
  if (CONFIG_EXTS.has(ext)) return 'config';
  return 'other';
}

function detectFrameworks(tree, packageJson) {
  const frameworks = [];
  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  const depNames = new Set(Object.keys(deps));
  const paths = tree.map(f => f.path);

  if (depNames.has('next') || paths.some(p => p.includes('next.config'))) frameworks.push('Next.js');
  else if (depNames.has('react')) frameworks.push('React');
  if (depNames.has('vue')) frameworks.push('Vue.js');
  if (depNames.has('svelte')) frameworks.push('Svelte');
  if (depNames.has('nuxt')) frameworks.push('Nuxt.js');
  if (depNames.has('express')) frameworks.push('Express');
  if (depNames.has('fastify')) frameworks.push('Fastify');
  if (depNames.has('koa')) frameworks.push('Koa');
  if (depNames.has('nestjs') || depNames.has('@nestjs/core')) frameworks.push('NestJS');
  if (depNames.has('tailwindcss')) frameworks.push('Tailwind CSS');
  if (depNames.has('vite') || paths.some(p => p.includes('vite.config'))) frameworks.push('Vite');
  if (depNames.has('typescript') || paths.some(p => p.endsWith('.ts') || p.endsWith('.tsx'))) frameworks.push('TypeScript');
  if (depNames.has('prisma') || depNames.has('@prisma/client')) frameworks.push('Prisma');
  if (depNames.has('drizzle-orm')) frameworks.push('Drizzle ORM');
  if (depNames.has('mongoose')) frameworks.push('Mongoose');

  return [...new Set(frameworks)];
}

function detectArchitecture(tree) {
  const paths = tree.map(f => f.path);
  const hasPackages = paths.some(p => p.startsWith('packages/') || p.startsWith('apps/'));
  if (hasPackages) return 'monorepo';
  const hasControllers = paths.some(p => /controllers?\//.test(p));
  const hasModels = paths.some(p => /models?\//.test(p));
  const hasRoutes = paths.some(p => /routes?\//.test(p));
  if (hasControllers || (hasModels && hasRoutes)) return 'MVC';
  const hasFeatures = paths.some(p => /features?\//.test(p) || /modules?\//.test(p));
  if (hasFeatures) return 'feature-sliced';
  const hasMultipleDockerfiles = paths.filter(p => /Dockerfile/.test(p)).length > 1;
  if (hasMultipleDockerfiles) return 'microservices';
  return 'flat';
}

function detectPrimaryLanguage(tree) {
  const extCount = {};
  for (const file of tree) {
    const ext = file.extension || extname(file.path).toLowerCase();
    if (SOURCE_EXTS.has(ext)) extCount[ext] = (extCount[ext] || 0) + 1;
  }
  const sorted = Object.entries(extCount).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return 'Unknown';
  const topExt = sorted[0][0];
  const map = { '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.vue': 'Vue', '.svelte': 'Svelte' };
  return map[topExt] || 'JavaScript';
}

/**
 * Analyze repository structure.
 * @param {object} fetchResult - Output of repoFetch
 * @param {object|null} packageJson - Parsed package.json or null
 * @returns {object} REPO_ANALYSIS_RESULT
 */
export function analyzeRepo(fetchResult, packageJson = null) {
  const tree = fetchResult.tree || [];
  const categories = { source: 0, tests: 0, docs: 0, config: 0, cicd: 0, docker: 0, 'secret-risk': 0, other: 0 };
  const findings = [];

  for (const file of tree) {
    const cat = classifyFile(file.path);
    categories[cat] = (categories[cat] || 0) + 1;
  }

  const paths = tree.map(f => f.path);
  const hasGitignore = paths.some(p => p === '.gitignore' || p.endsWith('/.gitignore'));
  const hasReadme = paths.some(p => /readme\.(md|rst|txt)$/i.test(p));
  const hasPackageJson = paths.some(p => p === 'package.json');
  const hasLockfile = paths.some(p => /package-lock\.json|yarn\.lock|pnpm-lock\.yaml/.test(p));
  const hasEnvExample = paths.some(p => /\.env\.example|\.env\.sample/.test(p));
  const hasCI = categories.cicd > 0;
  const hasDocker = categories.docker > 0;
  const nodeModulesCommitted = paths.some(p => p.startsWith('node_modules/'));

  // Structural findings
  if (!hasGitignore) {
    findings.push({
      id: 'STRUCT-001', skill: 'repo-analysis', severity: 'high',
      title: 'Missing .gitignore',
      impact: 'Without .gitignore, sensitive files (node_modules, .env, build artifacts) may be accidentally committed.',
      remediation: 'Add a .gitignore file. Use https://gitignore.io to generate one for your stack.'
    });
  }
  if (nodeModulesCommitted) {
    findings.push({
      id: 'STRUCT-002', skill: 'repo-analysis', severity: 'high',
      title: 'node_modules committed to repository',
      impact: 'Massively inflates repo size, causes conflicts, and may include OS-specific native binaries.',
      remediation: 'Add "node_modules/" to .gitignore, then run: git rm -r --cached node_modules && git commit -m "Remove node_modules"'
    });
  }
  if (!hasCI && hasPackageJson) {
    findings.push({
      id: 'STRUCT-003', skill: 'repo-analysis', severity: 'medium',
      title: 'No CI/CD configuration found',
      impact: 'Code ships without automated testing, linting, or security checks. Quality regressions ship silently.',
      remediation: 'Add a GitHub Actions workflow at .github/workflows/ci.yml that runs npm test and npm run lint on every push and pull request.'
    });
  }

  const testRatio = categories.source > 0 ? Math.round((categories.tests / categories.source) * 100) / 100 : 0;
  const architecture = detectArchitecture(tree);
  const primaryLanguage = detectPrimaryLanguage(tree);
  const frameworks = detectFrameworks(tree, packageJson);

  // Code quality score (out of 25)
  let codeQualityScore = 25;
  for (const f of findings) {
    if (f.severity === 'high') codeQualityScore -= 5;
    else if (f.severity === 'medium') codeQualityScore -= 2;
    else codeQualityScore -= 1;
  }
  if (!hasCI) codeQualityScore -= 2;
  if (packageJson && !packageJson.engines) codeQualityScore -= 1;
  codeQualityScore = Math.max(0, codeQualityScore);

  return {
    repo: fetchResult.repo,
    branch: fetchResult.branch,
    total_files: fetchResult.total_files,
    file_categories: categories,
    primary_language: primaryLanguage,
    frameworks,
    architecture,
    has_package_json: hasPackageJson,
    has_lockfile: hasLockfile,
    has_gitignore: hasGitignore,
    has_readme: hasReadme,
    has_env_example: hasEnvExample,
    has_ci: hasCI,
    has_docker: hasDocker,
    node_modules_committed: nodeModulesCommitted,
    test_ratio: testRatio,
    code_quality_score: codeQualityScore,
    findings
  };
}
