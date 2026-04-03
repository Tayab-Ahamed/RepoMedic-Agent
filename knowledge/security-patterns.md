# Security Patterns Reference

This knowledge file provides the agent with security pattern context during analysis.

## OWASP Top 10 Mapping

| OWASP Category | RepoMedic Check |
|---|---|
| A01: Broken Access Control | Auth middleware test coverage |
| A02: Cryptographic Failures | Hardcoded secrets, weak JWT config |
| A03: Injection | Parameterized queries check |
| A05: Security Misconfiguration | SECURITY.md, Dependabot, .gitignore |
| A06: Vulnerable Components | Dependency analysis, known CVEs |
| A09: Security Logging | Audit logging presence |

## Secret Severity Rationale

**HIGH** — Immediate breach risk, rotate within minutes:
- Cloud provider keys (AWS, GCP, Azure)
- Source control tokens (GitHub PAT)
- Payment processor keys (Stripe live)
- Private cryptographic keys (RSA, EC, PGP)

**MEDIUM** — Sensitive, investigate within hours:
- Generic API keys and passwords
- Database connection strings with credentials
- JWT secrets
- Internal service tokens

**LOW** — Informational, address in next sprint:
- Placeholder/default credentials
- TODO comments referencing secrets
- Files that should be gitignored

## Remediation Priority Matrix

```
Impact\Likelihood →  Low    Medium  High
HIGH               | P2  |  P1  |  P0  |
MEDIUM             | P3  |  P2  |  P1  |
LOW                | P4  |  P3  |  P2  |
```

P0 = Fix immediately (today)
P1 = Fix this sprint
P2 = Fix next sprint
P3 = Track in backlog
P4 = Informational

## Supply Chain Attack Indicators

Flag these patterns as supply-chain risk:
- Packages with `*` or `latest` version specifier
- Packages last published >2 years ago with <100 weekly downloads
- Packages with `deprecated` flag in npm registry
- Packages with mismatched name/scope (typosquatting)
