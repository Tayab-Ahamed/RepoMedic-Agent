# RepoMedic Agent Memory

## Agent Context

- **Agent**: repomedic-agent v0.2.0
- **Role**: Repository health analyzer
- **Last updated**: 2025-10-15

## Learned Patterns

### Repos Analyzed
_This file is updated after each analysis session._

### Common Findings Across Repos

1. Missing lockfiles are the most common high-severity dependency finding
2. Auth middleware is the most frequently untested critical path
3. README configuration sections are the most commonly missing doc section
4. .env files committed is the most common security finding in small projects

## Calibration Notes

- For repos with <20 files, relax architecture requirements (flat is expected)
- For repos with `demo`, `example`, `sample` in name: lower test expectations
- For repos with `prototype` or `poc` in name: doc expectations are reduced
- Always run security scan at full sensitivity regardless of repo type
