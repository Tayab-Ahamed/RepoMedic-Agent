---
type: calibration
label: high-score-example
description: "Example of a well-maintained repo that scores A (90+). Used to calibrate severity thresholds."
expected_score_range: [88, 96]
---

# Example: High-Health Repository

## Input

```
Analyze https://github.com/sindresorhus/got
```

## Expected Agent Behavior

The agent should:
1. Detect TypeScript as primary language
2. Find comprehensive test coverage (proxy coverage >80%)
3. Find README with all required sections
4. Find lockfile present
5. Find CI/CD configured
6. Award high scores across all dimensions

## Expected Output Shape

```json
{
  "score": 91,
  "grade": "A",
  "breakdown": {
    "code_quality": 24,
    "docs": 18,
    "security": 19,
    "tests": 17,
    "dependencies": 13
  },
  "ai_insights": {
    "top_issues": [],
    "quick_wins": [
      "Add ARCHITECTURE.md for a codebase this large"
    ],
    "risks": []
  }
}
```

## Calibration Notes

- A repo with 0 high findings, lockfile, CI, and good README should never score below 80
- TypeScript repos with >60% proxy coverage deserve test scores of 14+/20
- A missing CHANGELOG.md should reduce docs score by at most 1 point
- Do not penalize for missing .env.example if the repo has no environment variables
