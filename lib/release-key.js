'use strict';
// The public half of the release signing key. Every NursesLog-Setup.exe that the
// updater installs must carry a .sig made with the private half, which never
// leaves the release PC (%USERPROFILE%\.nurse-log\release-signing-key.pem, see
// scripts/build-setup.js). So someone who got into the GitHub account still could
// not push an update to schools: the checksum alone comes from the same release.

const crypto = require('crypto');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA6OcKTDwUbmgw2cbY3boOvrv9bLqAm7lFVrhCbFFm1+Y=
-----END PUBLIC KEY-----
`;

// Tests sign with their own throwaway key; only allowed against the fake release server.
const publicKey = () => crypto.createPublicKey(process.env.NL_RELEASES_URL && process.env.NL_RELEASE_PUBKEY ? process.env.NL_RELEASE_PUBKEY : PUBLIC_KEY);

// sig is the base64 Ed25519 signature of the file's bytes.
function verifyRelease(buf, sig) {
  try {
    return crypto.verify(null, buf, publicKey(), Buffer.from(String(sig).trim(), 'base64'));
  } catch {
    return false;
  }
}

module.exports = { verifyRelease, PUBLIC_KEY };
