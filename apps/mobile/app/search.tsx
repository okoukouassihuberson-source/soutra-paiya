import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useColors } from '@/lib/theme';

/**
 * /search — recherche universelle v1 (RPC search_my_universe, migration 0071).
 *
 * Recherche texte simple (pas de LLM) sur 3 sources en une requête :
 * contacts (bénéficiaires), transactions personnelles, lieux. Distinct de
 * /search-ai qui reste la recherche IA dédiée aux lieux (accessible depuis
 * l'onglet Explorer).
 */

interface Contact {
  phone: string;
  display_name: string;
}

interface TxResult {
  id: string;
  type: string;
  amount_xof: number;
  description: string | null;
  created_at: string;
  counterparty_name: string | null;
}

interface VenueResult {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  city: string | null;
}

export default function SearchScreen() {
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [transactions, setTransactions] = useState<TxResult[]>([]);
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setContacts([]);
      setTransactions([]);
      setVenues([]);
      setLoading(false);
      return;
    }
    const { data, error } = await (supabase.rpc as any)('search_my_universe', { p_query: q });
    if (error) {
      console.warn('[search] error:', error.message);
      setLoading(false);
      return;
    }
    const d = data as any;
    setContacts((d?.contacts as Contact[]) ?? []);
    setTransactions((d?.transactions as TxResult[]) ?? []);
    setVenues((d?.venues as VenueResult[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setContacts([]);
      setTransactions([]);
      setVenues([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const hasResults = contacts.length > 0 || transactions.length > 0 || venues.length > 0;
  const hasQuery = query.trim().length >= 2;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Recherche" />

      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={c.neutral[500]} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Contact, transaction, lieu…"
          placeholderTextColor={c.neutral[400]}
          autoFocus
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={c.primary[500]} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
        {!hasQuery && (
          <Text style={s.hint}>Tape au moins 2 caractères pour chercher parmi tes contacts, tes transactions et les lieux.</Text>
        )}

        {hasQuery && !loading && !hasResults && (
          <Text style={s.hint}>Aucun résultat pour « {query} ».</Text>
        )}

        {contacts.length > 0 && (
          <Section title="Contacts">
            {contacts.map((ctc) => (
              <Pressable
                key={ctc.phone}
                style={s.row}
                onPress={() => router.push({ pathname: '/send', params: { phone: ctc.phone } } as any)}
              >
                <View style={s.rowIcon}>
                  <Ionicons name="person" size={16} color={c.primary[600]} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{ctc.display_name}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{ctc.phone}</Text>
                </View>
                <Ionicons name="send-outline" size={16} color={c.neutral[400]} />
              </Pressable>
            ))}
          </Section>
        )}

        {transactions.length > 0 && (
          <Section title="Transactions">
            {transactions.map((tx) => (
              <View key={tx.id} style={s.row}>
                <View style={s.rowIcon}>
                  <Ionicons name="swap-vertical" size={16} color={c.primary[600]} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {tx.description || tx.counterparty_name || tx.type}
                  </Text>
                  <Text style={s.rowSub} numberOfLines={1}>{relativeDate(tx.created_at)}</Text>
                </View>
                <Text style={s.rowAmount}>{formatXOF(tx.amount_xof)}</Text>
              </View>
            ))}
          </Section>
        )}

        {venues.length > 0 && (
          <Section title="Lieux">
            {venues.map((v) => (
              <Pressable key={v.id} style={s.row} onPress={() => router.push(`/venue/${v.id}` as any)}>
                <View style={s.rowIcon}>
                  <Ionicons name="location" size={16} color={c.primary[600]} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{v.city || v.category || ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.neutral[400]} />
              </Pressable>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.list}>{children}</View>
    </View>
  );
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const m = Math.floor((now - d.getTime()) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: c.neutral[200],
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.fontSize.base,
      color: c.dark,
      padding: 0,
    },
    hint: {
      marginTop: spacing.xl,
      marginHorizontal: spacing.lg,
      textAlign: 'center',
      fontSize: typography.fontSize.sm,
      color: c.neutral[500],
    },
    sectionTitle: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.fontSize.xs,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: c.neutral[500],
    },
    list: {
      marginHorizontal: spacing.lg,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.neutral[200],
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.neutral[200],
    },
    rowIcon: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary[50],
    },
    rowTitle: {
      fontSize: typography.fontSize.sm,
      fontWeight: '700',
      color: c.dark,
    },
    rowSub: {
      marginTop: 2,
      fontSize: typography.fontSize.xs,
      color: c.neutral[500],
    },
    rowAmount: {
      fontSize: typography.fontSize.sm,
      fontWeight: '800',
      color: c.dark,
      fontVariant: ['tabular-nums'],
    },
  });
}
