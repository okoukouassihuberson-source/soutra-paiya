'use client';

import { useEffect } from 'react';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

interface Tx {
  id: string;
  amount_xof: number;
  status: string;
  provider: string | null;
  provider_ref: string | null;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
  completed_at: string | null;
}

interface Plan {
  code: string;
  display_name: string;
  price_monthly_xof: number;
  price_yearly_xof: number;
  cashback_bps: number;
}

interface Profile {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
}

/**
 * Facture HTML imprimable. CSS dédié pour @media print : marges A4,
 * couleurs sobres, aucun bouton dans le rendu PDF.
 *
 * Auto-déclenche window.print() au mount → le navigateur ouvre la dialog
 * "Imprimer / Save as PDF". L'utilisateur choisit "Enregistrer en PDF"
 * comme imprimante. Aucune dépendance npm.
 */
export function InvoiceView({
  tx, plan, profile, billingPeriod,
}: {
  tx: Tx;
  plan: Plan | null;
  profile: Profile | null;
  billingPeriod: 'monthly' | 'yearly';
}) {
  // Auto-print après chargement (250ms pour laisser le rendu se stabiliser).
  // L'utilisateur peut désactiver via ?autoprint=0 en query string.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoprint') === '0') return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, []);

  const invoiceNumber = `SP-${tx.id.slice(0, 8).toUpperCase()}`;
  const invoiceDate = tx.completed_at || tx.created_at;
  const planName = plan?.display_name || tx.metadata?.plan_code || 'Abonnement Premium';
  const periodLabel = billingPeriod === 'yearly' ? 'Annuel (365 jours)' : 'Mensuel (30 jours)';
  const isRenewal = tx.metadata?.renewal === true;

  return (
    <main className="invoice-root">
      {/* ──────── BOUTONS ÉCRAN (cachés à l'impression) ──────── */}
      <div className="invoice-actions no-print">
        <button onClick={() => window.history.back()} className="btn-secondary">
          ← Retour
        </button>
        <button onClick={() => window.print()} className="btn-primary">
          📄 Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* ──────── FACTURE ──────── */}
      <article className="invoice-sheet">
        {/* HEADER */}
        <header className="invoice-header">
          <div className="brand">
            <div className="brand-logo">SP</div>
            <div>
              <p className="brand-name">
                <span style={{ color: '#0E1116' }}>Soutra</span>
                <span style={{ color: '#FF6B1A' }}>-Playce</span>
              </p>
              <p className="brand-tagline">Sors, réserve, paie. Zéro galère.</p>
            </div>
          </div>
          <div className="invoice-title">
            <p className="invoice-title-label">Facture</p>
            <p className="invoice-number">{invoiceNumber}</p>
          </div>
        </header>

        {/* INFOS PARTIES */}
        <section className="invoice-parties">
          <div>
            <p className="party-label">Émetteur</p>
            <p className="party-name">Soutra-Explore</p>
            <p className="party-line">Abidjan, Côte d&apos;Ivoire</p>
            <p className="party-line">support@soutra-paiya.com</p>
            <p className="party-line">+225 07 08 81 74 09</p>
          </div>
          <div>
            <p className="party-label">Facturé à</p>
            <p className="party-name">{profile?.full_name || 'Utilisateur Soutra-Explore'}</p>
            {profile?.phone && <p className="party-line">📞 {profile.phone}</p>}
            {profile?.email && <p className="party-line">✉ {profile.email}</p>}
            {profile?.city && <p className="party-line">{profile.city}</p>}
          </div>
        </section>

        {/* METADATA */}
        <section className="invoice-meta">
          <div className="meta-item">
            <p className="meta-label">Date de facture</p>
            <p className="meta-value">{formatDate(invoiceDate)}</p>
          </div>
          <div className="meta-item">
            <p className="meta-label">Référence Paystack</p>
            <p className="meta-value mono">{tx.provider_ref || '—'}</p>
          </div>
          <div className="meta-item">
            <p className="meta-label">Statut</p>
            <p className="meta-value">
              <span className={`status-pill status-${tx.status}`}>
                {STATUS_LABEL[tx.status] || tx.status}
              </span>
            </p>
          </div>
        </section>

        {/* TABLEAU DES LIGNES */}
        <section className="invoice-lines">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="th-right">Période</th>
                <th className="th-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Abonnement {planName}</strong>
                  {isRenewal && (
                    <span className="renewal-badge">Renouvellement automatique</span>
                  )}
                  {plan?.cashback_bps != null && (
                    <p className="line-sub">
                      Cashback inclus : {(plan.cashback_bps / 100).toFixed(plan.cashback_bps % 100 === 0 ? 0 : 1)} % sur tes paiements marchand
                    </p>
                  )}
                </td>
                <td className="td-right">{periodLabel}</td>
                <td className="td-right mono">{formatXOF(tx.amount_xof)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="totals-label">Sous-total</td>
                <td className="td-right mono">{formatXOF(tx.amount_xof)}</td>
              </tr>
              <tr>
                <td colSpan={2} className="totals-label">TVA</td>
                <td className="td-right mono">0 FCFA</td>
              </tr>
              <tr className="totals-grand">
                <td colSpan={2} className="totals-label-grand">Total payé</td>
                <td className="td-right mono total-amount">{formatXOF(tx.amount_xof)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* FOOTER */}
        <footer className="invoice-footer">
          <p>
            Paiement effectué via <strong>Paystack</strong> · Méthode de paiement enregistrée
            sécurisée
          </p>
          <p className="mono small">{tx.provider_ref}</p>
          <p className="small mt">
            Ce document fait office de reçu fiscal. Pour toute question, contacte{' '}
            <strong>support@soutra-paiya.com</strong>.
          </p>
          <p className="small mt2 brand-mention">
            Soutra-Explore — Le wallet fintech de la Côte d&apos;Ivoire
          </p>
        </footer>
      </article>

      {/* ──────── STYLES ──────── */}
      <style jsx>{`
        :global(body) {
          background: #f5f5f5;
          margin: 0;
        }
        .invoice-root {
          min-height: 100vh;
          padding: 24px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #0E1116;
        }
        .invoice-actions {
          max-width: 800px;
          margin: 0 auto 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .btn-primary, .btn-secondary {
          padding: 10px 20px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s, transform 0.1s;
        }
        .btn-primary {
          background: linear-gradient(135deg, #FF6B1A, #E5500D);
          color: white;
          box-shadow: 0 4px 12px rgba(255, 107, 26, 0.3);
        }
        .btn-primary:hover { opacity: 0.92; }
        .btn-primary:active { transform: scale(0.97); }
        .btn-secondary {
          background: white;
          color: #525252;
          border: 1px solid #e5e5e5;
        }
        .btn-secondary:hover { background: #fafafa; }

        .invoice-sheet {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 48px 56px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          padding-bottom: 24px;
          border-bottom: 2px solid #f5f5f5;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand-logo {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: linear-gradient(135deg, #FF6B1A, #E5500D);
          color: white;
          font-weight: 800;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .brand-name { font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
        .brand-tagline { font-size: 12px; color: #737373; margin: 2px 0 0; }
        .invoice-title { text-align: right; }
        .invoice-title-label {
          font-size: 11px;
          font-weight: 700;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          margin: 0;
        }
        .invoice-number {
          font-size: 22px;
          font-weight: 800;
          color: #0E1116;
          margin: 4px 0 0;
          font-family: ui-monospace, 'SF Mono', Menlo, monospace;
          letter-spacing: -0.02em;
        }

        .invoice-parties {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          padding: 32px 0;
          border-bottom: 1px solid #f5f5f5;
        }
        .party-label {
          font-size: 11px;
          font-weight: 700;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 8px;
        }
        .party-name {
          font-size: 16px;
          font-weight: 700;
          color: #0E1116;
          margin: 0 0 4px;
        }
        .party-line { font-size: 13px; color: #525252; margin: 2px 0; }

        .invoice-meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          padding: 24px 0;
          border-bottom: 1px solid #f5f5f5;
        }
        .meta-label {
          font-size: 11px;
          font-weight: 700;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 6px;
        }
        .meta-value { font-size: 14px; color: #0E1116; margin: 0; font-weight: 600; }
        .mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; }

        .status-pill {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .status-success { background: #d1fae5; color: #047857; }
        .status-pending { background: #fef3c7; color: #b45309; }
        .status-failed { background: #fee2e2; color: #b91c1c; }

        .invoice-lines { padding: 32px 0 16px; }
        .invoice-lines table { width: 100%; border-collapse: collapse; }
        .invoice-lines th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 12px 8px;
          border-bottom: 2px solid #0E1116;
        }
        .th-right { text-align: right; }
        .invoice-lines td {
          padding: 16px 8px;
          font-size: 14px;
          color: #0E1116;
          vertical-align: top;
          border-bottom: 1px solid #f5f5f5;
        }
        .td-right { text-align: right; }
        .line-sub {
          font-size: 12px;
          color: #737373;
          margin: 4px 0 0;
        }
        .renewal-badge {
          display: inline-block;
          margin-left: 8px;
          padding: 2px 8px;
          border-radius: 999px;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .invoice-lines tfoot td {
          border-bottom: none;
          padding-top: 12px;
        }
        .totals-label {
          text-align: right;
          color: #525252;
          font-size: 13px;
        }
        .totals-grand td { border-top: 2px solid #0E1116; padding-top: 16px; }
        .totals-label-grand {
          text-align: right;
          font-size: 14px;
          font-weight: 700;
          color: #0E1116;
        }
        .total-amount {
          font-size: 22px;
          font-weight: 800;
          color: #FF6B1A;
        }

        .invoice-footer {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid #f5f5f5;
          text-align: center;
          color: #737373;
          font-size: 13px;
        }
        .invoice-footer .small { font-size: 11px; }
        .invoice-footer .mt { margin-top: 12px; }
        .invoice-footer .mt2 { margin-top: 24px; color: #a3a3a3; }
        .brand-mention { font-weight: 600; }

        /* ============ PRINT-SPECIFIC ============ */
        @media print {
          :global(body) { background: white !important; }
          .no-print { display: none !important; }
          .invoice-root { padding: 0; }
          .invoice-sheet {
            box-shadow: none;
            border-radius: 0;
            max-width: none;
            padding: 24px 32px;
          }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </main>
  );
}

/* ─────────────────────────────────────────────────── *
 *  UTILS                                              *
 * ─────────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  success: 'Payée',
  pending: 'En cours',
  failed: 'Échouée',
  reversed: 'Remboursée',
};

function formatXOF(n: number): string {
  if (!Number.isFinite(n)) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
