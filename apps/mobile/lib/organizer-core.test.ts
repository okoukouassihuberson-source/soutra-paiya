import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSlotRows, parseDays, parsePackages, parseTicket, splitList } from './organizer-core';

const NOW = new Date('2026-10-03T08:00:00Z');

test('splitList accepte virgules et retours à la ligne', () => {
  assert.deepEqual(splitList('a, b\nc,, '), ['a', 'b', 'c']);
});

test('parseDays : « Titre : étape, étape » et ligne sans étapes', () => {
  const d = parseDays('Abidjan → Bassam : Abidjan, Grand-Bassam\nRetour', 'T1');
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { trip_id: 'T1', day_number: 1, title: 'Abidjan → Bassam', stops: ['Abidjan', 'Grand-Bassam'], i18n: {} });
  assert.deepEqual(d[1].stops, []);
});

test('parsePackages : code reconnu, prix numérique, inclus', () => {
  const p = parsePackages('Formule Confort | 65000 | Transport, Hébergement\nSur mesure | 1000', 'T1');
  assert.equal(p[0].code, 'confort');
  assert.equal(p[0].price_xof, 65000);
  assert.deepEqual(p[0].includes, ['Transport', 'Hébergement']);
  assert.equal(p[1].code, 'custom');
  assert.equal(p[1].position, 1);
});

test('buildSlotRows : plage × horaires, jours filtrés, passé exclu', () => {
  // 2026-10-03 = samedi (6) ; 2026-10-04 = dimanche (0) ; 2026-10-05 = lundi (1)
  const all = buildSlotRows('A', { from: '2026-10-03', to: '2026-10-05', times: ['09:00', '14:00'], days: [], capacity: 10, price: null }, NOW);
  assert.equal(all.length, 6);
  const weekend = buildSlotRows('A', { from: '2026-10-03', to: '2026-10-05', times: ['09:00'], days: [0, 6], capacity: 8, price: 5000 }, NOW);
  assert.deepEqual(weekend.map((r) => r.starts_at), ['2026-10-03T09:00:00Z', '2026-10-04T09:00:00Z']);
  assert.equal(weekend[0].price_xof, 5000);
  const past = buildSlotRows('A', { from: '2026-10-03', to: '2026-10-03', times: ['07:00', '09:00'], days: [], capacity: 1, price: null }, NOW);
  assert.deepEqual(past.map((r) => r.starts_at), ['2026-10-03T09:00:00Z']);
});

test('buildSlotRows : « to » vide = un seul jour', () => {
  assert.equal(buildSlotRows('A', { from: '2026-10-10', to: '', times: ['10:00'], days: [], capacity: 5, price: null }, NOW).length, 1);
});

test('parseTicket : préfixes, jeton nu, invalide', () => {
  const tok = 'a'.repeat(32);
  assert.deepEqual(parseTicket(`soutra:trip:${tok}`), { token: tok, kind: 'trip' });
  assert.deepEqual(parseTicket(` soutra:act:${tok} `), { token: tok, kind: 'activity' });
  assert.deepEqual(parseTicket(tok), { token: tok, kind: 'unknown' });
  assert.equal(parseTicket('soutra:trip:xyz'), null);
  assert.equal(parseTicket(`soutra:trip:${'g'.repeat(32)}`), null);
});
