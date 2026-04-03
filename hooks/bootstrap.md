# Bootstrap Hook

## Runs On: Agent Startup

Execute these steps before the first analysis task:

1. **Verify Node.js version**
   ```bash
   node --version  # Must be >= 18.0.0
   ```

2. **Verify network access** (optional, skip if --no-registry flag is set)
   ```bash
   curl -s https://registry.npmjs.org/express/latest > /dev/null && echo "Registry OK"
   ```

3. **Load security patterns from knowledge/**
   - Read `knowledge/security-patterns.md`
   - Load pattern severity rationale into working context

4. **Initialize finding counter at 1** for each skill

5. **Set analysis mode**
   - If `REPOMEDIC_STRICT=true` env var: apply strictest thresholds
   - If `REPOMEDIC_OFFLINE=true` env var: skip registry checks

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPOMEDIC_STRICT` | false | Apply strictest scoring thresholds |
| `REPOMEDIC_OFFLINE` | false | Skip npm registry and GitHub API calls |
| `GITHUB_TOKEN` | null | Fallback GitHub PAT if --pat not provided |
| `REPOMEDIC_MAX_FILES` | 800 | Maximum files to enumerate |
