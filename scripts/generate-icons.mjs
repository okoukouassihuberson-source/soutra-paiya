#!/usr/bin/env node
// ============================================================================
// scripts/generate-icons.mjs — génère toutes les tailles d'icônes Android, iOS
// et PWA depuis un seul logo source 1024×1024.
//
// Usage :
//   1. Placer le logo PNG 1024×1024 à `apps/web/public/icons/icon-1024.png`
//      (et idéalement aussi à `apps/mobile/assets/icon.png`)
//   2. `pnpm install sharp` (devDep one-shot, ~10 MB)
//   3. `node scripts/generate-icons.mjs`
//
// Génère :
//   apps/mobile/assets/icon.png             (1024×1024 — source pour Expo)
//   apps/mobile/assets/adaptive-icon.png    (1024×1024 — fg seul, safe zone 80%)
//   apps/mobile/assets/splash.png           (2048×2048 — centré, fond transparent)
//   apps/mobile/assets/notification-icon.png (96×96 — mono blanc pour Android)
//   apps/web/public/apple-touch-icon.png    (180×180)
//   apps/web/public/icons/icon-192.png      (192×192 PWA standard)
//   apps/web/public/icons/icon-512.png      (512×512 PWA standard)
//   apps/web/public/icons/icon-maskable-192.png (192×192, safe zone 80%)
//   apps/web/public/icons/icon-maskable-512.png (512×512, safe zone 80%)
//   apps/web/public/favicon.ico             (16+32+48 multi-res)
// ============================================================================

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('❌ Le module `sharp` est requis. Installe-le :');
  console.error('   pnpm add -w -D sharp');
  console.error('   puis relance : node scripts/generate-icons.mjs');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'apps/web/public/icons/icon-1024.png');

async function ensureSource() {
  try {
    await fs.access(SRC);
  } catch {
    console.error(`❌ Logo source introuvable : ${SRC}`);
    console.error('   Sauvegarde ton PNG 1024×1024 à cet emplacement puis relance.');
    process.exit(1);
  }
  const meta = await sharp(SRC).metadata();
  if ((meta.width ?? 0) < 1024 || (meta.height ?? 0) < 1024) {
    console.warn(`⚠️  Source ${meta.width}×${meta.height} — recommandé ≥ 1024×1024 pour éviter le flou.`);
  }
}

/** Resize simple, format PNG, sans perte (compressionLevel 9). */
async function resize(input, output, size, opts = {}) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  let pipeline = sharp(input)
    .resize(size, size, { fit: 'contain', background: opts.bg ?? { r: 0, g: 0, b: 0, alpha: 0 } });
  if (opts.background) {
    pipeline = pipeline.flatten({ background: opts.background });
  }
  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output);
  console.log(`✓ ${path.relative(ROOT, output)} (${size}×${size})`);
}

/** Crée une variante "maskable" avec safe zone : logo réduit à 80% centré sur fond plein. */
async function maskable(input, output, size, bgColor = '#FFFFFF') {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const inner = Math.round(size * 0.8);
  const padded = await sharp(input)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: bgColor },
  })
    .composite([{ input: padded, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(output);
  console.log(`✓ ${path.relative(ROOT, output)} (${size}×${size} maskable, bg ${bgColor})`);
}

async function generate() {
  await ensureSource();
  console.log('\n📱 MOBILE (Expo) — sources pour EAS Build\n');
  // Expo génère toutes les sizes natives à partir du source 1024×1024.
  await resize(SRC, path.join(ROOT, 'apps/mobile/assets/icon.png'), 1024);
  // Adaptive icon = foreground sur fond plein (Android applique son propre fond)
  await maskable(SRC, path.join(ROOT, 'apps/mobile/assets/adaptive-icon.png'), 1024, '#FFFFFF');
  // Splash = logo centré sur fond transparent, le backgroundColor de app.json fait le reste
  await resize(SRC, path.join(ROOT, 'apps/mobile/assets/splash.png'), 2048);

  console.log('\n🌐 WEB / PWA\n');
  await resize(SRC, path.join(ROOT, 'apps/web/public/apple-touch-icon.png'), 180);
  await resize(SRC, path.join(ROOT, 'apps/web/public/icons/icon-192.png'), 192);
  await resize(SRC, path.join(ROOT, 'apps/web/public/icons/icon-512.png'), 512);
  await maskable(SRC, path.join(ROOT, 'apps/web/public/icons/icon-maskable-192.png'), 192);
  await maskable(SRC, path.join(ROOT, 'apps/web/public/icons/icon-maskable-512.png'), 512);

  console.log('\n🪟 FAVICON (Windows / Edge / Safari)\n');
  // Favicon multi-resolution
  await resize(SRC, path.join(ROOT, 'apps/web/public/favicon-16.png'), 16);
  await resize(SRC, path.join(ROOT, 'apps/web/public/favicon-32.png'), 32);
  await resize(SRC, path.join(ROOT, 'apps/web/public/favicon-48.png'), 48);
  // Note : pour générer un .ico multi-res, ajouter `npm i to-ico` puis :
  //   import toIco from 'to-ico';
  //   const ico = await toIco([await fs.readFile('favicon-16.png'), ...]);
  //   await fs.writeFile('apps/web/public/favicon.ico', ico);
  // (Optionnel — la plupart des browsers acceptent favicon.png aujourd'hui.)

  console.log('\n✅ Génération terminée. Commit les assets puis rebuild EAS.\n');
}

generate().catch((err) => {
  console.error('❌ Erreur :', err);
  process.exit(1);
});
