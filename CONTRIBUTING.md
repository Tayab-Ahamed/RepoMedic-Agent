# Contributing to RepoMedic

Thanks for taking the time to improve the project.

## Local setup

```bash
git clone https://github.com/Tayab-Ahamed/RepoMedic-Agent.git
cd RepoMedic-Agent
npm install
```

## Before you open a pull request

```bash
npm test
npm run lint
npm run validate
```

## Development workflow

- Use `feat/`, `fix/`, `docs/`, or `chore/` prefixes for branch names.
- Keep changes scoped to one clear improvement when possible.
- Add or update tests when analyzer logic, scoring, or parsing behavior changes.
- Update documentation when CLI flags, workflows, or report output changes.

## Pull request checklist

1. Explain the user-facing behavior change or scoring change.
2. Call out any changes to report shape, CLI behavior, or workflow files.
3. Include tests for parser, analyzer, or scoring changes.
4. Keep sample data and docs in sync if the output examples changed.

## Project areas

- `src/tools/` contains low-level repo fetch, file parsing, dependency, and secret scanning helpers.
- `src/analyzers/` contains the six audit stages and report assembly.
- `src/__tests__/` contains the local regression suite.
- `.github/workflows/` contains the validation and demo automation used by the repo.

## Good contribution candidates

- Improve signal quality for findings without increasing noise.
- Tighten report formatting or scoring explanations.
- Expand test coverage around edge cases in local path scanning and secret detection.
- Improve sample reports or demo flows for better offline evaluation.