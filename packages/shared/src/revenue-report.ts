// ============================================================================
// Générateur HTML de rapport de revenus pour un venue (web + mobile).
//
// Produit un document HTML/CSS autonome (inline) compatible avec :
//   • window.print() côté web → Sauvegarder en PDF
//   • expo-print.printToFileAsync({ html }) côté mobile → PDF natif
//
// Les types sont volontairement minimaux pour être indépendants du backend.
// ============================================================================

import { formatXOF } from './utils';

export interface RevenueReportVenue {
  name: string;
  category: string;
  city: string | null;
  district: string | null;
  cover_url?: string | null;
}

export interface RevenueReportSummary {
  gross_xof: number;
  commission_xof: number;
  net_xof: number;
  billable_xof: number;
  event_count: number;
  reservation_events: number;
  ticket_events: number;
  payment_events: number;
  previous_commission_xof: number;
  delta_pct: number | null;
  commission_rate_pct: number;
}

export interface RevenueReportKindRow {
  kind: string;
  total_xof: number;
  event_count: number;
}

export interface RevenueReportEventRow {
  ts: string;
  kind: string;
  amount_xof: number;
  rule_name: string | null;
}

export interface RevenueReportOptions {
  venue: RevenueReportVenue;
  summary: RevenueReportSummary;
  byKind: RevenueReportKindRow[];
  events?: RevenueReportEventRow[];
  periodLabel: string;
  generatedAt?: Date;
}

// Métadonnées d'affichage des 17 sources monétaires.
const KIND_LABELS: Record<string, string> = {
  reservation_commission_pct:   'Commission réservation',
  reservation_commission_fixed: 'Commission réservation (fixe)',
  service_fee_pct:              'Frais de service',
  service_fee_fixed:            'Frais de service (fixe)',
  payment_commission:           'Commission paiement',
  subscription_commission:      'Commission abonnement',
  ticket_commission:            'Commission billetterie',
  marketplace_commission:       'Commission marketplace',
  affiliation_commission:       'Commission affiliation',
  user_cashback:                'Ristourne utilisateur (historique)',
  loyalty_bonus:                'Bonus fidélité',
  featured_listing:             'Mise en avant',
  advertising:                  'Publicité',
  account_verification:         'Vérification compte',
  venue_certification:          'Certification venue',
  event_publication:            'Publication événement',
  promo_publication:            'Publication promo',
};

