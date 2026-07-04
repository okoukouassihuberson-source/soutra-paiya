// ============================================================================
// Génération PDF locale d'un ticket avec QR code de validation.
//
// Pipeline :
//   1. Encode le payload QR (type + kind + id + code) via qrcode → SVG string
//   2. Construit le HTML du ticket avec le SVG inline
//   3. expo-print.printToFileAsync({ html }) → URI PDF local
//   4. expo-sharing.shareAsync(uri) → sheet de partage (Files, Gmail, WhatsApp…)
//
// Le PDF fonctionne offline : pas de dépendance à une URL web ni à un service
// tiers pour générer le QR.
//
// La validation du ticket côté merchant sera implémentée dans une prochaine
// PR (scan QR → parseTicketQr → RPC de validation).
// ============================================================================
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import QRCode from 'qrcode';
import { formatXOF } from '@soutra/shared';

const TICKET_QR_TYPE = 'soutraticket';

export type TicketKind = 'reservation' | 'order' | 'booking';

export interface TicketPdfPayload {
  kind: TicketKind;
  id: string;
  // Code court affiché sous le QR pour la validation manuelle. Pour les
  // reservations resto, c'est le champ `qr_code` existant. Pour orders /
  // bookings, on utilise le numéro (order_number / booking_number).
  code: string;
  // Métadonnées d'affichage
  title: string;         // venue name
  subtitle?: string;     // adresse / district
  date: string;          // date lisible (déjà formatée en français)
  status: string;        // libellé statut
  amountXof: number;
  // Détails contextuels par type (optionnels)
  detailsLines?: Array<{ label: string; value: string }>;
}

/**
 * Charge utile du QR — encode l'identité du ticket. La validation par le
 * merchant décodera ce JSON pour appeler la RPC de check-in.
 */
function buildTicketQrPayload(payload: TicketPdfPayload): string {
  return JSON.stringify({
    t: TICKET_QR_TYPE,
    k: payload.kind,
    id: payload.id,
    c: payload.code,
  });
}

/**
 * Retourne un SVG string prêt à être embedded dans le HTML.
 * Utilise la lib `qrcode` disponible en transitive dep via
 * react-native-qrcode-svg. Niveau de correction M (~15 % de dégradation
 * tolérée) : bon compromis lisibilité / densité pour un ticket imprimé.
 */
async function buildQrSvg(payloadJson: string): Promise<string> {
  return await QRCode.toString(payloadJson, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#0E1116', light: '#FFFFFF' },
  });
}

const KIND_LABEL: Record<TicketKind, string> = {
  reservation: 'Réservation',
  order: 'Commande',
  booking: 'Séjour hôtel',
};

const KIND_ACCENT: Record<TicketKind, string> = {
  reservation: '#f97316',
  order: '#7c3aed',
  booking: '#0891b2',
};

/**
 * Construit le HTML A4 du ticket. Le style est inline pour que le rendu
 * expo-print soit fidèle sans dépendance externe (pas de <link> CSS).
 */
