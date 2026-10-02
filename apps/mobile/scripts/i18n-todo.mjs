// Liste les fichiers de l'app mobile qui contiennent encore du texte français en dur (hors commentaires)
// et ne passent pas par lib/i18n : sert à suivre l'avancement de la traduction.  Usage : pnpm i18n:todo
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (f === 'node_modules' || f === 'i18n' || f.endsWith('.test.ts')) return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(f) ? [p] : [];
});
const FR = /[àâçéèêëîïôûùüÿœÀÉÈÊ]|\b(Aucun|Aucune|Chargement|Erreur|Retour|Envoyer|Annuler|Valider)\b/;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const rows = [];
for (const f of ['app', 'components', 'lib'].flatMap((d) => walk(join(root, d)))) {
  const src = stripComments(readFileSync(f, 'utf8'));
  const n = src.split('\n').filter((l) => FR.test(l)).length;
  if (n > 0) rows.push({ file: relative(root, f), lines: n, wired: /lib\/i18n|\.\/i18n/.test(src) });
}
rows.sort((a, b) => b.lines - a.lines);
const todo = rows.filter((r) => !r.wired);
console.log(`Fichiers avec texte français en dur : ${rows.length} (dont ${todo.length} pas encore branchés sur lib/i18n)\n`);
for (const r of todo.slice(0, 80)) console.log(String(r.lines).padStart(4), r.file);
if (todo.length > 80) console.log(`… et ${todo.length - 80} autres`);
const partial = rows.filter((r) => r.wired);
if (partial.length) { console.log('\nBranchés mais avec encore du français en dur :'); for (const r of partial) console.log(String(r.lines).padStart(4), r.file); }
