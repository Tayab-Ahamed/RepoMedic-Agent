/**
 * docAnalyzer.js — DocDrift: documentation completeness analyzer.
 */

const README_SECTIONS = [
  { key: 'description', keywords: ['about', 'overview', 'description', 'what is', 'introduction'], severity: 'high', label: 'Project description' },
  { key: 'installation', keywords: ['install', 'setup', 'getting started', 'quick start', 'prerequisite'], severity: 'high', label: 'Installation instructions' },
  { key: 'usage',        keywords: ['usage', 'how to use', 'example', 'examples', 'demo'], severity: 'high', label: 'Usage examples' },
  { key: 'config',       keywords: ['config', 'configuration', 'environment', 'env vars', 'env variables', '.env'], severity: 'medium', label: 'Configuration guide' },
  { key: 'contributing', keywords: ['contributing', 'development', 'how to contribute', 'pull request', 'pr'], severity: 'medium', label: 'Contributing guide' },
  { key: 'license',      keywords: ['license', 'licenced', 'licensed'], severity: 'medium', label: 'License section' },
];

const EXTRA_DOC_FILES = [
  { name: 'CHANGELOG.md',        severity: 'low',    hint: 'changelog, releases, or CHANGELOG.md' },
  { name: 'CONTRIBUTING.md',     severity: 'medium', hint: 'CONTRIBUTING.md' },
  { name: 'CODE_OF_CONDUCT.md',  severity: 'low',    hint: 'CODE_OF_CONDUCT.md' },
  { name: 'LICENSE',             severity: 'medium', hint: 'LICENSE or LICENSE.md' },
  { name: 'SECURITY.md',         severity: 'medium', hint: '.github/SECURITY.md or SECURITY.md' },
];

