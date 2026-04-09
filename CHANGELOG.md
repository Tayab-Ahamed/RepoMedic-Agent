# Changelog

All notable changes to RepoMedic are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.0] — 2025-10-15

### Added
- 6-skill analysis pipeline: repo-analysis, security-scan, doc-analysis, test-analysis, dependency-analysis, scoring
- **SecretSweep**: 20+ regex patterns + Shannon entropy analysis for secret detection
- **DocDrift**: README section completeness + JSDoc coverage + documentation drift detection
- Proxy test coverage analysis via import mapping
- CVE pattern matching for 10 known vulnerable packages
- License risk analysis (GPL, AGPL, LGPL detection)
- Weighted 0–100 health score with A–F grading
- Top 5 Issues, Quick Wins, Risk Radar in final report
- `--no-registry` flag for offline/faster analysis
- `--json` flag for CI/CD pipeline integration
- Console report with ASCII progress bars
- `example-usage/` folder with offline demo + sample report
- `workflows/full-audit.yaml` and `workflows/security-only.yaml`
- `examples/` calibration interactions for scoring accuracy
- GitHub Actions: validate + self-audit CI pipeline
- Dependabot configuration for automated dependency updates
- AGENTS.md for framework-agnostic agent instructions

### Fixed
- `src/cli.js` bin entry now correctly re-exports index.js
- `agent.yaml` delegation mode set to valid `auto` value
- All SKILL.md frontmatter stripped to spec-compliant fields only
- Tool YAML schemas renamed `input` → `input_schema`, version fixed to semver

---

## [0.1.0] — 2025-09-30

### Added
- Initial project structure following gitagent 0.1.0 spec
- `agent.yaml` manifest with model preferences and compliance config
- `SOUL.md` — Senior Staff Engineer + Security Auditor identity
- `RULES.md` — hard constraints and output contract
- Basic skill definitions for all 6 analysis dimensions
- Tool schemas for repo-fetch, file-reader, dependency-parser, secret-scanner
