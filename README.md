# RepoMedic

[![CI](https://github.com/Tayab-Ahamed/RepoMedic-Agent/actions/workflows/validate.yml/badge.svg)](https://github.com/Tayab-Ahamed/RepoMedic-Agent/actions/workflows/validate.yml)
[![gitagent](https://img.shields.io/badge/gitagent-0.1.0-blue)](https://gitagent.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Changelog](https://img.shields.io/badge/changelog-v0.2.0-informational)](CHANGELOG.md)

RepoMedic audits GitHub repositories and local codebases, then returns a single health report covering structure, security, documentation, tests, and dependencies.

## What RepoMedic checks

RepoMedic runs six skills in sequence:

| Skill | Focus |
| --- | --- |
| `repo-analysis` | Structure, architecture, language detection, repo hygiene |
| `security-scan` | Secrets, tokens, risky config, disclosure policy, automation gaps |
| `doc-analysis` | README completeness, JSDoc coverage, doc drift |
| `test-analysis` | Test framework detection, proxy coverage, critical-path gaps, anti-patterns |
| `dependency-analysis` | Lockfiles, version gaps, deprecations, license risk, known vulnerable packages |
| `scoring` | Weighted score, ranked issues, quick wins, risk radar |

## Quick start

### Requirements

- Node.js 18 or newer
- npm 8 or newer
- Internet access if you want live GitHub and npm registry checks

### Install

```bash
git clone https://github.com/Tayab-Ahamed/RepoMedic-Agent.git
cd RepoMedic-Agent
npm install
```

### Run an analysis

```bash
# Public GitHub repository
node src/index.js --repo https://github.com/expressjs/express

# Local repository
node src/index.js --repo .

# Private GitHub repository
node src/index.js --repo https://github.com/owner/private-repo --pat ghp_yourtoken

# Save the full report
node src/index.js --repo https://github.com/owner/repo --output report.json

# JSON only
node src/index.js --repo https://github.com/owner/repo --json
```

### Development commands

```bash
npm test
npm run lint
npm run validate
npm run demo -- --offline
```

## Report shape

RepoMedic returns a structured JSON object:

```json
{
  "score": 94,
  "grade": "A",
  "label": "Excellent - Production Ready",
  "breakdown": {
    "code_quality": 25,
    "docs": 14,
    "security": 20,
    "tests": 20,
    "dependencies": 15
  },
  "issues": [],
  "recommendations": [],
  "ai_insights": {
    "top_issues": [],
    "quick_wins": [],
    "risks": []
  },
  "summary": "..."
}
```

### Score bands

| Score | Grade | Meaning |
| --- | --- | --- |
| 90-100 | A | Excellent - Production Ready |
| 80-89 | B | Good - Minor Issues |
| 70-79 | C | Fair - Needs Attention |
| 60-69 | D | Poor - Significant Gaps |
| 50-59 | E | Weak - High Risk |
| Below 50 | F | Critical - Do Not Ship |

## Console output

A typical run prints a compact summary to stdout and can optionally write the full JSON report to disk:

```text
RepoMedic - Repository Health Analyzer
--------------------------------------------------
Score: 91/100 (A)
Findings: 1 high, 2 medium, 3 low
Weakest area: docs (16/20)
Top issue: missing SECURITY.md
```

## CLI flags

| Flag | Description |
| --- | --- |
| `--repo` | GitHub URL or local path to analyze |
| `--branch` | Branch to inspect when analyzing GitHub repos |
| `--pat` | GitHub personal access token for private repos |
| `--output` | Write the JSON report to a file |
| `--json` | Print JSON only |
| `--no-registry` | Skip npm registry lookups for faster offline-oriented runs |
| `--help` | Show CLI help |

## Project layout

```text
repomedic-agent/
|-- .github/
|   |-- dependabot.yml
|   `-- workflows/
|-- skills/
|-- tools/
|-- workflows/
|-- src/
|   |-- __tests__/
|   |-- analyzers/
|   |-- tools/
|   |-- cli.js
|   `-- index.js
|-- scripts/
|-- example-usage/
|-- AGENTS.md
|-- RULES.md
|-- SOUL.md
`-- agent.yaml
```

## Notes

- Local path analysis normalizes Windows and Unix-style paths before scoring.
- Secrets are always masked in findings.
- The repo includes tests, lint checks, GitHub Actions validation, and self-audit coverage for the core pipeline.
- `example-usage/sample-report.json` is useful for offline demos and UI wiring.