/**
 * securityAnalyzer.js — wraps secretScanner + structural security checks.
 */

import { scanSecrets } from '../tools/secretScanner.js';

const IMPACT_MAP = {
  'AWS Access Key ID':              'Immediate AWS account compromise. Attackers can spin up compute, exfiltrate S3 data, or rack up massive bills.',
  'GitHub PAT Classic':             'Full GitHub account access. Attacker can read private repos, push code, and access org secrets.',
  'GitHub PAT Fine-grained':        'Scoped GitHub access. Exact permissions depend on PAT scope but may include code and Actions access.',
  'Slack Bot Token':                'Access to Slack workspace messages, channels, and files. Can post as the bot to all channels.',
  'Stripe Live Secret Key':         'Full Stripe API access. Attacker can create charges, issue refunds, access customer data, and modify subscriptions.',
  'RSA Private Key Header':         'Private key exposure allows impersonation of servers, decryption of TLS traffic, or SSH access.',
  'Generic API Key Assignment':     'Third-party service compromise. Scope depends on the service but may include data access or financial operations.',
  'Generic Password Assignment':    'Hardcoded credentials are a critical vulnerability. Any developer with repo access can authenticate as this user.',
  'Database URL with Credentials':  'Direct database access. Attacker can read, modify, or delete all data in the database.',
  'OpenAI API Key':                 'OpenAI API costs billed to your account. Attacker can run unlimited queries.',
  '.env file present in repository': 'Environment files contain production credentials. All secrets in this file should be considered compromised.',
  'default':                        'Exposed credentials may allow unauthorized access to services or data.'
};

const REMEDIATION_MAP = {
  'AWS Access Key ID':              '1. Revoke key immediately in AWS IAM Console. 2. Run: git filter-repo --invert-paths --path <file> to remove from history. 3. Use IAM Roles or AWS Secrets Manager instead.',
  'GitHub PAT Classic':             '1. Revoke token at github.com/settings/tokens. 2. Rotate any other secrets that may have been accessed. 3. Use GitHub Actions secrets for CI/CD.',
  'Stripe Live Secret Key':         '1. Roll key immediately in Stripe Dashboard > Developers > API keys. 2. Remove from code and use environment variable STRIPE_SECRET_KEY. 3. Never commit keys with "live" in the name.',
  'Generic Password Assignment':    '1. Change the password immediately. 2. Replace with: const password = process.env.DB_PASSWORD. 3. Add .env to .gitignore.',
  'Database URL with Credentials':  '1. Rotate database credentials immediately. 2. Use: const dbUrl = process.env.DATABASE_URL. 3. Ensure .env is gitignored.',
  'RSA Private Key Header':         '1. Regenerate the key pair — treat the private key as fully compromised. 2. Never commit private keys. 3. Use secret managers (AWS SSM, HashiCorp Vault).',
  '.env file present in repository': '1. Add .env to .gitignore now. 2. Run: git rm --cached .env && git commit -m "Remove .env". 3. Rotate ALL credentials in the file immediately. 4. Use .env.example for documentation.',
  'default':                        '1. Remove the secret from the codebase. 2. Rotate/revoke the exposed credential immediately. 3. Use environment variables and a secrets manager.'
};

/**
 * Run full security analysis.
 */
export function analyzeSecurity({ tree, fileContents = {} }) {
  const paths = tree.map(f => f.path);
  const findings = [];
  let findingCounter = 1;

  // Prepare files for secret scanner
  const filesToScan = Object.entries(fileContents)
    .map(([path, content]) => ({ path, content: content || '' }));

  // Also create entries for files we know exist but may not have content
  for (const path of paths) {
    if (!fileContents[path] && /\.env(\.|$)/.test(path)) {
      filesToScan.push({ path, content: '' });
    }
  }

  const scanResult = scanSecrets(filesToScan, { include_entropy_scan: true });

  // Enrich scan findings with impact + remediation
  for (const finding of scanResult.findings) {
    findings.push({
      id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'security-scan',
      severity: finding.severity,
      title: `${finding.pattern_name}`,
      file: finding.file,
      line: finding.line,
      evidence: finding.evidence,
      matched_by: finding.matched_by,
      entropy_score: finding.entropy_score,
      impact: IMPACT_MAP[finding.pattern_name] || IMPACT_MAP['default'],
      remediation: REMEDIATION_MAP[finding.pattern_name] || REMEDIATION_MAP['default'],
    });
  }

  // Structural security checks
  const hasSecurityMd = paths.some(p => /security\.md$/i.test(p) || /\.github\/security\.md$/i.test(p));
  const hasDependabot = paths.some(p => /\.github\/dependabot\.yml/.test(p) || /\.github\/dependabot\.yaml/.test(p));
  const hasNpmrc = paths.some(p => p === '.npmrc');
  const hasEnvExample = paths.some(p => /\.env\.example|\.env\.sample/.test(p));
  const hasEnvCommitted = paths.some(p => /^\.env(\.|$)/.test(p));

  if (!hasSecurityMd) {
    findings.push({
      id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'security-scan', severity: 'medium',
      title: 'No SECURITY.md — missing vulnerability disclosure policy',
      impact: 'Security researchers have no sanctioned channel to report vulnerabilities. They may resort to public disclosure.',
      remediation: 'Create .github/SECURITY.md with your vulnerability reporting process. GitHub provides a template. See: https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository'
    });
  }

  if (!hasDependabot && paths.some(p => p === 'package.json')) {
    findings.push({
      id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'security-scan', severity: 'medium',
      title: 'Dependabot not configured',
      impact: 'Without automated dependency updates, vulnerable packages will silently accumulate over time.',
      remediation: 'Create .github/dependabot.yml:\n  version: 2\n  updates:\n    - package-ecosystem: npm\n      directory: "/"\n      schedule:\n        interval: weekly'
    });
  }

  if (hasNpmrc) {
    // Check .npmrc content if available
    const npmrcContent = fileContents['.npmrc'] || '';
    if (npmrcContent.includes('_authToken')) {
      findings.push({
        id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
        skill: 'security-scan', severity: 'high',
        title: '.npmrc contains auth token',
        file: '.npmrc',
        impact: 'npm auth tokens in .npmrc allow publishing packages and accessing private registries. Committing them is equivalent to sharing your npm credentials.',
        remediation: '1. Revoke the token at npmjs.com/settings. 2. Remove from .npmrc. 3. Add .npmrc to .gitignore. 4. Use NPM_TOKEN environment variable in CI.'
      });
    }
  }

  // Security score (0-20)
  let secScore = 20;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const medCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;
  secScore -= highCount * 5;
  secScore -= medCount * 2;
  secScore -= lowCount * 0.5;
  secScore = Math.max(0, Math.min(20, Math.round(secScore)));

  return {
    security_score: secScore,
    total_files_scanned: scanResult.total_files_scanned,
    has_security_md: hasSecurityMd,
    has_dependabot: hasDependabot,
    has_env_example: hasEnvExample,
    env_committed: hasEnvCommitted,
    findings
  };
}
