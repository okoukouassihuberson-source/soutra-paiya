// ============================================================================
// Export PDF du rapport de revenus côté mobile.
//
// Pipeline :
//   1. buildRevenueReportHtml() — HTML standalone (shared)
//   2. expo-print.printToFileAsync({ html }) → URI fichier PDF local
//   3. expo-sharing.shareAsync(uri) → sheet de partage (Files, Gmail, WhatsApp…)
//
// Note : expo-print génère un PDF natif en interne (iOS UIPrintInteractionController,
// Android via WebView → PdfRenderer). Le PDF a la même mise en page que le HTML.
// ============================================================================
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import {
  buildRevenueReportHtml,
  type RevenueReportSummary,
  type RevenueReportKindRow,
  type RevenueReportEventRow,
  type RevenueReportVenue,
} from '@soutra/shared';
import { tr, intlLocale, type TKey } from '@/lib/i18n';
import { PRO_KIND_META } from '@/lib/pro-revenue';

export interface ExportRevenuePdfParams {
  venue: RevenueReportVenue;
  summary: RevenueReportSummary;
  byKind: RevenueReportKindRow[];
  events?: RevenueReportEventRow[];
  periodLabel: string;
}

/**
 * Génère le PDF du rapport de revenus puis ouvre le picker de partage.
 * Si Sharing n'est pas dispo (web Expo), tombe sur Alert.
 *
 * @returns l'URI du fichier PDF généré (pour debug / preview)
 */
export async function exportRevenuePdf(params: ExportRevenuePdfParams): Promise<string | null> {
  const html = buildRevenueReportHtml({
    venue: params.venue,
    summary: params.summary,
    byKind: params.byKind,
    events: params.events ?? [],
    periodLabel: params.periodLabel,
    locale: intlLocale(),
    labels: Object.fromEntries(
      (['title', 'subtitle', 'ref', 'period', 'financials', 'gross', 'grossSub', 'commission', 'commissionSub', 'net', 'netSub', 'billable', 'billableSub', 'deltaText', 'reservations', 'tickets', 'payments', 'bySource', 'source', 'amount', 'events', 'lastLines', 'date', 'rule', 'footer'] as const)
        .map((k) => [k, tr(`revenuePdf.${k}` as TKey)]),
    ),
    kindLabels: Object.fromEntries(Object.keys(PRO_KIND_META).map((k) => [k, PRO_KIND_META[k].label])),
  });

  try {
    const { uri } = await Print.printToFileAsync({
      html,
      // Marges déjà prises en charge par @page CSS dans le HTML.
      margins: { left: 0, top: 0, right: 0, bottom: 0 },
      width: 595,   // A4 portrait en points (595 × 842 PostScript points)
      height: 842,
      base64: false,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: tr('sys.pdfShare'),
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert(
        tr('sys.pdfDone'),
        Platform.OS === 'android'
          ? tr('sys.pdfSaved', { uri })
          : tr('sys.pdfNoShare'),
      );
    }
    return uri;
  } catch (err: any) {
    Alert.alert(tr('sys.pdfErrTitle'), err?.message ?? tr('sys.pdfFail'));
    return null;
  }
}
