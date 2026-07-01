'use client';

import { useEffect } from 'react';

/* ─────────────────────────────────────────────────── *
 *  TYPES                                              *
 * ─────────────────────────────────────────────────── */

interface Venue {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  address: string;
  city: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  cover_url: string | null;
}

interface Reservation {
  id: string;
  user_id: string;
  venue_id: string;
  date_time: string;
  party_size: number;
  deposit_xof: number;
  status: string;
  qr_code: string;
  notes: string | null;
  created_at: string;
  arrived_at: string | null;
  cancelled_at: string | null;
  venue: Venue | null;
}

interface Profile {
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Ticket HTML imprimable d'une réservation.
 *
 * QR code : généré via api.qrserver.com (gratuit, pas de clé, pas de
 * dépendance npm). L'URL contient le qr_code de la réservation et le
 * staff venue peut le scanner pour valider l'arrivée.
 *
 * Auto window.print() au mount (350ms). Désactivable avec ?autoprint=0.
 */
export function TicketView({
  resa,
  profile,
}: {
  resa: Reservation;
  profile: Profile | null;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoprint') === '0') return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, []);

  const ticketNumber = `SP-R-${resa.id.slice(0, 8).toUpperCase()}`;
  const date = new Date(resa.date_time);
  const dateFr = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFr = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Source du QR : api.qrserver.com retourne un PNG carré, scannable
  // directement avec n'importe quel appareil photo.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(resa.qr_code)}&size=240x240&margin=0`;

  const venueLine = [resa.venue?.district, resa.venue?.city].filter(Boolean).join(' · ');

  return (
    <main className="ticket-root">
      {/* ──────── BOUTONS ÉCRAN (cachés à l'impression) ──────── */}
      <div className="ticket-actions no-print">
        <button onClick={() => window.history.back()} className="btn-secondary">
          ← Retour
        </button>
        <button onClick={() => window.print()} className="btn-primary">
          📄 Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* ──────── TICKET ──────── */}
      <article className="ticket-sheet">
        {/* HEADER */}
        <header className="ticket-header">
          <div className="brand">
            <div className="brand-logo">SP</div>
            <div>
              <p className="brand-name">
                <span style={{ color: '#0E1116' }}>Soutra</span>
                <span style={{ color: '#FF6B1A' }}>-Playce</span>
              </p>
              <p className="brand-tagline">Ta réservation</p>
            </div>
          </div>
          <div className="ticket-title">
            <p className="ticket-title-label">Numéro</p>
            <p className="ticket-number">{ticketNumber}</p>
            <p className="ticket-status">
              <span className={`status-pill status-${resa.status}`}>
                {STATUS_LABEL[resa.status] || resa.status}
              </span>
            </p>
          </div>
        </header>

        {/* VENUE */}
        <section className="venue-block">
          {resa.venue?.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resa.venue.cover_url} alt={resa.venue.name} className="venue-cover" />
          )}
          <div className="venue-info">
            <p className="venue-category">{resa.venue?.category}</p>
            <h1 className="venue-name">{resa.venue?.name || 'Établissement'}</h1>
            <p className="venue-address">{resa.venue?.address}</p>
            {venueLine && <p className="venue-meta">{venueLine}</p>}
            {(resa.venue?.phone || resa.venue?.email) && (
              <p className="venue-contact">
                {resa.venue.phone && <>📞 {resa.venue.phone}</>}
                {resa.venue.phone && resa.venue.email && ' · '}
                {resa.venue.email && <>✉ {resa.venue.email}</>}
              </p>
            )}
          </div>
        </section>

        {/* DÉTAILS */}
        <section className="details-grid">
          <div className="detail-card detail-card-primary">
            <p className="detail-label">📅 Date</p>
            <p className="detail-value">{dateFr}</p>
          </div>
          <div className="detail-card detail-card-primary">
            <p className="detail-label">🕐 Heure</p>
            <p className="detail-value">{timeFr}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">👥 Personnes</p>
            <p className="detail-value">{resa.party_size}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">💰 Acompte payé</p>
            <p className="detail-value">{formatXOF(resa.deposit_xof)}</p>
          </div>
        </section>

        {/* QR + INFOS PORTEUR */}
        <section className="qr-block">
          <div className="qr-wrap">
            <div className="qr-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR code de la réservation" width={240} height={240} />
            </div>
            <p className="qr-caption">
              Présente ce QR à l&apos;établissement pour valider ton arrivée
            </p>
          </div>
          <div className="holder-info">
            <p className="holder-label">Au nom de</p>
            <p className="holder-name">{profile?.full_name || 'Client Soutra-Explore'}</p>
            {profile?.phone && <p className="holder-line">📞 {profile.phone}</p>}
            <div className="ref-block">
              <p className="ref-label">Référence interne</p>
              <p className="ref-value">{resa.qr_code}</p>
            </div>
          </div>
        </section>

