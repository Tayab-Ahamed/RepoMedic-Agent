---
type: calibration
label: edge-cases
description: "Edge cases the agent must handle correctly without over-penalizing."
---

# Edge Cases & Calibration Rules

## Case 1: Prototype / Demo Repos

**Signal**: repo name contains `demo`, `example`, `sample`, `poc`, `prototype`, `playground`

**Rule**: Reduce test and doc severity expectations by one level.
- Missing tests → `medium` (not `high`)
- Missing CONTRIBUTING.md → `low` (not `medium`)

**Do NOT reduce**: Security findings. Secrets are always `high` regardless of repo type.

---

## Case 2: Repos with <20 Files

**Signal**: `total_files < 20`

**Rule**: Do not flag "no organizational structure" or "flat architecture" as findings.
Small repos are expected to be flat.

---

## Case 3: Libraries vs Applications

**Signal**: `package.json` has `main` field but no `scripts.start` or `scripts.dev`

**Rule**: This is likely a library, not an app.
- Do not flag missing `.env.example` (libraries rarely need env vars)
- Do not flag missing CI if the repo is <6 months old

---

## Case 4: Monorepos

**Signal**: `packages/` or `apps/` directories, or `workspaces` in `package.json`

**Rule**: Analyze the root `package.json` for dependencies.
Report architecture as `monorepo` and note it in summary.
Do not flag "no src/ structure" — monorepos use workspace dirs instead.

---

## Case 5: Repos with Test Coverage Config but No Tests Yet

**Signal**: Jest or Vitest in `devDependencies` + `scripts.test` exists + zero `*.test.*` files

**Rule**: Flag as `medium` ("Test framework configured but no tests written") not `high`.
The developer has intent — reward the setup even if tests are missing.

---

## Case 6: False Positive Secret Detection

**Signal**: File is `*.test.*` or `*.spec.*` or in `__tests__/` and matches a secret pattern

**Rule**: Reduce severity from `high` to `low` — test files commonly use fake/mock credentials.
Add note: "Detected in test file — verify this is a mock value."
