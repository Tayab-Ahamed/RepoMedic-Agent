# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅ Yes    |
| 0.1.x   | ❌ No     |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report vulnerabilities via email to: security@repomedic.dev

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

In scope:
- Secret detection false negatives (we missed a real secret)
- Credential exposure in agent output
- Dependency vulnerabilities in RepoMedic itself

Out of scope:
- False positives in secret scanning (report as a regular issue)
- Feature requests