        {/* NOTES */}
        {resa.notes && (
          <section className="notes-block">
            <p className="notes-label">📝 Notes</p>
            <p className="notes-text">{resa.notes}</p>
          </section>
        )}

        {/* CONDITIONS */}
        <section className="conditions">
          <p className="conditions-title">Conditions</p>
          <ul>
            <li>Arrive 5 minutes avant l&apos;heure de réservation.</li>
            <li>L&apos;acompte est non remboursable en cas de no-show.</li>
            <li>Annulation gratuite jusqu&apos;à 24h avant.</li>
            <li>Présente ce ticket (papier ou écran) à l&apos;accueil.</li>
          </ul>
        </section>

        {/* FOOTER */}
        <footer className="ticket-footer">
          <p>
            Réservé via <strong>Soutra-Explore</strong> · Wallet fintech Côte d&apos;Ivoire
          </p>
          <p className="small">
            Question ? Contacte <strong>support@soutra-paiya.com</strong>
          </p>
        </footer>
      </article>

      {/* ──────── STYLES ──────── */}
      <style jsx>{`
        :global(body) {
          background: #f5f5f5;
          margin: 0;
        }
        .ticket-root {
          min-height: 100vh;
          padding: 24px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #0E1116;
        }
        .ticket-actions {
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
        }
        .btn-primary {
          background: linear-gradient(135deg, #FF6B1A, #E5500D);
          color: white;
          box-shadow: 0 4px 12px rgba(255, 107, 26, 0.3);
        }
        .btn-primary:hover { opacity: 0.92; }
        .btn-secondary {
          background: white;
          color: #525252;
          border: 1px solid #e5e5e5;
        }
        .btn-secondary:hover { background: #fafafa; }

        .ticket-sheet {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 40px 48px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          position: relative;
          overflow: hidden;
        }
        /* Ticket "torn" decoration en haut/bas */
        .ticket-sheet::before,
        .ticket-sheet::after {
          content: '';
          position: absolute;
          left: 0; right: 0;
          height: 16px;
          background:
            radial-gradient(circle, transparent 8px, white 8px) repeat-x;
          background-size: 24px 16px;
        }
        .ticket-sheet::before { top: -8px; }
        .ticket-sheet::after  { bottom: -8px; }

        .ticket-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          padding-bottom: 20px;
          border-bottom: 2px dashed #e5e5e5;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand-logo {
          width: 44px; height: 44px; border-radius: 10px;
          background: linear-gradient(135deg, #FF6B1A, #E5500D);
          color: white; font-weight: 800; font-size: 16px;
          display: flex; align-items: center; justify-content: center;
        }
        .brand-name { font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
        .brand-tagline { font-size: 12px; color: #737373; margin: 2px 0 0; }
        .ticket-title { text-align: right; }
        .ticket-title-label {
          font-size: 11px; font-weight: 700; color: #737373;
          text-transform: uppercase; letter-spacing: 1.2px;
          margin: 0;
        }
        .ticket-number {
          font-size: 20px; font-weight: 800; color: #0E1116;
          margin: 4px 0 6px;
          font-family: ui-monospace, 'SF Mono', Menlo, monospace;
          letter-spacing: -0.02em;
        }
        .ticket-status { margin: 0; }
        .status-pill {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .status-pending { background: #fef3c7; color: #b45309; }
        .status-confirmed { background: #dbeafe; color: #1d4ed8; }
        .status-arrived { background: #d1fae5; color: #047857; }
        .status-no_show { background: #fee2e2; color: #b91c1c; }
        .status-cancelled { background: #f5f5f5; color: #737373; }
        .status-refunded { background: #ede9fe; color: #6d28d9; }

        .venue-block {
          display: flex;
          gap: 20px;
          align-items: center;
          padding: 24px 0;
          border-bottom: 1px dashed #e5e5e5;
        }
        .venue-cover {
          width: 100px; height: 100px;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid #e5e5e5;
        }
        .venue-info { flex: 1; min-width: 0; }
        .venue-category {
          font-size: 10px; font-weight: 700; color: #FF6B1A;
          text-transform: uppercase; letter-spacing: 1.2px;
          margin: 0 0 4px;
        }
        .venue-name {
          font-size: 24px; font-weight: 800; color: #0E1116;
          margin: 0 0 6px; letter-spacing: -0.02em;
        }
        .venue-address { font-size: 14px; color: #0E1116; margin: 2px 0; }
        .venue-meta { font-size: 12px; color: #737373; margin: 2px 0; }
        .venue-contact { font-size: 12px; color: #525252; margin: 6px 0 0; }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          padding: 24px 0;
        }
        .detail-card {
          padding: 14px;
          border-radius: 12px;
          background: #fafafa;
          border: 1px solid #f5f5f5;
        }
        .detail-card-primary {
          background: #fff7ed;
          border-color: #fed7aa;
        }
        .detail-label {
          font-size: 11px; font-weight: 700; color: #737373;
          text-transform: uppercase; letter-spacing: 0.8px;
          margin: 0 0 4px;
        }
        .detail-value {
          font-size: 16px; font-weight: 700; color: #0E1116;
          margin: 0; text-transform: capitalize;
        }

        .qr-block {
          display: flex;
          gap: 24px;
          align-items: center;
          padding: 24px 0;
          border-top: 2px dashed #e5e5e5;
          border-bottom: 2px dashed #e5e5e5;
        }
        .qr-wrap { text-align: center; }
        .qr-img {
          width: 240px; height: 240px;
          padding: 10px;
          background: white;
          border: 2px solid #0E1116;
          border-radius: 12px;
        }
        .qr-img img { display: block; width: 100%; height: 100%; }
        .qr-caption {
          font-size: 11px; color: #737373;
          margin: 10px 0 0; max-width: 240px;
        }
        .holder-info { flex: 1; min-width: 0; }
        .holder-label {
          font-size: 11px; font-weight: 700; color: #737373;
          text-transform: uppercase; letter-spacing: 1px;
          margin: 0 0 4px;
        }
        .holder-name {
          font-size: 18px; font-weight: 700; color: #0E1116;
          margin: 0 0 4px;
        }
        .holder-line { font-size: 13px; color: #525252; margin: 2px 0; }
        .ref-block {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #f5f5f5;
        }
        .ref-label {
          font-size: 11px; font-weight: 700; color: #737373;
          text-transform: uppercase; letter-spacing: 1px;
          margin: 0 0 4px;
        }
        .ref-value {
          font-family: ui-monospace, 'SF Mono', Menlo, monospace;
          font-size: 11px; color: #525252;
          margin: 0; word-break: break-all;
        }

        .notes-block {
          margin-top: 20px;
          padding: 16px;
          background: #fffbeb;
          border-left: 3px solid #f59e0b;
          border-radius: 6px;
        }
        .notes-label {
          font-size: 11px; font-weight: 700; color: #92400e;
          text-transform: uppercase; letter-spacing: 1px;
          margin: 0 0 6px;
        }
        .notes-text {
          font-size: 13px; color: #0E1116; margin: 0;
          white-space: pre-wrap;
        }

        .conditions { padding: 24px 0 16px; }
        .conditions-title {
          font-size: 11px; font-weight: 700; color: #737373;
          text-transform: uppercase; letter-spacing: 1.2px;
          margin: 0 0 12px;
        }
        .conditions ul {
          margin: 0; padding-left: 20px;
          font-size: 12px; color: #525252;
        }
        .conditions li { margin: 4px 0; line-height: 1.5; }

        .ticket-footer {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #f5f5f5;
          text-align: center;
          color: #737373;
          font-size: 12px;
        }
        .ticket-footer .small { font-size: 11px; margin-top: 4px; }

        /* ============ PRINT ============ */
        @media print {
          :global(body) { background: white !important; }
          .no-print { display: none !important; }
          .ticket-root { padding: 0; }
          .ticket-sheet {
            box-shadow: none;
            border-radius: 0;
            max-width: none;
            padding: 16px 24px;
          }
          .ticket-sheet::before, .ticket-sheet::after { display: none; }
          @page { size: A4; margin: 10mm; }
        }

        /* Responsive : mobile */
        @media (max-width: 600px) {
          .ticket-sheet { padding: 24px 20px; }
          .ticket-header { flex-direction: column; gap: 12px; }
          .ticket-title { text-align: left; }
          .venue-block { flex-direction: column; align-items: flex-start; }
          .venue-cover { width: 100%; height: 140px; }
          .qr-block { flex-direction: column; }
          .qr-img { margin: 0 auto; }
        }
      `}</style>
    </main>
  );
}

/* ─────────────────────────────────────────────────── *
 *  UTILS                                              *
 * ─────────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  arrived: 'Arrivé',
  no_show: 'No-show',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

function formatXOF(n: number): string {
  if (!Number.isFinite(n)) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}
