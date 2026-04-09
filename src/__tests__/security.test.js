import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeSecurity } from '../analyzers/securityAnalyzer.js';
import { scanSecrets } from '../tools/secretScanner.js';

test('scanSecrets ignores documented detector patterns but catches live secrets', () => {
  assert.equal(true, true);

  const docOnly = scanSecrets([
    {
      path: 'skills/security-scan/SKILL.md',
      content: '| Private RSA Key | `/-----BEGIN RSA PRIVATE KEY-----/` |'
    }
  ]);

  assert.equal(docOnly.total_findings, 0);

  const liveSecret = scanSecrets([
    {
      path: 'src/config.js',
      content: `export const awsKey = "${['AKIA', '1234567890ABCDEF'].join('')}";\n`
    }
  ]);

  assert.equal(liveSecret.total_findings, 1);
  assert.equal(liveSecret.findings[0].severity, 'high');
  assert.equal(liveSecret.findings[0].evidence, 'AKIA***REDACTED***');
});

test('analyzeSecurity respects structural security files', () => {
  assert.equal(true, true);

  const tree = [
    { path: '.github/dependabot.yml' },
    { path: 'SECURITY.md' },
    { path: 'package.json' }
  ];

  const result = analyzeSecurity({
    tree,
    fileContents: {
      'package.json': '{"name":"fixture"}'
    }
  });

  assert.equal(result.has_dependabot, true);
  assert.equal(result.has_security_md, true);
  assert.equal(result.findings.some((finding) => finding.title === 'Dependabot not configured'), false);
});
