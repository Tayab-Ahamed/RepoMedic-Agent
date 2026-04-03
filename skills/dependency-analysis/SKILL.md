---
name: dependency-analysis
description: "Parses package.json to detect outdated dependencies, known vulnerability patterns, abandoned packages, license risks, and dependency bloat. Uses npm registry API — no system binaries required."
allowed-tools: Bash Read Write
version: "1.0"
author: RepoMedic
tags:
  - dependencies
  - security
  - supply-chain
---

# Skill: Dependency Analysis

## Purpose

Your dependencies are your attack surface. A single outdated package with a known CVE can compromise an entire application. This skill audits every dependency in the graph.

---

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | yes | Path to repository |
| `package_json` | object | yes | Parsed `package.json` contents |
| `lockfile_present` | boolean | yes | Whether `package-lock.json` or `yarn.lock` exists |

---

## Execution Steps

### Step 1 — Parse package.json

Use the `dependency-parser` tool:

```bash
node scripts/dependency-parser.js --path ./repo/package.json --output /tmp/deps.json
```

Extract:
- `dependencies` (production)
- `devDependencies`
- `peerDependencies`
- `engines` (Node.js version constraints)

### Step 2 — Check npm Registry

For each production dependency, query the npm registry:

```
GET https://registry.npmjs.org/{package}/latest
```

Compare installed version (from `package.json`) against latest version.

Categorize staleness:
- **Patch behind** (e.g., `1.2.3` vs `1.2.9`) → low
- **Minor behind** (e.g., `1.2.x` vs `1.5.x`) → low–medium
- **Major behind** (e.g., `1.x.x` vs `3.x.x`) → medium–high (breaking changes + unpatched vulns)

### Step 3 — Vulnerability Pattern Matching

Check against known high-profile vulnerability patterns for common packages:

| Package | Known Issue Pattern |
|---------|---------------------|
| `lodash` < 4.17.21 | Prototype pollution (CVE-2020-8203) |
| `axios` < 1.6.0 | SSRF / credential exposure |
| `jsonwebtoken` < 9.0.0 | Algorithm confusion attacks |
| `express` < 4.18.0 | ReDoS vulnerabilities |
| `minimist` < 1.2.6 | Prototype pollution |
| `node-fetch` < 2.6.7 | Redirect exposure |
| `sharp` (check for native deps) | Build compatibility issues |
| `node-gyp` in deps | Native build requirement — clawless incompatible |

> **Note**: Do not invent CVEs. Only flag packages on this known list or with versions >2 major versions behind.

### Step 4 — Abandoned Package Detection

Flag packages that match any of these signals:
- Last publish date >2 years ago (check `time.modified` in registry response)
- Weekly downloads <100 (check `downloads` endpoint)
- Has `deprecated` field set in registry response → **high** finding

### Step 5 — License Risk Analysis

For each production dependency, check `license` field in registry response:

| License | Risk Level |
|---------|------------|
| MIT, Apache-2.0, BSD-* | None |
| ISC, 0BSD, Unlicense | None |
| LGPL-2.1, LGPL-3.0 | Low (copyleft, may require disclosure) |
| GPL-2.0, GPL-3.0 | High (strong copyleft — may infect your codebase) |
| AGPL-3.0 | High (network copyleft) |
| UNLICENSED or missing | Medium (no explicit permission to use) |
| Commercial/proprietary | High (requires license purchase) |

### Step 6 — Dependency Health Checks

| Check | Severity if Failed |
|-------|--------------------|
| No lockfile (`package-lock.json` or `yarn.lock`) | high |
| `^` or `~` on major production deps (loose pinning) | low |
| `*` version specifier in production deps | high |
| >100 direct production dependencies | medium |
| `node_modules` in repo | high |
| `.npmrc` with auth token hardcoded | high |

---

## Findings Format

```json
{
  "id": "DEP-004",
  "skill": "dependency-analysis",
  "severity": "high",
  "title": "lodash@4.17.15 — prototype pollution vulnerability",
  "package": "lodash",
  "installed_version": "4.17.15",
  "latest_version": "4.17.21",
  "cve_pattern": "CVE-2020-8203",
  "impact": "Prototype pollution can allow attackers to inject properties onto Object.prototype, potentially leading to Remote Code Execution in server-side contexts.",
  "remediation": "Run: npm update lodash. If version is locked via another dependency, add a resolutions entry in package.json.",
  "auto_fixable": true
}
```

---

## Batch Rate Limiting

When querying the npm registry for many packages, batch requests and add 100ms delay between requests to avoid rate limiting. Use `Promise.allSettled()` — do not let one failed lookup fail the entire analysis.

---

## Scoring Contribution

Dependency skill contributes **15 points** to the total score.

| Condition | Points |
|-----------|--------|
| All deps current, lockfile present, no risks | 13–15 |
| Minor version gaps, no critical vulns | 10–12 |
| Some medium-risk deps, lockfile present | 7–9 |
| Major version gaps or abandoned deps | 4–6 |
| Known CVE patterns or no lockfile | 0–3 |
