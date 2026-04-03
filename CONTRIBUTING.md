# Contributing to RepoMedic

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/your-org/RepoMedic-Agent
cd repomedic-agent
npm install
```

## Running Tests

```bash
npm test
```

## Running Locally

```bash
node src/index.js --repo https://github.com/expressjs/express
```

## Branch Naming

- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation only
- `security/` — security-related changes

## Pull Request Process

1. Fork the repo
2. Create a feature branch
3. Add tests for new functionality
4. Ensure `npx gitagent validate` passes
5. Open a PR against `main`

## Adding a New Skill

1. Create `skills/your-skill/SKILL.md` with YAML frontmatter
2. Add the skill name to `agent.yaml` under `skills:`
3. Implement the analyzer in `src/analyzers/yourSkill.js`
4. Wire it into `src/index.js`
5. Add scoring contribution to `src/analyzers/scorer.js`
