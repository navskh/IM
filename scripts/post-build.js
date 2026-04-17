#!/usr/bin/env node
// Next.js standalone output doesn't automatically copy .next/static or public/
// into the standalone folder. This script does that so the published npm
// package has a self-contained standalone bundle.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  console.log('  post-build: no .next/standalone — is output: "standalone" enabled?');
  process.exit(0);
}

const staticSrc = path.join(root, '.next', 'static');
const staticDst = path.join(standaloneDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.rmSync(staticDst, { recursive: true, force: true });
  fs.cpSync(staticSrc, staticDst, { recursive: true });
  console.log('  post-build: copied .next/static -> standalone');
}

const publicSrc = path.join(root, 'public');
const publicDst = path.join(standaloneDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.rmSync(publicDst, { recursive: true, force: true });
  fs.cpSync(publicSrc, publicDst, { recursive: true });
  console.log('  post-build: copied public -> standalone');
}

console.log('  post-build: standalone bundle ready');
