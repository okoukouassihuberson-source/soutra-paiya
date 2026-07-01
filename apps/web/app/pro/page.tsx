'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { supabaseBrowser } from '@/lib/supabase';
import {
  formatXOF, slugify, categoriesByGroup,
  isShopCategory, isHotelCategory,
  businessTypeOf, modulesForBusinessType,
  type ProModule,
} from '@soutra/shared';
import { VenueAnalytics } from './_components/VenueAnalytics';
import { ProRevenueDashboard } from './_components/ProRevenueDashboard';
import { ShopProductsTab } from './_components/ShopProductsTab';
import { ShopOrdersTab } from './_components/ShopOrdersTab';
import { HotelRoomsTab } from './_components/HotelRoomsTab';
import { HotelBookingsTab } from './_components/HotelBookingsTab';
import { VenuePayoutPanel } from './_components/VenuePayoutPanel';
import { PaymentMethodsPanel } from './_components/PaymentMethodsPanel';

// Picker GPS — chargé en client only (leaflet utilise window au montage).
const VenueLocationPicker = dynamic(() => import('@/components/VenueLocationPicker'), {
  ssr: false,
  loading: () => <div className="py-12 text-center text-sm text-neutral-400">Chargement de la carte…</div>,
});

type Tab = 'dashboard' | 'reservations' | 'events' | 'menu' | 'analytics' | 'shop-products' | 'shop-orders' | 'hotel-rooms' | 'hotel-bookings' | 'finances' | 'marketing' | 'settings';

// Note : la compatibilité boutique/hôtel passe par isShopCategory() /
// isHotelCategory() du shared (source unique avec la sidebar dynamique
// PR2 onboarding). Plus de Sets de catégories à maintenir ici.
type ResStatus = 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled' | 'refunded';

interface Venue { id: string; name: string; category: string; city: string; address: string; phone: string; status: string; rating_avg: number; rating_count: number; description: string; logo_url: string | null; cover_url: string | null; gallery_urls: string[] | null; whatsapp: string | null; email: string | null; district: string | null; avg_price_xof: number | null; opening_hours: any; amenities: string[] | null; ambiance: string[] | null; socials: any; }
interface Reservation { id: string; user_id: string; venue_id: string; date_time: string; party_size: number; deposit_xof: number; status: ResStatus; notes: string | null; created_at: string; customer_name: string | null; customer_phone: string | null; }

const STATUS_META: Record<ResStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'En attente', color: 'text-amber-700', bg: 'bg-amber-50' },
  confirmed: { label: 'Confirmé', color: 'text-blue-700', bg: 'bg-blue-50' },
  arrived: { label: 'Arrivé', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  no_show: { label: 'No-show', color: 'text-red-700', bg: 'bg-red-50' },
  cancelled: { label: 'Annulé', color: 'text-neutral-600', bg: 'bg-neutral-100' },
  refunded: { label: 'Remboursé', color: 'text-purple-700', bg: 'bg-purple-50' },
};

