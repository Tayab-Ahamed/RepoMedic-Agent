/**
 * dependencyParser.js
 * Parses package.json and queries the npm registry for dependency health.
 * Uses Node 18+ native fetch — no axios or node-fetch needed.
 */

const LICENSE_RISK = {
  'MIT': 'none', 'Apache-2.0': 'none', 'BSD-2-Clause': 'none',
  'BSD-3-Clause': 'none', 'ISC': 'none', '0BSD': 'none',
  'Unlicense': 'none', 'CC0-1.0': 'none',
  'LGPL-2.1': 'low', 'LGPL-3.0': 'low', 'MPL-2.0': 'low',
  'GPL-2.0': 'high', 'GPL-3.0': 'high', 'AGPL-3.0': 'high',
  'SSPL-1.0': 'high', 'BUSL-1.1': 'high',
};

function parseSemver(v) {
  const clean = v.replace(/^[\^~>=<\s]+/, '').split('-')[0];
  const parts = clean.split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function versionGap(declared, latest) {
  if (!declared || !latest) return 'unknown';
  const d = parseSemver(declared);
  const l = parseSemver(latest);
  if (d.major < l.major) return 'major';
  if (d.minor < l.minor) return 'minor';
  if (d.patch < l.patch) return 'patch';
  return 'current';
}

async function fetchNpmInfo(packageName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      headers: { 'User-Agent': 'repomedic-agent/0.2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function batchFetch(packages, batchSize = 8) {
  const results = {};
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async name => ({ name, data: await fetchNpmInfo(name) }))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.data) {
        results[r.value.name] = r.value.data;
      }
    }
    if (i + batchSize < packages.length) {
      await new Promise(r => setTimeout(r, 120));
    }
  }
  return results;
}

/**
 * Parse package.json and enrich with registry data.
 * @param {string} packageJsonContent - Raw package.json string
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function parseDependencies(packageJsonContent, {
  check_registry = true,
  include_dev = false,
  batch_size = 8
} = {}) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonContent);
  } catch (e) {
    throw new Error(`Failed to parse package.json: ${e.message}`);
  }

  const prodDeps = Object.entries(pkg.dependencies || {}).map(([name, ver]) => ({ name, declared_version: ver, is_dev: false }));
  const devDeps = include_dev
    ? Object.entries(pkg.devDependencies || {}).map(([name, ver]) => ({ name, declared_version: ver, is_dev: true }))
    : [];
  const allDeps = [...prodDeps, ...devDeps];

  let registryData = {};
  if (check_registry && allDeps.length > 0) {
    registryData = await batchFetch(allDeps.map(d => d.name), batch_size);
  }

  const enriched = allDeps.map(dep => {
    const info = registryData[dep.name];
    const latestVersion = info?.version || null;
    const license = info?.license || 'UNKNOWN';
    const isDeprecated = !!(info?.deprecated);
    const lastPublish = info?.dist?.tarball
      ? null
      : (info?._time?.modified || info?.time?.modified || null);

    return {
      name: dep.name,
      declared_version: dep.declared_version,
      latest_version: latestVersion,
      is_deprecated: isDeprecated,
      deprecation_message: isDeprecated ? (typeof info.deprecated === 'string' ? info.deprecated : 'Deprecated') : null,
      license,
      license_risk: LICENSE_RISK[license] || (license === 'UNKNOWN' ? 'medium' : 'low'),
      version_gap: latestVersion ? versionGap(dep.declared_version, latestVersion) : 'unknown',
      is_dev: dep.is_dev
    };
  });

  const summary = {
    outdated_count: enriched.filter(d => d.version_gap !== 'current' && d.version_gap !== 'unknown').length,
    deprecated_count: enriched.filter(d => d.is_deprecated).length,
    high_license_risk_count: enriched.filter(d => d.license_risk === 'high').length,
    major_version_gaps: enriched.filter(d => d.version_gap === 'major').length,
  };

  return {
    package_name: pkg.name || 'unknown',
    package_version: pkg.version || '0.0.0',
    node_engine: pkg.engines?.node || null,
    has_lockfile: false, // caller sets this
    total_dependencies: prodDeps.length,
    total_dev_dependencies: (pkg.devDependencies || {}).length ? Object.keys(pkg.devDependencies).length : 0,
    dependencies: enriched,
    summary
  };
}
