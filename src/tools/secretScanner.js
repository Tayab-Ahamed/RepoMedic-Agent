/**
 * secretScanner.js
 * Scans file contents for secrets using regex patterns + Shannon entropy analysis.
 * All matches are masked before returning — no raw secrets in output.
 */

// ─── Pattern Definitions ───────────────────────────────────────────────────

const HIGH_PATTERNS = [
  { name: 'AWS Access Key ID',          regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub PAT Classic',         regex: /ghp_[0-9a-zA-Z]{36}/g },
  { name: 'GitHub PAT Fine-grained',    regex: /github_pat_[0-9a-zA-Z_]{82}/g },
  { name: 'Slack Bot Token',            regex: /xoxb-\d{11,13}-\d{11,13}-[a-zA-Z0-9]{24}/g },
  { name: 'Stripe Live Secret Key',     regex: /sk_live_[0-9a-zA-Z]{24,}/g },
  { name: 'Stripe Live Pub Key',        regex: /pk_live_[0-9a-zA-Z]{24,}/g },
  { name: 'RSA Private Key Header',     regex: /-----BEGIN RSA PRIVATE KEY-----/g },
  { name: 'EC Private Key Header',      regex: /-----BEGIN EC PRIVATE KEY-----/g },
  { name: 'PGP Private Key Block',      regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g },
  { name: 'Google API Key',             regex: /AIza[0-9A-Za-z\\-_]{35}/g },
  { name: 'Firebase API Key',           regex: /AIza[0-9A-Za-z-_]{35}/g },
  { name: 'Heroku API Key',             regex: /[hH]eroku.*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g },
  { name: 'Twilio Account SID',         regex: /AC[a-z0-9]{32}/g },
  { name: 'Mailgun API Key',            regex: /key-[0-9a-zA-Z]{32}/g },
];

const MEDIUM_PATTERNS = [
  { name: 'Generic API Key Assignment',      regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([a-zA-Z0-9_\-]{20,})['"]/gi },
  { name: 'Generic Password Assignment',     regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^\s'"]{8,})['"]/gi },
  { name: 'Database URL with Credentials',   regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi },
  { name: 'JWT Secret Assignment',           regex: /(?:jwt[_-]?secret|jwt[_-]?key)\s*[:=]\s*['"]([^'"]{10,})['"]/gi },
  { name: 'Bearer Token in Code',            regex: /[Bb]earer\s+([a-zA-Z0-9_\-\.]{20,})/g },
  { name: 'SendGrid API Key',                regex: /SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}/g },
  { name: 'NPM Auth Token',                  regex: /\/\/registry\.npmjs\.org\/:_authToken\s*=\s*([^\s]+)/g },
  { name: 'OpenAI API Key',                  regex: /sk-[a-zA-Z0-9]{48}/g },
];

const LOW_PATTERNS = [
  { name: 'TODO comment near credential',    regex: /(?:TODO|FIXME|HACK).{0,30}(?:key|token|secret|password)/gi },
  { name: 'Placeholder credential',          regex: /(?:password|secret)\s*[:=]\s*['"](?:admin|root|password123|changeme|test1234|secret|hunter2)['"]/gi },
  { name: 'Hardcoded localhost credential',  regex: /localhost:\d{4,5}\/[^\s'"]*?(?:password|secret)=[^\s'"&]+/gi },
];

const HIGH_RISK_FILENAMES = /^\.env(\.(local|prod|production|staging|development|test))?$/i;
const SKIP_PATH_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /out\//,
  /\.min\.js$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

const BINARY_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.pdf','.zip','.tar','.gz','.exe','.dll','.wasm','.bin']);

// ─── Shannon Entropy ───────────────────────────────────────────────────────

function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((h, c) => h + (c / len) * Math.log2(c / len), 0);
}

const HIGH_ENTROPY_VARIABLE = /(?:key|token|secret|pass|auth|credential|pwd|api)[_a-zA-Z]*\s*[:=]\s*['"]([a-zA-Z0-9+/=_\-\.]{20,})['"]/gi;

function scanEntropy(content, threshold = 4.5) {
  const matches = [];
  let m;
  HIGH_ENTROPY_VARIABLE.lastIndex = 0;
  while ((m = HIGH_ENTROPY_VARIABLE.exec(content)) !== null) {
    const candidate = m[1];
    const h = shannonEntropy(candidate);
    if (h >= threshold) {
      matches.push({ match: m[0], value: candidate, entropy: h, index: m.index });
    }
  }
  return matches;
}

// ─── Masking ───────────────────────────────────────────────────────────────

function maskSecret(value) {
  if (!value || value.length <= 4) return '***REDACTED***';
  return value.substring(0, 4) + '***REDACTED***';
}

// ─── Line number from index ────────────────────────────────────────────────

function lineFromIndex(content, index) {
  return content.substring(0, index).split('\n').length;
}

// ─── Main Scanner ──────────────────────────────────────────────────────────

/**
 * Scan a list of files for secrets.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {object} options
 * @param {string[]} [options.skip_paths]
 * @param {number} [options.entropy_threshold]
 * @param {boolean} [options.include_entropy_scan]
 * @returns {object} Scan results
 */
export function scanSecrets(files, {
  entropy_threshold = 4.5,
  include_entropy_scan = true
} = {}) {
  const findings = [];
  let findingCounter = 1;
  let scanned = 0;
  const skipped = [];

  for (const file of files) {
    const { path: filePath, content } = file;

    // Skip based on path patterns
    if (SKIP_PATH_PATTERNS.some(p => p.test(filePath))) {
      skipped.push({ path: filePath, reason: 'excluded path pattern' });
      continue;
    }

    const ext = filePath.split('.').pop()?.toLowerCase();
    if (BINARY_EXTS.has(`.${ext}`)) {
      skipped.push({ path: filePath, reason: 'binary file' });
      continue;
    }

    if (!content) continue;
    scanned++;

    const fileName = filePath.split('/').pop();

    // Check for .env files committed directly
    if (HIGH_RISK_FILENAMES.test(fileName)) {
      findings.push({
        id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
        file: filePath,
        line: 1,
        severity: 'high',
        pattern_name: '.env file present in repository',
        evidence: '.env (file existence)',
        matched_by: 'filename',
        impact: 'Environment files often contain production credentials. Committing them exposes all configured secrets.',
        remediation: `1. Add "${fileName}" to .gitignore immediately. 2. Rotate all credentials in this file. 3. Use a secrets manager or CI/CD environment variables instead.`
      });
    }

    // High severity patterns
    for (const pattern of HIGH_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let m;
      while ((m = re.exec(content)) !== null) {
        findings.push({
          id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
          file: filePath,
          line: lineFromIndex(content, m.index),
          severity: 'high',
          pattern_name: pattern.name,
          evidence: maskSecret(m[0]),
          matched_by: 'regex'
        });
      }
    }

    // Medium severity patterns
    for (const pattern of MEDIUM_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let m;
      while ((m = re.exec(content)) !== null) {
        const secretValue = m[1] || m[0];
        findings.push({
          id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
          file: filePath,
          line: lineFromIndex(content, m.index),
          severity: 'medium',
          pattern_name: pattern.name,
          evidence: maskSecret(secretValue),
          matched_by: 'regex'
        });
      }
    }

    // Low severity patterns
    for (const pattern of LOW_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let m;
      while ((m = re.exec(content)) !== null) {
        findings.push({
          id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
          file: filePath,
          line: lineFromIndex(content, m.index),
          severity: 'low',
          pattern_name: pattern.name,
          evidence: m[0].substring(0, 40) + (m[0].length > 40 ? '...' : ''),
          matched_by: 'regex'
        });
      }
    }

    // Entropy scan
    if (include_entropy_scan) {
      const entropyMatches = scanEntropy(content, entropy_threshold);
      for (const em of entropyMatches) {
        // Skip if already caught by a named pattern
        const alreadyCaught = findings.some(f => f.file === filePath && Math.abs(f.line - lineFromIndex(content, em.index)) <= 1);
        if (!alreadyCaught) {
          findings.push({
            id: `SEC-${String(findingCounter++).padStart(3, '0')}`,
            file: filePath,
            line: lineFromIndex(content, em.index),
            severity: 'medium',
            pattern_name: 'High-entropy string in sensitive variable',
            evidence: maskSecret(em.value),
            matched_by: 'entropy',
            entropy_score: Math.round(em.entropy * 100) / 100
          });
        }
      }
    }
  }

  // Deduplicate by (file, line, pattern_name)
  const seen = new Set();
  const deduplicated = findings.filter(f => {
    const key = `${f.file}:${f.line}:${f.pattern_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    total_files_scanned: scanned,
    total_findings: deduplicated.length,
    findings: deduplicated,
    skipped_files: skipped
  };
}
