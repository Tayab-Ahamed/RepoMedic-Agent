---
name: security-scan
description: "SecretSweep — scans repository files for exposed secrets, API keys, tokens, credentials, and risky configuration patterns using regex heuristics and entropy analysis. Node.js only, zero system dependencies."
allowed-tools: Bash Read Write
version: "1.0"
author: RepoMedic
tags:
  - security
  - secrets
  - owasp
---

# Skill: Security Scan (SecretSweep)

## Purpose

Detect exposed credentials and security misconfigurations **before they become breaches**. This skill is non-negotiable — a repo that leaks secrets is a liability regardless of code quality.

---

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | yes | Local path to cloned repo or fetched file contents |
| `file_list` | array | yes | File list from `repo-analysis` skill |
| `skip_paths` | array | no | Patterns to exclude (e.g., `node_modules`, `*.test.*`) |

---

## Secret Detection Patterns

Run the `secret-scanner` tool against all non-binary files. Use these regex patterns:

### Tier 1 — High Severity (immediate breach risk)

| Pattern Name | Regex |
|---|---|
| AWS Access Key | `/AKIA[0-9A-Z]{16}/` |
| AWS Secret Key | `/(?i)aws.{0,20}secret.{0,20}['\"][0-9a-zA-Z\/+]{40}['\"]` |
| GitHub PAT (classic) | `/ghp_[0-9a-zA-Z]{36}/` |
| GitHub PAT (fine-grained) | `/github_pat_[0-9a-zA-Z_]{82}/` |
| Slack Bot Token | `/xoxb-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{24}/` |
| Stripe Secret Key | `/sk_live_[0-9a-zA-Z]{24,}/` |
| Stripe Publishable Key | `/pk_live_[0-9a-zA-Z]{24,}/` |
| Twilio Auth Token | `/(?i)twilio.{0,20}['\"][0-9a-f]{32}['\"]` |
| Private RSA Key | `/-----BEGIN RSA PRIVATE KEY-----/` |
| Private EC Key | `/-----BEGIN EC PRIVATE KEY-----/` |
| Generic API Key | `/(?i)(api[_-]?key|apikey).{0,10}['\"][a-zA-Z0-9_\-]{20,}['\"]` |
| Bearer Token | `/(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}/` |

### Tier 2 — Medium Severity (likely sensitive)

| Pattern Name | Regex |
|---|---|
| Generic Password | `/(?i)(password|passwd|pwd).{0,5}[=:]\s*['\"]?[^\s'"]{8,}['\"]?/` |
| Database URL with creds | `/(?i)(mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/` |
| JWT Secret | `/(?i)(jwt[_-]?secret|jwt[_-]?key).{0,10}['\"][^'"]{10,}['\"]` |
| SendGrid API Key | `/SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}/` |
| Hardcoded IP with port | `/\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/` |

### Tier 3 — Low Severity / Informational

| Pattern Name | Regex |
|---|---|
| `.env` file committed | file path matches `\.env$` or `\.env\.local$` |
| `TODO: remove key` comment | `/(?i)todo.{0,20}(key|token|secret|password)/` |
| Placeholder credentials | `/(?i)(admin|root|password123|changeme|secret)/` |

---

## Entropy Analysis

For any string value >20 characters assigned to a variable with a security-sensitive name, compute Shannon entropy:

```
H = -Σ p(x) * log2(p(x))
```

If H > 4.5 and the variable name contains `key`, `token`, `secret`, `pass`, `auth`, `credential` → flag as **medium** finding with note "High-entropy string in sensitive variable".

---

## File Priority

Scan these files first (highest risk):
1. `.env`, `.env.*`, `.env.local`, `.env.production`
2. `config/*.json`, `config/*.yaml`
3. `*.config.js`, `*.config.ts`
4. Any file in repo root
5. `src/`, `lib/`, `server/`

Skip these paths:
- `node_modules/`
- `.git/`
- `dist/`, `build/`, `out/`
- `*.min.js`
- Binary files (png, jpg, pdf, zip, etc.)

---

## Execution Steps

### Step 1 — Run Secret Scanner

```bash
node scripts/secret-scanner.js --path ./repo --output /tmp/secrets.json
```

### Step 2 — Cross-reference .gitignore

If `.gitignore` exists, check whether flagged files are ignored or committed.
- If the file is committed AND contains secrets → **high**
- If the file is gitignored but exists → **medium** (still a local risk)

### Step 3 — Check Security Files

Verify presence of:
- `SECURITY.md` or `.github/SECURITY.md` → missing = low finding
- `CODEOWNERS` → missing = informational
- Dependabot config (`.github/dependabot.yml`) → missing = medium finding

### Step 4 — Assemble Findings

For each secret found, produce a finding object:

```json
{
  "id": "SEC-001",
  "skill": "security-scan",
  "severity": "high",
  "title": "AWS Access Key exposed in source",
  "file": "src/config/aws.js",
  "line": 14,
  "pattern": "AWS Access Key",
  "evidence": "AKIA***REDACTED***",
  "impact": "Full AWS account compromise if this key has broad permissions.",
  "remediation": "1. Revoke this key immediately via AWS IAM Console. 2. Rotate all related secrets. 3. Add .env to .gitignore. 4. Use environment variables or AWS Secrets Manager.",
  "references": ["https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html"]
}
```

> **IMPORTANT**: Always redact/mask the actual secret value in output. Show first 4 chars + `***REDACTED***`.

---

## Scoring Contribution

Security skill contributes **20 points** to the total score.

| Condition | Points |
|-----------|--------|
| Zero secrets found, SECURITY.md present | 20 |
| Zero secrets found, no SECURITY.md | 16 |
| Low-severity findings only | 12 |
| Medium findings present | 8 |
| Any high-severity secret found | 0–4 |
