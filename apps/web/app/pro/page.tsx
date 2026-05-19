'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF, slugify } from '@soutra/shared';

type Tab = 'dashboard' | 'reservations' | 'events' | 'menu' | 'finances' | 'marketing' | 'settings';
type ResStatus = 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled' | 'refunded';

interface Venue { id: string; name: string; category: string; city: string; address: string; phone: string; status: string; rating_avg: number; rating_count: number; description: string; }
interface Reservation { id: string; user_id: string; venue_id: string; date_time: string; party_size: number; deposit_xof: number; status: ResStatus; notes: string | null; created_at: string; customer_name: string | null; customer_phone: string | null; }

const STATUS_META: Record<ResStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'En attente', color: 'text-amber-700', bg: 'bg-amber-50' },
  confirmed: { label: 'Confirmé', color: 'text-blue-700', bg: 'bg-blue-50' },
  arrived: { label: 'Arrivé', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  no_show: { label: 'No-show', color: 'text-red-700', bg: 'bg-red-50' },
  cancelled: { label: 'Annulé', color: 'text-neutral-600', bg: 'bg-neutral-100' },
  refunded: { label: 'Remboursé', color: 'text-purple-700', bg: 'bg-purple-50' },
};

const SIDEBAR: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <IcoGrid /> },
  { id: 'reservations', label: 'Réservations', icon: <IcoCalendar /> },
  { id: 'events', label: 'Événements', icon: <IcoTicket /> },
  { id: 'menu', label: 'Menu', icon: <IcoUtensils /> },
  { id: 'finances', label: 'Finances', icon: <IcoWallet /> },
  { id: 'marketing', label: 'Marketing', icon: <IcoMegaphone /> },
  { id: 'settings', label: 'Paramètres', icon: <IcoGear /> },
];

// Catégories d'établissement — valeurs de l'enum venue_category (migration 0013).
const VENUE_CATEGORIES: { v: string; l: string }[] = [
  { v: 'maquis', l: 'Maquis' },
  { v: 'restaurant', l: 'Restaurant' },
  { v: 'bar', l: 'Bar' },
  { v: 'lounge', l: 'Lounge' },
  { v: 'club', l: 'Club / Boîte de nuit' },
  { v: 'hotel', l: 'Hôtel' },
  { v: 'cafe', l: 'Café' },
  { v: 'sport', l: 'Complexe sportif' },
  { v: 'beach', l: 'Plage privée' },
  { v: 'event_space', l: 'Espace événementiel' },
];

