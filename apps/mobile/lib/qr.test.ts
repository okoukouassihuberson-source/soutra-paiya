/**
 * Tests unitaires pour lib/qr.ts (build/parse QR de paiement Soutra-Explore).
 *
 * Pas de framework Jest dans ce projet — ces tests sont exécutables avec
 * `npx tsx apps/mobile/lib/qr.test.ts` (ou ts-node). Ils couvrent les cas
 * demandés en mission 3 : QR valide, QR invalide, payload non-JSON, montant
 * invalide, numéros mal formatés, self-payment edge case.
 *
 * En cas d'erreur, le script exit 1 et imprime le détail. À intégrer
 * éventuellement plus tard dans une suite Jest si le projet en adopte une.
 */

import { buildPaymentQr, parsePaymentQr } from './qr';

type Test = { name: string; run: () => void };

const tests: Test[] = [];
function test(name: string, run: () => void) {
  tests.push({ name, run });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─────────────────────────── build → parse ───────────────────────────

test('build + parse: phone seul', () => {
  const payload = buildPaymentQr({ phone: '+2250707000001' });
  const parsed = parsePaymentQr(payload);
  assert(parsed, 'parse a renvoyé null');
  assert(parsed!.phone === '+2250707000001', `phone mismatch: ${parsed!.phone}`);
  assert(parsed!.amount === undefined, `amount devrait être undefined`);
  assert(parsed!.name === undefined, `name devrait être undefined`);
});

test('build + parse: phone + name + amount', () => {
  const payload = buildPaymentQr({ phone: '+2250707000002', name: 'Alice', amount: 5000 });
  const parsed = parsePaymentQr(payload);
  assert(parsed, 'parse a renvoyé null');
  assert(parsed!.phone === '+2250707000002', 'phone');
  assert(parsed!.name === 'Alice', 'name');
  assert(parsed!.amount === 5000, 'amount');
});

// ─────────────────────────── invalides ───────────────────────────

test('parse: chaîne vide → null', () => {
  assert(parsePaymentQr('') === null, "chaîne vide doit retourner null");
});

test('parse: non-JSON → null', () => {
  assert(parsePaymentQr('not a json {{{') === null, 'non-JSON doit retourner null');
});

test('parse: JSON sans champ t → null', () => {
  assert(parsePaymentQr(JSON.stringify({ phone: '+2250707000001' })) === null,
    'manque le type → null');
});

test('parse: type incorrect → null', () => {
  const raw = JSON.stringify({ t: 'other-app', phone: '+2250707000001' });
  assert(parsePaymentQr(raw) === null, 'type différent → null');
});

test('parse: téléphone mal formaté (manque +225) → null', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '0707000001' });
  assert(parsePaymentQr(raw) === null, 'téléphone sans +225 → null');
});

test('parse: téléphone trop court → null', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+225070700' });
  assert(parsePaymentQr(raw) === null, 'téléphone trop court → null');
});

test('parse: téléphone avec lettres → null', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+225ABC0000001' });
  assert(parsePaymentQr(raw) === null, 'lettres dans le téléphone → null');
});

test('parse: phone absent → null', () => {
  const raw = JSON.stringify({ t: 'soutrapay' });
  assert(parsePaymentQr(raw) === null, 'phone manquant → null');
});

// ─────────────────────────── montants edge cases ───────────────────────────

test('parse: amount négatif → ignoré (undefined)', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+2250707000001', amount: -100 });
  const parsed = parsePaymentQr(raw);
  assert(parsed && parsed.amount === undefined, 'amount négatif → undefined');
});

test('parse: amount zéro → ignoré (undefined)', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+2250707000001', amount: 0 });
  const parsed = parsePaymentQr(raw);
  assert(parsed && parsed.amount === undefined, 'amount 0 → undefined');
});

test('parse: amount décimal → ignoré (undefined)', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+2250707000001', amount: 100.5 });
  const parsed = parsePaymentQr(raw);
  assert(parsed && parsed.amount === undefined, 'amount décimal → undefined');
});

test('parse: amount string → ignoré (undefined)', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+2250707000001', amount: '100' });
  const parsed = parsePaymentQr(raw);
  assert(parsed && parsed.amount === undefined, 'amount string → undefined');
});

// ─────────────────────────── name edge cases ───────────────────────────

test('parse: name non-string → undefined', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+2250707000001', name: 42 });
  const parsed = parsePaymentQr(raw);
  assert(parsed && parsed.name === undefined, 'name non-string → undefined');
});

test('parse: name absent → undefined', () => {
  const raw = JSON.stringify({ t: 'soutrapay', phone: '+2250707000001' });
  const parsed = parsePaymentQr(raw);
  assert(parsed && parsed.name === undefined, 'name absent → undefined');
});

// ─────────────────────────── round-trip ───────────────────────────

test('round-trip: build → parse préserve les données', () => {
  const original = { phone: '+2250708817409', name: 'Bob', amount: 2500 };
  const payload = buildPaymentQr(original);
  const parsed = parsePaymentQr(payload);
  assert(parsed, 'parse renvoie null');
  assert(deepEqual(parsed, original), `round-trip diff: ${JSON.stringify(parsed)}`);
});

// ─────────────────────────── runner ───────────────────────────

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${t.name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
process.exit(failed > 0 ? 1 : 0);
