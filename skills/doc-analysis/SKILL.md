---
name: doc-analysis
description: "DocDrift — analyzes repository documentation for completeness, freshness, and accuracy. Checks README quality, inline code documentation, API docs, and compares documented surface area against actual code."
allowed-tools: Bash Read Write
version: "1.0"
author: RepoMedic
tags:
  - documentation
  - readme
  - quality
---

# Skill: Documentation Analysis (DocDrift)

## Purpose

Undocumented code is unfinished code. DocDrift audits whether the repository's documentation matches its complexity — and flags every gap that would slow down a new contributor.

---

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | yes | Path to repository |
| `repo_analysis` | object | yes | Output from `repo-analysis` skill |
| `file_contents` | object | yes | Key-value of `filepath → content` for doc files |

---

## README Analysis

### Existence Check

If no `README.md` or `README.rst` exists at the repo root → **high** finding ("No README").

### Section Completeness

Parse the README and check for these required sections (by heading keyword matching):

| Section | Keywords to Match | Severity if Missing |
|---------|-------------------|---------------------|
| What it does | `about`, `overview`, `description`, `what is` | high |
| Installation | `install`, `setup`, `getting started`, `quick start` | high |
| Usage | `usage`, `how to use`, `example`, `examples` | high |
| Configuration | `config`, `configuration`, `environment`, `env vars` | medium |
| Contributing | `contributing`, `development`, `how to contribute` | medium |
| License | `license` | medium |
| Badges | (presence of `[![` in README) | low |
| API Reference | `api`, `reference`, `endpoints`, `methods` | low (only if code has API patterns) |

### README Quality Scoring

Score the README from 0–10:
- +2: Has title and description in first 10 lines
- +2: Has working code example (fenced code block present)
- +2: Has all 3 required sections (install, usage, description)
- +1: Has badges (build status, coverage, version)
- +1: Has contributing guide or link to one
- +1: Has license section
- +1: Has changelog or link to CHANGELOG

---

## Inline Documentation Check

Analyze source files for documentation coverage:

### For JavaScript / TypeScript

Use the `file-reader` tool to scan `.js`, `.ts`, `.jsx`, `.tsx` files:

1. Count exported functions/classes/types
2. Count how many have JSDoc comments (`/** ... */`)
3. Compute: `jsdoc_ratio = documented / total_exports`

| Ratio | Rating |
|-------|--------|
| >0.8 | Excellent |
| 0.5–0.8 | Acceptable |
| 0.2–0.5 | Poor |
| <0.2 | Critical |

### Public API Detection

Flag public API patterns without documentation:
- `export function` / `export const` / `export class` without preceding JSDoc
- `module.exports` without a comment block above
- REST route definitions (`app.get(`, `router.post(`, etc.) without comments

---

## Documentation Freshness (DocDrift Detection)

Compare documented claims against actual code:

1. If README mentions installing with `npm install <package>` → verify that package is in `package.json`
2. If README mentions a script (`npm run build`) → verify it exists in `package.json scripts`
3. If README documents environment variables → check if a `.env.example` file exists

Any mismatch = **medium** finding ("Documentation drift detected").

---

## Additional Doc Files Check

| File | Severity if Missing |
|------|---------------------|
| `CHANGELOG.md` or `CHANGELOG` | low |
| `CONTRIBUTING.md` | medium |
| `CODE_OF_CONDUCT.md` | low |
| `LICENSE` or `LICENSE.md` | medium |
| `.env.example` (if `.env` mentioned) | medium |
| `ARCHITECTURE.md` or `docs/` folder (if repo >50 files) | low |

---

## Execution Steps

### Step 1 — Fetch README

```bash
node scripts/doc-analyzer.js --path ./repo --output /tmp/doc-report.json
```

### Step 2 — Check Section Completeness

Parse README markdown headings. Match keywords case-insensitively.

### Step 3 — Scan Source for JSDoc

Walk all `.js` / `.ts` files. For each exported symbol, check if a JSDoc block precedes it within 3 lines.

### Step 4 — Cross-check README vs Code

Verify README claims against `package.json`. Log all mismatches.

### Step 5 — Assemble Finding Objects

```json
{
  "id": "DOC-003",
  "skill": "doc-analysis",
  "severity": "medium",
  "title": "README references npm run test but script is missing",
  "file": "README.md",
  "line": 34,
  "impact": "Contributors following the README will hit errors immediately, increasing friction and reducing contributions.",
  "remediation": "Add a 'test' script to package.json, or update the README to reflect the correct command."
}
```

---

## Scoring Contribution

Docs skill contributes **20 points** to the total score.

| Condition | Points |
|-----------|--------|
| README complete, all sections, JSDoc >80% | 18–20 |
| README good, minor gaps | 13–17 |
| README exists but thin, low JSDoc | 8–12 |
| README missing major sections | 4–7 |
| No README | 0–3 |
