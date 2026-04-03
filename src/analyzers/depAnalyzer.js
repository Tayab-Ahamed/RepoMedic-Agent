/**
 * depAnalyzer.js — wraps dependencyParser with findings generation.
 */

import { parseDependencies } from '../tools/dependencyParser.js';

const KNOWN_VULN_PATTERNS = [
  { name: 'lodash',          maxSafe: [4, 17, 20], cve: 'CVE-2020-8203',  desc: 'Prototype pollution vulnerability' },
  { name: 'minimist',        maxSafe: [1, 2,  5],  cve: 'CVE-2021-44906', desc: 'Prototype pollution vulnerability' },
  { name: 'jsonwebtoken',    maxSafe: [8, 5,  2],  cve: 'CVE-2022-23529', desc: 'Algorithm confusion / header injection' },
  { name: 'node-fetch',      maxSafe: [2, 6,  6],  cve: 'CVE-2022-0235',  desc: 'URL redirect exposes cookies/auth headers' },
  { name: 'axios',           maxSafe: [0, 27, 2],  cve: 'CVE-2023-45857', desc: 'CSRF / credential exposure on redirect' },
  { name: 'express',         maxSafe: [4, 17, 20], cve: null,              desc: 'Open redirect and ReDoS in older versions' },
  { name: 'got',             maxSafe: [11, 8, 5],  cve: null,              desc: 'SSRF and redirect vulnerabilities' },
  { name: 'qs',              maxSafe: [6, 10, 3],  cve: 'CVE-2022-24999', desc: 'Prototype pollution in query string parsing' },
  { name: 'yaml',            maxSafe: [1, 10, 5],  cve: null,              desc: 'ReDoS vulnerability in YAML parsing' },
  { name: 'semver',          maxSafe: [7, 5,  2],  cve: 'CVE-2022-25883', desc: 'ReDoS in version range validation' },
];

