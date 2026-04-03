---
name: test-analysis
description: "Analyzes test coverage, test file structure, testing framework usage, and identifies untested critical paths. Flags missing tests for exported functions, API routes, and core business logic."
allowed-tools: Bash Read Write
---

# Skill: Test Analysis

## Purpose

A codebase with no tests, or tests that don't cover critical paths, is a time bomb. This skill maps what's tested, what isn't, and what absolutely needs to be.

---

## Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo_path` | string | yes | Path to repository |
| `repo_analysis` | object | yes | Output from `repo-analysis` skill |
| `source_files` | array | yes | List of source files from structural map |

---

## Test File Detection

### Detect Test Files

A file is a test file if any of these match:
- Path contains: `__tests__/`, `test/`, `tests/`, `spec/`, `e2e/`
- Filename matches: `*.test.js`, `*.spec.js`, `*.test.ts`, `*.spec.ts`, `*.test.jsx`, `*.spec.tsx`

### Detect Test Frameworks

Check `package.json` devDependencies and file content for:

| Framework | Detection |
|-----------|-----------|
| Jest | `jest` in deps, `describe(`, `it(`, `test(` |
| Vitest | `vitest` in deps, `import { describe }` from vitest |
| Mocha | `mocha` in deps, `describe(`, `it(` |
| Jasmine | `jasmine` in deps |
| AVA | `ava` in deps |
| Node Test Runner | `import { test } from 'node:test'` |
| None detected | no test framework found → **high** finding |

---

## Coverage Analysis (Proxy Method)

Since we can't run tests in analysis mode, use a **proxy coverage** approach:

### Step 1 — Map Source Exports

For each source file, count:
- Exported functions/classes/constants
- Async functions (higher risk if untested)
- API route handlers (`app.get`, `router.post`, etc.)

### Step 2 — Map Test Imports

For each test file, extract `import` / `require` statements. Map which source files are imported by tests.

### Step 3 — Compute Proxy Coverage

```
proxy_coverage = tested_source_files / total_source_files
```

| Coverage | Rating |
|----------|--------|
| >0.80 | Strong |
| 0.60–0.80 | Acceptable |
| 0.40–0.60 | Weak |
| 0.20–0.40 | Poor |
| <0.20 | Critical |

---

## Critical Path Detection

Flag these as untested if no test file imports them:

1. **Auth/session modules** — files named `auth.js`, `session.js`, `jwt.js`, `middleware/auth.*`
2. **API route files** — files in `routes/`, `api/`, `controllers/` with no corresponding test
3. **Data models** — files in `models/`, `schema/`, `db/`
4. **Payment/billing logic** — files named `payment.js`, `billing.js`, `stripe.js`
5. **Config/environment handling** — `config.js`, `env.js`

Any critical path file with no test coverage → **high** finding.

---

## Test Quality Signals

Scan existing test files for anti-patterns:

| Anti-pattern | Detection | Severity |
|---|---|---|
| Empty test blocks | `it('...', () => {})` or `test('...', () => {})` with no assertions | medium |
| `console.log` in tests | `console.log` in test files | low |
| Hardcoded waits | `setTimeout(`, `sleep(` with literal values | medium |
| No assertions per test | test functions with no `expect(` or `assert.` | high |
| Snapshot-only tests | only `toMatchSnapshot()` — brittle | low |
| `test.skip` or `it.skip` | disabled tests | low |
| `describe.only` or `it.only` | focused tests accidentally committed | medium |

---

## Test Configuration Check

Verify test infrastructure:

| Item | Check | Severity if Missing |
|------|-------|---------------------|
| Test script in `package.json` | `scripts.test` exists and isn't `"echo no tests"` | high |
| Test framework installed | in `devDependencies` | high |
| Coverage config | `jest --coverage`, `c8`, `nyc` in scripts | medium |
| CI runs tests | `.github/workflows/*.yml` contains `npm test` or `yarn test` | medium |

---

## Execution Steps

### Step 1 — Discover Test Files

```bash
node scripts/test-analyzer.js --path ./repo --output /tmp/test-report.json
```

### Step 2 — Map Coverage

Parse source and test imports to build coverage map.

### Step 3 — Flag Untested Critical Paths

Cross-reference critical path files against coverage map.

### Step 4 — Assemble Findings

```json
{
  "id": "TEST-002",
  "skill": "test-analysis",
  "severity": "high",
  "title": "Authentication middleware has no test coverage",
  "file": "src/middleware/auth.js",
  "impact": "Bugs in authentication logic ship silently. Any regression could expose protected routes.",
  "remediation": "Create src/middleware/auth.test.js. Test: valid token passes, expired token rejects, malformed token throws, missing token returns 401.",
  "suggested_test_cases": [
    "should allow requests with valid JWT",
    "should reject requests with expired JWT",
    "should reject requests with no Authorization header",
    "should reject requests with malformed token"
  ]
}
```

---

## Scoring Contribution

Test skill contributes **20 points** to the total score.

| Condition | Points |
|-----------|--------|
| Strong coverage, quality tests, CI configured | 18–20 |
| Acceptable coverage, some gaps | 13–17 |
| Tests exist but weak coverage | 8–12 |
| Minimal tests, critical paths untested | 4–7 |
| No test files or framework | 0–3 |
