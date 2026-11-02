// Fails if English and Russian dictionaries differ, or if the UI uses a key that does not exist.
// node scripts/check_i18n.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync('hub/ui/i18n.js', 'utf8');
const keys = (text) => new Set([...text.matchAll(/^ {2}'([\w.]+)':/gm)].map((m) => m[1]));
const [, enPart, ruPart] = src.split(/^const (?:en|ru) = \{/m);
const en = keys(enPart.split(/^\};/m)[0]);
const ru = keys(ruPart.split(/^\};/m)[0]);
const problems = [];
for (const k of en) if (!ru.has(k)) problems.push(`missing in ru: ${k}`);
for (const k of ru) if (!en.has(k)) problems.push(`missing in en: ${k}`);

const html = readFileSync('hub/ui/index.html', 'utf8');
const js = readFileSync('hub/ui/app.js', 'utf8');
const used = new Set([...html.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(';')) used.add(p.split(':')[1].trim());
for (const m of js.matchAll(/\bt[n]?\('([\w.]+)'/g)) used.add(m[1]);
const dynamic = /^(look|poll|err)\./; // built from a variable: look.<id>, poll.<minutes>, err.<code>
for (const k of used) if (!en.has(k) && !dynamic.test(k)) problems.push(`used but not defined: ${k}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`i18n ok: ${en.size} keys in both languages`);
