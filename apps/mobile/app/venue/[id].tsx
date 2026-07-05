import { useState, useEffect, useMemo } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, Share, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatVenuePriceLabel, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { openDirections, dialPhone, openWhatsApp } from '@/lib/maps';
import { Gallery } from '@/components/venue/Gallery';
import { HoursCompact } from '@/components/venue/HoursCompact';
import { ReportSheet } from '@/components/venue/ReportSheet';
import { ClaimSheet } from '@/components/venue/ClaimSheet';
import { PaymentMethodsStrip } from '@/components/PaymentMethodsStrip';
import { logVenueEvent } from '@/lib/venue-analytics';
import { getVenueClaimStatus, CLAIM_STATUS_META, type ClaimStatus } from '@/lib/venue-claims';
import * as WebBrowser from 'expo-web-browser';

// Catégories qui utilisent le module Boutique (catalogue produits) au lieu de
// la réservation de table. Doit rester en miroir de SHOP_COMPATIBLE_CATEGORIES
// côté pro/page.tsx web.
const SHOP_CATEGORIES = new Set(['boutique', 'mall', 'supermarche', 'pharmacie']);
// Catégories qui utilisent le module Hôtel (réservation de chambre nuitée).
// Doit rester aligné avec businessTypeOf() === 'hotel_rooms' (migration 0057).
const HOTEL_CATEGORIES = new Set(['hotel', 'villa', 'resort', 'auberge', 'residence_meublee']);

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string; // enum venue_category — utilisé pour le switch CTA boutique/réservation
  description: string;
  cover_url: string;
  gallery_urls: string[];
  // Migration 0033 : galerie vidéos + visite 360°. Optionnels (peuvent
  // être absents si la migration n'est pas encore appliquée côté DB).
  video_urls?: string[];
  tour_360_url?: string | null;
  address: string;
  city: string;
  phone: string;
  whatsapp: string | null;
  email: string;
  opening_hours: Record<string, [string, string]>;
  avg_price_xof: number;
  amenities: string[];
  payment_methods: string[] | null;
  rating_avg: number;
  rating_count: number;
}

