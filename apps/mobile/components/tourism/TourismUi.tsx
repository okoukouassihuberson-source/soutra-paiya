import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, formatXOF, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { OFFER_KIND_LABEL, offerValueLabel, previewPrice, type Offer, type PricePreview } from '@/lib/tourism';

/** Carte générique (voyage / activité / destination). */
export function TourismCard({ title, subtitle, meta, price, cover, badge, onPress }: {
  title: string; subtitle?: string | null; meta?: string | null; price?: number | null; cover: string | null; badge?: string | null; onPress: () => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [s.card, pressed && { opacity: 0.92 }]}>
      {cover ? <Image source={{ uri: cover }} style={s.cover} /> : <View style={[s.cover, s.coverEmpty]}><Ionicons name="image-outline" size={32} color={c.neutral[400]} /></View>}
      {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
      <View style={s.body}>
        {subtitle ? <Text style={s.kicker} numberOfLines={1}>{subtitle}</Text> : null}
        <Text style={s.title} numberOfLines={2}>{title}</Text>
        {meta ? <Text style={s.meta} numberOfLines={1}>{meta}</Text> : null}
        {price != null ? <Text style={s.price}>dès {formatXOF(price)}</Text> : null}
      </View>
    </Pressable>
  );
}

export function OfferCardMobile({ offer, onPress }: { offer: Offer; onPress?: () => void }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.offer}>
      <View style={s.offerRow}>
        <Text style={s.offerKind}>{OFFER_KIND_LABEL[offer.kind] ?? 'Offre'}</Text>
        <Text style={s.offerValue}>{offerValueLabel(offer)}</Text>
      </View>
      <Text style={s.title}>{offer.title}</Text>
      {offer.description ? <Text style={s.meta}>{offer.description}</Text> : null}
      {offer.target_title ? <Text style={s.meta}>{offer.target_kind === 'activity' ? 'Activité' : 'Voyage'} : {offer.target_title}</Text> : null}
      <Text style={s.offerCode}>{offer.code ? `Code : ${offer.code}` : 'Appliquée automatiquement'}</Text>
    </Pressable>
  );
}

/** Aperçu serveur du prix (offres automatiques + code), anti-rebond. */
export function usePricePreview(kind: 'trip' | 'activity', target: string | null, participants: number, pkg: string | null, code: string) {
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!target) { setPreview(null); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const p = await previewPrice(kind, target, participants, pkg, code).catch(() => null);
      if (id === seq.current) setPreview(p);
    }, 300);
    return () => clearTimeout(t);
  }, [kind, target, participants, pkg, code]);
  return preview;
}

export function PromoBox({ applied, onApply, preview }: { applied: string; onApply: (code: string) => void; preview: PricePreview | null }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [draft, setDraft] = useState(applied);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>Code promo</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={draft} onChangeText={(v) => setDraft(v.toUpperCase())} placeholder="Ex. ABIDJAN10" autoCapitalize="characters" autoCorrect={false}
                   maxLength={40} style={s.input} placeholderTextColor={c.neutral[400]} />
        <Pressable onPress={() => onApply(draft.trim())} style={s.applyBtn} accessibilityRole="button"><Text style={s.applyText}>Appliquer</Text></Pressable>
      </View>
      {applied && preview?.error ? <Text style={s.error}>{promoMessage(preview.error)}</Text> : null}
      {!preview?.error && preview?.offer && preview.discount_xof > 0
        ? <Text style={s.success}>Offre « {preview.offer.title} » appliquée : −{formatXOF(preview.discount_xof)}</Text> : null}
    </View>
  );
}
import { PROMO_ERRORS } from '@/lib/tourism';
const promoMessage = (e: string) => PROMO_ERRORS[e] ?? 'Code promo invalide.';

export function PriceBox({ preview, fallback }: { preview: PricePreview | null; fallback: number }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const d = preview && preview.discount_xof > 0;
  return (
    <View style={s.priceBox}>
      {d ? <Row s={s} k="Prix avant réduction" v={formatXOF(preview!.gross_xof)} strike /> : null}
      {d ? <Row s={s} k="Réduction" v={`−${formatXOF(preview!.discount_xof)}`} good /> : null}
      <View style={s.totalRow}><Text style={s.totalLabel}>Total</Text><Text style={s.totalValue}>{formatXOF(preview ? preview.total_xof : fallback)}</Text></View>
    </View>
  );
}
function Row({ s, k, v, strike, good }: { s: ReturnType<typeof makeStyles>; k: string; v: string; strike?: boolean; good?: boolean }) {
  return <View style={s.lineRow}><Text style={s.meta}>{k}</Text><Text style={[s.meta, strike && { textDecorationLine: 'line-through' }, good && { color: '#059669' }]}>{v}</Text></View>;
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.stepperWrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.stepper}>
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} hitSlop={8} accessibilityLabel="Moins" style={s.stepBtn}><Ionicons name="remove" size={20} color={c.dark} /></Pressable>
        <Text style={s.stepValue}>{value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} hitSlop={8} accessibilityLabel="Plus" style={s.stepBtn}><Ionicons name="add" size={20} color={c.dark} /></Pressable>
      </View>
    </View>
  );
}

export function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: c.light, borderWidth: 1, borderColor: c.neutral[200], overflow: 'hidden' },
    cover: { width: '100%', height: 160, backgroundColor: c.neutral[100] },
    coverEmpty: { alignItems: 'center', justifyContent: 'center' },
    badge: { position: 'absolute', top: 10, left: 10, backgroundColor: c.primary[500], paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    body: { padding: spacing.md, gap: 3 },
    kicker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: c.neutral[500] },
    title: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    meta: { fontSize: typography.fontSize.sm, color: c.neutral[600] },
    price: { marginTop: 4, fontSize: typography.fontSize.base, fontWeight: '800', color: c.primary[600] },
    offer: { marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary[300], backgroundColor: c.light, gap: 4 },
    offerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    offerKind: { fontSize: 12, fontWeight: '800', color: c.neutral[700] },
    offerValue: { fontSize: 22, fontWeight: '900', color: c.primary[600] },
    offerCode: { marginTop: 4, fontSize: 12, fontWeight: '700', color: c.neutral[600] },
    label: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    input: { flex: 1, borderWidth: 1, borderColor: c.neutral[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.dark, backgroundColor: c.light },
    applyBtn: { paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: c.primary[500] },
    applyText: { color: c.primary[600], fontWeight: '800', fontSize: 13 },
    error: { color: '#dc2626', fontSize: 13 },
    success: { color: '#059669', fontSize: 13, fontWeight: '600' },
    priceBox: { gap: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[200] },
    lineRow: { flexDirection: 'row', justifyContent: 'space-between' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontSize: typography.fontSize.sm, color: c.neutral[600] },
    totalValue: { fontSize: 22, fontWeight: '900', color: c.primary[600] },
    stepperWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.neutral[300], alignItems: 'center', justifyContent: 'center' },
    stepValue: { minWidth: 24, textAlign: 'center', fontSize: 18, fontWeight: '800', color: c.dark },
  });
}
