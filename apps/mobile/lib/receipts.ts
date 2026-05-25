// ============================================================================
// Reçus de transaction PDF (Soutra-Pay).
// ============================================================================
// Stratégie : on construit un HTML stylé côté mobile, expo-print le convertit
// localement en PDF (moteur WebKit/Android Print), expo-sharing ouvre la
// feuille de partage OS (WhatsApp, mail, AirDrop, etc.).
//
// Pourquoi pas une Edge Function ? Pas besoin :
//   • RLS sur transactions garantit déjà l'autorisation
//   • la génération mobile est instantanée, sans dépendance réseau,
//     et le PDF n'a pas besoin d'être stocké
//   • la référence vérifiable du reçu = id UUID de la transaction
// ============================================================================

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatXOF } from '@soutra/shared';
import { supabase } from './supabase';

export interface ReceiptTransaction {
  id: string;
  type: string;
  status: string;
  amount_xof: number;
  fee_xof: number;
  provider: string | null;
  provider_ref: string | null;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  user_id: string;
  counterparty_id: string | null;
}

export interface ReceiptParty {
  id: string;
  name: string;
  phone: string | null;
}

export interface ReceiptContext {
  transaction: ReceiptTransaction;
  user: ReceiptParty;            // titulaire du compte (le viewer)
  counterparty: ReceiptParty | null;
  isCredit: boolean;             // true = montant reçu (vert), false = débité
}

/** Charge la transaction + les profils impliqués pour le reçu. */
export async function loadReceiptContext(
  txId: string,
  currentUserId: string,
): Promise<ReceiptContext> {
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select(
      'id, type, status, amount_xof, fee_xof, provider, provider_ref, description, created_at, completed_at, user_id, counterparty_id',
    )
    .eq('id', txId)
    .maybeSingle();
  if (txErr) throw new Error(txErr.message);
  if (!tx) throw new Error('TRANSACTION_NOT_FOUND');

  const tx2 = tx as ReceiptTransaction;
  const ids = Array.from(
    new Set([tx2.user_id, tx2.counterparty_id].filter((x): x is string => !!x)),
  );

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .in('id', ids);
  if (profErr) throw new Error(profErr.message);

  const byId = new Map<string, ReceiptParty>(
    (profiles ?? []).map((p: any) => [
      p.id as string,
      { id: p.id, name: p.full_name || 'Utilisateur Soutra-Pay', phone: p.phone ?? null },
    ]),
  );

  // Pour un transfer reçu, le « titulaire » de ce reçu est le destinataire
  // (counterparty_id), pas le user_id de la ligne. On inverse selon le viewer.
  const userIsRecipient = tx2.type === 'transfer' && tx2.counterparty_id === currentUserId;
  const ownerId = userIsRecipient ? tx2.counterparty_id! : tx2.user_id;
  const otherId = userIsRecipient ? tx2.user_id : tx2.counterparty_id;

  const user = byId.get(ownerId) ?? { id: ownerId, name: 'Moi', phone: null };
  const counterparty = otherId ? byId.get(otherId) ?? null : null;

  return {
    transaction: tx2,
    user,
    counterparty,
    isCredit: userIsRecipient || tx2.type === 'topup' || tx2.type === 'refund' || tx2.type === 'escrow_release',
  };
}