export default function VenueDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  // Coordonnées GPS lues depuis la RPC get_venue_location (migration 0019)
  // — la colonne PostGIS `location` ne se lit pas proprement via supabase-js.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Hauteur mesurée du CTA flottant : sert à calculer le paddingBottom du
  // ScrollView pour qu'aucun contenu (notamment la galerie) ne soit chevauché
  // par le bouton « Réserver une table ».
  const [ctaHeight, setCtaHeight] = useState(0);
  const onCtaLayout = (e: LayoutChangeEvent) => setCtaHeight(e.nativeEvent.layout.height);
  // Modal "Signaler un problème" — ouvert via la 3e action du header.
  const [reportOpen, setReportOpen] = useState(false);
  // Modal "Revendiquer cet établissement" + état du claim courant.
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimable, setClaimable] = useState(false);
  const [myClaimStatus, setMyClaimStatus] = useState<ClaimStatus | null>(null);

  useEffect(() => {
    loadVenue();
    // Tracking analytics : on log une vue dès qu'on a un id stable.
    // Fire-and-forget : ne casse pas le rendu si la RPC échoue.
    if (id) logVenueEvent(id, 'view');
  }, [id]);

  useEffect(() => {
    if (!id || !user?.id) {
      setIsFavorite(false);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('favorites')
        .select('venue_id')
        .eq('user_id', user.id)
        .eq('venue_id', id)
        .maybeSingle();
      if (active) setIsFavorite(!!data);
    })();
    return () => {
      active = false;
    };
  }, [id, user?.id]);

  // Statut de revendication — décide l'affichage du bouton "Revendiquer".
  // Recalculé quand on revient sur l'écran ou après soumission.
  const loadClaimStatus = async () => {
    if (!id) return;
    try {
      const info = await getVenueClaimStatus(id);
      setClaimable(info.claimable);
      setMyClaimStatus(info.myClaimStatus);
    } catch {
      // Fire-and-forget : ne casse pas l'écran si la RPC échoue.
      setClaimable(false);
      setMyClaimStatus(null);
    }
  };

  useEffect(() => {
    void loadClaimStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  // Real-time sync (migration 0058) : quand le Pro modifie ses horaires
  // ou ses infos depuis le dashboard web, on rafraîchit la fiche mobile
  // sans que l'utilisateur ait à pull-to-refresh.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`venue-${id}`)
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'venues', filter: `id=eq.${id}` },
        (payload: any) => {
          const next = payload?.new;
          if (next) {
            setVenue((prev) => (prev ? { ...prev, ...next } as Venue : (next as Venue)));
          }
        },
      )
      .subscribe();
    return () => {
      try { (supabase as any).removeChannel(channel); } catch { /* déjà unsubscribed */ }
    };
  }, [id]);

  const loadVenue = async () => {
    if (!id) {
      console.warn('[venue] no id provided');
      setLoading(false);
      return;
    }
    try {
      const [venueRes, coordsRes] = await Promise.all([
        supabase.from('venues').select('*').eq('id', id).maybeSingle(),
        (supabase as any).rpc('get_venue_location', { p_venue_id: id }),
      ]);

      if (venueRes.error) {
        console.error('[venue] supabase error:', venueRes.error);
        setVenue(null);
      } else {
        setVenue(venueRes.data as Venue | null);
      }

      const c = coordsRes?.data;
      if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
        setCoords({ lat: c.lat, lng: c.lng });
      } else {
        setCoords(null);
      }
    } catch (error) {
      console.error('[venue] unexpected error:', error);
      setVenue(null);
      setCoords(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!user?.id || !id) {
      Alert.alert('Connexion requise', 'Connecte-toi pour gérer tes favoris.');
      return;
    }
    const sb = supabase as any;
    const next = !isFavorite;
    setFavBusy(true);
    setIsFavorite(next);
    try {
      if (next) {
        const { error } = await sb.from('favorites').insert({ user_id: user.id, venue_id: id });
        if (error) throw error;
      } else {
        const { error } = await sb
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('venue_id', id);
        if (error) throw error;
      }
    } catch {
      setIsFavorite(!next);
      Alert.alert('Erreur', 'Action sur les favoris impossible. Réessaie.');
    } finally {
      setFavBusy(false);
    }
  };

  const shareVenue = async () => {
    if (!venue) return;
    try {
      const url = `https://soutra-playce.com/v/${venue.slug}`;
      await Share.share({
        message: `Découvre ${venue.name} sur Soutra-Playce : ${url}`,
        url,
        title: venue.name,
      });
    } catch (err) {
      console.warn('[venue] share error:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={s.center} />
      </SafeAreaView>
    );
  }

  if (!venue) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.errorText}>Lieu non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Padding bottom dynamique : hauteur réelle du CTA + un peu d'air pour
  // que la galerie reste entièrement visible quand on scroll en bas.
  // Fallback à 120px tant que onLayout n'a pas encore mesuré le CTA.
  const scrollPaddingBottom = (ctaHeight || 120) + spacing.md;
  const priceLabel = formatVenuePriceLabel({ avg_price_xof: venue.avg_price_xof, category: venue.category }).label;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}>
        {/* Header with back button + favorite + signaler */}
        <View style={s.headerBar}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Pressable
              hitSlop={10}
              onPress={() => setReportOpen(true)}
              accessibilityLabel="Signaler un problème"
            >
              <Ionicons name="flag-outline" size={22} color={colors.neutral[600]} />
            </Pressable>
            <Pressable hitSlop={10} onPress={shareVenue} accessibilityLabel="Partager ce lieu">
              <Ionicons name="share-outline" size={22} color={colors.neutral[600]} />
            </Pressable>
            <Pressable hitSlop={10} onPress={toggleFavorite} disabled={favBusy}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? colors.danger : colors.dark}
              />
            </Pressable>
          </View>
        </View>

        {/* ════════ GALERIE PREMIUM ════════ */}
        {/* Hero photo principale + thumbs + lightbox plein écran avec swipe/zoom */}
        <Gallery cover={venue.cover_url} gallery={venue.gallery_urls} videos={venue.video_urls} />

        {/* Content */}
        <View style={s.content}>
          {/* Name and Rating */}
          <View style={s.titleBar}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{venue.name}</Text>
              <View style={s.ratingRow}>
                <Text style={s.rating}>★ {venue.rating_avg}</Text>
                <Text style={s.ratingCount}>({venue.rating_count} avis)</Text>
              </View>
            </View>
            {priceLabel && <Text style={s.price}>{priceLabel}</Text>}
          </View>

          {/* Description */}
          {venue.description && (
            <Text style={s.description}>{venue.description}</Text>
          )}

          {/* ════════ REVENDICATION PROPRIÉTAIRE (PR 8 Découverte) ════════ */}
          {/* Bannière "Êtes-vous le propriétaire ?" quand le lieu est claimable
              et qu'aucun claim en cours côté user. Si déjà soumis, on affiche
              un petit badge de statut au lieu du CTA. */}
          {claimable && !myClaimStatus && user?.id && (
            <Pressable
              onPress={() => setClaimOpen(true)}
              style={({ pressed }) => [s.claimCard, pressed && { opacity: 0.92 }]}
              accessibilityLabel="Revendiquer cet établissement"
            >
              <View style={s.claimIconWrap}>
                <Ionicons name="shield-checkmark" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.claimTitle}>Êtes-vous le propriétaire ?</Text>
                <Text style={s.claimSub}>Revendiquez cet établissement pour gérer la fiche.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary[600]} />
            </Pressable>
          )}
          {myClaimStatus && myClaimStatus !== 'approved' && (
            <View style={[s.claimBadge, { borderColor: CLAIM_STATUS_META[myClaimStatus].color }]}>
              <Text style={{ fontSize: 14 }}>{CLAIM_STATUS_META[myClaimStatus].icon}</Text>
              <Text style={[s.claimBadgeText, { color: CLAIM_STATUS_META[myClaimStatus].color }]}>
                Revendication : {CLAIM_STATUS_META[myClaimStatus].label}
              </Text>
            </View>
          )}

          {/* Actions rapides — itinéraire, appel, WhatsApp */}
          <View style={s.actionRow}>
            <Pressable
              style={({ pressed }) => [s.actionBtn, !coords && s.actionBtnDisabled, pressed && coords && { opacity: 0.85 }]}
              onPress={() => {
                if (!coords) return;
                logVenueEvent(venue.id, 'click_directions');
                openDirections({ lat: coords.lat, lng: coords.lng, label: venue.name });
              }}
              disabled={!coords}
            >
              <Ionicons name="navigate" size={22} color={coords ? colors.primary[500] : colors.neutral[400]} />
              <Text style={[s.actionLabel, !coords && s.actionLabelDisabled]}>Itinéraire</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.actionBtn, !venue.phone && s.actionBtnDisabled, pressed && venue.phone && { opacity: 0.85 }]}
              onPress={() => {
                if (!venue.phone) return;
                logVenueEvent(venue.id, 'click_call');
                dialPhone(venue.phone);
              }}
              disabled={!venue.phone}
            >
              <Ionicons name="call" size={22} color={venue.phone ? colors.primary[500] : colors.neutral[400]} />
              <Text style={[s.actionLabel, !venue.phone && s.actionLabelDisabled]}>Appeler</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.actionBtn, !venue.whatsapp && s.actionBtnDisabled, pressed && venue.whatsapp && { opacity: 0.85 }]}
              onPress={() => {
                if (!venue.whatsapp) return;
                logVenueEvent(venue.id, 'click_whatsapp');
                openWhatsApp(venue.whatsapp, `Bonjour, je vous contacte au sujet de ${venue.name} via Soutra-Playce.`);
              }}
              disabled={!venue.whatsapp}
            >
              <Ionicons name="logo-whatsapp" size={22} color={venue.whatsapp ? '#25D366' : colors.neutral[400]} />
              <Text style={[s.actionLabel, !venue.whatsapp && s.actionLabelDisabled]}>WhatsApp</Text>
            </Pressable>
          </View>

          {/* ════════ VISITE VIRTUELLE 360° ════════ */}
          {/* Migration 0033 : tour_360_url (Matterport, Kuula, etc).
              Ouvre l'URL dans un browser in-app (Custom Tabs / SFSafariVC). */}
          {venue.tour_360_url && (
            <Pressable
              onPress={async () => {
                logVenueEvent(venue.id, 'click_website', { kind: 'tour_360' });
                try {
                  await WebBrowser.openBrowserAsync(venue.tour_360_url!, {
                    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                  });
                } catch (err) {
                  console.warn('[venue] tour 360 open error:', err);
                }
              }}
              style={({ pressed }) => [s.tour360Card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
            >
              <View style={s.tour360IconWrap}>
                <Ionicons name="cube" size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tour360Title}>Visite virtuelle 360°</Text>
                <Text style={s.tour360Sub}>Explore l'établissement en immersion</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.primary[600]} />
            </Pressable>
          )}

          {/* ════════ HORAIRES COMPACTES ════════ */}
          {/* Statut ouvert/fermé en temps réel + horaire du jour + bouton "Voir tous" */}
          {venue.opening_hours && Object.keys(venue.opening_hours).length > 0 && (
            <View style={{ marginBottom: spacing.lg }}>
              <HoursCompact hours={venue.opening_hours} />
            </View>
          )}

          {/* Info Cards — l'adresse est cliquable et lance l'itinéraire */}
          <View style={s.infoGrid}>
            {venue.address && (
              <Pressable
                style={({ pressed }) => [s.infoCard, pressed && coords && { opacity: 0.7 }]}
                onPress={() => coords && openDirections({ lat: coords.lat, lng: coords.lng, label: venue.name })}
                disabled={!coords}
              >
                <Ionicons name="location" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.address}</Text>
                {coords && <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />}
              </Pressable>
            )}
            {venue.phone && (
              <Pressable style={({ pressed }) => [s.infoCard, pressed && { opacity: 0.7 }]} onPress={() => dialPhone(venue.phone)}>
                <Ionicons name="call" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.phone}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
              </Pressable>
            )}
            {venue.email && (
              <View style={s.infoCard}>
                <Ionicons name="mail" size={20} color={colors.primary[500]} />
                <Text style={s.infoText}>{venue.email}</Text>
              </View>
            )}
          </View>

          {/* Moyens de paiement acceptés (migration 0063) */}
          {/* Le Pro choisit la liste depuis /pro Paramètres. Effet confiance
              avant même la réservation : "Je sais que je peux payer en
              Orange Money / Wave / etc." */}
          <PaymentMethodsStrip methods={venue.payment_methods} variant="venue-card" />

          {/* Amenities */}
          {venue.amenities && venue.amenities.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Équipements</Text>
              <View style={s.amenitiesGrid}>
                {venue.amenities.map((amenity, idx) => (
                  <View key={idx} style={s.amenityTag}>
                    <Text style={s.amenityText}>{amenity}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Floating CTA — mesure sa hauteur via onLayout pour que le
          ScrollView padding bottom soit dynamique et evite tout chevauchement.
          Padding bottom du conteneur inclut la safe-area iOS (home indicator). */}
      <View
        style={[s.cta, { paddingBottom: spacing.lg + Math.max(insets.bottom, 0) }]}
        onLayout={onCtaLayout}
      >
        {/* CTA dynamique selon la catégorie du venue :
            - boutique/mall/supermarche/pharmacie → "Voir le catalogue" → /shop/[venueId]
            - hotel/villa/resort/auberge/residence_meublee → "Réserver une chambre" → /hotel/[venueId]
            - sinon → "Réserver une table" → /reservation/[venueId] (historique) */}
        {SHOP_CATEGORIES.has(venue.category) ? (
          <Pressable
            style={({ pressed }) => [s.ctaButton, pressed && { opacity: 0.85 }]}
            onPress={() => {
              // Pas de logVenueEvent ici : 'catalog_open' n'est pas encore
              // dans l'enum venue_event_kind. À ajouter dans une migration
              // dédiée si on veut tracker cette analytics.
              router.push({
                pathname: '/shop/[venueId]',
                params: { venueId: venue.id },
              });
            }}
          >
            <Text style={s.ctaText}>🛍️  Voir le catalogue</Text>
          </Pressable>
        ) : HOTEL_CATEGORIES.has(venue.category) ? (
          <Pressable
            style={({ pressed }) => [s.ctaButton, pressed && { opacity: 0.85 }]}
            onPress={() => {
              logVenueEvent(venue.id, 'reservation_start');
              router.push({
                pathname: '/hotel/[venueId]',
                params: { venueId: venue.id },
              });
            }}
          >
            <Text style={s.ctaText}>🛏️  Réserver une chambre</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [s.ctaButton, pressed && { opacity: 0.85 }]}
            onPress={() => {
              logVenueEvent(venue.id, 'reservation_start');
              router.push({
                pathname: '/reservation/[venueId]',
                params: { venueId: venue.id },
              });
            }}
          >
            <Text style={s.ctaText}>Réserver une table</Text>
          </Pressable>
        )}
      </View>

      {/* Modal "Signaler un problème" */}
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        venueId={venue.id}
        venueName={venue.name}
      />

      {/* Modal "Revendiquer cet établissement" — KYC pro */}
      <ClaimSheet
        visible={claimOpen}
        onClose={() => setClaimOpen(false)}
        venueId={venue.id}
        venueName={venue.name}
        onSubmitted={() => void loadClaimStatus()}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  heroImg: { width: '100%', height: 280 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  title: { fontSize: typography.fontSize['2xl'], fontWeight: '700', color: colors.dark },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
  rating: { fontSize: typography.fontSize.lg, color: colors.warning, fontWeight: '600' },
  ratingCount: { fontSize: typography.fontSize.sm, color: colors.neutral[500] },
  price: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.primary[500] },
  description: { fontSize: typography.fontSize.sm, color: colors.neutral[600], lineHeight: 20, marginBottom: spacing.lg },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  actionBtnDisabled: { backgroundColor: colors.neutral[100] },
  actionLabel: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.primary[600] },
  actionLabelDisabled: { color: colors.neutral[400] },
  infoGrid: { marginBottom: spacing.lg, gap: spacing.md },
  // PR Video — visite 360° (Matterport/Kuula)
  tour360Card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary[100],
    marginBottom: spacing.lg,
  },
  tour360IconWrap: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
  },
  tour360Title: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  tour360Sub: { fontSize: typography.fontSize.xs, color: colors.neutral[600], marginTop: 2 },
  // PR Claims — bannière revendication propriétaire
  claimCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.primary[200],
    marginBottom: spacing.lg,
  },
  claimIconWrap: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary[500],
    alignItems: 'center', justifyContent: 'center',
  },
  claimTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  claimSub: { fontSize: typography.fontSize.xs, color: colors.neutral[600], marginTop: 2 },
  claimBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    marginBottom: spacing.lg,
  },
  claimBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.neutral[700] },
  sectionTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, marginBottom: spacing.md, marginTop: spacing.lg },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  amenityTag: { backgroundColor: colors.neutral[100], borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  amenityText: { fontSize: typography.fontSize.sm, color: colors.neutral[700] },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  dayText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark, flex: 1 },
  timeText: { fontSize: typography.fontSize.sm, color: colors.neutral[600] },
  galleryRow: { gap: spacing.md, paddingBottom: spacing.lg },
  galleryImg: { width: 160, height: 160, borderRadius: radius.lg },
  cta: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.neutral[200] },
  ctaButton: { backgroundColor: colors.primary[500], borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: typography.fontSize.base, color: colors.neutral[600] },
  });
}
