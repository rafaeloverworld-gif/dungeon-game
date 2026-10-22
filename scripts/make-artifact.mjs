// Turns dist-single/index.html into a Claude artifact page and lists the source files to back up.
// Usage: npm run build:single && node scripts/make-artifact.mjs <outDir>
// Writes <outDir>/dungeon-beta.html and <outDir>/files.json ({"source/...": {from, contentType}}).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.argv[2] ?? join(root, 'artifact'));
mkdirSync(out, { recursive: true });

// 1. page: the artifact host adds its own doctype/head/body, so keep only title, styles, markup and scripts
const html = readFileSync(join(root, 'dist-single/index.html'), 'utf8');
const styles = html.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
const body = (html.match(/<body>([\s\S]*?)<\/body>/) ?? [])[1] ?? '';
writeFileSync(join(out, 'dungeon-beta.html'), ['<title>地城 Beta</title>', ...styles, body.trim(), ...scripts].join('\n') + '\n');

// 2. source backup: everything except build output and node_modules
const files = {};
const skip = new Set(['node_modules', 'dist', 'dist-single', 'artifact']);
const rename = { 'docs/計劃.md': 'docs/plan.md', '.gitignore': 'gitignore.txt' };
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (name.endsWith('.glb')) continue; // binary models are already inside the page
    const rel = relative(root, full).split('\\').join('/');
    let pub = rename[rel] ?? rel;
    const ext = extname(name).toLowerCase();
    let contentType = { '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' }[ext] ?? 'text/plain';
    if (['.html', '.webmanifest', '.js', '.mjs'].includes(ext)) { pub += '.txt'; contentType = 'text/plain'; }
    files[`source/${pub}`] = { from: full, contentType };
  }
};
walk(root);
writeFileSync(join(out, 'files.json'), JSON.stringify(files, null, 1));
console.log(`page: ${join(out, 'dungeon-beta.html')}\nfiles: ${Object.keys(files).length}`);