function buildTicketHtml(payload: TicketPdfPayload, qrSvg: string): string {
  const accent = KIND_ACCENT[payload.kind];
  const kindLabel = KIND_LABEL[payload.kind];
  const details = (payload.detailsLines ?? [])
    .map(
      (l) => `
        <tr>
          <td class="lbl">${escapeHtml(l.label)}</td>
          <td class="val">${escapeHtml(l.value)}</td>
        </tr>
      `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Ticket Soutra-Playce — ${escapeHtml(kindLabel)}</title>
    <style>
      @page { size: A4; margin: 20mm; }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
        color: #0E1116;
        margin: 0;
        padding: 0;
      }
      .card {
        border: 1.5px solid #E5E7EB;
        border-radius: 16px;
        padding: 32px;
        max-width: 640px;
        margin: 0 auto;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 20px;
        border-bottom: 1px dashed #E5E7EB;
        margin-bottom: 24px;
      }
      .brand {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.5px;
      }
      .brand .accent { color: #FF6B1A; }
      .kind-pill {
        display: inline-block;
        padding: 6px 14px;
        border-radius: 999px;
        background: ${accent}22;
        color: ${accent};
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .title {
        font-size: 26px;
        font-weight: 700;
        margin: 0 0 6px;
      }
      .subtitle {
        color: #6B7280;
        font-size: 13px;
        margin: 0 0 24px;
      }
      .qr-block {
        display: flex;
        align-items: center;
        gap: 28px;
        margin: 28px 0;
        padding: 24px;
        background: #F9FAFB;
        border-radius: 12px;
      }
      .qr-svg { width: 160px; height: 160px; }
      .qr-svg svg { width: 100%; height: 100%; }
      .qr-info { flex: 1; }
      .qr-info .label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        color: #6B7280;
        margin-bottom: 6px;
      }
      .qr-info .code {
        font-family: "SF Mono", Consolas, monospace;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 2px;
      }
      .qr-info .hint {
        font-size: 12px;
        color: #6B7280;
        margin-top: 10px;
        line-height: 1.5;
      }
      table.details {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      table.details td {
        padding: 10px 0;
        font-size: 14px;
        border-bottom: 1px solid #F3F4F6;
      }
      table.details td.lbl {
        color: #6B7280;
        width: 40%;
      }
      table.details td.val {
        color: #0E1116;
        font-weight: 600;
        text-align: right;
      }
      .amount-row td {
        border-top: 2px solid #0E1116;
        border-bottom: none !important;
        padding-top: 16px !important;
        font-size: 16px !important;
      }
      .amount-row td.val {
        color: ${accent};
        font-weight: 800;
      }
      .footer {
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px dashed #E5E7EB;
        font-size: 11px;
        color: #9CA3AF;
        text-align: center;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <div class="brand">Soutra<span class="accent">-Playce</span></div>
        <span class="kind-pill">${escapeHtml(kindLabel)}</span>
      </div>

      <h1 class="title">${escapeHtml(payload.title)}</h1>
      ${payload.subtitle ? `<p class="subtitle">${escapeHtml(payload.subtitle)}</p>` : ''}

      <div class="qr-block">
        <div class="qr-svg">${qrSvg}</div>
        <div class="qr-info">
          <div class="label">Code de validation</div>
          <div class="code">${escapeHtml(payload.code.toUpperCase().slice(0, 12))}</div>
          <p class="hint">
            Présente ce ticket (écran ou papier) au personnel du lieu.
            Le QR est scanné pour valider l'entrée / la remise.
          </p>
        </div>
      </div>

      <table class="details">
        <tr><td class="lbl">Date</td><td class="val">${escapeHtml(payload.date)}</td></tr>
        <tr><td class="lbl">Statut</td><td class="val">${escapeHtml(payload.status)}</td></tr>
        ${details}
        <tr class="amount-row">
          <td class="lbl">Total</td>
          <td class="val">${escapeHtml(formatXOF(payload.amountXof))}</td>
        </tr>
      </table>

      <div class="footer">
        Ticket émis par Soutra-Playce · ID ${escapeHtml(payload.id.slice(0, 8))}<br />
        En cas de problème : support@soutra-paiya.com
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Génère le PDF du ticket et ouvre le picker de partage. Renvoie l'URI
 * du fichier PDF (utile pour debug ou preview).
 */
export async function exportTicketPdf(payload: TicketPdfPayload): Promise<string | null> {
  try {
    const qrSvg = await buildQrSvg(buildTicketQrPayload(payload));
    const html = buildTicketHtml(payload, qrSvg);
    const { uri } = await Print.printToFileAsync({
      html,
      margins: { left: 0, top: 0, right: 0, bottom: 0 },
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Ticket Soutra-Playce',
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert(
        'PDF généré',
        Platform.OS === 'web'
          ? 'Ouvre le fichier depuis ton navigateur.'
          : `Fichier sauvegardé : ${uri}`,
      );
    }
    return uri;
  } catch (err) {
    console.error('[ticket-pdf] export error:', err);
    Alert.alert(
      'Erreur',
      err instanceof Error ? err.message : 'Impossible de générer le ticket PDF.',
    );
    return null;
  }
}