// Mêmes badges visuels pour les statuts d'événement (enum event_status).
const STATUS_META_EVT: Record<'draft' | 'published' | 'sold_out' | 'cancelled' | 'done', { label: string; color: string; bg: string }> = {
  draft: { label: 'Brouillon', color: 'text-neutral-600', bg: 'bg-neutral-100' },
  published: { label: 'Publié', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  sold_out: { label: 'Complet', color: 'text-amber-700', bg: 'bg-amber-50' },
  cancelled: { label: 'Annulé', color: 'text-red-700', bg: 'bg-red-50' },
  done: { label: 'Terminé', color: 'text-blue-700', bg: 'bg-blue-50' },
};

// Catalogue complet des entrées de la "quick nav" du dashboard, indexé par
// ProModule. La liste effective est filtrée à l'exécution selon le
// businessType du venue actif (PR2 onboarding) — alignée avec la sidebar
// du shell (ProShell.tsx) et MODULES_BY_BUSINESS_TYPE (@soutra/shared).
const QUICK_NAV: Record<Tab, { id: Tab; label: string; icon: React.ReactNode }> = {
  'dashboard':      { id: 'dashboard',      label: 'Dashboard',              icon: <IcoGrid /> },
  'reservations':   { id: 'reservations',   label: 'Réservations',           icon: <IcoCalendar /> },
  'events':         { id: 'events',         label: 'Événements',             icon: <IcoTicket /> },
  'menu':           { id: 'menu',           label: 'Menu',                   icon: <IcoUtensils /> },
  'shop-products':  { id: 'shop-products',  label: 'Catalogue',              icon: <IcoUtensils /> },
  'shop-orders':    { id: 'shop-orders',    label: 'Commandes',              icon: <IcoCalendar /> },
  'hotel-rooms':    { id: 'hotel-rooms',    label: 'Chambres',               icon: <IcoUtensils /> },
  'hotel-bookings': { id: 'hotel-bookings', label: 'Réservations chambres',  icon: <IcoCalendar /> },
  'analytics':      { id: 'analytics',      label: 'Analytics',              icon: <IcoTrend /> },
  'finances':       { id: 'finances',       label: 'Finances',               icon: <IcoWallet /> },
  'marketing':      { id: 'marketing',      label: 'Marketing',              icon: <IcoMegaphone /> },
  'settings':       { id: 'settings',       label: 'Paramètres',             icon: <IcoGear /> },
};

// Catégories d'établissement — désormais sourcées de @soutra/shared
// (migrations 0001 + 0013 + 0033). Les <select> utilisent <optgroup> pour
// rester lisibles avec ~50 catégories réparties dans 10 domaines.
const VENUE_CATEGORY_GROUPS_PRO = categoriesByGroup();

const HOURS_DAYS: { k: string; l: string }[] = [
  { k: 'mon', l: 'Lundi' }, { k: 'tue', l: 'Mardi' }, { k: 'wed', l: 'Mercredi' },
  { k: 'thu', l: 'Jeudi' }, { k: 'fri', l: 'Vendredi' }, { k: 'sat', l: 'Samedi' },
  { k: 'sun', l: 'Dimanche' },
];
// Format normalisé attendu par le mobile + la fonction SQL is_venue_open :
//   Record<DayKey, [openHHMM, closeHHMM]> avec ex. ['12:00','23:00'].
// Si un jour est fermé, la clé est OMISE (au lieu d'une string "Fermé"). C'est
// le contrat strict côté lecture mobile.
type HoursRange = [string, string];
type HoursMap = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', HoursRange>>;

const EMPTY_HOURS: HoursMap = {};

/** Récupère ['HH:MM','HH:MM'] tolérant à un format legacy string "12:00 - 23:00". */
function normalizeHoursRange(v: unknown): HoursRange | null {
  if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'string' && typeof v[1] === 'string') {
    // Format correct
    return [v[0], v[1]];
  }
  if (typeof v === 'string') {
    // Format legacy "12:00 - 23:00" → parse côté front pour ne pas attendre la migration DB
    const m = v.toLowerCase().match(/(\d{1,2})\s*[h:]?\s*(\d{0,2})\s*[-–—→]+\s*(\d{1,2})\s*[h:]?\s*(\d{0,2})/);
    if (m) {
      const open  = `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
      const close = `${m[3].padStart(2, '0')}:${(m[4] || '00').padStart(2, '0')}`;
      return [open, close];
    }
  }
  return null;
}
const EMPTY_SOCIALS = { instagram: '', facebook: '', tiktok: '' };
const AMENITY_SUGGESTIONS = ['Wifi', 'Parking', 'Climatisation', 'Terrasse', 'Privatisable', 'Karaoké', 'Écran géant', 'Piscine'];
const AMBIANCE_SUGGESTIONS = ['VIP', 'Chill', 'Familial', 'Festif', 'Romantique', 'Branché'];

// Mappe une ligne venue vers l'état du formulaire de profil riche.
function vxFromVenue(v: any) {
  return {
    whatsapp: v?.whatsapp || '',
    email: v?.email || '',
    district: v?.district || '',
    price: v?.avg_price_xof ? String(v.avg_price_xof) : '',
    hours: ((): HoursMap => {
      // Conversion défensive : on lit ce qu'il y a en DB (peut être legacy
      // string ou array correct) et on normalise vers le bon format.
      const out: HoursMap = {};
      const raw = (v?.opening_hours || {}) as Record<string, unknown>;
      for (const day of ['mon','tue','wed','thu','fri','sat','sun'] as const) {
        const range = normalizeHoursRange(raw[day]);
        if (range) out[day] = range;
      }
      return out;
    })(),
    amenities: (v?.amenities || []) as string[],
    ambiance: (v?.ambiance || []) as string[],
    socials: { ...EMPTY_SOCIALS, ...(v?.socials || {}) },
  };
}

/**
 * Next 14 App Router exige qu'un composant qui appelle useSearchParams soit
 * rendu sous une <Suspense> boundary (sinon le build static échoue). On wrap
 * la vraie page dans un container qui fait juste ça.
 */
export default function ProDashboardPage() {
  return (
    <Suspense>
      <ProDashboard />
    </Suspense>
  );
}

function ProDashboard() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // L'onglet actif est désormais piloté par ?tab=… ce qui permet à la
  // sidebar AppShell (Link) et au bouton retour navigateur de fonctionner.
  const tabParam = searchParams?.get('tab');
  const venueParam = searchParams?.get('venue');
  const tab: Tab = (
    ['dashboard', 'reservations', 'events', 'menu', 'analytics', 'shop-products', 'shop-orders', 'hotel-rooms', 'hotel-bookings', 'finances', 'marketing', 'settings'] as const
  ).includes(tabParam as Tab) ? (tabParam as Tab) : 'dashboard';
  const setTab = useCallback((next: Tab) => {
    // Préserve ?venue= dans l'URL pour que ProShell continue de filtrer
    // la sidebar selon le venue actif.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    router.replace(`/pro${url.search}`, { scroll: false });
  }, [router]);

  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Events state — table `events` (migration 0001) : starts_at/ends_at,
  // ticket_tiers jsonb [{name,price_xof,qty,sold}], slug unique, organizer_id.
  type EventRow = {
    id: string; title: string; description: string | null; status: 'draft' | 'published' | 'sold_out' | 'cancelled' | 'done';
    starts_at: string; ends_at: string; capacity: number | null;
    ticket_tiers: { name: string; price_xof: number; qty: number; sold: number }[];
    cover_url: string | null; slug: string;
  };
  const [events, setEvents] = useState<EventRow[]>([]);
  const [evtSaving, setEvtSaving] = useState(false);
  const [evtName, setEvtName] = useState('');
  const [evtDate, setEvtDate] = useState('');
  const [evtDuration, setEvtDuration] = useState('4'); // heures
  const [evtPrice, setEvtPrice] = useState('');
  const [evtCapacity, setEvtCapacity] = useState('');
  const [evtDesc, setEvtDesc] = useState('');

  // Modal d'édition événement
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [editEvtSaving, setEditEvtSaving] = useState(false);

  // Menu state — persistance réelle via la table menu_items (migration 0014).
  const [menuItems, setMenuItems] = useState<{ id: string; name: string; category: string; price_xof: number; available: boolean; description: string | null; position: number }[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuName, setMenuName] = useState('');
  const [menuCat, setMenuCat] = useState('Plat principal');
  const [menuPrice, setMenuPrice] = useState('');
  const [menuDesc, setMenuDesc] = useState('');
  const [menuSaving, setMenuSaving] = useState(false);

  // Finances state
  const [txs, setTxs] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  // Marketing state — persistance réelle via la table promo_codes (migrations 0015 + 0038).
  type PromoKind = 'discount' | 'happy_hour' | 'couple' | 'group' | 'weekend' | 'student';
  type Promo = { id: string; code: string; discount_pct: number; max_uses: number | null; uses_count: number; valid_until: string | null; active: boolean; created_at: string; kind?: PromoKind };
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('10');
  const [promoMaxUses, setPromoMaxUses] = useState('');
  const [promoValidUntil, setPromoValidUntil] = useState('');
  // Migration 0038 — type de promo (discount/happy_hour/couple/group/weekend/student)
  const [promoKind, setPromoKind] = useState<PromoKind>('discount');
  const [promos, setPromos] = useState<Promo[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);

  // Meta partagée par le sélecteur de kind + les badges affichés sur la liste.
  const PROMO_KIND_META: Record<PromoKind, { label: string; emoji: string; color: string }> = {
    discount:   { label: 'Réduction',   emoji: '🏷️', color: '#FF6B1A' },
    happy_hour: { label: 'Happy Hour',  emoji: '🍻', color: '#F59E0B' },
    couple:     { label: 'Couple',      emoji: '💑', color: '#EC4899' },
    group:      { label: 'Groupe',      emoji: '👥', color: '#3B82F6' },
    weekend:    { label: 'Week-end',    emoji: '🌅', color: '#A855F7' },
    student:    { label: 'Étudiant',    emoji: '🎓', color: '#10B981' },
  };

  // Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsCity, setSettingsCity] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsCategory, setSettingsCategory] = useState('');

  // Création d'un établissement (espace pro en autonomie)
  const [creating, setCreating] = useState(false);
  const [nv, setNv] = useState({ name: '', category: 'maquis', city: 'Abidjan', address: '', phone: '', whatsapp: '', description: '' });

  // Médias de l'établissement (logo, bannière, galerie)
  // PR Video — étend l'état média avec videos[] et tour_360_url (migration 0033).
  const [media, setMedia] = useState<{
    logo: string | null;
    cover: string | null;
    gallery: string[];
    videos: string[];
    tour360: string | null;
  }>({ logo: null, cover: null, gallery: [], videos: [], tour360: null });
  // State local pour le champ "URL visite 360°" — synchronisé lors du save.
  const [tour360Input, setTour360Input] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);

  // Localisation GPS — lat/lng lus depuis la RPC get_venue_location au changement
  // de venue. `null` tant que le venue n'a pas de point PostGIS.
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  // Profil riche de l'établissement (horaires, contacts, réseaux, services…)
  const [vx, setVx] = useState(vxFromVenue(null));

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function flash(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => { loadInitialData(); }, []);

  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);

    const { data: profile } = await (supabase as any).from('profiles').select('full_name, phone').eq('id', user.id).single();
    setUserName(profile?.full_name || profile?.phone || 'Pro');

    const { data: ownedVenues } = await (supabase as any).from('venues').select('id, name, category, city, address, phone, status, rating_avg, rating_count, description, logo_url, cover_url, gallery_urls, whatsapp, email, district, avg_price_xof, opening_hours, amenities, ambiance, socials').eq('owner_id', user.id);

    if (ownedVenues && ownedVenues.length > 0) {
      setVenues(ownedVenues as Venue[]);
      // Priorise ?venue=ID si présent ET appartient au user (sinon premier).
      // Permet à ProShell de piloter le filtrage de la sidebar selon le
      // venue actif (PR2 onboarding).
      const fromUrl = venueParam
        ? ownedVenues.find((x: { id: string }) => x.id === venueParam)
        : null;
      const v = (fromUrl ?? ownedVenues[0]) as Venue;
      setSelectedVenueId(v.id);
      setSettingsName(v.name || '');
      setSettingsCity(v.city || '');
      setSettingsAddress(v.address || '');
      setSettingsPhone(v.phone || '');
      setSettingsDesc(v.description || '');
      setSettingsCategory(v.category || '');
      setMedia({ logo: v.logo_url, cover: v.cover_url, gallery: v.gallery_urls || [], videos: (v as any).video_urls || [], tour360: (v as any).tour_360_url || null }); setTour360Input((v as any).tour_360_url || '');
      setVx(vxFromVenue(v));
    } else {
      // PR3 onboarding : aucun venue → wizard /pro/onboard (4 étapes).
      router.replace('/pro/onboard');
      return;
    }

    // Load wallet
    const { data: wallet } = await (supabase as any).from('wallets').select('balance_xof').eq('user_id', user.id).single();
    setWalletBalance(wallet?.balance_xof || 0);

    setLoading(false);
  }

  const loadReservations = useCallback(async (venueId: string) => {
    setTableLoading(true);
    const { data } = await (supabase as any).from('reservations').select('*').eq('venue_id', venueId).order('date_time', { ascending: false }).limit(200);
    const rows = (data || []) as any[];
    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))];
      const { data: profiles } = await (supabase as any).from('profiles').select('id, full_name, phone').in('id', userIds);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      setReservations(rows.map((r: any) => { const p = map.get(r.user_id) as any; return { ...r, status: r.status as ResStatus, customer_name: p?.full_name || null, customer_phone: p?.phone || null }; }));
    } else { setReservations([]); }
    setTableLoading(false);
  }, [supabase]);

  const loadEvents = useCallback(async (venueId: string) => {
    const { data, error } = await (supabase as any)
      .from('events')
      .select('id, title, description, status, starts_at, ends_at, capacity, ticket_tiers, cover_url, slug')
      .eq('venue_id', venueId)
      .order('starts_at', { ascending: false })
      .limit(100);
    if (error) { flash(error.message, 'error'); setEvents([]); }
    else setEvents((data || []) as EventRow[]);
  }, [supabase]);

  const loadTxs = useCallback(async () => {
    const { data } = await (supabase as any).from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    setTxs(data || []);
  }, [supabase, userId]);

  const loadPromos = useCallback(async (venueId: string) => {
    setPromosLoading(true);
    const { data, error } = await (supabase as any)
      .from('promo_codes')
      .select('id, code, discount_pct, max_uses, uses_count, valid_until, active, created_at, kind')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false });
    if (error) { flash(error.message, 'error'); setPromos([]); }
    else setPromos((data || []) as Promo[]);
    setPromosLoading(false);
  }, [supabase]);

  const loadMenu = useCallback(async (venueId: string) => {
    setMenuLoading(true);
    const { data, error } = await (supabase as any)
      .from('menu_items')
      .select('id, name, category, price_xof, available, description, position')
      .eq('venue_id', venueId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) { flash(error.message, 'error'); setMenuItems([]); }
    else setMenuItems((data || []) as any);
    setMenuLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!selectedVenueId || loading) return;
    loadReservations(selectedVenueId);
    loadEvents(selectedVenueId);
    loadMenu(selectedVenueId);
    loadPromos(selectedVenueId);
    if (userId) loadTxs();
  }, [selectedVenueId, loading]);

  // Modules disponibles pour le venue actif. Pilote la quick nav du dashboard
  // (alignée avec la sidebar de ProShell). Fallback liste minimale tant que
  // le venue n'est pas chargé.
  const selectedCategory = useMemo(
    () => venues.find((v) => v.id === selectedVenueId)?.category ?? null,
    [venues, selectedVenueId],
  );
  const availableModules = useMemo<ProModule[]>(
    () => modulesForBusinessType(selectedCategory ? businessTypeOf(selectedCategory) : null),
    [selectedCategory],
  );

  // Si le tab actif n'est plus dispo pour ce businessType (ex: l'user change
  // de venue restau → magasin), bascule sur 'dashboard' en silence.
  useEffect(() => {
    if (!selectedCategory) return;
    if (tab !== 'dashboard' && !availableModules.includes(tab as ProModule)) {
      setTab('dashboard');
    }
  }, [tab, availableModules, selectedCategory, setTab]);

  useEffect(() => {
    if (!selectedVenueId) return;
    const channel = supabase.channel('pro-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `venue_id=eq.${selectedVenueId}` }, () => { loadReservations(selectedVenueId); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedVenueId, supabase, loadReservations]);

  // When venue changes, update settings
  useEffect(() => {
    const v = venues.find((x) => x.id === selectedVenueId);
    if (v) { setSettingsName(v.name || ''); setSettingsCity(v.city || ''); setSettingsAddress(v.address || ''); setSettingsPhone(v.phone || ''); setSettingsDesc(v.description || ''); setSettingsCategory(v.category || ''); setMedia({ logo: v.logo_url, cover: v.cover_url, gallery: v.gallery_urls || [], videos: (v as any).video_urls || [], tour360: (v as any).tour_360_url || null }); setTour360Input((v as any).tour_360_url || ''); setVx(vxFromVenue(v)); }
  }, [selectedVenueId, venues]);

  // Charge la position GPS courante du venue (la colonne PostGIS n'est pas
  // exposée proprement par supabase-js — on passe par la RPC get_venue_location).
  useEffect(() => {
    if (!selectedVenueId) { setGeo(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc('get_venue_location', { p_venue_id: selectedVenueId });
      if (cancelled) return;
      if (error || !data || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
        setGeo(null);
      } else {
        setGeo({ lat: data.lat, lng: data.lng });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedVenueId, supabase]);

  async function saveVenueLocation(p: { lat: number; lng: number; address?: string; district?: string; city?: string }) {
    const { data, error } = await (supabase as any).rpc('set_venue_location', {
      p_venue_id: selectedVenueId,
      p_lat: p.lat,
      p_lng: p.lng,
      p_address: p.address || null,
      p_district: p.district || null,
      p_city: p.city || null,
    });
    if (error) return { ok: false, error: error.message };
    setGeo({ lat: p.lat, lng: p.lng });
    // Synchronise les inputs adresse/ville/quartier du formulaire courant.
    if (data?.address) setSettingsAddress(data.address);
    if (data?.city) setSettingsCity(data.city);
    if (data?.district) setVx((prev) => ({ ...prev, district: data.district }));
    flash('Localisation GPS enregistrée');
    return { ok: true };
  }

  async function updateStatus(id: string, newStatus: ResStatus) {
    setActionLoading(id);
    const updates: Record<string, string> = { status: newStatus };
    if (newStatus === 'arrived') updates.arrived_at = new Date().toISOString();
    if (newStatus === 'cancelled') updates.cancelled_at = new Date().toISOString();
    const { error } = await (supabase as any).from('reservations').update(updates).eq('id', id);
    if (error) flash('Erreur: ' + error.message, 'error');
    else { flash(newStatus === 'confirmed' ? 'Réservation confirmée' : newStatus === 'arrived' ? 'Client marqué arrivé' : newStatus === 'cancelled' ? 'Réservation annulée' : 'Statut mis à jour'); await loadReservations(selectedVenueId); }
    setActionLoading(null);
  }

  async function createEvent() {
    if (!selectedVenueId) { flash('Sélectionne un établissement', 'error'); return; }
    const title = evtName.trim();
    if (!title) { flash('Nom requis', 'error'); return; }
    if (!evtDate) { flash('Date et heure requises', 'error'); return; }
    const startsAt = new Date(evtDate);
    if (isNaN(startsAt.getTime())) { flash('Date invalide', 'error'); return; }
    const durationHours = parseFloat(evtDuration);
    const endsAt = new Date(startsAt.getTime() + (Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 4) * 3600 * 1000);
    const price = parseInt(evtPrice, 10) || 0;
    const capacity = parseInt(evtCapacity, 10) || 0;
    if (capacity < 0) { flash('Capacité invalide', 'error'); return; }
    const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`;
    setEvtSaving(true);
    const { data, error } = await (supabase as any)
      .from('events')
      .insert({
        organizer_id: userId,
        venue_id: selectedVenueId,
        title,
        slug,
        description: evtDesc.trim() || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        capacity: capacity || null,
        ticket_tiers: capacity > 0 ? [{ name: 'Standard', price_xof: price, qty: capacity, sold: 0 }] : [],
        status: 'draft',
        city: settingsCity || 'Abidjan',
      })
      .select('id, title, description, status, starts_at, ends_at, capacity, ticket_tiers, cover_url, slug')
      .single();
    setEvtSaving(false);
    if (error) { flash(error.code === '23505' ? 'Conflit de slug — réessaie' : error.message, 'error'); return; }
    setEvents((prev) => [data as EventRow, ...prev]);
    setEvtName(''); setEvtDate(''); setEvtPrice(''); setEvtCapacity(''); setEvtDesc(''); setEvtDuration('4');
    flash('Événement créé en brouillon — passe-le en publié quand il est prêt');
  }

  async function updateEventStatus(id: string, next: EventRow['status']) {
    const prev = events;
    setEvents((curr) => curr.map((e) => e.id === id ? { ...e, status: next } : e));
    const { error } = await (supabase as any).from('events').update({ status: next }).eq('id', id);
    if (error) { setEvents(prev); flash(error.message, 'error'); }
    else flash(`Statut → ${next}`);
  }

  async function deleteEvent(id: string) {
    const prev = events;
    setEvents((curr) => curr.filter((e) => e.id !== id));
    // RLS : events_organizer_all autorise le delete au seul organisateur.
    const { error } = await (supabase as any).from('events').delete().eq('id', id);
    if (error) {
      setEvents(prev);
      // 23503 = foreign_key_violation (tickets vendus) -> proposer l'annulation à la place
      flash(error.code === '23503' ? 'Des tickets sont déjà vendus — annule plutôt l\'événement.' : error.message, 'error');
    } else {
      flash('Événement supprimé');
    }
  }

  async function saveEventEdit() {
    if (!editingEvent) return;
    const e = editingEvent;
    const startsAt = new Date(e.starts_at);
    const endsAt = new Date(e.ends_at);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) { flash('Dates invalides', 'error'); return; }
    if (endsAt <= startsAt) { flash('La fin doit être après le début', 'error'); return; }
    setEditEvtSaving(true);
    const { error } = await (supabase as any)
      .from('events')
      .update({
        title: e.title.trim(),
        description: e.description?.trim() || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        capacity: e.capacity,
        ticket_tiers: e.ticket_tiers,
      })
      .eq('id', e.id);
    setEditEvtSaving(false);
    if (error) { flash(error.message, 'error'); return; }
    setEvents((prev) => prev.map((x) => x.id === e.id ? e : x));
    setEditingEvent(null);
    flash('Événement mis à jour');
  }

  // Calcule les places restantes à partir des paliers (qty - sold).
  function remainingSeats(e: EventRow): number | null {
    if (!e.ticket_tiers?.length) return e.capacity ?? null;
    return e.ticket_tiers.reduce((s, t) => s + Math.max(0, (t.qty || 0) - (t.sold || 0)), 0);
  }

  async function addMenuItem() {
    if (!selectedVenueId) { flash('Sélectionne un établissement', 'error'); return; }
    const name = menuName.trim();
    const price = parseInt(menuPrice, 10);
    if (!name) { flash('Nom requis', 'error'); return; }
    if (!Number.isFinite(price) || price < 0) { flash('Prix invalide', 'error'); return; }
    setMenuSaving(true);
    const { data, error } = await (supabase as any)
      .from('menu_items')
      .insert({
        venue_id: selectedVenueId,
        name,
        category: menuCat,
        price_xof: price,
        description: menuDesc.trim() || null,
        available: true,
        position: menuItems.length,
      })
      .select('id, name, category, price_xof, available, description, position')
      .single();
    setMenuSaving(false);
    if (error) { flash(error.message, 'error'); return; }
    setMenuItems((prev) => [...prev, data as any]);
    setMenuName(''); setMenuPrice(''); setMenuDesc('');
    flash('Article ajouté');
  }

  async function toggleMenuItem(id: string, next: boolean) {
    // Optimistic flip — rollback en cas d'erreur RLS.
    setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, available: next } : m));
    const { error } = await (supabase as any).from('menu_items').update({ available: next }).eq('id', id);
    if (error) {
      setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, available: !next } : m));
      flash(error.message, 'error');
    }
  }

  async function deleteMenuItem(id: string) {
    const prev = menuItems;
    setMenuItems((curr) => curr.filter((m) => m.id !== id));
    const { error } = await (supabase as any).from('menu_items').delete().eq('id', id);
    if (error) {
      setMenuItems(prev);
      flash(error.message, 'error');
    } else {
      flash('Article supprimé');
    }
  }

  async function createPromo() {
    if (!selectedVenueId) { flash('Sélectionne un établissement', 'error'); return; }
    const code = promoCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) { flash('Code invalide (2-32 caractères, A-Z 0-9 _ -)', 'error'); return; }
    const discount = parseInt(promoDiscount, 10);
    const maxUses = promoMaxUses.trim() ? parseInt(promoMaxUses, 10) : null;
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) { flash('Nombre d\'utilisations invalide', 'error'); return; }
    const validUntilIso = promoValidUntil ? new Date(promoValidUntil).toISOString() : null;
    setPromoSaving(true);
    const { data, error } = await (supabase as any)
      .from('promo_codes')
      .insert({
        venue_id: selectedVenueId,
        code,
        discount_pct: discount,
        max_uses: maxUses,
        valid_until: validUntilIso,
        active: true,
        kind: promoKind, // migration 0038
      })
      .select('id, code, discount_pct, max_uses, uses_count, valid_until, active, created_at, kind')
      .single();
    setPromoSaving(false);
    if (error) {
      // 23505 = unique_violation (déjà code identique sur cet établissement)
      flash(error.code === '23505' ? `Le code ${code} existe déjà` : error.message, 'error');
      return;
    }
    setPromos((prev) => [data as Promo, ...prev]);
    setPromoCode(''); setPromoMaxUses(''); setPromoValidUntil('');
    flash(`Promo ${code} créée`);
  }

  async function togglePromo(id: string, next: boolean) {
    setPromos((prev) => prev.map((p) => p.id === id ? { ...p, active: next } : p));
    const { error } = await (supabase as any).from('promo_codes').update({ active: next }).eq('id', id);
    if (error) {
      setPromos((prev) => prev.map((p) => p.id === id ? { ...p, active: !next } : p));
      flash(error.message, 'error');
    }
  }

  async function deletePromo(id: string) {
    const prev = promos;
    setPromos((curr) => curr.filter((p) => p.id !== id));
    const { error } = await (supabase as any).from('promo_codes').delete().eq('id', id);
    if (error) {
      setPromos(prev);
      flash(error.message, 'error');
    } else {
      flash('Promo supprimée');
    }
  }

  async function saveSettings() {
    const { error } = await (supabase as any).from('venues').update({
      name: settingsName, city: settingsCity, address: settingsAddress,
      phone: settingsPhone, description: settingsDesc, category: settingsCategory,
      whatsapp: vx.whatsapp.trim() || null, email: vx.email.trim() || null,
      district: vx.district.trim() || null,
      avg_price_xof: vx.price ? parseInt(vx.price, 10) : null,
      opening_hours: vx.hours, amenities: vx.amenities, ambiance: vx.ambiance,
      socials: vx.socials,
    }).eq('id', selectedVenueId);
    if (error) flash(error.message, 'error');
    else { flash('Paramètres sauvegardés'); const { data } = await (supabase as any).from('venues').select('id, name, category, city, address, phone, status, rating_avg, rating_count, description, logo_url, cover_url, gallery_urls, whatsapp, email, district, avg_price_xof, opening_hours, amenities, ambiance, socials').eq('owner_id', userId); if (data) setVenues(data); }
  }

  async function createVenue() {
    if (!nv.name.trim() || !nv.address.trim()) { flash('Nom et adresse requis', 'error'); return; }
    setCreating(true);
    // Migration 0061 : RPC pro_create_venue → activation immédiate (status='active')
    // + defaults intelligents (horaires + cover par businessType). Plus de
    // status='draft' bloquant en attente d'un admin.
    const { data, error } = await (supabase.rpc as any)('pro_create_venue', {
      p_name: nv.name.trim(),
      p_category: nv.category,
      p_address: nv.address.trim(),
      p_city: nv.city.trim() || 'Abidjan',
      p_phone: nv.phone.trim() || null,
      p_whatsapp: nv.whatsapp.trim() || null,
      p_description: nv.description.trim() || null,
    });
    setCreating(false);
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('NAME_REQUIRED')) flash('Nom requis', 'error');
      else if (msg.includes('ADDRESS_REQUIRED')) flash('Adresse requise', 'error');
      else if (msg.includes('NAME_TOO_LONG')) flash('Nom trop long (200 caractères max)', 'error');
      else if (msg.includes('INVALID_CATEGORY')) flash('Catégorie invalide', 'error');
      else if (msg.includes('NOT_AUTHENTICATED')) flash('Session expirée — reconnecte-toi', 'error');
      else flash(error.message || 'Création impossible', 'error');
      return;
    }
    const result = data as { ok: boolean; reason?: string; venue_id?: string };
    if (!result?.ok) {
      if (result?.reason === 'ALREADY_EXISTS') {
        flash('Tu as déjà un établissement avec ce nom et cette adresse', 'error');
      } else {
        flash('Création impossible', 'error');
      }
      return;
    }
    flash('Établissement créé et actif — tu peux commencer !');
    await loadInitialData();
  }

  async function uploadMedia(file: File, kind: 'logo' | 'cover' | 'gallery' | 'video') {
    // Guards visibles -> on n'absorbe plus le `selectedVenueId` vide en silence,
    // sinon le user voit le toast RLS sans comprendre d'où il vient.
    if (!selectedVenueId) {
      flash('Aucun établissement sélectionné — crée-le d\'abord, puis recharge la page.', 'error');
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(selectedVenueId)) {
      flash('ID d\'établissement invalide — recharge la page.', 'error');
      return;
    }
    // Validation par type de média :
    //  • image (logo/cover/gallery) : 8 Mo, formats classiques
    //  • video (PR Video)           : 50 Mo, MP4/MOV/WebM
    if (kind === 'video') {
      const okVid = /^video\/(mp4|quicktime|webm|x-m4v)$/i.test(file.type);
      if (!okVid) { flash('Format vidéo non supporté (MP4, MOV, WebM)', 'error'); return; }
      if (file.size > 50 * 1024 * 1024) { flash('Vidéo trop lourde (50 Mo max)', 'error'); return; }
    } else {
      const okMime = /^image\/(jpe?g|png|webp|gif)$/i.test(file.type);
      if (!okMime) { flash('Format non supporté (JPG, PNG, WebP, GIF uniquement)', 'error'); return; }
      if (file.size > 8 * 1024 * 1024) { flash('Image trop lourde (8 Mo max)', 'error'); return; }
    }

    // Vérifie côté client que la session est encore vivante. Un JWT expiré
    // donne « new row violates row-level security policy » côté storage car
    // auth.uid() = NULL -> aucune policy ne matche.
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      flash('Session expirée — reconnecte-toi.', 'error');
      setTimeout(() => router.push('/login'), 1500);
      return;
    }

    setUploading(kind);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${selectedVenueId}/${kind}-${Date.now()}.${ext || 'jpg'}`;

    const { error: upErr } = await supabase.storage
      .from('venue-media')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) {
      const msg = upErr.message || '';
      if (/row-level security/i.test(msg)) {
        // Sonde directe : la RPC simule la policy dans le contexte authentifié
        // réel (migration 0017). Plus de devinettes — on sait précisément
        // quelle clause matche ou pas.
        const { data: dbg, error: dbgErr } = await (supabase as any).rpc('debug_storage_policy', { p_path: path });
        console.error('[uploadMedia][RLS][debug]', { path, dbg, dbgErr, supabaseErr: upErr });
        if (dbgErr) {
          flash('Diagnostic RPC indisponible — rejoue la migration 0017.', 'error');
        } else if (dbg && typeof dbg === 'object') {
          // Format attendu : { auth_uid, folder_split_part, venue_visible,
          // venue_owner_id, is_owner, is_admin, policy_would_pass }
          if (!dbg.auth_uid) {
            flash('Session non transmise au serveur (auth.uid = NULL). Reconnecte-toi.', 'error');
          } else if (!dbg.venue_visible) {
            flash(`Venue ${String(dbg.folder_split_part || '').slice(0, 8)}… invisible côté serveur.`, 'error');
          } else if (!dbg.policy_would_pass) {
            flash(`Policy refuse : owner=${String(dbg.venue_owner_id || '').slice(0, 8)}… toi=${String(dbg.auth_uid).slice(0, 8)}… admin=${dbg.is_admin}`, 'error');
          } else {
            // policy_would_pass=true côté sonde, mais l'INSERT a échoué quand
            // même -> path passé à Supabase storage diffère probablement de
            // celui passé à la RPC. Voir console pour comparer.
            flash('Sonde dit OK mais Storage refuse. Voir la console (cause Supabase).', 'error');
          }
        } else {
          flash('RPC debug renvoyé un format inattendu — voir console.', 'error');
        }
      } else {
        flash(msg || 'Upload échoué', 'error');
      }
      setUploading(null);
      return;
    }

    const url = supabase.storage.from('venue-media').getPublicUrl(path).data.publicUrl;
    const patch =
      kind === 'logo'    ? { logo_url: url }
      : kind === 'cover' ? { cover_url: url }
      : kind === 'video' ? { video_urls: [...media.videos, url] }
      : { gallery_urls: [...media.gallery, url] };
    const { error: updErr } = await (supabase as any).from('venues').update(patch).eq('id', selectedVenueId);
    if (updErr) { flash(updErr.message, 'error'); setUploading(null); return; }

    setMedia((m) =>
      kind === 'logo'    ? { ...m, logo: url }
      : kind === 'cover' ? { ...m, cover: url }
      : kind === 'video' ? { ...m, videos: [...m.videos, url] }
      : { ...m, gallery: [...m.gallery, url] },
    );
    flash(
      kind === 'video' ? 'Vidéo ajoutée' :
      kind === 'gallery' ? 'Photo ajoutée' :
      kind === 'logo' ? 'Logo mis à jour' :
      'Bannière mise à jour'
    );
    setUploading(null);
  }

  async function removeGalleryImage(url: string) {
    const next = media.gallery.filter((u) => u !== url);
    const { error } = await (supabase as any).from('venues').update({ gallery_urls: next }).eq('id', selectedVenueId);
    if (error) { flash(error.message, 'error'); return; }
    setMedia((m) => ({ ...m, gallery: next }));
    flash('Photo retirée');
  }

  // PR Video — retire une vidéo de la galerie video_urls (file laissé en
  // Storage : on évite la cascade de delete pour rester non-cassant).
  async function removeGalleryVideo(url: string) {
    const next = media.videos.filter((u) => u !== url);
    const { error } = await (supabase as any).from('venues').update({ video_urls: next }).eq('id', selectedVenueId);
    if (error) { flash(error.message, 'error'); return; }
    setMedia((m) => ({ ...m, videos: next }));
    flash('Vidéo retirée');
  }

  // PR Video — sauvegarde l'URL visite 360° (Matterport, Kuula…)
  async function saveTour360() {
    const next = tour360Input.trim() || null;
    // Validation soft : si non vide, doit ressembler à https://
    if (next && !/^https?:\/\//i.test(next)) {
      flash("L'URL doit commencer par https://", 'error');
      return;
    }
    const { error } = await (supabase as any).from('venues').update({ tour_360_url: next }).eq('id', selectedVenueId);
    if (error) { flash(error.message, 'error'); return; }
    setMedia((m) => ({ ...m, tour360: next }));
    flash(next ? 'Visite 360° enregistrée' : 'Visite 360° retirée');
  }

  // KPIs
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRes = reservations.filter((r) => r.date_time?.startsWith(todayStr));
  const revenue = reservations.filter((r) => ['confirmed', 'arrived'].includes(r.status)).reduce((s, r) => s + r.deposit_xof, 0);
  const noShowRate = reservations.length > 0 ? Math.round((reservations.filter((r) => r.status === 'no_show').length / reservations.length) * 100) : 0;
  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  const filtered = reservations.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) { const val = (r.customer_name || r.customer_phone || '').toLowerCase(); if (!val.includes(search.toLowerCase())) return false; }
    return true;
  });

  // Finances computed
  const revByDay = useMemo(() => {
    const map = new Map<string, number>();
    reservations.filter((r) => ['confirmed', 'arrived'].includes(r.status)).forEach((r) => {
      const day = (r.created_at || '').slice(0, 10);
      if (day) map.set(day, (map.get(day) || 0) + r.deposit_xof);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([d, v]) => ({ day: fmtShort(d), value: v }));
  }, [reservations]);

  const resaByStatus = useMemo(() => {
    const map = new Map<string, number>();
    reservations.forEach((r) => { map.set(r.status, (map.get(r.status) || 0) + 1); });
    return Array.from(map.entries()).map(([s, c]) => ({ status: STATUS_META[s as ResStatus]?.label || s, count: c }));
  }, [reservations]);

  // Menu categories
  const menuCategories = useMemo(() => [...new Set(menuItems.map((m) => m.category))], [menuItems]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" />
          <p className="mt-4 text-sm text-neutral-500">Chargement du dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neutral-50">
      {toast && (
        <div
          className={`fixed left-1/2 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl sm:left-auto sm:right-6 sm:translate-x-0 sm:px-5 sm:py-3 ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 70px)' }}
        >
          <span>{toast.type === 'success' ? '✓' : '✗'}</span>
          <span className="truncate">{toast.message}</span>
        </div>
      )}

      {/* Header local — sticky sous la topbar AppShell */}
      <header
        className="sticky z-20 border-b border-neutral-200 bg-white/80 backdrop-blur-xl"
        style={{ top: 0 }}
      >
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-8 lg:py-5">
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold text-dark sm:text-xl">
              Bonjour, {userName.split(' ')[0] || '—'}
            </h1>
            <p className="mt-0.5 truncate text-xs capitalize text-neutral-400 sm:text-sm">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            {venues.length > 1 && (
              <select
                value={selectedVenueId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedVenueId(nextId);
                  // Synchronise ?venue= dans l'URL pour que ProShell recharge
                  // la sidebar selon le businessType du venue choisi.
                  const url = new URL(window.location.href);
                  url.searchParams.set('venue', nextId);
                  router.replace(`/pro${url.search}`, { scroll: false });
                }}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-dark transition focus:border-primary-500 focus:outline-none sm:w-auto sm:px-4 sm:py-2.5"
              >
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
            {venues.length === 1 && (
              <div className="truncate rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-dark sm:px-4 sm:py-2.5">
                {venues[0].name}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* Création d'établissement (aucun venue rattaché) */}
          {venues.length === 0 && (
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-50"><IcoGrid className="h-8 w-8 text-primary-500" /></div>
                <h2 className="mt-4 font-display text-2xl font-bold text-dark">Crée ton établissement</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Renseigne les infos de base — ton fiche sera <span className="font-semibold text-emerald-600">active immédiatement</span>.
                  Tu pourras tout compléter ensuite dans Paramètres.
                </p>
              </div>
              <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
                <ProInput label="Nom de l'établissement" value={nv.name} onChange={(v) => setNv((p) => ({ ...p, name: v }))} placeholder="Le Maquis du Coin" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-500">Catégorie</label>
                    <select value={nv.category} onChange={(e) => setNv((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                      {VENUE_CATEGORY_GROUPS_PRO.map((g) => (
                        <optgroup key={g.group} label={g.label}>
                          {g.items.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <ProInput label="Ville / commune" value={nv.city} onChange={(v) => setNv((p) => ({ ...p, city: v }))} placeholder="Abidjan" />
                </div>
                <ProInput label="Adresse" value={nv.address} onChange={(v) => setNv((p) => ({ ...p, address: v }))} placeholder="Rue, quartier..." />
                <div className="grid grid-cols-2 gap-3">
                  <ProInput label="Téléphone" value={nv.phone} onChange={(v) => setNv((p) => ({ ...p, phone: v }))} placeholder="+225XXXXXXXXXX" />
                  <ProInput label="WhatsApp" value={nv.whatsapp} onChange={(v) => setNv((p) => ({ ...p, whatsapp: v }))} placeholder="+225XXXXXXXXXX" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
                  <textarea value={nv.description} onChange={(e) => setNv((p) => ({ ...p, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none" placeholder="Présente ton établissement en quelques lignes..." />
                </div>
                <button onClick={createVenue} disabled={creating} className="btn-primary w-full disabled:opacity-50">
                  {creating ? 'Création...' : 'Créer mon établissement'}
                </button>
                <p className="text-center text-xs text-neutral-400">Ton établissement sera vérifié par l&apos;équipe Soutra-Explore avant d&apos;apparaître dans l&apos;application.</p>
              </div>
            </div>
          )}

          {venues.length > 0 && (
            <>
              {/* ═══════════ DASHBOARD ═══════════ */}
              {tab === 'dashboard' && (
                <>
                  <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard icon={<IcoCalendar className="h-5 w-5" />} iconBg="bg-blue-50 text-blue-600" label="Réservations du jour" value={String(todayRes.length)} sub={`${reservations.length} au total`} />
                    <KpiCard icon={<IcoWallet className="h-5 w-5" />} iconBg="bg-emerald-50 text-emerald-600" label="Chiffre d'affaires" value={formatXOF(revenue)} sub="Acomptes confirmés" />
                    <KpiCard icon={<IcoAlert className="h-5 w-5" />} iconBg={noShowRate > 15 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'} label="Taux de no-show" value={`${noShowRate}%`} sub={noShowRate > 15 ? 'Élevé — action requise' : 'Dans la norme'} />
                    <KpiCard icon={<IcoStar className="h-5 w-5" />} iconBg="bg-amber-50 text-amber-600" label="Note moyenne" value={`★ ${selectedVenue?.rating_avg?.toFixed(1) || '—'}`} sub={`${selectedVenue?.rating_count || 0} avis`} />
                  </div>

                  {/* Quick nav — filtrée selon les modules disponibles pour
                      le businessType du venue actif (PR2 onboarding). */}
                  <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
                    {availableModules.filter((m) => m !== 'dashboard').map((m) => {
                      const s = QUICK_NAV[m];
                      return (
                      <button
                        key={s.id}
                        onClick={() => setTab(s.id)}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-center text-xs font-medium text-neutral-600 transition hover:border-primary-500/30 hover:text-primary-500 sm:px-4 sm:py-3 sm:text-sm"
                      >
                        {s.label}
                      </button>
                      );
                    })}
                  </div>

                  <ReservationTable reservations={filtered} tableLoading={tableLoading} search={search} onSearch={setSearch} statusFilter={statusFilter} onStatusFilter={setStatusFilter} actionLoading={actionLoading} onUpdateStatus={updateStatus} />
                </>
              )}

              {/* ═══════════ RESERVATIONS ═══════════ */}
              {tab === 'reservations' && (
                <>
                  <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard icon={<IcoCalendar className="h-5 w-5" />} iconBg="bg-blue-50 text-blue-600" label="Aujourd'hui" value={String(todayRes.length)} sub={`${todayRes.filter((r) => r.status === 'pending').length} en attente`} />
                    <KpiCard icon={<IcoCheck className="h-5 w-5" />} iconBg="bg-emerald-50 text-emerald-600" label="Confirmées" value={String(reservations.filter((r) => r.status === 'confirmed').length)} sub="à accueillir" />
                    <KpiCard icon={<IcoAlert className="h-5 w-5" />} iconBg="bg-amber-50 text-amber-600" label="En attente" value={String(reservations.filter((r) => r.status === 'pending').length)} sub="à traiter" />
                    <KpiCard icon={<IcoStar className="h-5 w-5" />} iconBg="bg-purple-50 text-purple-600" label="Total couverts" value={String(reservations.reduce((s, r) => s + r.party_size, 0))} sub="toutes réservations" />
                  </div>

                  <ReservationTable reservations={filtered} tableLoading={tableLoading} search={search} onSearch={setSearch} statusFilter={statusFilter} onStatusFilter={setStatusFilter} actionLoading={actionLoading} onUpdateStatus={updateStatus} />

                  {/* Répartition par statut */}
                  {resaByStatus.length > 0 && (
                    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 text-sm font-semibold text-neutral-400">Répartition par statut</h3>
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        {resaByStatus.map((s) => (
                          <div key={s.status} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center">
                            <p className="text-2xl font-bold text-dark">{s.count}</p>
                            <p className="mt-1 text-xs text-neutral-500">{s.status}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══════════ EVENTS ═══════════ */}
              {tab === 'events' && (
                <>
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Create event */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Créer un événement</h3>
                      <div className="space-y-4">
                        <ProInput label="Nom de l'événement" value={evtName} onChange={setEvtName} placeholder="Soirée DJ, Brunch dominical..." />
                        <div className="grid grid-cols-2 gap-3">
                          <ProInput label="Début" value={evtDate} onChange={setEvtDate} type="datetime-local" />
                          <ProInput label="Durée (heures)" value={evtDuration} onChange={setEvtDuration} type="number" placeholder="4" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <ProInput label="Prix (FCFA)" value={evtPrice} onChange={setEvtPrice} type="number" placeholder="5000" />
                          <ProInput label="Capacité" value={evtCapacity} onChange={setEvtCapacity} type="number" placeholder="50" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
                          <textarea value={evtDesc} onChange={(e) => setEvtDesc(e.target.value)} rows={3} placeholder="Décris l'événement, le programme, l'ambiance..." className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none" />
                        </div>
                        <button onClick={createEvent} disabled={evtSaving || !selectedVenueId} className="btn-primary w-full disabled:opacity-50">
                          {evtSaving ? 'Création…' : 'Créer l\'événement (brouillon)'}
                        </button>
                        {!selectedVenueId && <p className="text-xs text-neutral-400">Crée d'abord un établissement.</p>}
                      </div>
                    </div>

                    {/* Events list */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Mes événements ({events.length})</h3>
                      {events.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400">Aucun événement créé</div>
                      ) : (
                        <div className="space-y-3">
                          {events.map((e) => {
                            const tier = e.ticket_tiers?.[0];
                            const remaining = remainingSeats(e);
                            const sold = tier ? tier.sold : 0;
                            const statusMeta = STATUS_META_EVT[e.status];
                            return (
                              <div key={e.id} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-dark">{e.title}</p>
                                    <p className="mt-1 text-xs text-neutral-500">{fmtDateTime(e.starts_at)}</p>
                                    {e.description && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{e.description}</p>}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="font-mono text-sm font-medium text-primary-600">{formatXOF(tier?.price_xof || 0)}</p>
                                    <p className="text-xs text-neutral-400">
                                      {remaining !== null ? `${remaining} place${remaining === 1 ? '' : 's'}` : 'illimité'}
                                      {sold > 0 && ` · ${sold} vendu${sold === 1 ? '' : 's'}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusMeta.bg} ${statusMeta.color}`}>{statusMeta.label}</span>
                                  {e.status === 'draft' && <button onClick={() => updateEventStatus(e.id, 'published')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100">Publier</button>}
                                  {e.status === 'published' && <>
                                    <button onClick={() => updateEventStatus(e.id, 'sold_out')} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100">Marquer complet</button>
                                    <button onClick={() => updateEventStatus(e.id, 'done')} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100">Terminer</button>
                                    <button onClick={() => updateEventStatus(e.id, 'cancelled')} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100">Annuler</button>
                                  </>}
                                  {e.status === 'sold_out' && <button onClick={() => updateEventStatus(e.id, 'published')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100">Rouvrir</button>}
                                  <button onClick={() => setEditingEvent({ ...e })} className="ml-auto rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700" title="Modifier">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                  </button>
                                  <button onClick={() => { if (confirm(`Supprimer « ${e.title} » ?`)) deleteEvent(e.id); }} className="rounded-lg p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-500" title="Supprimer">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal d'édition événement */}
                  {editingEvent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingEvent(null)}>
                      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="font-display text-lg font-bold text-dark">Modifier l'événement</h3>
                          <button onClick={() => setEditingEvent(null)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="space-y-4">
                          <ProInput label="Nom" value={editingEvent.title} onChange={(v) => setEditingEvent((prev) => prev && { ...prev, title: v })} />
                          <div className="grid grid-cols-2 gap-3">
                            <ProInput label="Début" type="datetime-local" value={editingEvent.starts_at.slice(0, 16)} onChange={(v) => setEditingEvent((prev) => prev && { ...prev, starts_at: new Date(v).toISOString() })} />
                            <ProInput label="Fin" type="datetime-local" value={editingEvent.ends_at.slice(0, 16)} onChange={(v) => setEditingEvent((prev) => prev && { ...prev, ends_at: new Date(v).toISOString() })} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <ProInput label="Prix Standard (FCFA)" type="number" value={String(editingEvent.ticket_tiers?.[0]?.price_xof ?? 0)} onChange={(v) => setEditingEvent((prev) => {
                              if (!prev) return prev;
                              const tiers = prev.ticket_tiers?.length ? [...prev.ticket_tiers] : [{ name: 'Standard', price_xof: 0, qty: prev.capacity || 0, sold: 0 }];
                              tiers[0] = { ...tiers[0], price_xof: parseInt(v, 10) || 0 };
                              return { ...prev, ticket_tiers: tiers };
                            })} />
                            <ProInput label="Capacité" type="number" value={String(editingEvent.capacity ?? 0)} onChange={(v) => setEditingEvent((prev) => {
                              if (!prev) return prev;
                              const cap = parseInt(v, 10) || 0;
                              const tiers = prev.ticket_tiers?.length ? [...prev.ticket_tiers] : [{ name: 'Standard', price_xof: 0, qty: 0, sold: 0 }];
                              tiers[0] = { ...tiers[0], qty: cap };
                              return { ...prev, capacity: cap || null, ticket_tiers: tiers };
                            })} />
                          </div>
                          {editingEvent.ticket_tiers?.[0]?.sold > 0 && (
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              {editingEvent.ticket_tiers[0].sold} ticket{editingEvent.ticket_tiers[0].sold > 1 ? 's' : ''} déjà vendu{editingEvent.ticket_tiers[0].sold > 1 ? 's' : ''} — ne descends pas la capacité en-dessous.
                            </p>
                          )}
                          <div>
                            <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
                            <textarea rows={3} value={editingEvent.description || ''} onChange={(e) => setEditingEvent((prev) => prev && { ...prev, description: e.target.value })} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none" />
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setEditingEvent(null)} className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50">Annuler</button>
                            <button onClick={saveEventEdit} disabled={editEvtSaving} className="btn-primary flex-1 disabled:opacity-50">{editEvtSaving ? 'Sauvegarde…' : 'Enregistrer'}</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══════════ MENU ═══════════ */}
              {tab === 'menu' && (
                <>
                  <div className="grid gap-6 lg:grid-cols-3">
                    {/* Add item */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Ajouter un article</h3>
                      <div className="space-y-4">
                        <ProInput label="Nom" value={menuName} onChange={setMenuName} placeholder="Alloco, Attiéké poisson..." />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Catégorie</label>
                          <select value={menuCat} onChange={(e) => setMenuCat(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                            {['Entrée', 'Plat principal', 'Dessert', 'Boisson', 'Cocktail', 'Snack', 'Spécialité'].map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <ProInput label="Prix (FCFA)" value={menuPrice} onChange={setMenuPrice} type="number" placeholder="3000" />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Description (optionnelle)</label>
                          <textarea
                            value={menuDesc}
                            onChange={(e) => setMenuDesc(e.target.value)}
                            placeholder="Ingrédients, portion, accompagnement..."
                            rows={2}
                            className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={addMenuItem}
                          disabled={menuSaving || !selectedVenueId}
                          className="btn-primary w-full disabled:opacity-50"
                        >
                          {menuSaving ? 'Ajout…' : 'Ajouter au menu'}
                        </button>
                        {!selectedVenueId && <p className="text-xs text-neutral-400">Crée d'abord un établissement.</p>}
                      </div>
                    </div>

                    {/* Menu list */}
                    <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Menu ({menuItems.length} articles)</h3>
                      {menuLoading ? (
                        <div className="py-12 text-center text-sm text-neutral-400">Chargement…</div>
                      ) : menuItems.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400">Aucun article dans le menu</div>
                      ) : (
                        <div className="space-y-4">
                          {menuCategories.map((cat) => (
                            <div key={cat}>
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{cat}</h4>
                              <div className="space-y-2">
                                {menuItems.filter((m) => m.category === cat).map((item) => (
                                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <button
                                        onClick={() => toggleMenuItem(item.id, !item.available)}
                                        className={`h-3 w-3 shrink-0 rounded-full ${item.available ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                                        title={item.available ? 'Disponible — clic pour rendre indispo' : 'Indisponible — clic pour activer'}
                                      />
                                      <div className="min-w-0">
                                        <div className={`truncate text-sm font-medium ${item.available ? 'text-dark' : 'text-neutral-400 line-through'}`}>{item.name}</div>
                                        {item.description && <div className="mt-0.5 truncate text-xs text-neutral-500">{item.description}</div>}
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                      <span className="font-mono text-sm font-medium text-primary-600">{formatXOF(item.price_xof)}</span>
                                      <button
                                        onClick={() => deleteMenuItem(item.id)}
                                        className="rounded-lg p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-500"
                                        title="Supprimer"
                                      >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ═══════════ ANALYTICS (PR 9) ═══════════ */}
              {tab === 'analytics' && (
                <VenueAnalytics venueId={selectedVenueId || null} venueName={selectedVenue?.name} />
              )}

              {/* ═══════════ BOUTIQUE (catégories compatibles uniquement) ═══════════ */}
              {tab === 'shop-products' && selectedVenueId && (
                selectedVenue && isShopCategory(selectedVenue.category) ? (
                  <ShopProductsTab venueId={selectedVenueId} />
                ) : (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-600">
                      Le module Catalogue n&apos;est disponible que pour les venues catégorie{' '}
                      <strong>boutique, mall, supermarché ou pharmacie</strong>.
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Catégorie actuelle : <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">{selectedVenue?.category || '—'}</code>
                    </p>
                  </div>
                )
              )}

              {tab === 'shop-orders' && selectedVenueId && (
                selectedVenue && isShopCategory(selectedVenue.category) ? (
                  <ShopOrdersTab venueId={selectedVenueId} />
                ) : (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-600">
                      Le module Commandes n&apos;est disponible que pour les venues catégorie boutique.
                    </p>
                  </div>
                )
              )}

              {/* ═══════════ HÔTEL (catégories compatibles uniquement) ═══════════ */}
              {tab === 'hotel-rooms' && selectedVenueId && (
                selectedVenue && isHotelCategory(selectedVenue.category) ? (
                  <HotelRoomsTab venueId={selectedVenueId} />
                ) : (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-600">
                      Le module Chambres n&apos;est disponible que pour les venues catégorie{' '}
                      <strong>hôtel, villa, resort, auberge ou résidence meublée</strong>.
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Catégorie actuelle : <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">{selectedVenue?.category || '—'}</code>
                    </p>
                  </div>
                )
              )}

              {tab === 'hotel-bookings' && selectedVenueId && (
                selectedVenue && isHotelCategory(selectedVenue.category) ? (
                  <HotelBookingsTab venueId={selectedVenueId} />
                ) : (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-600">
                      Le module Réservations chambres n&apos;est disponible que pour les venues hôteliers.
                    </p>
                  </div>
                )
              )}

              {/* ═══════════ FINANCES ═══════════ */}
              {tab === 'finances' && (
                <>
                  {/* ═══════════ DASHBOARD REVENUS SOUTRA-PLAYCE (PR 0043) ═══════════ */}
                  {/* Affiche brut / commission Soutra-Explore / net / frais facturés
                      avec timeline + ventilation par source + détail des events.
                      Le bouton "📄 Télécharger PDF" génère un rapport autonome. */}
                  <div className="mb-8">
                    <ProRevenueDashboard
                      venueId={selectedVenueId}
                      venue={selectedVenue ? {
                        name: selectedVenue.name,
                        category: selectedVenue.category,
                        city: selectedVenue.city,
                        district: selectedVenue.district,
                      } : undefined}
                    />
                  </div>

                  {/* ═══════════ PAYOUTS GÉRANT (migration 0044) ═══════════ */}
                  {/* Solde payable du venue + demande de virement mobile money.
                      Edge function venue-payout-initiate + RPCs request/settle
                      _venue_payout. Le webhook Paystack route automatiquement
                      sur settle_venue_payout via le préfixe sp-vp-. */}
                  <div className="mb-8">
                    <VenuePayoutPanel venueId={selectedVenueId || null} />
                  </div>

                  <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard icon={<IcoWallet className="h-5 w-5" />} iconBg="bg-emerald-50 text-emerald-600" label="Solde wallet" value={formatXOF(walletBalance)} sub="disponible" />
                    <KpiCard icon={<IcoTrend className="h-5 w-5" />} iconBg="bg-blue-50 text-blue-600" label="Revenus acomptes" value={formatXOF(revenue)} sub="confirmés + arrivés" />
                    <KpiCard icon={<IcoCalendar className="h-5 w-5" />} iconBg="bg-amber-50 text-amber-600" label="Transactions" value={String(txs.length)} sub="historique" />
                    <KpiCard icon={<IcoStar className="h-5 w-5" />} iconBg="bg-purple-50 text-purple-600" label="Revenus événements" value={formatXOF(events.reduce((s, e) => s + (e.ticket_tiers || []).reduce((ts, t) => ts + (t.price_xof || 0) * (t.sold || 0), 0), 0))} sub={`${events.length} événements`} />
                  </div>

                  {/* Revenue chart (simple bar) */}
                  {revByDay.length > 0 && (
                    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 text-sm font-semibold text-neutral-400">Revenus des 14 derniers jours</h3>
                      <div className="flex h-40 items-end gap-2">
                        {revByDay.map((d, i) => {
                          const max = Math.max(...revByDay.map((x) => x.value), 1);
                          const h = Math.max(4, (d.value / max) * 100);
                          return (
                            <div key={i} className="flex flex-1 flex-col items-center gap-1">
                              <span className="text-[9px] text-neutral-400">{formatXOF(d.value)}</span>
                              <div className="w-full rounded-t-md bg-primary-500 transition-all hover:bg-primary-600" style={{ height: `${h}%` }} />
                              <span className="text-[9px] text-neutral-400">{d.day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Transaction history */}
                  <div className="rounded-2xl border border-neutral-200 bg-white">
                    <div className="border-b border-neutral-100 px-6 py-4"><h3 className="font-display text-lg font-bold text-dark">Historique transactions</h3></div>
                    {txs.length === 0 ? (
                      <div className="py-12 text-center text-neutral-400">Aucune transaction</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">
                            <th className="px-6 py-3">Date</th><th className="px-6 py-3">Type</th><th className="px-6 py-3">Montant</th><th className="px-6 py-3">Statut</th>
                          </tr></thead>
                          <tbody>{txs.map((t: any) => (
                            <tr key={t.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                              <td className="px-6 py-3 text-xs text-neutral-500">{fmtDateTime(t.created_at)}</td>
                              <td className="px-6 py-3 text-xs capitalize">{t.type}</td>
                              <td className="px-6 py-3 font-mono font-medium">{formatXOF(t.amount_xof)}</td>
                              <td className="px-6 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${t.status === 'success' ? 'bg-emerald-50 text-emerald-700' : t.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{t.status === 'success' ? 'Réussi' : t.status === 'pending' ? 'En cours' : 'Échoué'}</span></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ═══════════ MARKETING ═══════════ */}
              {tab === 'marketing' && (
                <>
                  <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard icon={<IcoStar className="h-5 w-5" />} iconBg="bg-amber-50 text-amber-600" label="Note moyenne" value={`★ ${selectedVenue?.rating_avg?.toFixed(1) || '—'}`} sub={`${selectedVenue?.rating_count || 0} avis`} />
                    <KpiCard icon={<IcoCalendar className="h-5 w-5" />} iconBg="bg-blue-50 text-blue-600" label="Réservations" value={String(reservations.length)} sub="toutes confondues" />
                    <KpiCard icon={<IcoMegaphone className="h-5 w-5" />} iconBg="bg-purple-50 text-purple-600" label="Promos actives" value={String(promos.filter((p) => p.active).length)} sub={`${promos.length} codes au total`} />
                    <KpiCard icon={<IcoTrend className="h-5 w-5" />} iconBg="bg-emerald-50 text-emerald-600" label="Taux conversion" value={`${reservations.length > 0 ? Math.round((reservations.filter((r) => r.status === 'arrived').length / reservations.length) * 100) : 0}%`} sub="arrivés / total" />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Create promo */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Créer un code promo</h3>
                      <div className="space-y-4">
                        <ProInput label="Code promo" value={promoCode} onChange={(v) => setPromoCode(v.toUpperCase())} placeholder="ETE2026" />
                        {/* Migration 0038 — sélecteur de type de promo */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Type de promo</label>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {(Object.keys(PROMO_KIND_META) as PromoKind[]).map((k) => {
                              const meta = PROMO_KIND_META[k];
                              const active = promoKind === k;
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => setPromoKind(k)}
                                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                    active
                                      ? 'border-transparent text-white shadow-sm'
                                      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                                  }`}
                                  style={active ? { backgroundColor: meta.color } : undefined}
                                >
                                  <span className="mr-1">{meta.emoji}</span>{meta.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Remise (%)</label>
                          <select value={promoDiscount} onChange={(e) => setPromoDiscount(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                            {['5', '10', '15', '20', '25', '30', '50'].map((v) => <option key={v} value={v}>{v}%</option>)}
                          </select>
                        </div>
                        <ProInput label="Nombre max d'utilisations (optionnel)" value={promoMaxUses} onChange={setPromoMaxUses} type="number" placeholder="laisser vide = illimité" />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Date d'expiration (optionnelle)</label>
                          <input type="date" value={promoValidUntil} onChange={(e) => setPromoValidUntil(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none" />
                        </div>
                        <button onClick={createPromo} disabled={promoSaving || !selectedVenueId} className="btn-primary w-full disabled:opacity-50">
                          {promoSaving ? 'Création…' : 'Créer le code'}
                        </button>
                        {!selectedVenueId && <p className="text-xs text-neutral-400">Crée d'abord un établissement.</p>}
                      </div>
                    </div>

                    {/* Promo list */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Codes promos ({promos.length})</h3>
                      {promosLoading ? (
                        <div className="py-12 text-center text-sm text-neutral-400">Chargement…</div>
                      ) : promos.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400">Aucun code promo</div>
                      ) : (
                        <div className="space-y-2">
                          {promos.map((p) => {
                            const expired = p.valid_until ? new Date(p.valid_until) < new Date() : false;
                            const exhausted = p.max_uses !== null && p.uses_count >= p.max_uses;
                            const live = p.active && !expired && !exhausted;
                            return (
                              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-mono font-bold text-primary-600">{p.code}</p>
                                    {/* Migration 0038 — badge kind (fallback 'discount' pour les promos pré-migration) */}
                                    {(() => {
                                      const km = PROMO_KIND_META[(p.kind as PromoKind) || 'discount'];
                                      return (
                                        <span
                                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                          style={{ backgroundColor: km.color + '22', color: km.color }}
                                        >
                                          {km.emoji} {km.label}
                                        </span>
                                      );
                                    })()}
                                    {!p.active && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">désactivé</span>}
                                    {expired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">expiré</span>}
                                    {exhausted && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">épuisé</span>}
                                  </div>
                                  <p className="mt-0.5 text-xs text-neutral-400">
                                    {p.uses_count}{p.max_uses !== null ? ` / ${p.max_uses}` : ''} utilisation{p.uses_count === 1 ? '' : 's'}
                                    {p.valid_until && ` · jusqu'au ${fmtShort(p.valid_until.slice(0, 10))}`}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-200 text-neutral-500'}`}>-{p.discount_pct}%</span>
                                  <button onClick={() => togglePromo(p.id, !p.active)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-200" title={p.active ? 'Désactiver' : 'Activer'}>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      {p.active
                                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        : <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />}
                                    </svg>
                                  </button>
                                  <button onClick={() => deletePromo(p.id)} className="rounded-lg p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500" title="Supprimer">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Share links */}
                  <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                    <h3 className="mb-4 font-display text-lg font-bold text-dark">Partager votre établissement</h3>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {['WhatsApp', 'Facebook', 'Instagram', 'Copier le lien'].map((s) => (
                        <button key={s} onClick={() => { navigator.clipboard.writeText(`https://soutra-paiya.com/venues/${selectedVenueId}`); flash(`Lien ${s === 'Copier le lien' ? 'copié' : 'prêt à partager'}`); }}
                          className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-600 transition hover:border-primary-500/30 hover:text-primary-500">{s}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ═══════════ SETTINGS ═══════════ */}
              {tab === 'settings' && (
                <>
                  {/* PR Paiements — moyens de paiement acceptés (migration 0063) */}
                  {selectedVenueId && (
                    <div className="mb-6">
                      <PaymentMethodsPanel venueId={selectedVenueId} />
                    </div>
                  )}

                  {/* Médias de la vitrine */}
                  <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6">
                    <h3 className="mb-5 font-display text-lg font-bold text-dark">Médias de la vitrine</h3>
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-medium text-neutral-500">Logo</label>
                        <div className="flex items-center gap-4">
                          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                            {media.logo ? (
                              <Image src={media.logo} alt="logo" fill sizes="80px" className="object-cover" />
                            ) : (
                              <IcoGrid className="h-7 w-7 text-neutral-300" />
                            )}
                          </div>
                          <label className="cursor-pointer rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-primary-500/30 hover:text-primary-500">
                            {uploading === 'logo' ? 'Envoi…' : 'Choisir un logo'}
                            <input type="file" accept="image/*" className="hidden" disabled={!!uploading}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'logo'); e.target.value = ''; }} />
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-neutral-500">Bannière</label>
                        <div className="flex items-center gap-4">
                          <div className="relative flex h-20 w-32 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                            {media.cover ? (
                              <Image src={media.cover} alt="bannière" fill sizes="128px" className="object-cover" />
                            ) : (
                              <IcoGrid className="h-7 w-7 text-neutral-300" />
                            )}
                          </div>
                          <label className="cursor-pointer rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-primary-500/30 hover:text-primary-500">
                            {uploading === 'cover' ? 'Envoi…' : 'Choisir une bannière'}
                            <input type="file" accept="image/*" className="hidden" disabled={!!uploading}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'cover'); e.target.value = ''; }} />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-medium text-neutral-500">Galerie photos ({media.gallery.length})</label>
                        <label className="cursor-pointer rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600">
                          {uploading === 'gallery' ? 'Envoi…' : '+ Ajouter une photo'}
                          <input type="file" accept="image/*" className="hidden" disabled={!!uploading}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'gallery'); e.target.value = ''; }} />
                        </label>
                      </div>
                      {media.gallery.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400">Aucune photo — ajoute des visuels pour attirer les clients</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                          {media.gallery.map((url) => (
                            <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-neutral-200">
                              <Image src={url} alt="" fill sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw" className="object-cover" />
                              <button onClick={() => removeGalleryImage(url)} title="Retirer"
                                className="absolute right-1 top-1 rounded-lg bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* PR Video — galerie vidéos */}
                    <div className="mt-6 border-t border-neutral-100 pt-6">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-medium text-neutral-500">
                          Galerie vidéos ({media.videos.length}) <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">MP4 · MOV · WebM · 50 Mo max</span>
                        </label>
                        <label className="cursor-pointer rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600">
                          {uploading === 'video' ? 'Envoi…' : '+ Ajouter une vidéo'}
                          <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" className="hidden" disabled={!!uploading}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f, 'video'); e.target.value = ''; }} />
                        </label>
                      </div>
                      {media.videos.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400">
                          Aucune vidéo — une visite vidéo augmente fortement l'engagement
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {media.videos.map((url) => (
                            <div key={url} className="group relative aspect-video overflow-hidden rounded-xl border border-neutral-200 bg-black">
                              {/* video preview (muet pour ne pas hurler dans /pro) */}
                              <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="rounded-full bg-black/50 p-2">
                                  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                              </div>
                              <button onClick={() => removeGalleryVideo(url)} title="Retirer"
                                className="absolute right-1 top-1 rounded-lg bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* PR Video — Visite virtuelle 360° */}
                    <div className="mt-6 border-t border-neutral-100 pt-6">
                      <label className="mb-2 block text-xs font-medium text-neutral-500">
                        Visite virtuelle 360° <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">Matterport, Kuula, Pano2VR…</span>
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="url"
                          value={tour360Input}
                          onChange={(e) => setTour360Input(e.target.value)}
                          placeholder="https://my.matterport.com/show/?m=..."
                          className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none"
                        />
                        <button
                          onClick={saveTour360}
                          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
                        >
                          {media.tour360 === (tour360Input.trim() || null) ? '✓ Enregistré' : 'Enregistrer'}
                        </button>
                      </div>
                      {media.tour360 && (
                        <p className="mt-2 text-xs text-neutral-500">
                          Lien actif :{' '}
                          <a href={media.tour360} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                            ouvrir la visite
                          </a>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Localisation GPS */}
                  <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6">
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="font-display text-lg font-bold text-dark">Localisation GPS</h3>
                      <span className={`text-xs ${geo ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {geo ? '✓ Position enregistrée' : '⚠ Pas encore positionné sur la carte'}
                      </span>
                    </div>
                    <p className="mb-5 text-sm text-neutral-500">
                      Place ton établissement sur la carte. Sans coordonnées GPS, ta vitrine n'apparaîtra pas dans la recherche par proximité et tes clients ne pourront pas obtenir d'itinéraire.
                    </p>
                    {selectedVenueId ? (
                      <VenueLocationPicker
                        initialLat={geo?.lat ?? null}
                        initialLng={geo?.lng ?? null}
                        onSave={saveVenueLocation}
                      />
                    ) : (
                      <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400">
                        Crée d'abord un établissement.
                      </p>
                    )}
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-5 font-display text-lg font-bold text-dark">Informations générales</h3>
                      <div className="space-y-4">
                        <ProInput label="Nom de l'établissement" value={settingsName} onChange={setSettingsName} />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Catégorie</label>
                          <select value={settingsCategory} onChange={(e) => setSettingsCategory(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                            {VENUE_CATEGORY_GROUPS_PRO.map((g) => (
                        <optgroup key={g.group} label={g.label}>
                          {g.items.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                        </optgroup>
                      ))}
                          </select>
                        </div>
                        <ProInput label="Ville" value={settingsCity} onChange={setSettingsCity} />
                        <ProInput label="Quartier / commune" value={vx.district} onChange={(v) => setVx((p) => ({ ...p, district: v }))} placeholder="Cocody, Marcory…" />
                        <ProInput label="Adresse" value={settingsAddress} onChange={setSettingsAddress} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-5 font-display text-lg font-bold text-dark">Contact & description</h3>
                      <div className="space-y-4">
                        <ProInput label="Téléphone" value={settingsPhone} onChange={setSettingsPhone} />
                        <ProInput label="WhatsApp" value={vx.whatsapp} onChange={(v) => setVx((p) => ({ ...p, whatsapp: v }))} placeholder="+225XXXXXXXXXX" />
                        <ProInput label="Email" value={vx.email} onChange={(v) => setVx((p) => ({ ...p, email: v }))} placeholder="contact@etablissement.ci" />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
                          <textarea value={settingsDesc} onChange={(e) => setSettingsDesc(e.target.value)} rows={4}
                            className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none" placeholder="Décrivez votre établissement..." />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Horaires d'ouverture
                      Stockage cohérent mobile/SQL : Record<DayKey, [open, close]>
                      sans clé si fermé. Lecture mobile : hoursHelpers.computeOpenStatus. */}
                  <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                    <h3 className="mb-1 font-display text-lg font-bold text-dark">Horaires d&apos;ouverture</h3>
                    <p className="mb-5 text-xs text-neutral-500">
                      Pour les fermetures après minuit (ex. 17h → 02h), saisis 02:00 en heure de fermeture. La fonction « Ouvert maintenant » sur mobile gère le wrap automatiquement.
                    </p>
                    <div className="grid gap-3">
                      {HOURS_DAYS.map((d) => {
                        const dayKey = d.k as keyof HoursMap;
                        const range = vx.hours[dayKey];
                        const open  = range?.[0] || '';
                        const close = range?.[1] || '';
                        const isClosed = !range;

                        const setRange = (next: HoursRange | null) => {
                          setVx((p) => {
                            const nextHours = { ...p.hours };
                            if (next === null) delete nextHours[dayKey];
                            else nextHours[dayKey] = next;
                            return { ...p, hours: nextHours };
                          });
                        };

                        return (
                          <div
                            key={d.k}
                            className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition ${
                              isClosed ? 'border-neutral-100 bg-neutral-50' : 'border-neutral-200 bg-white'
                            }`}
                          >
                            <span className="w-20 shrink-0 text-sm font-semibold text-dark">{d.l}</span>

                            {/* Checkbox Fermé */}
                            <label className="inline-flex items-center gap-2 text-xs text-neutral-600">
                              <input
                                type="checkbox"
                                checked={isClosed}
                                onChange={(e) => setRange(e.target.checked ? null : ['09:00', '18:00'])}
                                className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                              />
                              Fermé
                            </label>

                            {!isClosed && (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-neutral-500">Ouverture</span>
                                  <input
                                    type="time"
                                    value={open}
                                    onChange={(e) => setRange([e.target.value || '00:00', close || '23:59'])}
                                    className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-neutral-500">Fermeture</span>
                                  <input
                                    type="time"
                                    value={close}
                                    onChange={(e) => setRange([open || '00:00', e.target.value || '23:59'])}
                                    className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick actions */}
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                      <button
                        type="button"
                        onClick={() => setVx((p) => ({
                          ...p,
                          hours: {
                            mon: ['09:00', '18:00'], tue: ['09:00', '18:00'], wed: ['09:00', '18:00'],
                            thu: ['09:00', '18:00'], fri: ['09:00', '18:00'],
                          },
                        }))}
                        className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                      >
                        ⚡ Lun-Ven 9h-18h
                      </button>
                      <button
                        type="button"
                        onClick={() => setVx((p) => ({
                          ...p,
                          hours: {
                            mon: ['12:00', '23:00'], tue: ['12:00', '23:00'], wed: ['12:00', '23:00'],
                            thu: ['12:00', '23:00'], fri: ['12:00', '02:00'], sat: ['12:00', '02:00'],
                            sun: ['12:00', '22:00'],
                          },
                        }))}
                        className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                      >
                        ⚡ Resto / Maquis (12h-23h + WE late)
                      </button>
                      <button
                        type="button"
                        onClick={() => setVx((p) => ({ ...p, hours: {} }))}
                        className="ml-auto rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100"
                      >
                        Tout fermer
                      </button>
                    </div>
                  </div>

                  {/* Services, ambiance, réseaux & tarif */}
                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="font-display text-lg font-bold text-dark">Services & ambiance</h3>
                      <TagEditor label="Services proposés" tags={vx.amenities} suggestions={AMENITY_SUGGESTIONS} placeholder="Ajouter un service…" onChange={(t) => setVx((p) => ({ ...p, amenities: t }))} />
                      <TagEditor label="Ambiance" tags={vx.ambiance} suggestions={AMBIANCE_SUGGESTIONS} placeholder="Ajouter une ambiance…" onChange={(t) => setVx((p) => ({ ...p, ambiance: t }))} />
                    </div>
                    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="font-display text-lg font-bold text-dark">Tarif & réseaux sociaux</h3>
                      <ProInput label="Prix moyen par personne (FCFA)" type="number" value={vx.price} onChange={(v) => setVx((p) => ({ ...p, price: v }))} placeholder="5000" />
                      <ProInput label="Instagram" value={vx.socials.instagram} onChange={(v) => setVx((p) => ({ ...p, socials: { ...p.socials, instagram: v } }))} placeholder="@monetablissement" />
                      <ProInput label="Facebook" value={vx.socials.facebook} onChange={(v) => setVx((p) => ({ ...p, socials: { ...p.socials, facebook: v } }))} placeholder="facebook.com/monetablissement" />
                      <ProInput label="TikTok" value={vx.socials.tiktok} onChange={(v) => setVx((p) => ({ ...p, socials: { ...p.socials, tiktok: v } }))} placeholder="@monetablissement" />
                    </div>
                  </div>

                  {/* Venue info */}
                  <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
                    <h3 className="mb-4 text-sm font-semibold text-neutral-400">Informations du compte</h3>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center">
                        <p className="text-xs text-neutral-500">Statut</p>
                        <p className={`mt-1 text-sm font-semibold ${selectedVenue?.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>{selectedVenue?.status === 'active' ? 'Actif' : selectedVenue?.status || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center">
                        <p className="text-xs text-neutral-500">Note</p>
                        <p className="mt-1 text-sm font-semibold text-amber-600">★ {selectedVenue?.rating_avg || 0}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center">
                        <p className="text-xs text-neutral-500">Avis</p>
                        <p className="mt-1 text-sm font-semibold text-dark">{selectedVenue?.rating_count || 0}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-center">
                        <p className="text-xs text-neutral-500">Réservations</p>
                        <p className="mt-1 text-sm font-semibold text-dark">{reservations.length}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button onClick={saveSettings} className="btn-primary px-8">Sauvegarder</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/*  COMPONENTS                                         */
/* ─────────────────────────────────────────────────── */

function ReservationTable({ reservations, tableLoading, search, onSearch, statusFilter, onStatusFilter, actionLoading, onUpdateStatus }: {
  reservations: Reservation[]; tableLoading: boolean; search: string; onSearch: (v: string) => void; statusFilter: string; onStatusFilter: (v: string) => void; actionLoading: string | null; onUpdateStatus: (id: string, s: ResStatus) => void;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-neutral-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-bold text-dark">Réservations</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <IcoSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input type="text" placeholder="Rechercher un client..." value={search} onChange={(e) => onSearch(e.target.value)} className="w-56 rounded-xl border border-neutral-200 py-2.5 pl-10 pr-4 text-sm transition focus:border-primary-500 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm transition focus:border-primary-500 focus:outline-none">
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option><option value="confirmed">Confirmé</option><option value="arrived">Arrivé</option><option value="no_show">No-show</option><option value="cancelled">Annulé</option>
          </select>
        </div>
      </div>
      {tableLoading ? (
        <div className="flex items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" /></div>
      ) : reservations.length === 0 ? (
        <div className="py-16 text-center text-neutral-400">Aucune réservation</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <th className="px-6 py-3">Date / Heure</th><th className="px-6 py-3">Client</th><th className="px-6 py-3">Pers.</th><th className="px-6 py-3">Acompte</th><th className="px-6 py-3">Statut</th><th className="px-6 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>{reservations.map((r) => {
              const dt = new Date(r.date_time);
              const meta = STATUS_META[r.status] || STATUS_META.pending;
              return (
                <tr key={r.id} className="border-b border-neutral-50 transition-colors hover:bg-neutral-50/50">
                  <td className="px-6 py-4"><div className="font-medium text-dark">{dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div><div className="font-mono text-xs text-neutral-400">{dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div></td>
                  <td className="px-6 py-4"><div className="font-medium text-dark">{r.customer_name || 'Client'}</div>{r.customer_phone && <div className="text-xs text-neutral-400">{r.customer_phone}</div>}</td>
                  <td className="px-6 py-4 font-medium">{r.party_size}</td>
                  <td className="px-6 py-4 font-mono font-medium">{formatXOF(r.deposit_xof)}</td>
                  <td className="px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.bg} ${meta.color}`}>{meta.label}</span></td>
                  <td className="px-6 py-4 text-right">
                    {actionLoading === r.id ? <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500" /> : (
                      <div className="flex items-center justify-end gap-1">
                        {r.status === 'pending' && <><button onClick={() => onUpdateStatus(r.id, 'confirmed')} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50">Confirmer</button><button onClick={() => onUpdateStatus(r.id, 'cancelled')} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">Annuler</button></>}
                        {r.status === 'confirmed' && <><button onClick={() => onUpdateStatus(r.id, 'arrived')} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50">Arrivé</button><button onClick={() => onUpdateStatus(r.id, 'no_show')} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-50">No-show</button></>}
                        {['arrived', 'no_show', 'cancelled', 'refunded'].includes(r.status) && <span className="text-xs text-neutral-300">—</span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <div className="border-t border-neutral-100 px-6 py-3 text-xs text-neutral-400">{reservations.length} réservation{reservations.length > 1 ? 's' : ''}</div>
    </section>
  );
}

function KpiCard({ icon, iconBg, label, value, sub }: { icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md sm:p-5 lg:p-6">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${iconBg}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-neutral-400 sm:text-xs">{label}</div>
          <div className="mt-0.5 truncate font-display text-lg font-bold text-dark sm:text-2xl">{value}</div>
        </div>
      </div>
      <div className="mt-2 truncate text-[11px] text-neutral-400 sm:mt-3 sm:text-xs">{sub}</div>
    </div>
  );
}

function ProInput({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-500">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none" />
    </div>
  );
}

function TagEditor({ label, tags, onChange, suggestions, placeholder }: { label: string; tags: string[]; onChange: (t: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [input, setInput] = useState('');
  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput('');
  };
  const remaining = (suggestions || []).filter((s) => !tags.includes(s));
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-500">{label}</label>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-600">
              {t}
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="text-primary-400 transition hover:text-primary-600">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-4 py-2 text-sm text-dark focus:border-primary-500 focus:outline-none" />
        <button type="button" onClick={() => add(input)} className="shrink-0 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:text-primary-500">Ajouter</button>
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-500 transition hover:border-primary-500/40 hover:text-primary-500">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/*  HELPERS                                            */
/* ─────────────────────────────────────────────────── */

function fmtDateTime(iso: string) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function fmtShort(iso: string) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}`; }

/* ─────────────────────────────────────────────────── */
/*  SVG ICONS                                          */
/* ─────────────────────────────────────────────────── */

function IcoGrid({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>; }
function IcoCalendar({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>; }
function IcoTicket({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" /></svg>; }
function IcoUtensils({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265z" /></svg>; }
function IcoWallet({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>; }
function IcoMegaphone({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg>; }
function IcoGear({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
function IcoTrend({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>; }
function IcoLogout({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>; }
function IcoSearch({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>; }
function IcoAlert({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>; }
function IcoStar({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>; }
function IcoCheck({ className = 'h-[18px] w-[18px]' }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; }
