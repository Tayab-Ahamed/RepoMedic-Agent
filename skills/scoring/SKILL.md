---
name: scoring
description: "Aggregates findings from all upstream skills into a weighted health score (0–100), produces a structured JSON report, generates a Top 5 Issues summary, Quick Wins list, and Risk Radar. This is the final skill in the pipeline."
allowed-tools: Bash Read Write
---

# Skill: Scoring & Report Generation

## Purpose

Synthesize every finding from the 5 upstream skills into a single, actionable health report. The score must be defensible — every point deducted maps to a specific finding.

---

## Inputs

All upstream skill outputs are required:

| Input | Source Skill |
|-------|-------------|
| `repo_analysis_result` | repo-analysis |
| `security_findings` | security-scan |
| `doc_findings` | doc-analysis |
| `test_findings` | test-analysis |
| `dependency_findings` | dependency-analysis |

---

## Score Weights

| Dimension | Max Points | Weight |
|-----------|------------|--------|
| Code Quality | 25 | 25% |
| Documentation | 20 | 20% |
| Security | 20 | 20% |
| Tests | 20 | 20% |
| Dependencies | 15 | 15% |
| **Total** | **100** | **100%** |

---

## Scoring Algorithm

### Code Quality (25 pts)

Start at 25. Apply deductions:

| Finding | Deduction |
|---------|-----------|
| High structural finding (missing .gitignore, node_modules committed) | -5 each |
| Medium structural finding (large files, deep nesting) | -2 each |
| Low structural finding | -1 each |
| No CI/CD configured | -4 |
| No `engines` field in package.json | -1 |

Minimum: 0.

### Documentation (20 pts)

Use the score directly from `doc-analysis` skill (0–20).

### Security (20 pts)

Use the score directly from `security-scan` skill (0–20).

### Tests (20 pts)

Use the score directly from `test-analysis` skill (0–20).

### Dependencies (15 pts)

Use the score directly from `dependency-analysis` skill (0–15).

---

## Aggregate Score

```
total = code_quality + docs + security + tests + dependencies
```

Cap at 100. Do not round up.

---

## Score Interpretation

| Score | Grade | Label |
|-------|-------|-------|
| 90–100 | A | Excellent — Production Ready |
| 80–89 | B | Good — Minor Issues |
| 70–79 | C | Fair — Needs Attention |
| 60–69 | D | Poor — Significant Gaps |
| 50–59 | E | Weak — High Risk |
| <50 | F | Critical — Do Not Ship |

---

## Top 5 Issues Algorithm

From all findings across all skills:

1. Collect all findings into a flat array
2. Sort by: `severity_weight * impact_score`
   - `high` = 3, `medium` = 2, `low` = 1
3. Deduplicate by `file` + `pattern`
4. Take top 5

Format each:

```json
{
  "rank": 1,
  "id": "SEC-001",
  "title": "AWS Access Key exposed in src/config/aws.js",
  "severity": "high",
  "skill": "security-scan",
  "one_liner": "Exposed credentials can lead to immediate AWS account compromise."
}
```

---

## Quick Wins Algorithm

From all findings, select items where:
- `severity` is `low` or `medium`
- `auto_fixable` is `true` OR remediation is a single command (e.g., `npm update X`)
- Estimated fix time <30 minutes

Cap at 5 quick wins. These are wins the dev can do right now.

---

## Risk Radar

Identify items most likely to cause a production incident or security breach:

1. Any `high` security finding
2. Untested auth/payment paths
3. Dependencies with known CVE patterns
4. Missing lockfile
5. No CI (changes ship without tests running)

Format:

```json
{
  "id": "RISK-001",
  "title": "No lockfile — dependency versions not pinned",
  "probability": "high",
  "impact": "high",
  "scenario": "A dependency publishes a breaking or malicious version. Without a lockfile, the next npm install will silently pick it up."
}
```

---

## Final Report Assembly

Run the scoring script:

```bash
node scripts/scorer.js \
  --repo-analysis /tmp/repo-analysis.json \
  --security /tmp/security.json \
  --docs /tmp/docs.json \
  --tests /tmp/tests.json \
  --deps /tmp/deps.json \
  --output /tmp/final-report.json
```

---

## Output Contract

The final report MUST match this exact JSON structure:

```json
{
  "meta": {
    "repo": "owner/repo",
    "analyzed_at": "2025-10-15T10:30:00Z",
    "agent_version": "0.2.0",
    "total_files_analyzed": 142,
    "total_findings": 18
  },
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
  "issues": [
    {
      "id": "SEC-001",
      "skill": "security-scan",
      "severity": "high",
      "title": "...",
      "file": "...",
      "impact": "...",
      "remediation": "..."
    }
  ],
  "recommendations": [
    "Add SECURITY.md to define your vulnerability disclosure process",
    "Configure Dependabot to receive automated dependency update PRs",
    "Add authentication middleware tests — this is your highest-risk untested path"
  ],
  "ai_insights": {
    "top_issues": [],
    "quick_wins": [],
    "risks": []
  },
  "summary": "This repository shows solid fundamentals but carries meaningful security and test coverage risk. The exposed credential in src/config/aws.js requires immediate action. Once that is resolved, focus on authentication test coverage before the next production deployment."
}
```

---

## Print Summary to Console

After generating the JSON report, also print a human-readable summary:

```
╔══════════════════════════════════════╗
║        RepoMedic Health Report       ║
╠══════════════════════════════════════╣
║  Repo:        owner/repo             ║
║  Score:       72/100  Grade: C       ║
║  Findings:    18 (3 high, 9 med, 6)  ║
╠══════════════════════════════════════╣
║  Code Quality   ████████░░  20/25    ║
║  Documentation  ███████░░░  15/20    ║
║  Security       █████████░  18/20    ║
║  Tests          ██████░░░░  12/20    ║
║  Dependencies   ███░░░░░░░   7/15    ║
╚══════════════════════════════════════╝
```