function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateFR(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function formatShortDateFR(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/**
 * Génère un document HTML complet autonome (avec <html>, <head>, <body>)
 * stylé pour A4 portrait, optimisé pour conversion PDF via print() ou expo-print.
 */
export function buildRevenueReportHtml(opts: RevenueReportOptions): string {
  const { venue, summary, byKind, events = [], periodLabel } = opts;
  const generatedAt = opts.generatedAt ?? new Date();

  const deltaSign = summary.delta_pct == null
    ? ''
    : summary.delta_pct > 0 ? '+' : '';

  const deltaBlock = summary.delta_pct == null
    ? ''
    : `<div class="delta ${summary.delta_pct >= 0 ? 'delta-pos' : 'delta-neg'}">
        ${summary.delta_pct >= 0 ? '↗' : '↘'} ${deltaSign}${summary.delta_pct}%
        de commission par rapport à la période précédente
        (${formatXOF(summary.previous_commission_xof)} → ${formatXOF(summary.commission_xof)})
       </div>`;

  // Bar chart par source — barres horizontales SVG inline pour PDF stable.
  const maxByKind = Math.max(1, ...byKind.map((b) => b.total_xof));
  const kindRows = byKind
    .map((b) => {
      const label = KIND_LABELS[b.kind] ?? b.kind;
      const pct = (b.total_xof / maxByKind) * 100;
      return `<tr>
        <td class="kind-label">${esc(label)}</td>
        <td class="kind-bar-cell">
          <div class="kind-bar-bg">
            <div class="kind-bar-fill" style="width:${Math.max(2, pct).toFixed(1)}%"></div>
          </div>
        </td>
        <td class="kind-amount">${formatXOF(b.total_xof)}</td>
        <td class="kind-count">${b.event_count}</td>
      </tr>`;
    })
    .join('');

  // Tableau des derniers events
  const eventRows = events
    .slice(0, 50)
    .map((e) => {
      const label = KIND_LABELS[e.kind] ?? e.kind;
      return `<tr>
        <td>${esc(formatShortDateFR(e.ts))}</td>
        <td>${esc(label)}</td>
        <td class="num">${formatXOF(e.amount_xof)}</td>
        <td class="muted">${esc(e.rule_name ?? '—')}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Rapport de revenus — ${esc(venue.name)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111;
    margin: 0;
    line-height: 1.4;
    font-size: 11pt;
  }
  .header {
    border-bottom: 2px solid #FF6B1A;
    padding-bottom: 12px;
    margin-bottom: 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .brand {
    font-weight: 800;
    font-size: 18pt;
    color: #FF6B1A;
    letter-spacing: -0.5px;
  }
  .brand-sub {
    font-size: 9pt;
    color: #666;
    margin-top: 2px;
  }
  .meta-right {
    text-align: right;
    font-size: 9pt;
    color: #666;
  }
  .meta-right .date { font-weight: 600; color: #333; }

  .venue-block {
    background: #FFF7F0;
    border: 1px solid #FFE0CC;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 18px;
  }
  .venue-name { font-size: 15pt; font-weight: 700; color: #111; }
  .venue-meta { font-size: 9.5pt; color: #666; margin-top: 2px; }
  .period { display: inline-block; margin-top: 6px; padding: 3px 10px; background: #FF6B1A; color: #fff; border-radius: 999px; font-size: 9pt; font-weight: 600; }

  .kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .kpi {
    border-radius: 8px;
    padding: 12px 14px;
  }
  .kpi-label { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
  .kpi-value { font-size: 15pt; font-weight: 800; margin-top: 4px; }
  .kpi-sub { font-size: 8.5pt; opacity: 0.6; margin-top: 2px; }
  .kpi-blue   { background: #EFF6FF; color: #1E3A8A; }
  .kpi-amber  { background: #FFFBEB; color: #92400E; }
  .kpi-green  { background: #ECFDF5; color: #065F46; }
  .kpi-purple { background: #F5F3FF; color: #5B21B6; }

  .delta {
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 9.5pt;
  }
  .delta-pos { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
  .delta-neg { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }

  h2 {
    font-size: 11pt;
    font-weight: 700;
    color: #FF6B1A;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 18px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #FFE0CC;
  }

  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { padding: 6px 8px; text-align: left; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4px; color: #666; border-bottom: 1px solid #E5E7EB; }
  tr { border-bottom: 1px solid #F3F4F6; }
  tr:last-child { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .muted { color: #888; }

  /* Bar chart par source */
  table.kinds td.kind-label { width: 38%; }
  table.kinds td.kind-bar-cell { width: 32%; }
  table.kinds td.kind-amount { width: 20%; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: #065F46; }
  table.kinds td.kind-count { width: 10%; text-align: right; color: #888; font-size: 8.5pt; }
  .kind-bar-bg { background: #F3F4F6; border-radius: 4px; height: 8px; overflow: hidden; }
  .kind-bar-fill { background: linear-gradient(to right, #FF6B1A, #10B981); height: 100%; border-radius: 4px; }

  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #E5E7EB;
    font-size: 8pt;
    color: #999;
    display: flex;
    justify-content: space-between;
  }

  .counts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 8px 0 14px;
    font-size: 9pt;
    color: #555;
  }
  .count-box {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 6px;
    padding: 6px 8px;
    text-align: center;
  }
  .count-box .v { font-weight: 700; color: #111; font-size: 11pt; }

  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">Soutra-Playce</div>
    <div class="brand-sub">Rapport de revenus établissement</div>
  </div>
  <div class="meta-right">
    <div class="date">${esc(formatDateFR(generatedAt))}</div>
    <div>Réf. : SP-REV-${generatedAt.getTime().toString(36).toUpperCase()}</div>
  </div>
</div>

<div class="venue-block">
  <div class="venue-name">${esc(venue.name)}</div>
  <div class="venue-meta">
    ${esc(venue.category)}${venue.district ? ' · ' + esc(venue.district) : ''}${venue.city ? ' · ' + esc(venue.city) : ''}
  </div>
  <div class="period">Période : ${esc(periodLabel)}</div>
</div>

<h2>Indicateurs financiers</h2>
<div class="kpi-grid">
  <div class="kpi kpi-blue">
    <div class="kpi-label">Revenus bruts</div>
    <div class="kpi-value">${formatXOF(summary.gross_xof)}</div>
    <div class="kpi-sub">Total des flux générés</div>
  </div>
  <div class="kpi kpi-amber">
    <div class="kpi-label">Commission Soutra-Playce</div>
    <div class="kpi-value">${formatXOF(summary.commission_xof)}</div>
    <div class="kpi-sub">${summary.commission_rate_pct}% du brut</div>
  </div>
  <div class="kpi kpi-green">
    <div class="kpi-label">Revenus nets</div>
    <div class="kpi-value">${formatXOF(summary.net_xof)}</div>
    <div class="kpi-sub">Brut – commission</div>
  </div>
  <div class="kpi kpi-purple">
    <div class="kpi-label">Frais facturés</div>
    <div class="kpi-value">${formatXOF(summary.billable_xof)}</div>
    <div class="kpi-sub">Mise en avant, publicité, certif…</div>
  </div>
</div>

${deltaBlock}

<div class="counts">
  <div class="count-box"><div class="v">${summary.reservation_events}</div>Réservations</div>
  <div class="count-box"><div class="v">${summary.ticket_events}</div>Billets vendus</div>
  <div class="count-box"><div class="v">${summary.payment_events}</div>Paiements</div>
</div>

${byKind.length > 0 ? `
<h2>Ventilation par source</h2>
<table class="kinds">
  <thead>
    <tr><th>Source</th><th></th><th class="num">Montant</th><th class="num">Events</th></tr>
  </thead>
  <tbody>${kindRows}</tbody>
</table>
` : ''}

${events.length > 0 ? `
<h2>Détail des lignes (50 dernières)</h2>
<table>
  <thead>
    <tr><th>Date</th><th>Source</th><th class="num">Montant</th><th>Règle appliquée</th></tr>
  </thead>
  <tbody>${eventRows}</tbody>
</table>
` : ''}

<div class="footer">
  <div>Soutra-Playce · soutra-paiya.vercel.app</div>
  <div>Généré automatiquement — document non contractuel</div>
</div>

</body>
</html>`;
}