/** Construit le HTML du reçu (utilisé par expo-print). */
export function buildReceiptHTML(ctx: ReceiptContext): string {
  const { transaction: tx, user, counterparty, isCredit } = ctx;
  const dateStr = formatFullDate(tx.completed_at ?? tx.created_at);
  const statusMeta = statusBadge(tx.status);
  const typeLabel = typeHumanLabel(tx.type, isCredit);
  const providerLabel = providerHumanLabel(tx.provider);
  const sign = isCredit ? '+' : '−';
  const colorAmount = isCredit ? '#16A34A' : '#1A1D2E';

  // Référence courte affichée à l'humain (les 8 premiers caractères) ;
  // l'id complet reste dans la section de bas de page pour traçabilité.
  const shortRef = tx.id.replace(/-/g, '').slice(0, 8).toUpperCase();

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Reçu Soutra-Pay ${shortRef}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif; margin: 0; padding: 0; color: #1A1D2E; background: #FAF7F2; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 32px 28px; }
  .brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #FF6B1A; }
  .brand small { display: block; font-size: 11px; font-weight: 600; color: #64748B; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .ref { text-align: right; font-size: 11px; color: #64748B; font-weight: 600; }
  .ref strong { display: block; font-size: 14px; color: #1A1D2E; letter-spacing: 1px; margin-top: 2px; font-family: 'SF Mono', Menlo, monospace; }

  .hero { background: linear-gradient(135deg, #FF6B1A 0%, #E5500D 100%); color: #fff; padding: 28px 24px; border-radius: 20px; margin-bottom: 24px; position: relative; overflow: hidden; }
  .hero::before { content: ''; position: absolute; top: -60px; right: -60px; width: 180px; height: 180px; border-radius: 50%; background: rgba(255,255,255,0.08); }
  .hero::after { content: ''; position: absolute; bottom: -40px; left: -40px; width: 130px; height: 130px; border-radius: 50%; background: rgba(255,255,255,0.06); }
  .hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85; font-weight: 700; position: relative; z-index: 1; }
  .hero-amount { font-size: 42px; font-weight: 800; letter-spacing: -1px; margin: 6px 0 2px; position: relative; z-index: 1; color: ${isCredit ? '#FFF' : '#FFF'}; }
  .hero-type { font-size: 14px; opacity: 0.95; font-weight: 600; position: relative; z-index: 1; }
  .badge { display: inline-block; background: rgba(0,0,0,0.25); color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-top: 12px; position: relative; z-index: 1; }
  .badge.success { background: rgba(0,184,148,0.35); }
  .badge.failed  { background: rgba(230,57,70,0.35); }
  .badge.pending { background: rgba(255,201,60,0.35); }

  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748B; margin: 0 0 12px; font-weight: 700; }
  .card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #F1F5F9; gap: 16px; }
  .row:last-child { border-bottom: 0; }
  .row-label { font-size: 12px; color: #64748B; font-weight: 600; flex: 0 0 auto; }
  .row-value { font-size: 13px; color: #1A1D2E; font-weight: 600; text-align: right; word-break: break-word; }
  .row-value small { display: block; font-size: 11px; color: #64748B; font-weight: 500; margin-top: 2px; }
  .row-value.mono { font-family: 'SF Mono', Menlo, monospace; font-size: 11px; }

  .footer { margin-top: 28px; padding-top: 16px; border-top: 1px dashed #CBD5E1; font-size: 10px; color: #64748B; line-height: 1.5; text-align: center; }
  .footer strong { color: #1A1D2E; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand-row">
      <div class="brand">Soutra-Pay<small>Reçu de transaction</small></div>
      <div class="ref">Référence<strong>#${shortRef}</strong></div>
    </div>

    <div class="hero">
      <div class="hero-label">${isCredit ? 'Montant reçu' : 'Montant payé'}</div>
      <div class="hero-amount">${sign}${escapeHtml(formatXOF(tx.amount_xof))}</div>
      <div class="hero-type">${escapeHtml(typeLabel)}</div>
      <div class="badge ${statusMeta.cls}">${escapeHtml(statusMeta.label)}</div>
    </div>

    <h2>Détails</h2>
    <div class="card">
      <div class="row">
        <div class="row-label">Date</div>
        <div class="row-value">${escapeHtml(dateStr)}</div>
      </div>
      <div class="row">
        <div class="row-label">Titulaire</div>
        <div class="row-value">${escapeHtml(user.name)}${user.phone ? `<small>${escapeHtml(user.phone)}</small>` : ''}</div>
      </div>
      ${counterparty ? `
      <div class="row">
        <div class="row-label">${isCredit ? 'Expéditeur' : 'Destinataire'}</div>
        <div class="row-value">${escapeHtml(counterparty.name)}${counterparty.phone ? `<small>${escapeHtml(counterparty.phone)}</small>` : ''}</div>
      </div>` : ''}
      <div class="row">
        <div class="row-label">Type</div>
        <div class="row-value">${escapeHtml(typeLabel)}</div>
      </div>
      <div class="row">
        <div class="row-label">Moyen</div>
        <div class="row-value">${escapeHtml(providerLabel)}</div>
      </div>
      ${tx.fee_xof > 0 ? `
      <div class="row">
        <div class="row-label">Frais</div>
        <div class="row-value">${escapeHtml(formatXOF(tx.fee_xof))}</div>
      </div>` : ''}
      ${tx.description ? `
      <div class="row">
        <div class="row-label">Motif</div>
        <div class="row-value">${escapeHtml(tx.description)}</div>
      </div>` : ''}
      ${tx.provider_ref ? `
      <div class="row">
        <div class="row-label">Réf. fournisseur</div>
        <div class="row-value mono">${escapeHtml(tx.provider_ref)}</div>
      </div>` : ''}
      <div class="row">
        <div class="row-label">Identifiant complet</div>
        <div class="row-value mono">${escapeHtml(tx.id)}</div>
      </div>
    </div>

    <div class="footer">
      Ce reçu est généré par <strong>Soutra-Pay</strong> et fait foi de l'opération réalisée.
      <br/>Pour toute réclamation, contactez le support en citant la référence ci-dessus.
      <br/>Document généré le ${escapeHtml(formatFullDate(new Date().toISOString()))}.
    </div>
  </div>
</body>
</html>`;
}

/** Génère un PDF à partir du contexte et ouvre la feuille de partage OS. */
export async function shareReceipt(ctx: ReceiptContext): Promise<void> {
  const html = buildReceiptHTML(ctx);
  const file = await Print.printToFileAsync({ html, base64: false });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    // Sur certains émulateurs ou plateformes (web), share natif indisponible —
    // on tombe sur la vue PDF système, qui propose au moins « Enregistrer ».
    await Print.printAsync({ uri: file.uri });
    return;
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Partager le reçu Soutra-Pay',
    UTI: 'com.adobe.pdf',
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function statusBadge(s: string): { label: string; cls: string } {
  switch (s) {
    case 'success': return { label: 'Réussi', cls: 'success' };
    case 'pending': return { label: 'En cours', cls: 'pending' };
    case 'failed': return { label: 'Échec', cls: 'failed' };
    case 'reversed': return { label: 'Annulée', cls: 'failed' };
    default: return { label: s, cls: '' };
  }
}

function typeHumanLabel(t: string, isCredit: boolean): string {
  switch (t) {
    case 'topup': return 'Rechargement du wallet';
    case 'withdraw': return 'Retrait vers Mobile Money';
    case 'payment': return 'Paiement';
    case 'transfer': return isCredit ? 'Transfert reçu' : 'Transfert envoyé';
    case 'refund': return 'Remboursement';
    case 'split': return 'Partage d\'addition';
    case 'escrow_hold': return 'Séquestre (réservation)';
    case 'escrow_release': return 'Libération du séquestre';
    case 'fee': return 'Frais de service';
    default: return t;
  }
}

function providerHumanLabel(p: string | null): string {
  switch (p) {
    case 'orange': return 'Orange Money';
    case 'mtn': return 'MTN Mobile Money';
    case 'wave': return 'Wave';
    case 'moov': return 'Moov Money';
    case 'card': return 'Carte bancaire';
    case 'wallet': return 'Wallet Soutra-Pay';
    case 'cinetpay': return 'CinetPay';
    case null: case undefined: return '—';
    default: return p ?? '—';
  }
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
