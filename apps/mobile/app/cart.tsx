import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Image, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /cart — panier persistant mobile.
 *
 * Affiche tous les sous-paniers du user, groupés par venue. Chaque sous-
 * panier peut être commandé indépendamment (delivery method + adresse +
 * notes). Bouton "Commander" appelle create_order_from_cart côté Supabase.
 */

interface CartItem {
  cart_item_id: string;
  product_id: string;
  name: string;
  unit_price_xof: number;
  qty: number;
  variant: Record<string, string> | null;
  subtotal_xof: number;
  photo: string | null;
  available: boolean;
}

interface SubCart {
  venue_id: string;
  venue_name: string;
  venue_cover: string | null;
  venue_category: string;
  items: CartItem[];
  subtotal_xof: number;
  items_count: number;
}

export default function CartScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [carts, setCarts] = useState<SubCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setCarts([]); setLoading(false); setRefreshing(false); return;
    }
    try {
      const { data, error } = await (supabase.rpc as any)('list_my_cart');
      if (error) {
        console.error('[cart] load:', error);
        setCarts([]);
      } else {
        setCarts((data as SubCart[]) ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const updateQty = useCallback(async (cartItemId: string, qty: number) => {
    const { error } = await (supabase.rpc as any)('update_cart_item_qty', {
      p_cart_item_id: cartItemId,
      p_qty: qty,
    });
    if (error) {
      Alert.alert('Erreur', error.message || 'Impossible de modifier');
      return;
    }
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Mon panier" />
        <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Mon panier" />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {carts.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bag-handle-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Ton panier est vide</Text>
            <Text style={s.emptyBody}>
              Explore les boutiques et ajoute des produits pour passer commande.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/explore')}
              style={s.exploreBtn}
            >
              <Ionicons name="compass" size={18} color="#fff" />
              <Text style={s.exploreBtnText}>Explorer</Text>
            </Pressable>
          </View>
        ) : (
          carts.map((sc) => (
            <SubCartCard
              key={sc.venue_id}
              c={c}
              subcart={sc}
              onUpdateQty={updateQty}
              onOrdered={load}
              router={router}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────── *
 *  SUB-CART CARD (un panier par venue)                *
 * ─────────────────────────────────────────────────── */

function SubCartCard({
  c, subcart, onUpdateQty, onOrdered, router,
}: {
  c: ColorPalette;
  subcart: SubCart;
  onUpdateQty: (cartItemId: string, qty: number) => Promise<void>;
  onOrdered: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [ordering, setOrdering] = useState(false);

  const hasUnavailable = subcart.items.some((it) => !it.available);

  const handleOrder = useCallback(async () => {
    if (hasUnavailable) {
      Alert.alert('Produits indisponibles', 'Retire ou modifie les articles indisponibles avant de commander.');
      return;
    }
    if (method === 'delivery' && !address.trim()) {
      Alert.alert('Adresse requise', 'Indique une adresse de livraison.');
      return;
    }
    setOrdering(true);
    const { data, error } = await (supabase.rpc as any)('create_order_from_cart', {
      p_venue_id: subcart.venue_id,
      p_delivery_method: method,
      p_delivery_address: address.trim() || null,
      p_delivery_notes: notes.trim() || null,
      p_contact_phone: contactPhone.trim() || null,
      p_contact_name: contactName.trim() || null,
      p_delivery_fee_xof: 0, // pas de frais livraison pour cette version
    });
    setOrdering(false);
    if (error) {
      Alert.alert('Erreur', error.message || 'Impossible de passer commande');
      return;
    }
    const orderNum = (data as any)?.order_number || '';
    Alert.alert(
      'Commande confirmée 🎉',
      `Numéro : ${orderNum}\nTu peux suivre l'état dans "Mes commandes".`,
      [
        { text: 'Voir mes commandes', onPress: () => router.push('/orders' as any) },
        { text: 'OK', onPress: () => onOrdered() },
      ],
    );
  }, [subcart.venue_id, method, address, notes, contactName, contactPhone, hasUnavailable, onOrdered, router]);

  return (
    <View style={s.subcart}>
      {/* Header venue */}
      <View style={s.subcartHeader}>
        {subcart.venue_cover ? (
          <Image source={{ uri: subcart.venue_cover }} style={s.venueImg} />
        ) : (
          <View style={[s.venueImg, { backgroundColor: c.neutral[200] }]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.venueName}>{subcart.venue_name}</Text>
          <Text style={s.venueCat}>{subcart.venue_category}</Text>
        </View>
        <Text style={s.subcartCount}>{subcart.items_count} art.</Text>
      </View>

      {/* Items */}
      <View style={s.itemsList}>
        {subcart.items.map((it) => (
          <View key={it.cart_item_id} style={[s.item, !it.available && s.itemUnavailable]}>
            {it.photo ? (
              <Image source={{ uri: it.photo }} style={s.itemImg} />
            ) : (
              <View style={[s.itemImg, { backgroundColor: c.neutral[100] }]} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.itemName} numberOfLines={1}>{it.name}</Text>
              {it.variant && (
                <Text style={s.itemVariant} numberOfLines={1}>
                  {Object.entries(it.variant).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </Text>
              )}
              <Text style={s.itemPrice}>{formatXOF(it.unit_price_xof)} × {it.qty}</Text>
              {!it.available && (
                <Text style={s.itemUnavailableText}>⚠ Indisponible</Text>
              )}
            </View>
            <View style={s.itemActions}>
              <Pressable
                onPress={() => onUpdateQty(it.cart_item_id, it.qty - 1)}
                style={s.itemBtn} hitSlop={6}
              >
                <Ionicons name={it.qty <= 1 ? 'trash-outline' : 'remove'} size={16} color={c.dark} />
              </Pressable>
              <Text style={s.itemQty}>{it.qty}</Text>
              <Pressable
                onPress={() => onUpdateQty(it.cart_item_id, Math.min(100, it.qty + 1))}
                style={s.itemBtn} hitSlop={6}
              >
                <Ionicons name="add" size={16} color={c.dark} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {/* Subtotal */}
      <View style={s.subtotalRow}>
        <Text style={s.subtotalLabel}>Sous-total</Text>
        <Text style={s.subtotalValue}>{formatXOF(subcart.subtotal_xof)}</Text>
      </View>

      {/* Delivery method */}
      <Text style={s.sectionLabel}>Mode de récupération</Text>
      <View style={s.methodRow}>
        <Pressable
          onPress={() => setMethod('pickup')}
          style={[s.methodBtn, method === 'pickup' && s.methodBtnActive]}
        >
          <Ionicons name="storefront" size={16} color={method === 'pickup' ? '#fff' : c.dark} />
          <Text style={[s.methodText, method === 'pickup' && s.methodTextActive]}>Retrait</Text>
        </Pressable>
        <Pressable
          onPress={() => setMethod('delivery')}
          style={[s.methodBtn, method === 'delivery' && s.methodBtnActive]}
        >
          <Ionicons name="bicycle" size={16} color={method === 'delivery' ? '#fff' : c.dark} />
          <Text style={[s.methodText, method === 'delivery' && s.methodTextActive]}>Livraison</Text>
        </Pressable>
      </View>

      {method === 'delivery' && (
        <View style={s.field}>
          <Text style={s.fieldLabel}>Adresse de livraison *</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Rue, quartier, commune"
            placeholderTextColor={c.neutral[400]}
            style={s.input}
            multiline
          />
        </View>
      )}

      <View style={s.field}>
        <Text style={s.fieldLabel}>Nom à contacter</Text>
        <TextInput
          value={contactName}
          onChangeText={setContactName}
          placeholder="Optionnel"
          placeholderTextColor={c.neutral[400]}
          style={s.input}
        />
      </View>

      <View style={s.field}>
        <Text style={s.fieldLabel}>Téléphone</Text>
        <TextInput
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder="+225..."
          placeholderTextColor={c.neutral[400]}
          keyboardType="phone-pad"
          style={s.input}
        />
      </View>

      <View style={s.field}>
        <Text style={s.fieldLabel}>Notes (optionnel)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Instructions spéciales"
          placeholderTextColor={c.neutral[400]}
          style={s.input}
          multiline
        />
      </View>

      <Pressable
        onPress={handleOrder}
        disabled={ordering}
        style={({ pressed }) => [
          s.orderBtn,
          ordering && { opacity: 0.6 },
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        ]}
      >
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.orderBtnText}>
          {ordering ? 'Commande en cours…' : `Commander · ${formatXOF(subcart.subtotal_xof)}`}
        </Text>
      </Pressable>

      <Text style={s.paymentNote}>
        Paiement à la réception · L&apos;intégration paiement en ligne arrive bientôt
      </Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: spacing['2xl'] },

    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing['2xl'] },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, marginTop: spacing.sm },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },
    exploreBtn: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderRadius: radius.full, marginTop: spacing.md,
    },
    exploreBtnText: { color: '#fff', fontWeight: '700' },

    subcart: {
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      marginHorizontal: spacing.md, marginTop: spacing.md,
      padding: spacing.md,
      borderWidth: 1, borderColor: c.neutral[200],
    },
    subcartHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    venueImg: { width: 40, height: 40, borderRadius: radius.md },
    venueName: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    venueCat: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
    subcartCount: { fontSize: typography.fontSize.xs, color: c.primary[600], fontWeight: '700' },

    itemsList: { paddingVertical: spacing.sm },
    item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.neutral[200] },
    itemUnavailable: { opacity: 0.5 },
    itemImg: { width: 50, height: 50, borderRadius: radius.md },
    itemName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    itemVariant: { fontSize: 11, color: c.neutral[500], marginTop: 2 },
    itemPrice: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2, fontVariant: ['tabular-nums'] },
    itemUnavailableText: { fontSize: 10, color: c.warning?.[600] ?? '#d97706', fontWeight: '700', marginTop: 2 },
    itemActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    itemBtn: { width: 28, height: 28, borderRadius: radius.full, borderWidth: 1, borderColor: c.neutral[300], alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
    itemQty: { minWidth: 24, textAlign: 'center', fontWeight: '700', fontVariant: ['tabular-nums'] },

    subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[100] },
    subtotalLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.neutral[700] },
    subtotalValue: { fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, fontVariant: ['tabular-nums'] },

    sectionLabel: { fontSize: 11, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.md, marginBottom: spacing.xs },
    methodRow: { flexDirection: 'row', gap: spacing.xs },
    methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[300], backgroundColor: '#fff' },
    methodBtnActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    methodText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    methodTextActive: { color: '#fff' },

    field: { marginTop: spacing.sm },
    fieldLabel: { fontSize: 11, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: c.neutral[300], backgroundColor: '#fff', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.fontSize.sm, color: c.dark, minHeight: 40 },

    orderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.success[600], paddingVertical: spacing.md + 2, borderRadius: radius.full, marginTop: spacing.lg, shadowColor: c.success[600], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    orderBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    paymentNote: { fontSize: 11, color: c.neutral[500], textAlign: 'center', marginTop: spacing.sm },
  });
}