function headingsFromContent(content) {
  return content.split('\n')
    .map((line, i) => { const m = line.match(/^(#{1,6})\s+(.+)/); return m ? { level: m[1].length, text: m[2].trim().toLowerCase(), line: i + 1 } : null; })
    .filter(Boolean);
}

function checkReadmeSections(content, headings) {
  const fullText = content.toLowerCase();
  const found = {};
  for (const section of README_SECTIONS) {
    const inHeadings = headings.some(h => section.keywords.some(k => h.text.includes(k)));
    const inText = section.keywords.some(k => fullText.includes(k));
    found[section.key] = inHeadings || inText;
  }
  return found;
}

function scoreReadme(content, headings, sectionMap) {
  let score = 0;
  const lines = content.split('\n');
  const hasTitleInFirstTen = lines.slice(0, 10).some(l => l.startsWith('#'));
  const hasCodeBlock = content.includes('```');
  const hasBadges = content.includes('[![');
  const requiredPresent = ['description', 'installation', 'usage'].every(k => sectionMap[k]);
  if (hasTitleInFirstTen) score += 2;
  if (hasCodeBlock) score += 2;
  if (requiredPresent) score += 2;
  if (hasBadges) score += 1;
  if (sectionMap['contributing']) score += 1;
  if (sectionMap['license']) score += 1;
  if (sectionMap['config']) score += 1;
  return Math.min(score, 10);
}

function analyzeJsDocCoverage(sourceFileResults) {
  let totalExports = 0;
  let documentedExports = 0;
  for (const file of sourceFileResults) {
    if (!file.exports) continue;
    totalExports += file.exports.length;
    documentedExports += file.exports.filter(e => e.has_jsdoc).length;
  }
  if (totalExports === 0) return { ratio: null, total: 0, documented: 0 };
  return {
    ratio: Math.round((documentedExports / totalExports) * 100) / 100,
    total: totalExports,
    documented: documentedExports
  };
}

function checkDocDrift(readmeContent, packageJson) {
  if (!readmeContent || !packageJson) return [];
  const driftIssues = [];
  const scripts = packageJson.scripts || {};
  const scriptMentionPattern = /`npm run ([\w:.-]+)`|`yarn ([\w:.-]+)`/g;
  let m;
  while ((m = scriptMentionPattern.exec(readmeContent)) !== null) {
    const scriptName = m[1] || m[2];
    if (scriptName && !scripts[scriptName]) {
      driftIssues.push(`README references "npm run ${scriptName}" but this script is missing from package.json`);
    }
  }
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const pkgMentionPattern = /`npm install ([\w@/-]+)`|install\s+([\w@/-]+)/g;
  while ((m = pkgMentionPattern.exec(readmeContent)) !== null) {
    const pkgName = (m[1] || m[2])?.replace(/^@/, '');
    if (pkgName && !deps[pkgName] && !deps[`@${pkgName}`]) {
      // Only flag if it looks like a real package name (not a generic word)
      if (pkgName.length > 2 && !['node', 'npm', 'yarn', 'git'].includes(pkgName)) {
        driftIssues.push(`README mentions installing "${m[1] || m[2]}" but it's not in package.json`);
      }
    }
  }
  return driftIssues;
}

/**
 * Analyze documentation quality.
 */
export function analyzeDocs({ tree, fileContents = {}, sourceFileResults = [], packageJson = null }) {
  const paths = tree.map(f => f.path);
  const findings = [];
  let findingCounter = 1;

  // README
  const readmePath = paths.find(p => /readme\.(md|rst|txt)$/i.test(p));
  let readmeScore = 0;
  let readmeDetails = {};

  if (!readmePath) {
    findings.push({
      id: `DOC-${String(findingCounter++).padStart(3, '0')}`,
      skill: 'doc-analysis', severity: 'high',
      title: 'No README file found',
      impact: 'New contributors and users have no starting point. Discoverability, onboarding, and trust are severely damaged.',
      remediation: 'Create README.md at the repo root. Include: project name, description, installation, usage example, and license.'
    });
  } else {
    const readmeContent = fileContents[readmePath] || '';
    if (readmeContent.split('\n').length < 10) {
      findings.push({
        id: `DOC-${String(findingCounter++).padStart(3, '0')}`,
        skill: 'doc-analysis', severity: 'medium',
        title: 'README exists but is nearly empty',
        impact: 'A 10-line README provides essentially no value. Contributors cannot understand what the project does or how to use it.',
        remediation: 'Expand README to include at minimum: description, installation instructions, and a usage example with code.'
      });
    }
    const headings = headingsFromContent(readmeContent);
    const sectionMap = checkReadmeSections(readmeContent, headings);
    readmeScore = scoreReadme(readmeContent, headings, sectionMap);
    readmeDetails = { headings: headings.length, sections_found: sectionMap };

    for (const section of README_SECTIONS) {
      if (!sectionMap[section.key]) {
        findings.push({
          id: `DOC-${String(findingCounter++).padStart(3, '0')}`,
          skill: 'doc-analysis', severity: section.severity,
          title: `README missing: ${section.label}`,
          file: readmePath,
          impact: `Missing "${section.label}" section forces readers to guess. High bounce rate from README = lower contributor engagement.`,
          remediation: `Add a "## ${section.label.split(' ')[0]}" section to ${readmePath}.`
        });
      }
    }

    // Doc drift
    const driftIssues = checkDocDrift(readmeContent, packageJson);
    for (const issue of driftIssues) {
      findings.push({
        id: `DOC-${String(findingCounter++).padStart(3, '0')}`,
        skill: 'doc-analysis', severity: 'medium',
        title: `Documentation drift: ${issue}`,
        file: readmePath,
        impact: 'Stale documentation actively breaks the contributor experience and erodes trust.',
        remediation: 'Update README.md to match the actual commands and packages in package.json.'
      });
    }
  }

  // Extra doc files
  for (const docFile of EXTRA_DOC_FILES) {
    const exists = paths.some(p => p === docFile.name || p.endsWith('/' + docFile.name) || p.endsWith('/.github/' + docFile.name));
    if (!exists) {
      findings.push({
        id: `DOC-${String(findingCounter++).padStart(3, '0')}`,
        skill: 'doc-analysis', severity: docFile.severity,
        title: `Missing ${docFile.name}`,
        impact: docFile.name === 'LICENSE' ? 'Without a license, the code is legally All Rights Reserved by default. Nobody can legally use or contribute to it.' : `Missing ${docFile.name} reduces project professionalism and contributor clarity.`,
        remediation: `Add ${docFile.hint} to the repository root.`
      });
    }
  }

  // JSDoc coverage
  const jsDoc = analyzeJsDocCoverage(sourceFileResults);
  let jsDocFinding = null;
  if (jsDoc.total > 0) {
    if (jsDoc.ratio < 0.2) {
      jsDocFinding = { ratio: jsDoc.ratio, rating: 'Critical' };
      findings.push({
        id: `DOC-${String(findingCounter++).padStart(3, '0')}`,
        skill: 'doc-analysis', severity: 'medium',
        title: `JSDoc coverage critically low (${Math.round(jsDoc.ratio * 100)}% of ${jsDoc.total} exports)`,
        impact: 'Functions without documentation are black boxes. Increases onboarding time and bug risk.',
        remediation: 'Add JSDoc comments to all exported functions. Start with public API surface and utility functions.'
      });
    } else if (jsDoc.ratio < 0.5) {
      jsDocFinding = { ratio: jsDoc.ratio, rating: 'Poor' };
    }
  }

  // Calculate docs score (0-20)
  let docsScore = 0;
  // README quality: 0-10 maps to 0-12 points
  docsScore += Math.round((readmeScore / 10) * 12);
  // Findings deductions
  for (const f of findings) {
    if (f.severity === 'high') docsScore -= 4;
    else if (f.severity === 'medium') docsScore -= 2;
    else docsScore -= 1;
  }
  // JSDoc bonus
  if (jsDoc.ratio !== null) {
    if (jsDoc.ratio >= 0.8) docsScore += 4;
    else if (jsDoc.ratio >= 0.5) docsScore += 2;
  } else {
    docsScore += 4; // No JS exports — not penalized
  }
  docsScore = Math.max(0, Math.min(20, docsScore));

  return {
    docs_score: docsScore,
    readme: { path: readmePath || null, quality_score: readmeScore, ...readmeDetails },
    jsdoc: jsDoc,
    findings
  };
}
