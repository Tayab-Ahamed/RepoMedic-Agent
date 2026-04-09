#!/usr/bin/env node
/**
 * RepoMedic CLI — bin entry point
 * This file exists so `npx repomedic` works after global install.
 *
 * Usage:
 *   npx repomedic --repo https://github.com/owner/repo
 *   repomedic --repo ./local-path --output report.json
 */

import { main } from './index.js';

const exitCode = await main();
process.exit(exitCode);
