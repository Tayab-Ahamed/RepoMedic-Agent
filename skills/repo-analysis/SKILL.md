---
name: repo-analysis
description: "Fetches and maps a GitHub repository structure. Accepts a GitHub URL or local path, enumerates all files, detects language composition, identifies architectural patterns, and produces a structural map for downstream skills."
allowed-tools: Bash Read Write
version: "1.0"
author: RepoMedic
tags:
  - analysis
  - structure
  - architecture
---

# Skill: Repository Analysis

## Purpose

Build a complete structural map of the target repository. This is the **first skill** that must run — every downstream skill depends on its output.

---

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_url` | string | yes | GitHub URL (`https://github.com/owner/repo`) or local path |
| `branch` | string | no | Branch to analyze (default: `main` or `master`) |
| `github_pat` | string | no | Personal Access Token for private repos |
| `max_files` | number | no | Cap file enumeration (default: 500) |

---

## Execution Steps

### Step 1 — Fetch the Repository

Run the `repo-fetch` tool with the provided URL.

- If it's a GitHub URL → use the GitHub API (no cloning required):
  ```
  GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1
  ```
- If it's a local path → use `scripts/map-local.js` to walk the filesystem
- Store the file tree in memory as `repoTree[]`

### Step 2 — Classify Files

For each file in `repoTree`, classify it:

| Category | Patterns |
|----------|----------|
| Source code | `*.js`, `*.ts`, `*.jsx`, `*.tsx`, `*.mjs`, `*.cjs` |
| Config | `*.json`, `*.yaml`, `*.yml`, `*.toml`, `*.env*` |
| Documentation | `*.md`, `*.mdx`, `*.rst`, `*.txt` |
| Tests | `*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/` |
| CI/CD | `.github/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/` |
| Docker | `Dockerfile`, `docker-compose*` |
| Secrets risk | `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*` |

### Step 3 — Language & Framework Detection

Detect primary language and framework from:
- File extensions in `repoTree`
- `package.json` → `dependencies` / `devDependencies`
- Config file presence (`next.config.js` → Next.js, `vite.config*` → Vite, etc.)

### Step 4 — Architecture Pattern Detection

Check for known patterns:
- **Monorepo**: `packages/`, `apps/`, `workspaces` in `package.json`
- **MVC**: `controllers/`, `models/`, `views/` or `routes/`
- **Feature-sliced**: `features/`, `modules/`, `domains/`
- **Flat**: everything in `src/` or root
- **Microservices**: multiple `Dockerfile`s, separate `package.json`s in subdirs

### Step 5 — Produce Structural Summary

Output a JSON object:

```json
{
  "repo": "owner/repo",
  "branch": "main",
  "total_files": 142,
  "file_categories": {
    "source": 67,
    "tests": 18,
    "docs": 9,
    "config": 14,
    "cicd": 3,
    "other": 31
  },
  "primary_language": "TypeScript",
  "frameworks": ["Next.js", "Tailwind CSS"],
  "architecture": "feature-sliced",
  "has_package_json": true,
  "has_lockfile": true,
  "has_gitignore": true,
  "has_env_example": false,
  "has_ci": true,
  "test_ratio": 0.27
}
```

---

## Code Quality Sub-Analysis

While mapping, also flag structural quality issues:

- **Deeply nested directories** (>5 levels) → medium finding
- **Very large files** (>500 lines) detected via file size → low finding
- **No `src/` or organizational structure** in repos >20 files → medium finding
- **Missing `.gitignore`** → high finding (secrets risk)
- **`node_modules/` committed** (appears in tree) → high finding

---

## Script Reference

Run `scripts/repo-fetch.js` for API-based fetching:

```bash
node scripts/repo-fetch.js --url https://github.com/owner/repo --branch main
```

Run `scripts/map-local.js` for local path analysis:

```bash
node scripts/map-local.js --path ./my-repo
```

---

## Output Contract

Pass the structural summary to the orchestrator as `REPO_ANALYSIS_RESULT`. All downstream skills read from this object.
