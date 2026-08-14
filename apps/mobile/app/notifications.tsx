// Nouveau fichier : apps/mobile/app/notifications.tsx
//
// Centre de notifications in-app. Dépend de la migration 0079 :
// table notifications, RPC unread_notifications_count / mark_all_notifications_read.
//
// Le routage au tap est porté par la colonne `route` en base, pas par un switch
// ici : ajouter un type de notification ne demande aucun changement client.
//
// Accès : icône cloche de l'accueil et d'Explorer (explore.tsx ligne ~289
// affiche aujourd'hui un Alert « Aucune nouvelle notification » — à remplacer
// par router.push('/notifications')).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionList, View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  typography, radius, spacing, touch,
  formatRelativeDate, formatXOF, type ColorPalette,
} from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useColors } from '@/lib/theme';

type NotificationKind =
  | 'reservation_pending' | 'reservation_confirmed' | 'reservation_declined'
  | 'order_status' | 'payment_received' | 'payment_sent'
  | 'loyalty' | 'social' | 'system';

interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  route: string | null;
  meta: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
}

// Une icône par famille, pas une par type : l'utilisateur reconnaît la
// catégorie d'un coup d'œil, le titre porte le détail.
const ICONS: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  reservation_pending: 'time-outline',
  reservation_confirmed: 'checkmark-circle',
  reservation_declined: 'close-circle',
  order_status: 'bag-handle',
  payment_received: 'arrow-down-circle',
  payment_sent: 'arrow-up-circle',
  loyalty: 'star',
  social: 'chatbubble-ellipses',
  system: 'information-circle',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: qError } = await (supabase as any)
      .from('notifications')
      .select('id, kind, title, body, route, meta, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (qError) setError(qError.message);
    else { setError(null); setItems((data as Notification[]) ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = items.filter((n) => n.read_at === null).length;

  // Sections : les non-lues d'abord, en bloc. C'est la seule hiérarchie qui
  // compte à l'ouverture — le reste est de l'historique.
  const sections = useMemo(() => {
    const fresh = items.filter((n) => n.read_at === null);
    const seen = items.filter((n) => n.read_at !== null);
    return [
      ...(fresh.length ? [{ title: 'Nouveau', data: fresh }] : []),
      ...(seen.length ? [{ title: 'Plus tôt', data: seen }] : []),
    ];
  }, [items]);

  async function markAllRead() {
    // Optimiste : la liste se met à jour tout de suite, la RPC suit.
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    const { error: rpcError } = await (supabase as any).rpc('mark_all_notifications_read');
    if (rpcError) load(); // revient à l'état serveur si ça a échoué
  }

  async function open(n: Notification) {
    if (n.read_at === null) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', n.id);
    }
    if (n.route) router.push(n.route as any);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : undefined}
        trailing={
          unread > 0 ? (
            <Pressable onPress={markAllRead} hitSlop={8} style={s.readAllBtn}>
              <Text style={s.readAllText}>Tout lire</Text>
            </Pressable>
          ) : null
        }
      />

      {loading ? (
        <View style={{ gap: spacing.sm, padding: spacing.gutter }}>
          {[0, 1, 2, 3].map((i) => <View key={i} style={s.skeleton} />)}
        </View>
      ) : error ? (
        <View style={s.stateBox}>
          <Text style={s.stateTitle}>Chargement impossible</Text>
          <Text style={s.stateBody}>{error}</Text>
          <Pressable style={s.stateBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={s.stateBtnText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={s.stateBox}>
          <Text style={s.stateTitle}>Rien pour le moment</Text>
          <Text style={s.stateBody}>
            Réservations, commandes et paiements arriveront ici. Tu peux aussi activer
            les notifications push dans les réglages.
          </Text>
          <Pressable style={s.stateBtn} onPress={() => router.push('/settings' as any)}>
            <Text style={s.stateBtnText}>Ouvrir les réglages</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.gutter, paddingBottom: spacing['2xl'], gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
          renderSectionHeader={({ section }) => (
            <Text style={s.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => <Row n={item} onPress={() => open(item)} />}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ n, onPress }: { n: Notification; onPress: () => void }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const unread = n.read_at === null;
  const amount = typeof n.meta?.amount_xof === 'number' ? n.meta.amount_xof : null;

  // Le fond du badge dit l'état : en attente, en cours, abouti, refusé.
  const tone =
    n.kind === 'reservation_pending' ? { bg: c.state.pendingBg, fg: c.state.pendingFg }
    : n.kind === 'reservation_declined' ? { bg: c.state.alertBg, fg: c.state.alertFg }
    : n.kind === 'order_status' ? { bg: c.state.liveBg, fg: c.state.liveFg }
    : n.kind === 'reservation_confirmed' || n.kind === 'payment_received'
      ? { bg: c.state.doneBg, fg: c.state.doneFg }
    : { bg: c.surface.sunken, fg: c.ink.muted };

  return (
    <Pressable
      style={[s.row, unread && s.rowUnread]}
      onPress={onPress}
      disabled={!n.route}
      accessibilityLabel={`${n.title}${unread ? ', non lue' : ''}`}
    >
      <View style={[s.rowIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={ICONS[n.kind]} size={18} color={tone.fg} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[s.rowTitle, unread && s.rowTitleUnread]} numberOfLines={2}>
          {n.title}
        </Text>
        {n.body ? <Text style={s.rowBody} numberOfLines={2}>{n.body}</Text> : null}
        <View style={s.rowFoot}>
          <Text style={s.rowDate}>{formatRelativeDate(n.created_at)}</Text>
          {amount !== null && (
            <Text style={[
              s.rowAmount,
              { color: n.kind === 'payment_received' ? c.money.credit : c.money.debit },
            ]}>
              {n.kind === 'payment_received' ? '+' : '−'} {formatXOF(amount)}
            </Text>
          )}
        </View>
      </View>

      {/* Point plutôt qu'un fond coloré sur toute la ligne : la non-lue reste
          lisible sans crier, et ça tient en mode sombre. */}
      {unread && <View style={s.dot} />}
      {n.route && <Ionicons name="chevron-forward" size={16} color={c.ink.faint} />}
    </Pressable>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.surface.canvas },

    readAllBtn: {
      minHeight: touch.minTarget, justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    readAllText: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      color: c.primary[600],
    },

    sectionHeader: {
      marginTop: spacing.md, marginBottom: spacing.xs,
      fontSize: typography.fontSize.xs,
      fontFamily: typography.fontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: typography.letterSpacing.caps,
      color: c.ink.faint,
    },

    row: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
      padding: spacing.md,
      minHeight: touch.minTarget,
      backgroundColor: c.surface.card,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.surface.hairline,
    },
    rowUnread: { borderColor: c.primary[500] },
    rowIcon: {
      width: 36, height: 36, borderRadius: radius.md,
      alignItems: 'center', justifyContent: 'center',
    },
    rowTitle: {
      fontSize: typography.fontSize.md,
      color: c.ink.strong,
      fontFamily: typography.fontFamily.medium,
    },
    rowTitleUnread: { fontFamily: typography.fontFamily.semibold },
    rowBody: {
      fontSize: typography.fontSize.sm,
      color: c.ink.muted,
      lineHeight: typography.fontSize.sm * typography.lineHeight.body,
    },
    rowFoot: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: spacing.sm, marginTop: 2,
    },
    rowDate: { fontSize: typography.fontSize.xs, color: c.ink.faint },
    rowAmount: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.semibold,
      fontVariant: ['tabular-nums'],
    },
    dot: {
      width: 8, height: 8, borderRadius: 4,
      marginTop: 6,
      backgroundColor: c.primary[500],
    },

    skeleton: {
      height: 72,
      borderRadius: radius.lg,
      backgroundColor: c.surface.sunken,
    },

    stateBox: {
      margin: spacing.gutter,
      padding: spacing.lg,
      alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.surface.card,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.surface.hairline,
    },
    stateTitle: {
      fontSize: typography.fontSize.lg,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.strong,
      textAlign: 'center',
    },
    stateBody: {
      fontSize: typography.fontSize.sm,
      color: c.ink.muted,
      textAlign: 'center',
    },
    stateBtn: {
      marginTop: spacing.sm,
      minHeight: touch.minTarget, justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.primary[500],
    },
    stateBtnText: {
      fontSize: typography.fontSize.base,
      fontFamily: typography.fontFamily.semibold,
      color: c.ink.onDark,
    },
  });
}
