'use strict';
// The version rule: releases count 1.0.1, 1.0.2 ... 1.0.100, then 1.1.0,
// 1.1.1 ... 1.1.100, then 1.2.0, and so on. The patch number never goes past 100.
// Anything released before 1.0.1 (the 0.x versions) moves straight to 1.0.1.

const MAX_PATCH = 100;
const FIRST = '1.0.1';

function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// The version that must come after `latest` (a tag like v1.0.7, or null for none).
function nextVersion(latest) {
  const p = parse(latest);
  if (!p || p[0] < 1) return FIRST;
  const [major, minor, patch] = p;
  return patch >= MAX_PATCH ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

module.exports = { nextVersion, parse, MAX_PATCH, FIRST };
