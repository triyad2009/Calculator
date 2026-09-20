#!/usr/bin/env node
/**
 * Copies the production build (wallet/dist) to the repository root so that
 * GitHub Pages (configured for this repo as branch `main`, path `/`) serves it.
 *
 * This script is deliberately conservative: it only ever touches the exact set
 * of files Vite emitted, so Calculator.java / README.md / wallet/ are never
 * modified or deleted.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');
const repoRoot = resolve(here, '..', '..');

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('✗ wallet/dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

/** Files/dirs currently emitted by the build. */
const emitted = readdirSync(distDir);

// Remove previously published copies of the same emitted names (never anything else).
for (const name of emitted) {
  const target = join(repoRoot, name);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`  - removed stale ${name}`);
  }
}

for (const name of emitted) {
  const src = join(distDir, name);
  const dest = join(repoRoot, name);
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  } else {
    cpSync(src, dest);
  }
  console.log(`  + published ${name}`);
}

// Safety assertion: the Java project must survive.
for (const mustExist of ['Calculator.java', 'README.md', 'wallet/package.json']) {
  if (!existsSync(join(repoRoot, mustExist))) {
    console.error(`✗ FATAL: ${mustExist} is missing after publish. Aborting.`);
    process.exit(1);
  }
}

const sizeKb = (readFileSync(join(repoRoot, 'index.html')).length / 1024).toFixed(1);
console.log(`\n✓ Site published to repository root (index.html = ${sizeKb} KB).`);
console.log('  GitHub Pages will serve it once this branch is merged into `main`.');
