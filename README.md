# 🏥 RepoMedic — Repository Health Agent

[![gitagent](https://img.shields.io/badge/gitagent-0.1.0-blue)](https://gitagent.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Hackathon](https://img.shields.io/badge/GitAgent-Hackathon-orange)](https://gitagent.sh)

> **Your brutally honest senior engineer, automated.**

RepoMedic is a git-native AI agent that analyzes any GitHub repository and produces a comprehensive health report covering code quality, security, documentation, tests, and dependencies — in under 60 seconds.

---

## 🎯 What It Does

RepoMedic runs **6 sequential skills** against any repository:

| Skill | What It Checks |
|-------|----------------|
| 🔍 **repo-analysis** | Structure, architecture, file classification |
| 🔒 **security-scan** | Secrets, tokens, keys, misconfigurations |
| 📝 **doc-analysis** | README completeness, JSDoc, doc drift |
| 🧪 **test-analysis** | Coverage proxy, critical path testing, anti-patterns |
| 📦 **dependency-analysis** | Outdated deps, CVE patterns, license risks |
| 📊 **scoring** | Weighted 0–100 health score + full report |

---

## 🚀 Quick Start

### Requirements
- Node.js ≥ 18.0.0
- npm ≥ 8.0.0
- Internet access (for GitHub API + npm registry)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/RepoMedic-Agent
cd repomedic-agent

# Install dependencies
npm install
```

### Run Analysis

```bash
# Analyze any public GitHub repo
node src/index.js --repo https://github.com/expressjs/express

# Analyze a local repo
node src/index.js --repo ./my-project

# Analyze a private repo (with PAT)
node src/index.js --repo https://github.com/org/private-repo --pat ghp_yourtoken

# Save report to JSON file
node src/index.js --repo https://github.com/owner/repo --output report.json

# Output raw JSON only (for CI/CD pipelines)
node src/index.js --repo https://github.com/owner/repo --json
```

### Run Demo

```bash
# Live demo against express.js
npm run demo

# Offline demo with pre-built sample report
node example-usage/run-example.js --offline
```

### Validate Agent Definition

```bash
npm run validate   # npx gitagent validate
npm run info       # npx gitagent info
```

---

## 📊 Output Format

RepoMedic produces a structured JSON report:

```json
{
  "score": 72,
  "grade": "C",
  "label": "Fair — Needs Attention",
  "breakdown": {
    "code_quality": 20,
    "docs": 15,
    "security": 18,
    "tests": 12,
    "dependencies": 7
  },
  "issues": [...],
  "recommendations": [...],
  "ai_insights": {
    "top_issues": [...],
    "quick_wins": [...],
    "risks": [...]
  },
  "summary": "..."
}
```

### Score Grades

| Score | Grade | Meaning |
|-------|-------|---------|
| 90–100 | A | Excellent — Production Ready |
| 80–89 | B | Good — Minor Issues |
| 70–79 | C | Fair — Needs Attention |
| 60–69 | D | Poor — Significant Gaps |
| 50–59 | E | Weak — High Risk |
| < 50 | F | Critical — Do Not Ship |

---

## 🖥 Console Output

```
╔════════════════════════════════════════════╗
║        🏥  RepoMedic Health Report          ║
╠════════════════════════════════════════════╣
║  Repo:     expressjs/express               ║
║  Score:    74/100  Grade: C                ║
║  Findings: 2 high, 7 medium, 5 low         ║
╠════════════════════════════════════════════╣
║  Code Quality   ████████░░  20/25          ║
║  Documentation  ███████░░░  15/20          ║
║  Security       █████████░  18/20          ║
║  Tests          ██████░░░░  12/20          ║
║  Dependencies   ███░░░░░░░   9/15          ║
╚════════════════════════════════════════════╝
```

---

## 🔒 Security Scanning

RepoMedic's **SecretSweep** skill detects:

- AWS Access Keys, GitHub PATs, Slack tokens
- Stripe live keys, OpenAI API keys
- Hardcoded passwords and database URLs
- Private RSA/EC/PGP keys
- High-entropy strings in sensitive variables

All matches are **masked** in output — raw secrets are never stored or transmitted.

---

## 🏗 Architecture

```
repomedic-agent/
├── agent.yaml              # gitagent manifest
├── SOUL.md                 # Agent identity & personality
├── RULES.md                # Hard constraints & output contract
├── skills/                 # 6 skill definitions (SKILL.md)
│   ├── repo-analysis/
│   ├── security-scan/
│   ├── doc-analysis/
│   ├── test-analysis/
│   ├── dependency-analysis/
│   └── scoring/
├── tools/                  # MCP-compatible tool YAML schemas
│   ├── repo-fetch.yaml
│   ├── file-reader.yaml
│   ├── dependency-parser.yaml
│   └── secret-scanner.yaml
├── src/                    # Node.js implementation
│   ├── index.js            # Main orchestrator + CLI
│   ├── tools/              # Tool implementations
│   └── analyzers/          # Per-skill analyzers
├── knowledge/              # Agent reference knowledge
├── memory/                 # Persistent agent memory
├── hooks/                  # Lifecycle hooks
└── example-usage/          # Demo scripts + sample report
```

---

## 🔧 Configuration

| Flag | Default | Description |
|------|---------|-------------|
| `--repo` | required | GitHub URL or local path |
| `--branch` | `main` | Branch to analyze |
| `--pat` | — | GitHub PAT for private repos |
| `--output` | — | Save JSON report to file |
| `--json` | false | Print raw JSON only |
| `--no-registry` | false | Skip npm registry (faster, offline) |

---

## 🧬 gitagent Compliance

This agent is fully compliant with the gitagent 0.1.0 specification:

- ✅ `agent.yaml` with `spec_version`, `model`, `skills`, `tags`
- ✅ `SOUL.md` with identity, communication style, and values
- ✅ `RULES.md` with must-always / must-never / output contract
- ✅ 6 `skills/` with YAML frontmatter and detailed instructions
- ✅ 4 `tools/` with MCP-compatible YAML schemas
- ✅ `knowledge/`, `memory/`, `hooks/` directories
- ✅ Node.js only — no Python, no Docker, clawless compatible
- ✅ `npx gitagent validate` passes

---

## 📄 License

MIT — See [LICENSE](LICENSE)

---
