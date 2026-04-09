---
type: calibration
label: low-score-example
description: "Example of a poorly maintained repo that scores F (<50). Used to calibrate high-severity detection."
expected_score_range: [20, 45]
---

# Example: Low-Health Repository

## Input

```
Analyze a repo with: committed .env, no tests, no README, no lockfile, AWS key in config.js
```

## Expected Agent Behavior

The agent should:
1. Flag .env file as HIGH severity immediately
2. Flag AWS key pattern as HIGH severity
3. Flag zero test files as HIGH severity
4. Flag missing README as HIGH severity
5. Flag missing lockfile as HIGH severity
6. Score should be below 50 (F grade)

## Expected Output Shape

```json
{
  "score": 28,
  "grade": "F",
  "label": "Critical — Do Not Ship",
  "breakdown": {
    "code_quality": 8,
    "docs": 0,
    "security": 0,
    "tests": 0,
    "dependencies": 3
  },
  "ai_insights": {
    "top_issues": [
      { "rank": 1, "severity": "high", "title": "AWS Access Key exposed" },
      { "rank": 2, "severity": "high", "title": ".env committed" },
      { "rank": 3, "severity": "high", "title": "No test files found" },
      { "rank": 4, "severity": "high", "title": "No README" },
      { "rank": 5, "severity": "high", "title": "No lockfile" }
    ]
  }
}
```

## Calibration Notes

- An exposed AWS key MUST set security_score to 0 or near 0
- Zero test files MUST result in test_score of 0–3
- A missing README MUST result in docs_score of 0–3
- Multiple HIGH findings should never yield a score above 40
- The agent must NOT soften language for repos this broken
