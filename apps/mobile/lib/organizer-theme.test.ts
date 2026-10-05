import test from 'node:test';
import assert from 'node:assert/strict';
import { colors, colorsDark } from '@soutra/shared';
import { orgTones } from './organizer-theme';

type RGB = [number, number, number];
const parse = (v: string): { rgb: RGB; a: number } => {
  const rgba = v.match(/rgba?\(([^)]+)\)/);
  if (rgba) { const p = rgba[1].split(',').map((x) => parseFloat(x)); return { rgb: [p[0], p[1], p[2]], a: p[3] ?? 1 }; }
  const h = v.replace('#', ''); const f = h.length === 3 ? h.replace(/./g, (x) => x + x) : h;
  return { rgb: [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as RGB, a: 1 };
};
const over = (fg: string, bg: string): RGB => { const f = parse(fg); const b = parse(bg).rgb; return f.rgb.map((c, i) => Math.round(c * f.a + b[i] * (1 - f.a))) as RGB; };
const lum = ([r, g, b]: RGB) => { const t = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]; };
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const [name, c] of [['clair', colors], ['sombre', colorsDark]] as const) {
  const k = orgTones(c as any);
  const page = parse(c.light).rgb;
  const surface = parse(k.surface).rgb;
  test(`organisateur (${name}) : pastilles lisibles sur la page et sur les cartes`, () => {
    for (const [tone, t] of Object.entries(k.pill)) {
      for (const [where, base] of [['page', c.light], ['carte', k.surface]] as const) {
        const bg = over(t.bg, base);
        assert.ok(ratio(parse(t.fg).rgb, bg) >= 4.5, `${tone} sur ${where} : ${ratio(parse(t.fg).rgb, bg).toFixed(2)}`);
      }
    }
  });
  test(`organisateur (${name}) : boutons et texte`, () => {
    assert.ok(ratio(parse(k.onPrimary).rgb, parse(c.primary[500]).rgb) >= 4.5, 'texte sur orange');
    assert.ok(ratio([255, 255, 255], parse(k.green).rgb) >= 4.5, 'blanc sur vert');
    assert.ok(ratio([255, 255, 255], parse(k.danger).rgb) >= 4.5, 'blanc sur rouge');
    assert.ok(ratio(parse(c.dark).rgb, surface) >= 7, 'texte principal sur carte');
    assert.ok(ratio(parse(c.neutral[600]).rgb, surface) >= 4.5, 'texte secondaire sur carte');
    assert.ok(ratio(parse(c.neutral[500]).rgb, surface) >= 4.5, 'texte discret sur carte');
    assert.ok(ratio(parse(c.neutral[600]).rgb, page) >= 4.5, 'texte secondaire sur page');
  });
  test(`organisateur (${name}) : résultat du scan`, () => {
    for (const t of [k.ok, k.err]) {
      const bg = over(t.bg, c.light);
      assert.ok(ratio(parse(k.resultText).rgb, bg) >= 4.5, 'ligne');
      assert.ok(ratio(parse(t.fg).rgb, bg) >= 4.5, 'titre');
      assert.ok(ratio(parse(k.warn).rgb, bg) >= 4.5, 'solde à payer');
    }
  });
}