export default function ProDashboard() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('dashboard');
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

  // Events state
  const [events, setEvents] = useState<any[]>([]);
  const [evtName, setEvtName] = useState('');
  const [evtDate, setEvtDate] = useState('');
  const [evtPrice, setEvtPrice] = useState('');
  const [evtCapacity, setEvtCapacity] = useState('');
  const [evtDesc, setEvtDesc] = useState('');

  // Menu state
  const [menuItems, setMenuItems] = useState<{ id: string; name: string; category: string; price: number; available: boolean }[]>([]);
  const [menuName, setMenuName] = useState('');
  const [menuCat, setMenuCat] = useState('Entrée');
  const [menuPrice, setMenuPrice] = useState('');

  // Finances state
  const [txs, setTxs] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);

  // Marketing state
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('10');
  const [promos, setPromos] = useState<{ code: string; discount: number; created: string }[]>([]);

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

    const { data: ownedVenues } = await (supabase as any).from('venues').select('id, name, category, city, address, phone, status, rating_avg, rating_count, description').eq('owner_id', user.id);

    if (ownedVenues && ownedVenues.length > 0) {
      setVenues(ownedVenues as Venue[]);
      setSelectedVenueId(ownedVenues[0].id);
      const v = ownedVenues[0];
      setSettingsName(v.name || '');
      setSettingsCity(v.city || '');
      setSettingsAddress(v.address || '');
      setSettingsPhone(v.phone || '');
      setSettingsDesc(v.description || '');
      setSettingsCategory(v.category || '');
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
    const { data } = await (supabase as any).from('events').select('*').eq('venue_id', venueId).order('date_time', { ascending: false }).limit(100);
    setEvents(data || []);
  }, [supabase]);

  const loadTxs = useCallback(async () => {
    const { data } = await (supabase as any).from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    setTxs(data || []);
  }, [supabase, userId]);

  useEffect(() => {
    if (!selectedVenueId || loading) return;
    loadReservations(selectedVenueId);
    loadEvents(selectedVenueId);
    if (userId) loadTxs();
  }, [selectedVenueId, loading]);

  useEffect(() => {
    if (!selectedVenueId) return;
    const channel = supabase.channel('pro-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `venue_id=eq.${selectedVenueId}` }, () => { loadReservations(selectedVenueId); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedVenueId, supabase, loadReservations]);

  // When venue changes, update settings
  useEffect(() => {
    const v = venues.find((x) => x.id === selectedVenueId);
    if (v) { setSettingsName(v.name || ''); setSettingsCity(v.city || ''); setSettingsAddress(v.address || ''); setSettingsPhone(v.phone || ''); setSettingsDesc(v.description || ''); setSettingsCategory(v.category || ''); }
  }, [selectedVenueId, venues]);

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
    if (!evtName || !evtDate) { flash('Nom et date requis', 'error'); return; }
    const { error } = await (supabase as any).from('events').insert({ venue_id: selectedVenueId, title: evtName, date_time: evtDate, price_xof: parseInt(evtPrice) || 0, capacity: parseInt(evtCapacity) || 50, description: evtDesc, status: 'published' });
    if (error) flash(error.message, 'error');
    else { flash('Événement créé'); setEvtName(''); setEvtDate(''); setEvtPrice(''); setEvtCapacity(''); setEvtDesc(''); await loadEvents(selectedVenueId); }
  }

  function addMenuItem() {
    if (!menuName || !menuPrice) { flash('Nom et prix requis', 'error'); return; }
    setMenuItems((prev) => [{ id: crypto.randomUUID(), name: menuName, category: menuCat, price: parseInt(menuPrice), available: true }, ...prev]);
    flash('Article ajouté');
    setMenuName(''); setMenuPrice('');
  }

  function createPromo() {
    if (!promoCode) { flash('Code requis', 'error'); return; }
    setPromos((prev) => [{ code: promoCode.toUpperCase(), discount: parseInt(promoDiscount), created: new Date().toISOString() }, ...prev]);
    flash(`Promo ${promoCode.toUpperCase()} créée`);
    setPromoCode('');
  }

  async function saveSettings() {
    const { error } = await (supabase as any).from('venues').update({ name: settingsName, city: settingsCity, address: settingsAddress, phone: settingsPhone, description: settingsDesc, category: settingsCategory }).eq('id', selectedVenueId);
    if (error) flash(error.message, 'error');
    else { flash('Paramètres sauvegardés'); const { data } = await (supabase as any).from('venues').select('id, name, category, city, address, phone, status, rating_avg, rating_count, description').eq('owner_id', userId); if (data) setVenues(data); }
  }

  async function createVenue() {
    if (!nv.name.trim() || !nv.address.trim()) { flash('Nom et adresse requis', 'error'); return; }
    setCreating(true);
    const slug = `${slugify(nv.name)}-${Math.random().toString(36).slice(2, 7)}`;
    const { error } = await (supabase as any).from('venues').insert({
      owner_id: userId,
      name: nv.name.trim(),
      slug,
      category: nv.category,
      city: nv.city.trim() || 'Abidjan',
      address: nv.address.trim(),
      phone: nv.phone.trim() || null,
      whatsapp: nv.whatsapp.trim() || null,
      description: nv.description.trim() || null,
      status: 'draft',
    });
    setCreating(false);
    if (error) { flash(error.message, 'error'); return; }
    flash('Établissement créé — en attente de validation');
    await loadInitialData();
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
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500" /><p className="mt-4 text-sm text-neutral-500">Chargement du dashboard...</p></div></div>;
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {toast && (
        <div className={`fixed right-6 top-6 z-[100] flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <span>{toast.type === 'success' ? '✓' : '✗'}</span>{toast.message}
        </div>
      )}

      {/* ════════ SIDEBAR ════════ */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-dark">
        <div className="flex items-center gap-2 border-b border-neutral-800 px-6 py-5">
          <Link href="/" className="font-display text-lg font-bold"><span className="text-white">Soutra</span><span className="text-primary-400">-Paiya</span></Link>
          <span className="ml-auto rounded-md bg-primary-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-400">Pro</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {SIDEBAR.map((item) => (
            <button key={item.id} onClick={() => { setTab(item.id); setSearch(''); setStatusFilter('all'); }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${tab === item.id ? 'bg-primary-500/15 text-primary-400' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-neutral-800 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">{userName.charAt(0).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{userName}</div><div className="text-xs text-neutral-500">Propriétaire</div></div>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} title="Se déconnecter" className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-800 hover:text-white"><IcoLogout /></button>
          </div>
        </div>
      </aside>

      {/* ════════ MAIN ════════ */}
      <div className="ml-64 flex-1">
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-8 py-5">
            <div><h1 className="font-display text-xl font-bold text-dark">Bonjour, {userName.split(' ')[0]}</h1><p className="mt-0.5 text-sm capitalize text-neutral-400">{today}</p></div>
            <div className="flex items-center gap-3">
              {venues.length > 1 && (
                <select value={selectedVenueId} onChange={(e) => setSelectedVenueId(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-dark transition focus:border-primary-500 focus:outline-none">
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              {venues.length === 1 && <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-dark">{venues[0].name}</div>}
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Création d'établissement (aucun venue rattaché) */}
          {venues.length === 0 && (
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-50"><IcoGrid className="h-8 w-8 text-primary-500" /></div>
                <h2 className="mt-4 font-display text-2xl font-bold text-dark">Crée ton établissement</h2>
                <p className="mt-1 text-sm text-neutral-500">Renseigne les infos de base — tu pourras tout compléter ensuite dans Paramètres.</p>
              </div>
              <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6">
                <ProInput label="Nom de l'établissement" value={nv.name} onChange={(v) => setNv((p) => ({ ...p, name: v }))} placeholder="Le Maquis du Coin" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-500">Catégorie</label>
                    <select value={nv.category} onChange={(e) => setNv((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                      {VENUE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
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
                <p className="text-center text-xs text-neutral-400">Ton établissement sera vérifié par l&apos;équipe Soutra-Paiya avant d&apos;apparaître dans l&apos;application.</p>
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

                  {/* Quick nav */}
                  <div className="mb-6 grid grid-cols-3 gap-3 lg:grid-cols-6">
                    {SIDEBAR.filter((s) => s.id !== 'dashboard').map((s) => (
                      <button key={s.id} onClick={() => setTab(s.id)} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-600 transition hover:border-primary-500/30 hover:text-primary-500">{s.label}</button>
                    ))}
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
                        <ProInput label="Date et heure" value={evtDate} onChange={setEvtDate} type="datetime-local" />
                        <div className="grid grid-cols-2 gap-3">
                          <ProInput label="Prix (FCFA)" value={evtPrice} onChange={setEvtPrice} type="number" placeholder="5000" />
                          <ProInput label="Capacité" value={evtCapacity} onChange={setEvtCapacity} type="number" placeholder="50" />
                        </div>
                        <ProInput label="Description" value={evtDesc} onChange={setEvtDesc} placeholder="Décrivez l'événement..." />
                        <button onClick={createEvent} className="btn-primary w-full">Créer l'événement</button>
                      </div>
                    </div>

                    {/* Events list */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Mes événements ({events.length})</h3>
                      {events.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400">Aucun événement créé</div>
                      ) : (
                        <div className="space-y-3">
                          {events.map((e: any) => (
                            <div key={e.id} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 transition hover:shadow-sm">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-dark">{e.title}</p>
                                  <p className="mt-1 text-xs text-neutral-500">{fmtDateTime(e.date_time)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-mono text-sm font-medium text-primary-600">{formatXOF(e.price_xof || 0)}</p>
                                  <p className="text-xs text-neutral-400">{e.capacity || 0} places</p>
                                </div>
                              </div>
                              {e.description && <p className="mt-2 text-xs text-neutral-500">{e.description}</p>}
                              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${e.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>{e.status === 'published' ? 'Publié' : e.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
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
                        <button onClick={addMenuItem} className="btn-primary w-full">Ajouter au menu</button>
                      </div>
                    </div>

                    {/* Menu list */}
                    <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Menu ({menuItems.length} articles)</h3>
                      {menuItems.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400">Aucun article dans le menu</div>
                      ) : (
                        <div className="space-y-4">
                          {menuCategories.map((cat) => (
                            <div key={cat}>
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{cat}</h4>
                              <div className="space-y-2">
                                {menuItems.filter((m) => m.category === cat).map((item) => (
                                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <button onClick={() => setMenuItems((prev) => prev.map((m) => m.id === item.id ? { ...m, available: !m.available } : m))}
                                        className={`h-3 w-3 rounded-full ${item.available ? 'bg-emerald-500' : 'bg-neutral-300'}`} title={item.available ? 'Disponible' : 'Indisponible'} />
                                      <span className={`text-sm font-medium ${item.available ? 'text-dark' : 'text-neutral-400 line-through'}`}>{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-sm font-medium text-primary-600">{formatXOF(item.price)}</span>
                                      <button onClick={() => setMenuItems((prev) => prev.filter((m) => m.id !== item.id))} className="rounded-lg p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-500">
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

              {/* ═══════════ FINANCES ═══════════ */}
              {tab === 'finances' && (
                <>
                  <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <KpiCard icon={<IcoWallet className="h-5 w-5" />} iconBg="bg-emerald-50 text-emerald-600" label="Solde wallet" value={formatXOF(walletBalance)} sub="disponible" />
                    <KpiCard icon={<IcoTrend className="h-5 w-5" />} iconBg="bg-blue-50 text-blue-600" label="Revenus acomptes" value={formatXOF(revenue)} sub="confirmés + arrivés" />
                    <KpiCard icon={<IcoCalendar className="h-5 w-5" />} iconBg="bg-amber-50 text-amber-600" label="Transactions" value={String(txs.length)} sub="historique" />
                    <KpiCard icon={<IcoStar className="h-5 w-5" />} iconBg="bg-purple-50 text-purple-600" label="Revenus événements" value={formatXOF(events.reduce((s: number, e: any) => s + (e.price_xof || 0), 0))} sub={`${events.length} événements`} />
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
                    <KpiCard icon={<IcoMegaphone className="h-5 w-5" />} iconBg="bg-purple-50 text-purple-600" label="Promos actives" value={String(promos.length)} sub="codes créés" />
                    <KpiCard icon={<IcoTrend className="h-5 w-5" />} iconBg="bg-emerald-50 text-emerald-600" label="Taux conversion" value={`${reservations.length > 0 ? Math.round((reservations.filter((r) => r.status === 'arrived').length / reservations.length) * 100) : 0}%`} sub="arrivés / total" />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Create promo */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Créer un code promo</h3>
                      <div className="space-y-4">
                        <ProInput label="Code promo" value={promoCode} onChange={(v) => setPromoCode(v.toUpperCase())} placeholder="ETE2026" />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Remise (%)</label>
                          <select value={promoDiscount} onChange={(e) => setPromoDiscount(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                            {['5', '10', '15', '20', '25', '30', '50'].map((v) => <option key={v} value={v}>{v}%</option>)}
                          </select>
                        </div>
                        <button onClick={createPromo} className="btn-primary w-full">Créer le code</button>
                      </div>
                    </div>

                    {/* Promo list */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-4 font-display text-lg font-bold text-dark">Codes promos actifs</h3>
                      {promos.length === 0 ? (
                        <div className="py-12 text-center text-neutral-400">Aucun code promo</div>
                      ) : (
                        <div className="space-y-2">
                          {promos.map((p, i) => (
                            <div key={i} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                              <div><p className="font-mono font-bold text-primary-600">{p.code}</p><p className="text-xs text-neutral-400">{fmtDateTime(p.created)}</p></div>
                              <div className="flex items-center gap-3">
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">-{p.discount}%</span>
                                <button onClick={() => { setPromos((prev) => prev.filter((_, j) => j !== i)); flash('Promo supprimée'); }} className="rounded-lg p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            </div>
                          ))}
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
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-5 font-display text-lg font-bold text-dark">Informations générales</h3>
                      <div className="space-y-4">
                        <ProInput label="Nom de l'établissement" value={settingsName} onChange={setSettingsName} />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Catégorie</label>
                          <select value={settingsCategory} onChange={(e) => setSettingsCategory(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none">
                            {VENUE_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                          </select>
                        </div>
                        <ProInput label="Ville" value={settingsCity} onChange={setSettingsCity} />
                        <ProInput label="Adresse" value={settingsAddress} onChange={setSettingsAddress} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                      <h3 className="mb-5 font-display text-lg font-bold text-dark">Contact & description</h3>
                      <div className="space-y-4">
                        <ProInput label="Téléphone" value={settingsPhone} onChange={setSettingsPhone} />
                        <div>
                          <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
                          <textarea value={settingsDesc} onChange={(e) => setSettingsDesc(e.target.value)} rows={4}
                            className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none" placeholder="Décrivez votre établissement..." />
                        </div>
                      </div>
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
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
        <div className="min-w-0 flex-1"><div className="text-xs font-medium text-neutral-400">{label}</div><div className="mt-0.5 truncate font-display text-2xl font-bold text-dark">{value}</div></div>
      </div>
      <div className="mt-3 text-xs text-neutral-400">{sub}</div>
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
