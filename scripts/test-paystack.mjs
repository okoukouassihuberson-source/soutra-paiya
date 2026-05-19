#!/usr/bin/env node
// ============================================================================
// Vérifie l'intégration Paystack de bout en bout (mode TEST uniquement).
//
// Ce script prouve que :
//  - la clé secrète Paystack fonctionne ;
//  - le montant XOF est correctement converti en subunit (FCFA × 100) ;
//  - les endpoints /transaction/initialize et /transaction/verify répondent.
//
// Usage (PowerShell) :
//   $env:PAYSTACK_SECRET_KEY="sk_test_xxx"; node scripts/test-paystack.mjs 1000
// Usage (bash) :
//   PAYSTACK_SECRET_KEY=sk_test_xxx node scripts/test-paystack.mjs 1000
// ============================================================================

const SECRET = process.env.PAYSTACK_SECRET_KEY;
if (!SECRET) {
  console.error('❌ PAYSTACK_SECRET_KEY manquant.');
  console.error('   Ex : PAYSTACK_SECRET_KEY=sk_test_xxx node scripts/test-paystack.mjs 1000');
  process.exit(1);
}
if (!SECRET.startsWith('sk_test_')) {
  console.error("⚠️  Cette clé n'est pas une clé de TEST (sk_test_...). Abandon par sécurité.");
  process.exit(1);
}

const amountXof = Number.parseInt(process.argv[2] || '1000', 10);
if (!Number.isInteger(amountXof) || amountXof < 100) {
  console.error('❌ Montant invalide (minimum 100 FCFA).');
  process.exit(1);
}

const BASE = 'https://api.paystack.co';

async function api(path, init) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok || json.status === false) {
    throw new Error(`${path} → ${json.message || `HTTP ${res.status}`}`);
  }
  return json;
}

try {
  const reference = `sp-test-${Date.now()}`;

  console.log(`\n🔸 Initialisation d'un paiement de ${amountXof} FCFA (XOF)…`);
  const init = await api('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: 'test@soutra-paiya.app',
      amount: amountXof * 100, // XOF : subunit Paystack = FCFA × 100
      currency: 'XOF',
      reference,
      callback_url: 'https://soutra-paiya.vercel.app/paystack/callback',
    }),
  });
  console.log('✅ Transaction initialisée.');
  console.log('   reference         :', reference);
  console.log('   authorization_url :', init.data.authorization_url);
  console.log(
    '\n👉 Ouvre cette URL dans un navigateur et paie avec une carte de test Paystack :',
  );
  console.log('   4084 0840 8408 4081 — CVV 408 — date future — PIN 0000 — OTP 123456');

  console.log('\n🔸 Vérification de la transaction…');
  const verified = await api(`/transaction/verify/${encodeURIComponent(reference)}`);
  console.log(`   statut Paystack : ${verified.data.status}`);
  console.log(
    `   montant         : ${verified.data.amount} subunit = ${verified.data.amount / 100} ${verified.data.currency}`,
  );

  console.log(
    '\n✅ Clé et endpoints Paystack opérationnels.' +
      "\n   (Le statut reste « abandoned » tant que le paiement n'est pas complété dans le navigateur.)\n",
  );
} catch (err) {
  console.error('\n❌ Échec :', err.message, '\n');
  process.exit(1);
}
