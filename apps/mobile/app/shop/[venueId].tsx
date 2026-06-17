import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl, ActivityIndicator,
  Image, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /shop/[venueId] — catalogue produits mobile.
 *
 * Affiche les produits actifs + out_of_stock d'un venue. Tap sur un
 * produit → modal avec détails + variant + qty + Add to cart.
 * CTA flottant "Panier (N)" → /cart si items.
 */

type ProductStatus = 'active' | 'out_of_stock' | 'archived';

interface Product {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  price_xof: number;
  stock_quantity: number | null;
  category: string | null;
  photos: string[];
  variants: { name: string; values: string[] }[];
  status: ProductStatus;
}

interface VenueLite {
  id: string;
  name: string;
  category: string;
  cover_url: string | null;
}

export default function ShopScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [venue, setVenue] = useState<VenueLite | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartCount, setCartCount] = useState(0);

  const load = useCallback(async () => {
    if (!venueId) { setLoading(false); return; }
    try {
      const [{ data: v }, { data: p }, { data: cart }] = await Promise.all([
        supabase.from('venues')
          .select('id, name, category, cover_url')
          .eq('id', venueId)
          .maybeSingle(),
        supabase.from('products')
          .select('id, venue_id, name, description, price_xof, stock_quantity, category, photos, variants, status')
          .eq('venue_id', venueId)
          .in('status', ['active', 'out_of_stock'])
          .order('status', { ascending: true })
          .order('position', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
        user?.id
          ? (supabase.rpc as any)('list_my_cart')
          : Promise.resolve({ data: null }),
      ]);
      setVenue(v as VenueLite | null);
      setProducts((p as Product[]) ?? []);
      // Compte le total d'items dans le sous-panier de ce venue
      if (cart && Array.isArray(cart)) {
        const sub = (cart as any[]).find((sp) => sp.venue_id === venueId);
        setCartCount(sub?.items_count ?? 0);
      }
    } catch (err) {
      console.error('[shop] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const onAddedToCart = useCallback((delta: number) => {
    setCartCount((n) => n + delta);
    setSelected(null);
  }, []);

  if (loading && !venue) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Catalogue" />
        <View style={s.center}>
          <ActivityIndicator color={c.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={venue?.name || 'Boutique'} subtitle={`${products.length} produit${products.length > 1 ? 's' : ''}`} />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {products.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bag-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Catalogue vide</Text>
            <Text style={s.emptyBody}>
              Le marchand n&apos;a pas encore publié de produits. Reviens plus tard !
            </Text>
          </View>
        ) : (
          <View style={s.grid}>
            {products.map((p) => (
              <ProductCard key={p.id} c={c} product={p} onPress={() => setSelected(p)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* CTA flottant Panier */}
      {cartCount > 0 && (
        <Pressable
          style={({ pressed }) => [s.cartBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
          onPress={() => router.push('/cart' as any)}
        >
          <Ionicons name="cart" size={20} color="#fff" />
          <Text style={s.cartBtnLabel}>Voir le panier</Text>
          <View style={s.cartBtnBadge}>
            <Text style={s.cartBtnBadgeText}>{cartCount}</Text>
          </View>
        </Pressable>
      )}

      {/* Modal détail produit */}
      <ProductDetailModal
        product={selected}
        onClose={() => setSelected(null)}
        onAdded={onAddedToCart}
      />
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────── *
 *  PRODUCT CARD                                       *
 * ─────────────────────────────────────────────────── */

function ProductCard({
  c, product, onPress,
}: { c: ColorPalette; product: Product; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const isOutOfStock = product.status === 'out_of_stock'
    || (product.stock_quantity != null && product.stock_quantity === 0);
  const lowStock = product.stock_quantity != null && product.stock_quantity > 0 && product.stock_quantity < 5;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
    >
      <View style={s.cardImg}>
        {product.photos[0] ? (
          <Image source={{ uri: product.photos[0] }} style={s.cardImgFill} />
        ) : (
          <View style={[s.cardImgFill, s.cardImgPlaceholder]}>
            <Ionicons name="image-outline" size={32} color={c.neutral[400]} />
          </View>
        )}
        {isOutOfStock && (
          <View style={s.cardOverlay}>
            <Text style={s.cardOverlayText}>Épuisé</Text>
          </View>
        )}
        {!isOutOfStock && lowStock && (
          <View style={s.cardLowStock}>
            <Text style={s.cardLowStockText}>Plus que {product.stock_quantity}</Text>
          </View>
        )}
      </View>
      <View style={s.cardBody}>
        {product.category && <Text style={s.cardCat}>{product.category}</Text>}
        <Text style={s.cardName} numberOfLines={2}>{product.name}</Text>
        <Text style={s.cardPrice}>{formatXOF(product.price_xof)}</Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────── *
 *  PRODUCT DETAIL MODAL                               *
 * ─────────────────────────────────────────────────── */

function ProductDetailModal({
  product, onClose, onAdded,
}: {
  product: Product | null;
  onClose: () => void;
  onAdded: (qtyAdded: number) => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [qty, setQty] = useState(1);
  const [variant, setVariant] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (product) {
      setQty(1);
      // Initialise variant avec la 1re valeur de chaque
      const init: Record<string, string> = {};
      product.variants?.forEach((v) => {
        if (v.values?.[0]) init[v.name] = v.values[0];
      });
      setVariant(init);
    }
  }, [product]);

  const handleAdd = useCallback(async () => {
    if (!product) return;
    setAdding(true);
    const variantPayload = Object.keys(variant).length > 0 ? variant : null;
    const { data, error } = await (supabase.rpc as any)('add_to_cart', {
      p_product_id: product.id,
      p_qty: qty,
      p_variant: variantPayload,
    });
    setAdding(false);
    if (error) {
      Alert.alert('Erreur', error.message || 'Impossible d\'ajouter au panier');
      return;
    }
    onAdded(qty);
    void data;
  }, [product, qty, variant, onAdded]);

  if (!product) return null;
  const isOutOfStock = product.status === 'out_of_stock'
    || (product.stock_quantity != null && product.stock_quantity === 0);
  const maxQty = product.stock_quantity != null ? Math.min(100, product.stock_quantity) : 100;

  return (
    <Modal visible={!!product} onRequestClose={onClose} animationType="slide" transparent>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            {product.photos[0] ? (
              <Image source={{ uri: product.photos[0] }} style={s.modalImg} />
            ) : (
              <View style={[s.modalImg, s.cardImgPlaceholder]}>
                <Ionicons name="image-outline" size={48} color={c.neutral[400]} />
              </View>
            )}

            {product.category && <Text style={s.modalCat}>{product.category}</Text>}
            <Text style={s.modalName}>{product.name}</Text>
            <Text style={s.modalPrice}>{formatXOF(product.price_xof)}</Text>

            {product.description && (
              <Text style={s.modalDesc}>{product.description}</Text>
            )}

            {/* Variants */}
            {product.variants?.map((v) => (
              <View key={v.name} style={s.variantBlock}>
                <Text style={s.variantLabel}>{v.name}</Text>
                <View style={s.variantOptions}>
                  {v.values.map((val) => {
                    const active = variant[v.name] === val;
                    return (
                      <Pressable
                        key={val}
                        onPress={() => setVariant((p) => ({ ...p, [v.name]: val }))}
                        style={[s.variantPill, active && s.variantPillActive]}
                      >
                        <Text style={[s.variantPillText, active && s.variantPillTextActive]}>{val}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Quantité */}
            {!isOutOfStock && (
              <View style={s.qtyBlock}>
                <Text style={s.variantLabel}>Quantité</Text>
                <View style={s.qtyRow}>
                  <Pressable
                    onPress={() => setQty((q) => Math.max(1, q - 1))}
                    style={s.qtyBtn}
                    hitSlop={6}
                  >
                    <Ionicons name="remove" size={20} color={c.dark} />
                  </Pressable>
                  <Text style={s.qtyValue}>{qty}</Text>
                  <Pressable
                    onPress={() => setQty((q) => Math.min(maxQty, q + 1))}
                    style={s.qtyBtn}
                    hitSlop={6}
                  >
                    <Ionicons name="add" size={20} color={c.dark} />
                  </Pressable>
                  {product.stock_quantity != null && (
                    <Text style={s.qtyMax}>max {maxQty}</Text>
                  )}
                </View>
              </View>
            )}

            {/* CTA */}
            <View style={s.modalActions}>
              {isOutOfStock ? (
                <View style={[s.addBtn, s.addBtnDisabled]}>
                  <Text style={s.addBtnText}>Épuisé</Text>
                </View>
              ) : (
                <Pressable
                  onPress={handleAdd}
                  disabled={adding}
                  style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.9 }]}
                >
                  <Ionicons name="cart" size={18} color="#fff" />
                  <Text style={s.addBtnText}>
                    {adding ? 'Ajout…' : `Ajouter au panier · ${formatXOF(product.price_xof * qty)}`}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} style={s.cancelBtn}>
                <Text style={s.cancelBtnText}>Fermer</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────── *
 *  STYLES                                             *
 * ─────────────────────────────────────────────────── */

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: 120 },

    empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing['2xl'] },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },

    grid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: spacing.md, paddingTop: spacing.md,
      gap: spacing.sm,
    },
    card: {
      width: '48%',
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1, borderColor: c.neutral[200],
    },
    cardImg: { width: '100%', aspectRatio: 1, position: 'relative' },
    cardImgFill: { ...StyleSheet.absoluteFillObject },
    cardImgPlaceholder: { backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    cardOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center', justifyContent: 'center',
    },
    cardOverlayText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base, letterSpacing: 1 },
    cardLowStock: {
      position: 'absolute', top: spacing.xs, right: spacing.xs,
      backgroundColor: c.warning[500] ?? '#f59e0b',
      paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full,
    },
    cardLowStockText: { color: '#fff', fontWeight: '700', fontSize: 10 },
    cardBody: { padding: spacing.sm, gap: 2 },
    cardCat: { fontSize: 10, color: c.primary[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    cardName: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark, minHeight: 34 },
    cardPrice: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark, fontVariant: ['tabular-nums'], marginTop: 2 },

    cartBtn: {
      position: 'absolute', bottom: spacing.xl, left: spacing.lg, right: spacing.lg,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md, borderRadius: radius.full,
      shadowColor: c.primary[500], shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
    },
    cartBtnLabel: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    cartBtnBadge: {
      backgroundColor: '#fff', borderRadius: radius.full,
      minWidth: 24, height: 24,
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 6,
    },
    cartBtnBadgeText: { color: c.primary[600], fontWeight: '900', fontSize: 12 },

    // Modal
    modalBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      maxHeight: '90%',
      paddingTop: spacing.sm,
    },
    modalHandle: {
      alignSelf: 'center', width: 44, height: 4,
      borderRadius: 2, backgroundColor: c.neutral[300],
      marginBottom: spacing.sm,
    },
    modalContent: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
    modalImg: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, marginBottom: spacing.md, backgroundColor: c.neutral[100] },
    modalCat: { fontSize: 11, color: c.primary[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    modalName: { fontSize: typography.fontSize.xl, fontWeight: '800', color: c.dark, marginTop: 4 },
    modalPrice: { fontSize: typography.fontSize.xl, fontWeight: '900', color: c.primary[600], marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
    modalDesc: { fontSize: typography.fontSize.sm, color: c.neutral[700], marginTop: spacing.md, lineHeight: 20 },

    variantBlock: { marginTop: spacing.lg },
    variantLabel: { fontSize: 11, color: c.neutral[600], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },
    variantOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    variantPill: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
      borderRadius: radius.full,
      borderWidth: 1, borderColor: c.neutral[300],
      backgroundColor: '#fff',
    },
    variantPillActive: { borderColor: c.primary[500], backgroundColor: c.primary[50] },
    variantPillText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.neutral[700] },
    variantPillTextActive: { color: c.primary[700] },

    qtyBlock: { marginTop: spacing.lg },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    qtyBtn: {
      width: 40, height: 40, borderRadius: radius.full,
      borderWidth: 1, borderColor: c.neutral[300],
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff',
    },
    qtyValue: { fontSize: typography.fontSize.lg, fontWeight: '800', minWidth: 32, textAlign: 'center', color: c.dark, fontVariant: ['tabular-nums'] },
    qtyMax: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginLeft: spacing.sm },

    modalActions: { marginTop: spacing.xl, gap: spacing.sm },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md + 2, borderRadius: radius.full,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    addBtnDisabled: { backgroundColor: c.neutral[300], shadowOpacity: 0 },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    cancelBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
    cancelBtnText: { color: c.neutral[600], fontWeight: '600', fontSize: typography.fontSize.sm },
  });
}
