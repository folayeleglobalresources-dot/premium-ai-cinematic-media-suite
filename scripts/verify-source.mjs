import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const errors = [];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
}
walk(src);

function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(src, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return true;
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.json'].map((ext) => base + ext), ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((name) => path.join(base, name))];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const spec = match[1];
    if (!resolveImport(file, spec)) errors.push(`${path.relative(root, file)}: unresolved local import ${spec}`);
  }
}

const shell = fs.readFileSync(path.join(src, 'components/shell.tsx'), 'utf8');
for (const match of shell.matchAll(/href:\s*["']([^"']+)["']/g)) {
  const href = match[1];
  if (!href.startsWith('/')) continue;
  const route = path.join(src, 'app', href === '/' ? 'page.tsx' : `${href.slice(1)}/page.tsx`);
  if (!fs.existsSync(route)) errors.push(`Navigation route ${href} has no page at ${path.relative(root, route)}`);
}

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
if (!tsconfig.exclude?.includes('archive')) errors.push('tsconfig.json must exclude the archived OBSIDIAN source');
if (fs.existsSync(path.join(root, 'public/manifest.webmanifest')) && fs.existsSync(path.join(src, 'app/manifest.ts'))) {
  errors.push('Duplicate public and app manifest routes detected');
}
if (!fs.existsSync(path.join(root, 'drizzle/0000_initial.sql'))) errors.push('Initial PostgreSQL migration is missing');
if (!fs.existsSync(path.join(root, '.env.example'))) errors.push('.env.example is missing');

if (errors.length) {
  console.error(`Source verification failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`Source verification passed: ${files.length} active JS/TS files, local imports resolve, navigation routes exist, archive excluded, migration and environment template present.`);