function parseSemver(v) {
  const clean = (v || '').replace(/^[\^~>=<\s*]+/, '').split('-')[0];
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isVulnerable(declaredVersion, maxSafe) {
  const [dMaj, dMin, dPatch] = parseSemver(declaredVersion);
  const [sMaj, sMin, sPatch] = maxSafe;
  if (dMaj < sMaj) return true;
  if (dMaj === sMaj && dMin < sMin) return true;
  if (dMaj === sMaj && dMin === sMin && dPatch <= sPatch) return true;
  return false;
}

/**
 * Full dependency analysis with findings.
 */
export async function analyzeDependencies({ tree, fileContents = {}, check_registry = true }) {
  const paths = tree.map(f => f.path);
  const findings = [];
  let findingCounter = 1;

  const pkgPath = paths.find(p => p === 'package.json');
  const hasLockfile = paths.some(p => /package-lock\.json|yarn\.lock|pnpm-lock\.yaml/.test(p));
  const hasNpmrcWithToken = paths.some(p => p === '.npmrc') &&
    (fileContents['.npmrc'] || '').includes('_authToken');

  if (!pkgPath) {
    return {
      dep_score: 15, // No package.json = not a Node project, don't penalize
      has_lockfile: false,
      total_dependencies: 0,
      findings: [],
      summary: {}
    };
  }

  const packageJsonContent = fileContents['package.json'];
  if (!packageJsonContent) {
    return { dep_score: 10, has_lockfile: false, total_dependencies: 0, findings: [], summary: {} };
  }

  let depResult;
  try {
    depResult = await parseDependencies(packageJsonContent, {
      check_registry,
      include_dev: false,
      batch_size: 8
    });
    depResult.has_lockfile = hasLockfile;
  } catch (e) {
    return { dep_score: 8, has_lockfile: false, total_dependencies: 0, findings: [{ id: 'DEP-001', skill: 'dependency-analysis', severity: 'medium', title: `Could not parse package.json: ${e.message}`, remediation: 'Ensure package.json is valid JSON.' }], summary: {} };
  }

  // Lockfile check
  if (!hasLockfile) {
    findings.push({
      id: `DEP-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'dependency-analysis', severity: 'high',
      title: 'No lockfile found (package-lock.json / yarn.lock)',
      impact: 'Without a lockfile, npm install resolves to the latest compatible versions. A dependency update can silently break production or introduce a malicious package.',
      remediation: 'Run: npm install (generates package-lock.json). Commit the lockfile and never add it to .gitignore.',
      auto_fixable: true
    });
  }

  // Known vulnerability patterns
  for (const pattern of KNOWN_VULN_PATTERNS) {
    const dep = depResult.dependencies.find(d => d.name === pattern.name);
    if (dep && isVulnerable(dep.declared_version, pattern.maxSafe)) {
      findings.push({
        id: `DEP-${String(findingCounter++).padStart(3, '0')}`,
        skill: 'dependency-analysis', severity: 'high',
        title: `${pattern.name}@${dep.declared_version} — ${pattern.desc}`,
        package: pattern.name,
        installed_version: dep.declared_version,
        latest_version: dep.latest_version,
        cve_pattern: pattern.cve,
        impact: `${pattern.desc}. This affects ${dep.declared_version} and may allow attackers to compromise the application.`,
        remediation: `Run: npm update ${pattern.name}. If blocked by peer deps, add to package.json resolutions: { "${pattern.name}": "^${dep.latest_version || 'latest'}" }`,
        auto_fixable: true
      });
    }
  }

  // Deprecated packages
  for (const dep of depResult.dependencies.filter(d => d.is_deprecated)) {
    findings.push({
      id: `DEP-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'dependency-analysis', severity: 'medium',
      title: `Deprecated package: ${dep.name}@${dep.declared_version}`,
      package: dep.name,
      installed_version: dep.declared_version,
      impact: `"${dep.name}" is deprecated: ${dep.deprecation_message || 'no longer maintained'}. Deprecated packages receive no security fixes.`,
      remediation: `Find the recommended replacement for ${dep.name}. Check the npm page or the deprecation message for the suggested alternative.`
    });
  }

  // Major version gaps
  for (const dep of depResult.dependencies.filter(d => d.version_gap === 'major')) {
    // Skip if already flagged for vuln
    if (findings.some(f => f.package === dep.name)) continue;
    findings.push({
      id: `DEP-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'dependency-analysis', severity: 'medium',
      title: `${dep.name}: ${dep.declared_version} is ${dep.latest_version ? `${dep.latest_version.split('.')[0] - dep.declared_version.replace(/[^0-9]/,'').split('.')[0]} major versions behind` : 'multiple major versions behind'}`,
      package: dep.name,
      installed_version: dep.declared_version,
      latest_version: dep.latest_version,
      impact: 'Major version gaps accumulate security patches and bug fixes. Each missed major version increases migration complexity.',
      remediation: `Review the ${dep.name} changelog, then run: npm install ${dep.name}@latest. Test for breaking changes.`,
      auto_fixable: false
    });
  }

  // High license risk
  for (const dep of depResult.dependencies.filter(d => d.license_risk === 'high')) {
    findings.push({
      id: `DEP-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'dependency-analysis', severity: 'medium',
      title: `License risk: ${dep.name} uses ${dep.license}`,
      package: dep.name,
      impact: `${dep.license} is a strong copyleft license. Using this package in a proprietary product may require you to open-source your code.`,
      remediation: `Consult with a legal advisor about ${dep.license} implications. Consider finding an MIT/Apache licensed alternative.`
    });
  }

  // Wildcard versions
  const wildcardDeps = depResult.dependencies.filter(d => d.declared_version === '*' || d.declared_version === 'latest');
  for (const dep of wildcardDeps) {
    findings.push({
      id: `DEP-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'dependency-analysis', severity: 'high',
      title: `Wildcard version specifier: ${dep.name}@${dep.declared_version}`,
      package: dep.name,
      impact: 'Using "*" or "latest" means any future version (including breaking or malicious) will be installed. This is a supply-chain risk.',
      remediation: `Pin to a specific version range: "${dep.name}": "^${dep.latest_version || '1.0.0'}"`
    });
  }

  // Dep score (0-15)
  let depScore = 15;
  const highFinds = findings.filter(f => f.severity === 'high').length;
  const medFinds = findings.filter(f => f.severity === 'medium').length;
  depScore -= highFinds * 4;
  depScore -= medFinds * 1;
  depScore = Math.max(0, Math.min(15, depScore));

  return {
    dep_score: depScore,
    has_lockfile: hasLockfile,
    total_dependencies: depResult.total_dependencies,
    dependencies: depResult.dependencies,
    summary: depResult.summary,
    findings
  };
}
