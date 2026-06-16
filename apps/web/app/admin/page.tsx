'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF } from '@soutra/shared';
import { ReportsTab } from './_components/ReportsTab';
import { ClaimsTab } from './_components/ClaimsTab';
import { SubmissionsTab } from './_components/SubmissionsTab';
import { MonetizationTab } from './_components/MonetizationTab';
import { ModerationTab } from './_components/ModerationTab';
import { SubscriptionsTab } from './_components/SubscriptionsTab';
import { CashbackTab } from './_components/CashbackTab';

// Lazy-load Recharts : sort ~80 kB du bundle initial /admin et ne les charge
// que si l'utilisateur affiche un onglet contenant des charts. Le static
// analysis de next/dynamic exige des options literals (pas de variable
// partagee), c'est pourquoi on duplique l'objet à chaque appel.
const ChartLoader = () => (
  <div className="flex h-[240px] items-center justify-center text-xs text-neutral-600">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-primary-500" />
  </div>
);

const RevenueAreaChart      = dynamic(() => import('./_components/AdminCharts').then(m => m.RevenueAreaChart),      { ssr: false, loading: ChartLoader });
const GenericPie            = dynamic(() => import('./_components/AdminCharts').then(m => m.GenericPie),            { ssr: false, loading: ChartLoader });
const RevenueFeeAreaChart   = dynamic(() => import('./_components/AdminCharts').then(m => m.RevenueFeeAreaChart),   { ssr: false, loading: ChartLoader });
const UserGrowthBar         = dynamic(() => import('./_components/AdminCharts').then(m => m.UserGrowthBar),         { ssr: false, loading: ChartLoader });
const ResaPerDayArea        = dynamic(() => import('./_components/AdminCharts').then(m => m.ResaPerDayArea),        { ssr: false, loading: ChartLoader });
const VenueCategoryBar      = dynamic(() => import('./_components/AdminCharts').then(m => m.VenueCategoryBar),      { ssr: false, loading: ChartLoader });
const RevenueByProviderBar  = dynamic(() => import('./_components/AdminCharts').then(m => m.RevenueByProviderBar),  { ssr: false, loading: ChartLoader });
const UsersByCityBar        = dynamic(() => import('./_components/AdminCharts').then(m => m.UsersByCityBar),        { ssr: false, loading: ChartLoader });

type Tab = 'overview' | 'analytics' | 'users' | 'venues' | 'moderation' | 'subscriptions' | 'cashback' | 'reports' | 'claims' | 'submissions' | 'monetization' | 'transactions' | 'reservations' | 'marketing' | 'security' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: <IcoGrid /> },
  { id: 'analytics', label: 'Analytics', icon: <IcoChart /> },
  { id: 'users', label: 'Utilisateurs', icon: <IcoUsers /> },
  { id: 'venues', label: 'Établissements', icon: <IcoBuilding /> },
  { id: 'moderation', label: 'Modération Pro', icon: <IcoShield /> },
  { id: 'subscriptions', label: 'Abonnements', icon: <IcoCurrency /> },
  { id: 'cashback', label: 'Cashback', icon: <IcoCurrency /> },
  { id: 'reports', label: 'Signalements', icon: <IcoAlert /> },
  { id: 'claims', label: 'Revendications', icon: <IcoAlert /> },
  { id: 'submissions', label: 'Contributions', icon: <IcoBuilding /> },
  { id: 'monetization', label: 'Monétisation', icon: <IcoCurrency /> },
  { id: 'transactions', label: 'Transactions', icon: <IcoCurrency /> },
  { id: 'reservations', label: 'Réservations', icon: <IcoCalendar /> },
  { id: 'marketing', label: 'Marketing', icon: <IcoMegaphone /> },
  { id: 'security', label: 'Sécurité', icon: <IcoShield /> },
  { id: 'settings', label: 'Paramètres', icon: <IcoCog /> },
];

const ROLE_META: Record<string, { label: string; color: string }> = {
  user: { label: 'Utilisateur', color: 'bg-neutral-700 text-neutral-300' },
  venue_owner: { label: 'Propriétaire', color: 'bg-blue-900/50 text-blue-400' },
  organizer: { label: 'Organisateur', color: 'bg-purple-900/50 text-purple-400' },
  staff: { label: 'Staff', color: 'bg-amber-900/50 text-amber-400' },
  admin: { label: 'Admin', color: 'bg-red-900/50 text-red-400' },
};

const KYC_META: Record<string, { label: string; color: string }> = {
  none: { label: 'Non vérifié', color: 'bg-neutral-700 text-neutral-400' },
  pending: { label: 'En attente', color: 'bg-amber-900/50 text-amber-400' },
  verified: { label: 'Vérifié', color: 'bg-emerald-900/50 text-emerald-400' },
  rejected: { label: 'Rejeté', color: 'bg-red-900/50 text-red-400' },
};

const VENUE_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-neutral-700 text-neutral-400' },
  active: { label: 'Actif', color: 'bg-emerald-900/50 text-emerald-400' },
  suspended: { label: 'Suspendu', color: 'bg-red-900/50 text-red-400' },
  closed: { label: 'Fermé', color: 'bg-neutral-700 text-neutral-400' },
};

const TX_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En cours', color: 'bg-amber-900/50 text-amber-400' },
  success: { label: 'Réussi', color: 'bg-emerald-900/50 text-emerald-400' },
  failed: { label: 'Échoué', color: 'bg-red-900/50 text-red-400' },
  reversed: { label: 'Inversé', color: 'bg-purple-900/50 text-purple-400' },
};

const RESA_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-amber-900/50 text-amber-400' },
  confirmed: { label: 'Confirmé', color: 'bg-blue-900/50 text-blue-400' },
  arrived: { label: 'Arrivé', color: 'bg-emerald-900/50 text-emerald-400' },
  no_show: { label: 'No-show', color: 'bg-red-900/50 text-red-400' },
  cancelled: { label: 'Annulé', color: 'bg-neutral-700 text-neutral-400' },
  refunded: { label: 'Remboursé', color: 'bg-purple-900/50 text-purple-400' },
};

// PIE_COLORS et CustomTooltip ont migré vers _components/AdminCharts.tsx
// (extraits avec les charts dans le chunk async Recharts).

/**
 * Next 14 App Router exige qu'un composant qui appelle useSearchParams soit
 * rendu sous une <Suspense> boundary (sinon le build static échoue).
 */
export default function AdminDashboardPage() {
  return (
    <Suspense>
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // L'onglet actif est piloté par ?tab=… (lien depuis la sidebar AppShell,
  // bouton retour navigateur, deep-linking).
  const tabParam = searchParams?.get('tab');
  const tab: Tab = (
    ['overview', 'analytics', 'users', 'venues', 'moderation', 'subscriptions', 'cashback', 'reports', 'claims', 'submissions', 'monetization', 'transactions', 'reservations', 'marketing', 'security', 'settings'] as const
  ).includes(tabParam as Tab) ? (tabParam as Tab) : 'overview';
  const setTab = useCallback((next: Tab) => {
    router.replace(`/admin?tab=${next}`, { scroll: false });
  }, [router]);

  // Niveau d'accès : 'admin' (tous onglets) ou 'moderator' (uniquement
  // l'onglet 'moderation'). Récupéré via la RPC get_admin_access_level
  // qui combine is_admin() et is_moderator() côté serveur (migration 0045).
  const [accessLevel, setAccessLevel] = useState<'admin' | 'moderator'>('admin');
  const isModeratorOnly = accessLevel === 'moderator';

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [kpis, setKpis] = useState({
    users: 0, venues: 0, reservations: 0, transactions: 0,
    revenue: 0, pending: 0, fees: 0, avgTicket: 0,
    newUsersToday: 0, conversionRate: 0, noShowRate: 0,
    activeVenues: 0,
  });

  const [users, setUsers] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [resas, setResas] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [filter1, setFilter1] = useState('all');

  // Marketing state
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState('10');
  const [promoTarget, setPromoTarget] = useState<'all' | 'new' | 'inactive'>('all');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifTarget, setNotifTarget] = useState<'all' | 'venue_owner' | 'user'>('all');
  const [promos, setPromos] = useState<{ code: string; discount: number; target: string; created: string; uses: number }[]>([]);

  // Settings state
  const [commissionRate, setCommissionRate] = useState('5');
  const [minDeposit, setMinDeposit] = useState('1000');
  const [otpExpiry, setOtpExpiry] = useState('60');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [autoApproveVenues, setAutoApproveVenues] = useState(false);
  const [maxResaPerSlot, setMaxResaPerSlot] = useState('10');
  const [supportEmail, setSupportEmail] = useState('support@soutra-paiya.com');
  const [supportPhone, setSupportPhone] = useState('+2250708817409');

  function flash(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const loadAll = useCallback(async () => {
    const [
      { count: userCount },
      { count: venueCount },
      { count: resaCount },
      { count: txCount },
      { data: allTxs },
      { data: allResas },
      { data: allUsers },
      { data: allVenues },
      { data: logs },
    ] = await Promise.all([
      (sb as any).from('profiles').select('*', { count: 'exact', head: true }),
      (sb as any).from('venues').select('*', { count: 'exact', head: true }),
      (sb as any).from('reservations').select('*', { count: 'exact', head: true }),
      (sb as any).from('transactions').select('*', { count: 'exact', head: true }),
      (sb as any).from('transactions').select('id, user_id, type, amount_xof, fee_xof, status, provider, created_at').order('created_at', { ascending: false }).limit(500),
      (sb as any).from('reservations').select('id, user_id, venue_id, date_time, party_size, deposit_xof, status, created_at').order('created_at', { ascending: false }).limit(500),
      (sb as any).from('profiles').select('id, phone, full_name, role, kyc_status, city, created_at').order('created_at', { ascending: false }).limit(500),
      (sb as any).from('venues').select('id, name, category, city, status, rating_avg, rating_count, owner_id, created_at, trust_score, quality_score, activity_score, popularity_score, scores_updated_at').order('created_at', { ascending: false }).limit(500),
      (sb as any).from('audit_events').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    const safeTxs = allTxs || [];
    const safeResas = allResas || [];
    const safeUsers = allUsers || [];
    const safeVenues = allVenues || [];

    const successTxs = safeTxs.filter((t: any) => t.status === 'success');
    const revenue = successTxs.reduce((s: number, t: any) => s + (t.amount_xof || 0), 0);
    const fees = successTxs.reduce((s: number, t: any) => s + (t.fee_xof || 0), 0);
    const avgTicket = successTxs.length > 0 ? Math.round(revenue / successTxs.length) : 0;
    const pendingCount = safeTxs.filter((t: any) => t.status === 'pending').length;

    const today = new Date().toISOString().split('T')[0];
    const newUsersToday = safeUsers.filter((u: any) => u.created_at?.startsWith(today)).length;

    const totalResas = safeResas.length;
    const arrivedResas = safeResas.filter((r: any) => r.status === 'arrived').length;
    const noShowResas = safeResas.filter((r: any) => r.status === 'no_show').length;
    const conversionRate = totalResas > 0 ? Math.round((arrivedResas / totalResas) * 100) : 0;
    const noShowRate = totalResas > 0 ? Math.round((noShowResas / totalResas) * 100) : 0;
    const activeVenues = safeVenues.filter((v: any) => v.status === 'active').length;

    setKpis({
      users: userCount || 0, venues: venueCount || 0,
      reservations: resaCount || 0, transactions: txCount || 0,
      revenue, fees, avgTicket, pending: pendingCount,
      newUsersToday, conversionRate, noShowRate, activeVenues,
    });

    setUsers(safeUsers);
    setVenues(safeVenues);
    setTxs(safeTxs);
    setResas(safeResas);
    setAuditLogs(logs || []);
  }, [sb]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // 1) Niveau d'accès (admin vs moderator) → pilote l'affichage + le
      // chargement des données. Le moderator ne charge pas les KPIs lourds.
      let isMod = false;
      try {
        const { data: lvl } = await (sb.rpc as any)('get_admin_access_level');
        if (lvl && lvl.is_admin === false && lvl.is_moderator === true) {
          isMod = true;
          setAccessLevel('moderator');
        }
      } catch (err) {
        console.error('[admin] get_admin_access_level:', err);
      }

      if (isMod) {
        // Modérateur : forcer l'onglet "moderation" — il n'a accès à rien
        // d'autre via les RLS (ses requêtes loadAll() échoueraient sur la
        // plupart des tables).
        if (tab !== 'moderation') {
          router.replace('/admin?tab=moderation', { scroll: false });
        }
        setLoading(false);
        return;
      }

      await loadAll();
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    setSearch('');
    setFilter1('all');
  }, [tab]);

  // ── ACTIONS ──
  async function updateProfile(id: string, updates: Record<string, string>) {
    setActionLoading(id);
    const { error } = await (sb as any).from('profiles').update(updates).eq('id', id);
    if (error) flash(error.message, false);
    else { flash('Profil mis à jour'); await loadAll(); }
    setActionLoading(null);
  }

  async function updateVenue(id: string, updates: Record<string, string>) {
    setActionLoading(id);
    const { error } = await (sb as any).from('venues').update(updates).eq('id', id);
    if (error) flash(error.message, false);
    else { flash('Établissement mis à jour'); await loadAll(); }
    setActionLoading(null);
  }

  /**
   * Migration 0036 — recalcule les 4 scores (trust/quality/activity/
   * popularity) pour TOUS les venues actifs. Réservé admin via la RPC
   * SECURITY DEFINER `recompute_all_venue_scores`.
   * Lourd : ~50 ms par venue. À utiliser ponctuellement (en attendant un
   * cron Edge Function).
   */
  async function recomputeAllScores() {
    setActionLoading('__scores__');
    const { data, error } = await (sb as any).rpc('recompute_all_venue_scores');
    if (error) flash(error.message, false);
    else { flash(`${(data as any)?.updated ?? 0} venues mis à jour`); await loadAll(); }
    setActionLoading(null);
  }

  async function updateReservation(id: string, updates: Record<string, string>) {
    setActionLoading(id);
    const { error } = await (sb as any).from('reservations').update(updates).eq('id', id);
    if (error) flash(error.message, false);
    else { flash('Réservation mise à jour'); await loadAll(); }
    setActionLoading(null);
  }

  async function logAudit(action: string, details: string) {
    const { data: { user } } = await sb.auth.getUser();
    await (sb as any).from('audit_events').insert({
      user_id: user?.id,
      action,
      details,
      ip_address: '0.0.0.0',
    });
  }

  function createPromo() {
    if (!promoCode.trim()) { flash('Code promo requis', false); return; }
    const newPromo = {
      code: promoCode.toUpperCase(),
      discount: parseInt(promoDiscount),
      target: promoTarget,
      created: new Date().toISOString(),
      uses: 0,
    };
    setPromos((prev) => [newPromo, ...prev]);
    logAudit('promo_created', `Code: ${newPromo.code}, Remise: ${newPromo.discount}%, Cible: ${newPromo.target}`);
    flash(`Promo ${newPromo.code} créée`);
    setPromoCode('');
  }

  function sendNotification() {
    if (!notifTitle.trim() || !notifBody.trim()) { flash('Titre et message requis', false); return; }
    const targetCount = notifTarget === 'all' ? users.length : users.filter((u) => notifTarget === 'venue_owner' ? u.role === 'venue_owner' : u.role === 'user').length;
    logAudit('notification_sent', `Titre: ${notifTitle}, Cible: ${notifTarget} (${targetCount} users)`);
    flash(`Notification envoyée à ${targetCount} utilisateurs`);
    setNotifTitle('');
    setNotifBody('');
  }

  function saveSettings() {
    logAudit('settings_updated', `Commission: ${commissionRate}%, Dépôt min: ${minDeposit} FCFA, Maintenance: ${maintenanceMode}`);
    flash('Paramètres sauvegardés');
  }

  function exportData(type: string) {
    const dataMap: Record<string, any[]> = { users, venues, transactions: txs, reservations: resas };
    const data = dataMap[type] || [];
    if (data.length === 0) { flash('Aucune donnée à exporter', false); return; }
    const csv = [Object.keys(data[0]).join(','), ...data.map((r) => Object.values(r).map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soutra-paiya_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit('data_export', `Type: ${type}, Lignes: ${data.length}`);
    flash(`${data.length} lignes exportées`);
  }

  // ── FILTERS ──
  function filterList<T extends Record<string, any>>(list: T[], nameKey: string, statusKey: string): T[] {
    return list.filter((item) => {
      if (filter1 !== 'all' && item[statusKey] !== filter1) return false;
      if (search) {
        const val = Object.values(item).join(' ').toLowerCase();
        if (!val.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }

  // ── COMPUTED ANALYTICS ──
  const revenueByDay = useMemo(() => {
    const map = new Map<string, { revenue: number; fees: number; count: number }>();
    txs.filter((t) => t.status === 'success').forEach((t) => {
      const day = (t.created_at || '').slice(0, 10);
      if (!day) return;
      const prev = map.get(day) || { revenue: 0, fees: 0, count: 0 };
      map.set(day, { revenue: prev.revenue + (t.amount_xof || 0), fees: prev.fees + (t.fee_xof || 0), count: prev.count + 1 });
    });
    return Array.from(map.entries()).map(([day, v]) => ({ day: fmtShortDate(day), ...v })).sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
  }, [txs]);

  const resaByDay = useMemo(() => {
    const map = new Map<string, number>();
    resas.forEach((r) => { const day = (r.created_at || '').slice(0, 10); if (day) map.set(day, (map.get(day) || 0) + 1); });
    return Array.from(map.entries()).map(([day, count]) => ({ day: fmtShortDate(day), reservations: count })).sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
  }, [resas]);

  const resaStatusPie = useMemo(() => {
    const map = new Map<string, number>();
    resas.forEach((r) => { const s = r.status || 'unknown'; map.set(s, (map.get(s) || 0) + 1); });
    return Array.from(map.entries()).map(([name, value]) => ({ name: RESA_STATUS[name]?.label || name, value }));
  }, [resas]);

  const txStatusPie = useMemo(() => {
    const map = new Map<string, number>();
    txs.forEach((t) => { const s = t.status || 'unknown'; map.set(s, (map.get(s) || 0) + 1); });
    return Array.from(map.entries()).map(([name, value]) => ({ name: TX_STATUS[name]?.label || name, value }));
  }, [txs]);

  const userRolePie = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => { const r = u.role || 'user'; map.set(r, (map.get(r) || 0) + 1); });
    return Array.from(map.entries()).map(([name, value]) => ({ name: ROLE_META[name]?.label || name, value }));
  }, [users]);

  const venueCategoryBar = useMemo(() => {
    const map = new Map<string, number>();
    venues.forEach((v) => { const c = v.category || 'Autre'; map.set(c, (map.get(c) || 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [venues]);

  const topVenues = useMemo(() => [...venues].sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0)).slice(0, 5), [venues]);

  const userGrowth = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => { const day = (u.created_at || '').slice(0, 10); if (day) map.set(day, (map.get(day) || 0) + 1); });
    const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
    let cumul = 0;
    return sorted.map(([day, count]) => { cumul += count; return { day: fmtShortDate(day), nouveaux: count, total: cumul }; });
  }, [users]);

  const revenueByProvider = useMemo(() => {
    const map = new Map<string, number>();
    txs.filter((t) => t.status === 'success').forEach((t) => { const p = t.provider || 'Inconnu'; map.set(p, (map.get(p) || 0) + (t.amount_xof || 0)); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [txs]);

  // Marketing analytics
  const usersByCity = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => { const c = u.city || 'Non renseigné'; map.set(c, (map.get(c) || 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [users]);

  const inactiveUsers = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return users.filter((u) => new Date(u.created_at) < thirtyDaysAgo);
  }, [users]);

  const kycVerifiedPct = useMemo(() => {
    if (users.length === 0) return 0;
    return Math.round((users.filter((u) => u.kyc_status === 'verified').length / users.length) * 100);
  }, [users]);

  // Security analytics
  const suspiciousTxs = useMemo(() => {
    return txs.filter((t) => t.status === 'failed' || t.amount_xof > 500000);
  }, [txs]);

  const failedTxRate = useMemo(() => {
    if (txs.length === 0) return 0;
    return Math.round((txs.filter((t) => t.status === 'failed').length / txs.length) * 100);
  }, [txs]);

  // Health score
  const healthScore = useMemo(() => {
    let score = 50;
    if (kpis.conversionRate > 60) score += 15; else if (kpis.conversionRate > 30) score += 8;
    if (kpis.noShowRate < 10) score += 15; else if (kpis.noShowRate < 25) score += 5;
    if (kpis.activeVenues > 0) score += 10;
    if (kpis.pending === 0) score += 10; else if (kpis.pending < 5) score += 5;
    return Math.min(100, score);
  }, [kpis]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-neutral-950 px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-primary-500" />
          <p className="text-sm text-neutral-500">Chargement du centre de contrôle…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-neutral-950 text-white">
      {toast && (
        <div
          className={`fixed left-1/2 z-[100] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6 sm:translate-x-0 sm:px-5 sm:py-3 ${toast.ok ? 'bg-emerald-600/95' : 'bg-red-600/95'}`}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 70px)' }}
        >
          <span className="text-lg">{toast.ok ? '✓' : '✗'}</span>
          <span className="truncate">{toast.msg}</span>
        </div>
      )}

      {/* Header local — sticky sous la topbar AppShell. Thème dark assumé. */}
      <header
        className="sticky z-20 border-b border-neutral-800/50 bg-neutral-950/85 backdrop-blur-xl"
        style={{ top: 0 }}
      >
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4 lg:px-8 lg:py-5">
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold sm:text-xl">
              {TABS.find((t) => t.id === tab)?.label || 'Admin'}
            </h1>
            <p className="mt-0.5 truncate text-xs text-neutral-500 sm:text-sm">
              Centre de contrôle Soutra-Playce
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={async () => { setLoading(true); await loadAll(); setLoading(false); flash('Données actualisées'); }}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-400 transition hover:border-primary-500/30 hover:text-white sm:px-4"
            >
              <IcoRefresh />
              <span className="hidden xs:inline">Actualiser</span>
            </button>
            <div className="hidden h-8 w-px bg-neutral-800 sm:block" />
            <div className="flex items-center gap-2 text-xs text-neutral-400 sm:text-sm">
              <div className={`h-2 w-2 rounded-full shadow-lg ${maintenanceMode ? 'bg-amber-500 shadow-amber-500/50' : 'bg-emerald-500 shadow-emerald-500/50'}`} />
              <span className="hidden sm:inline">{maintenanceMode ? 'Maintenance' : 'En ligne'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">

          {/* ═══════════ MODÉRATION PRO ═══════════ */}
          {tab === 'moderation' && <ModerationTab />}

          {/* ═══════════ ABONNEMENTS (analytics) ═══════════ */}
          {tab === 'subscriptions' && !isModeratorOnly && <SubscriptionsTab />}

          {/* ═══════════ CASHBACK (analytics) ═══════════ */}
          {tab === 'cashback' && !isModeratorOnly && <CashbackTab />}

          {/* Les onglets ci-dessous ne sont rendus que pour un admin complet.
              Le modérateur est forcé sur 'moderation' dans le useEffect d'init
              et ses RLS bloquent les requêtes ; on coupe le rendu en amont
              pour éviter les erreurs de chargement et les UI vides. */}
          {!isModeratorOnly && (<>

          {/* ═══════════ OVERVIEW ═══════════ */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiCard label="Utilisateurs" value={kpis.users} sub={`+${kpis.newUsersToday} aujourd'hui`} icon={<IcoUsers className="h-5 w-5" />} color="blue" />
                <KpiCard label="Revenus totaux" value={formatXOF(kpis.revenue)} sub={`${formatXOF(kpis.fees)} de frais`} icon={<IcoTrend className="h-5 w-5" />} color="emerald" />
                <KpiCard label="Réservations" value={kpis.reservations} sub={`${kpis.conversionRate}% conversion`} icon={<IcoCalendar className="h-5 w-5" />} color="amber" />
                <KpiCard label="Ticket moyen" value={formatXOF(kpis.avgTicket)} sub={`${kpis.transactions} transactions`} icon={<IcoCurrency className="h-5 w-5" />} color="purple" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <MiniKpi label="Venues actives" value={`${kpis.activeVenues}/${kpis.venues}`} color="emerald" />
                <MiniKpi label="Tx en attente" value={kpis.pending} color={kpis.pending > 0 ? 'red' : 'emerald'} />
                <MiniKpi label="Taux no-show" value={`${kpis.noShowRate}%`} color={kpis.noShowRate > 20 ? 'red' : 'emerald'} />
                <MiniKpi label="Santé" value={`${healthScore}/100`} color={healthScore >= 80 ? 'emerald' : 'amber'} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <ChartCard title="Revenus (30 derniers jours)">
                  {revenueByDay.length > 0 ? <RevenueAreaChart data={revenueByDay} height={240} /> : <EmptyChart />}
                </ChartCard>
                <ChartCard title="Réservations par statut">
                  {resaStatusPie.length > 0 ? <GenericPie data={resaStatusPie} height={240} innerRadius={55} outerRadius={90} /> : <EmptyChart />}
                </ChartCard>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-neutral-400">Navigation rapide</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {(['analytics', 'marketing', 'security', 'settings'] as Tab[]).map((t) => (
                      <button key={t} onClick={() => setTab(t)} className="rounded-xl border border-neutral-800/50 bg-neutral-950/50 px-4 py-3 text-sm font-medium text-neutral-300 transition hover:border-primary-500/30 hover:bg-primary-500/5 hover:text-primary-400 capitalize">{TABS.find((x) => x.id === t)?.label}</button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-neutral-400">Statut plateforme</h3>
                  <div className="space-y-3">
                    <StatusRow label="Base de données" status="Opérationnel" ok />
                    <StatusRow label="Paiements" status="Opérationnel" ok />
                    <StatusRow label="Temps réel" status="Opérationnel" ok />
                    <StatusRow label="Mode maintenance" status={maintenanceMode ? 'Activé' : 'Désactivé'} ok={!maintenanceMode} />
                  </div>
                </div>
              </div>
              {topVenues.length > 0 && (
                <div className="mt-6">
                  <ChartCard title="Top Établissements (par note)">
                    <div className="space-y-3 p-2">
                      {topVenues.map((v, i) => (
                        <div key={v.id} className="flex items-center gap-4">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-neutral-800 text-neutral-500'}`}>{i + 1}</span>
                          <div className="flex-1"><div className="text-sm font-medium">{v.name}</div><div className="text-xs text-neutral-500">{v.category} — {v.city}</div></div>
                          <div className="flex items-center gap-1 font-mono text-sm"><span className="text-amber-400">&#9733; {v.rating_avg || 0}</span><span className="text-neutral-600">({v.rating_count || 0})</span></div>
                          <Badge meta={VENUE_STATUS[v.status]} />
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                </div>
              )}
            </>
          )}

          {/* ═══════════ ANALYTICS ═══════════ */}
          {tab === 'analytics' && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Évolution revenus & frais">
                  {revenueByDay.length > 0 ? <RevenueFeeAreaChart data={revenueByDay} /> : <EmptyChart />}
                </ChartCard>
                <ChartCard title="Croissance utilisateurs">
                  {userGrowth.length > 0 ? <UserGrowthBar data={userGrowth} /> : <EmptyChart />}
                </ChartCard>
                <ChartCard title="Réservations / jour">
                  {resaByDay.length > 0 ? <ResaPerDayArea data={resaByDay} /> : <EmptyChart />}
                </ChartCard>
                <ChartCard title="Statut transactions">
                  {txStatusPie.length > 0 ? <GenericPie data={txStatusPie} height={280} innerRadius={60} outerRadius={95} /> : <EmptyChart />}
                </ChartCard>
                <ChartCard title="Répartition par rôle">
                  {userRolePie.length > 0 ? <GenericPie data={userRolePie} height={280} innerRadius={60} outerRadius={95} /> : <EmptyChart />}
                </ChartCard>
                <ChartCard title="Venues par catégorie">
                  {venueCategoryBar.length > 0 ? <VenueCategoryBar data={venueCategoryBar} /> : <EmptyChart />}
                </ChartCard>
              </div>
              {revenueByProvider.length > 0 && (
                <div className="mt-6">
                  <ChartCard title="Revenus par provider">
                    <RevenueByProviderBar data={revenueByProvider} />
                  </ChartCard>
                </div>
              )}
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <InsightCard title="Conversion" value={`${kpis.conversionRate}%`} desc="des réservations aboutissent" trend={kpis.conversionRate >= 50 ? 'up' : 'down'} color={kpis.conversionRate >= 50 ? 'emerald' : 'red'} />
                <InsightCard title="No-show" value={`${kpis.noShowRate}%`} desc="taux d'absence" trend={kpis.noShowRate <= 15 ? 'up' : 'down'} color={kpis.noShowRate <= 15 ? 'emerald' : 'red'} />
                <InsightCard title="Ticket moyen" value={formatXOF(kpis.avgTicket)} desc="par transaction réussie" trend="up" color="blue" />
              </div>
            </>
          )}

          {/* ═══════════ USERS ═══════════ */}
          {tab === 'users' && (
            <AdminTable searchPlaceholder="Rechercher par nom ou téléphone..." search={search} onSearch={setSearch} filterValue={filter1} onFilter={setFilter1}
              filterOptions={[{ value: 'all', label: 'Tous les rôles' }, { value: 'user', label: 'Utilisateur' }, { value: 'venue_owner', label: 'Propriétaire' }, { value: 'admin', label: 'Admin' }]}
              headers={['Utilisateur', 'Téléphone', 'Rôle', 'KYC', 'Ville', 'Inscription', 'Actions']}
              rows={filterList(users, 'full_name', 'role').map((u) => ({
                key: u.id,
                cells: [
                  <span key="n" className="font-medium">{u.full_name || '—'}</span>,
                  <span key="p" className="font-mono text-xs text-neutral-400">{u.phone || '—'}</span>,
                  <Badge key="r" meta={ROLE_META[u.role]} />,
                  <Badge key="k" meta={KYC_META[u.kyc_status]} />,
                  <span key="c" className="text-neutral-400">{u.city || '—'}</span>,
                  <span key="d" className="text-xs text-neutral-500">{fmtDate(u.created_at)}</span>,
                  <ActionGroup key="a" loading={actionLoading === u.id} actions={[
                    u.kyc_status !== 'verified' && { label: 'Vérifier KYC', cls: 'text-emerald-400 hover:bg-emerald-900/30', fn: () => updateProfile(u.id, { kyc_status: 'verified' }) },
                    u.role !== 'admin' && { label: '→ Admin', cls: 'text-amber-400 hover:bg-amber-900/30', fn: () => updateProfile(u.id, { role: 'admin' }) },
                    u.role !== 'user' && u.role !== 'admin' && { label: '→ User', cls: 'text-neutral-400 hover:bg-neutral-800', fn: () => updateProfile(u.id, { role: 'user' }) },
                  ]} />,
                ],
              }))} total={filterList(users, 'full_name', 'role').length} />
          )}

          {/* ═══════════ VENUES ═══════════ */}
          {tab === 'venues' && (
            <>
              {/* PR Scores — bouton de refresh global des 4 scores */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-3 text-xs">
                <span className="text-neutral-400">
                  <strong className="text-white">Scores</strong> calculés à partir des reviews, signalements et événements
                  des 30 derniers jours (migration 0036).
                </span>
                <button
                  onClick={recomputeAllScores}
                  disabled={actionLoading === '__scores__'}
                  className="rounded-full bg-primary-500/15 px-3 py-1.5 text-xs font-semibold text-primary-300 hover:bg-primary-500/25 disabled:opacity-50"
                >
                  {actionLoading === '__scores__' ? 'Recalcul…' : '⚙ Recalculer tous les scores'}
                </button>
              </div>
              <AdminTable searchPlaceholder="Rechercher un établissement..." search={search} onSearch={setSearch} filterValue={filter1} onFilter={setFilter1}
                filterOptions={[{ value: 'all', label: 'Tous les statuts' }, { value: 'active', label: 'Actif' }, { value: 'draft', label: 'Brouillon' }, { value: 'suspended', label: 'Suspendu' }, { value: 'closed', label: 'Fermé' }]}
                headers={['Établissement', 'Catégorie', 'Ville', 'Note', 'Scores', 'Statut', 'Créé le', 'Actions']}
                rows={filterList(venues, 'name', 'status').map((v) => ({
                  key: v.id,
                  cells: [
                    <span key="n" className="font-medium">{v.name}</span>,
                    <span key="c" className="text-xs capitalize text-neutral-400">{v.category}</span>,
                    <span key="ci" className="text-neutral-400">{v.city}</span>,
                    <span key="r" className="font-mono text-amber-400">&#9733; {v.rating_avg || 0}</span>,
                    <ScoreCluster key="sc" trust={v.trust_score} quality={v.quality_score} activity={v.activity_score} popularity={v.popularity_score} />,
                    <Badge key="s" meta={VENUE_STATUS[v.status]} />,
                    <span key="d" className="text-xs text-neutral-500">{fmtDate(v.created_at)}</span>,
                    <ActionGroup key="a" loading={actionLoading === v.id} actions={[
                      v.status !== 'active' && { label: 'Activer', cls: 'text-emerald-400 hover:bg-emerald-900/30', fn: () => updateVenue(v.id, { status: 'active' }) },
                      v.status === 'active' && { label: 'Suspendre', cls: 'text-red-400 hover:bg-red-900/30', fn: () => updateVenue(v.id, { status: 'suspended' }) },
                      v.status !== 'closed' && { label: 'Fermer', cls: 'text-neutral-400 hover:bg-neutral-800', fn: () => updateVenue(v.id, { status: 'closed' }) },
                    ]} />,
                  ],
                }))} total={filterList(venues, 'name', 'status').length} />
            </>
          )}

          {/* ═══════════ REPORTS (signalements) ═══════════ */}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'claims' && <ClaimsTab />}
          {tab === 'submissions' && <SubmissionsTab />}
          {tab === 'monetization' && <MonetizationTab />}

          {/* ═══════════ TRANSACTIONS ═══════════ */}
          {tab === 'transactions' && (
            <AdminTable searchPlaceholder="Rechercher par type..." search={search} onSearch={setSearch} filterValue={filter1} onFilter={setFilter1}
              filterOptions={[{ value: 'all', label: 'Tous les statuts' }, { value: 'pending', label: 'En cours' }, { value: 'success', label: 'Réussi' }, { value: 'failed', label: 'Échoué' }]}
              headers={['Date', 'Type', 'Montant', 'Frais', 'Provider', 'Statut']}
              rows={filterList(txs, 'type', 'status').map((t) => ({
                key: t.id,
                cells: [
                  <span key="d" className="text-xs text-neutral-400">{fmtDateTime(t.created_at)}</span>,
                  <span key="t" className="rounded bg-neutral-800 px-2 py-0.5 text-xs capitalize">{t.type}</span>,
                  <span key="a" className="font-mono font-medium">{formatXOF(t.amount_xof)}</span>,
                  <span key="f" className="font-mono text-xs text-neutral-500">{formatXOF(t.fee_xof)}</span>,
                  <span key="p" className="text-xs capitalize text-neutral-400">{t.provider || '—'}</span>,
                  <Badge key="s" meta={TX_STATUS[t.status]} />,
                ],
              }))} total={filterList(txs, 'type', 'status').length} />
          )}

          {/* ═══════════ RESERVATIONS ═══════════ */}
          {tab === 'reservations' && (
            <AdminTable searchPlaceholder="Rechercher..." search={search} onSearch={setSearch} filterValue={filter1} onFilter={setFilter1}
              filterOptions={[{ value: 'all', label: 'Tous les statuts' }, { value: 'pending', label: 'En attente' }, { value: 'confirmed', label: 'Confirmé' }, { value: 'arrived', label: 'Arrivé' }, { value: 'no_show', label: 'No-show' }, { value: 'cancelled', label: 'Annulé' }]}
              headers={['Date', 'Personnes', 'Acompte', 'Statut', 'Créé le', 'Actions']}
              rows={filterList(resas, 'venue_id', 'status').map((r) => ({
                key: r.id,
                cells: [
                  <span key="d" className="font-mono text-sm">{fmtDateTime(r.date_time)}</span>,
                  <span key="p" className="font-medium">{r.party_size} pers.</span>,
                  <span key="a" className="font-mono">{formatXOF(r.deposit_xof)}</span>,
                  <Badge key="s" meta={RESA_STATUS[r.status]} />,
                  <span key="c" className="text-xs text-neutral-500">{fmtDate(r.created_at)}</span>,
                  <ActionGroup key="ac" loading={actionLoading === r.id} actions={[
                    r.status === 'pending' && { label: 'Confirmer', cls: 'text-blue-400 hover:bg-blue-900/30', fn: () => updateReservation(r.id, { status: 'confirmed' }) },
                    ['pending', 'confirmed'].includes(r.status) && { label: 'Annuler', cls: 'text-red-400 hover:bg-red-900/30', fn: () => updateReservation(r.id, { status: 'cancelled', cancelled_at: new Date().toISOString() }) },
                  ]} />,
                ],
              }))} total={filterList(resas, 'venue_id', 'status').length} />
          )}

          {/* ═══════════ MARKETING ═══════════ */}
          {tab === 'marketing' && (
            <>
              {/* KPIs Marketing */}
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiCard label="Audience totale" value={users.length} sub={`${users.filter((u) => u.role === 'user').length} clients`} icon={<IcoUsers className="h-5 w-5" />} color="blue" />
                <KpiCard label="KYC vérifié" value={`${kycVerifiedPct}%`} sub={`${users.filter((u) => u.kyc_status === 'verified').length} vérifiés`} icon={<IcoShield className="h-5 w-5" />} color="emerald" />
                <KpiCard label="Inactifs (30j)" value={inactiveUsers.length} sub="à réengager" icon={<IcoAlert className="h-5 w-5" />} color="amber" />
                <KpiCard label="Promos actives" value={promos.length} sub="codes créés" icon={<IcoMegaphone className="h-5 w-5" />} color="purple" />
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                {/* Segments utilisateurs par ville */}
                <ChartCard title="Utilisateurs par ville">
                  {usersByCity.length > 0 ? <UsersByCityBar data={usersByCity.slice(0, 8)} /> : <EmptyChart />}
                </ChartCard>

                {/* Créer un code promo */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-neutral-400">Créer un code promo</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs text-neutral-500">Code</label>
                      <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="BIENVENUE20" className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 font-mono text-sm text-white placeholder-neutral-600 focus:border-primary-500 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-neutral-500">Remise (%)</label>
                        <select value={promoDiscount} onChange={(e) => setPromoDiscount(e.target.value)} className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-primary-500 focus:outline-none">
                          {['5', '10', '15', '20', '25', '30', '50'].map((v) => <option key={v} value={v}>{v}%</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-neutral-500">Cible</label>
                        <select value={promoTarget} onChange={(e) => setPromoTarget(e.target.value as any)} className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-primary-500 focus:outline-none">
                          <option value="all">Tous</option>
                          <option value="new">Nouveaux</option>
                          <option value="inactive">Inactifs</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={createPromo} className="w-full rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600">Créer le code promo</button>
                  </div>
                </div>
              </div>

              {/* Envoyer une notification */}
              <div className="mt-6 rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                <h3 className="mb-4 text-sm font-semibold text-neutral-400">Envoyer une notification</h3>
                <div className="grid gap-4 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Cible</label>
                    <select value={notifTarget} onChange={(e) => setNotifTarget(e.target.value as any)} className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white focus:border-primary-500 focus:outline-none">
                      <option value="all">Tous ({users.length})</option>
                      <option value="venue_owner">Propriétaires ({users.filter((u) => u.role === 'venue_owner').length})</option>
                      <option value="user">Utilisateurs ({users.filter((u) => u.role === 'user').length})</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Titre</label>
                    <input type="text" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="Nouvelle fonctionnalité !" className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-primary-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-500">Message</label>
                    <input type="text" value={notifBody} onChange={(e) => setNotifBody(e.target.value)} placeholder="Découvrez les meilleures venues..." className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-primary-500 focus:outline-none" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={sendNotification} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Envoyer</button>
                  </div>
                </div>
              </div>

              {/* Liste promos créées */}
              {promos.length > 0 && (
                <div className="mt-6 rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
                  <div className="border-b border-neutral-800/50 px-6 py-4"><h3 className="text-sm font-semibold text-neutral-400">Codes promos actifs</h3></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        <th className="px-6 py-3">Code</th><th className="px-6 py-3">Remise</th><th className="px-6 py-3">Cible</th><th className="px-6 py-3">Créé le</th><th className="px-6 py-3">Actions</th>
                      </tr></thead>
                      <tbody>
                        {promos.map((p, i) => (
                          <tr key={i} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                            <td className="px-6 py-3 font-mono font-bold text-primary-400">{p.code}</td>
                            <td className="px-6 py-3 text-emerald-400">{p.discount}%</td>
                            <td className="px-6 py-3 capitalize text-neutral-400">{p.target === 'all' ? 'Tous' : p.target === 'new' ? 'Nouveaux' : 'Inactifs'}</td>
                            <td className="px-6 py-3 text-xs text-neutral-500">{fmtDateTime(p.created)}</td>
                            <td className="px-6 py-3"><button onClick={() => { setPromos((prev) => prev.filter((_, j) => j !== i)); flash('Promo supprimée'); }} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-900/30">Supprimer</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════════ SECURITY ═══════════ */}
          {tab === 'security' && (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <KpiCard label="Événements d'audit" value={auditLogs.length} sub="derniers événements" icon={<IcoShield className="h-5 w-5" />} color="blue" />
                <KpiCard label="Tx suspectes" value={suspiciousTxs.length} sub={`${failedTxRate}% tx échouées`} icon={<IcoAlert className="h-5 w-5" />} color={suspiciousTxs.length > 5 ? 'red' : 'emerald'} />
                <KpiCard label="Admins actifs" value={users.filter((u) => u.role === 'admin').length} sub="comptes admin" icon={<IcoUsers className="h-5 w-5" />} color="amber" />
                <KpiCard label="KYC en attente" value={users.filter((u) => u.kyc_status === 'pending').length} sub="à traiter" icon={<IcoCog className="h-5 w-5" />} color="purple" />
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                {/* Alertes de sécurité */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-neutral-400">Alertes de sécurité</h3>
                  <div className="space-y-3">
                    {suspiciousTxs.length > 0 && (
                      <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                        <IcoAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                        <div><p className="text-sm font-medium text-red-400">{suspiciousTxs.length} transaction(s) suspecte(s)</p><p className="mt-0.5 text-xs text-neutral-500">Transactions échouées ou montant {'>'}500 000 FCFA</p></div>
                      </div>
                    )}
                    {users.filter((u) => u.kyc_status === 'pending').length > 0 && (
                      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <IcoAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                        <div><p className="text-sm font-medium text-amber-400">{users.filter((u) => u.kyc_status === 'pending').length} KYC en attente</p><p className="mt-0.5 text-xs text-neutral-500">Vérifications d'identité à traiter</p></div>
                      </div>
                    )}
                    {venues.filter((v) => v.status === 'suspended').length > 0 && (
                      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <IcoBuilding className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                        <div><p className="text-sm font-medium text-amber-400">{venues.filter((v) => v.status === 'suspended').length} venue(s) suspendue(s)</p><p className="mt-0.5 text-xs text-neutral-500">Établissements à examiner</p></div>
                      </div>
                    )}
                    {suspiciousTxs.length === 0 && users.filter((u) => u.kyc_status === 'pending').length === 0 && venues.filter((v) => v.status === 'suspended').length === 0 && (
                      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <IcoShield className="h-5 w-5 text-emerald-400" />
                        <p className="text-sm font-medium text-emerald-400">Aucune alerte — tout est en ordre</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comptes admin */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-4 text-sm font-semibold text-neutral-400">Comptes administrateurs</h3>
                  <div className="space-y-3">
                    {users.filter((u) => u.role === 'admin').map((u) => (
                      <div key={u.id} className="flex items-center justify-between rounded-xl border border-neutral-800/50 bg-neutral-950/50 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{u.full_name || 'Sans nom'}</p>
                          <p className="font-mono text-xs text-neutral-500">{u.phone}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge meta={KYC_META[u.kyc_status]} />
                          <span className="text-xs text-neutral-500">{fmtDate(u.created_at)}</span>
                        </div>
                      </div>
                    ))}
                    {users.filter((u) => u.role === 'admin').length === 0 && (
                      <p className="text-center text-sm text-neutral-600">Aucun admin trouvé</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Transactions suspectes */}
              {suspiciousTxs.length > 0 && (
                <div className="mt-6 rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
                  <div className="border-b border-neutral-800/50 px-6 py-4">
                    <h3 className="text-sm font-semibold text-neutral-400">Transactions suspectes (échouées ou {'>'} 500 000 FCFA)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        <th className="px-6 py-3">Date</th><th className="px-6 py-3">Type</th><th className="px-6 py-3">Montant</th><th className="px-6 py-3">Provider</th><th className="px-6 py-3">Statut</th><th className="px-6 py-3">Raison</th>
                      </tr></thead>
                      <tbody>
                        {suspiciousTxs.slice(0, 20).map((t) => (
                          <tr key={t.id} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                            <td className="px-6 py-3 text-xs text-neutral-400">{fmtDateTime(t.created_at)}</td>
                            <td className="px-6 py-3 text-xs capitalize">{t.type}</td>
                            <td className="px-6 py-3 font-mono font-medium">{formatXOF(t.amount_xof)}</td>
                            <td className="px-6 py-3 text-xs capitalize text-neutral-400">{t.provider || '—'}</td>
                            <td className="px-6 py-3"><Badge meta={TX_STATUS[t.status]} /></td>
                            <td className="px-6 py-3 text-xs text-neutral-500">{t.status === 'failed' ? 'Échec paiement' : 'Montant élevé'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Journal d'audit */}
              <div className="mt-6 rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
                <div className="border-b border-neutral-800/50 px-6 py-4"><h3 className="text-sm font-semibold text-neutral-400">Journal d'audit</h3></div>
                {auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-neutral-600">Aucun événement d'audit enregistré</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        <th className="px-6 py-3">Date</th><th className="px-6 py-3">Action</th><th className="px-6 py-3">Détails</th><th className="px-6 py-3">IP</th>
                      </tr></thead>
                      <tbody>
                        {auditLogs.slice(0, 50).map((log: any, i: number) => (
                          <tr key={log.id || i} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">
                            <td className="px-6 py-3 text-xs text-neutral-400">{fmtDateTime(log.created_at)}</td>
                            <td className="px-6 py-3"><span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium">{log.action}</span></td>
                            <td className="max-w-xs truncate px-6 py-3 text-xs text-neutral-400">{log.details || '—'}</td>
                            <td className="px-6 py-3 font-mono text-xs text-neutral-500">{log.ip_address || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══════════ SETTINGS ═══════════ */}
          {tab === 'settings' && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Configuration générale */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-5 text-sm font-semibold text-neutral-400">Configuration générale</h3>
                  <div className="space-y-4">
                    <SettingInput label="Taux de commission (%)" value={commissionRate} onChange={setCommissionRate} type="number" />
                    <SettingInput label="Acompte minimum (FCFA)" value={minDeposit} onChange={setMinDeposit} type="number" />
                    <SettingInput label="Expiration OTP (secondes)" value={otpExpiry} onChange={setOtpExpiry} type="number" />
                    <SettingInput label="Max réservations / créneau" value={maxResaPerSlot} onChange={setMaxResaPerSlot} type="number" />
                  </div>
                </div>

                {/* Switches */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-5 text-sm font-semibold text-neutral-400">Options plateforme</h3>
                  <div className="space-y-5">
                    <SettingToggle label="Mode maintenance" desc="Désactive l'accès public à la plateforme" checked={maintenanceMode} onChange={setMaintenanceMode} danger />
                    <SettingToggle label="Approbation auto des venues" desc="Les nouvelles venues sont actives immédiatement" checked={autoApproveVenues} onChange={setAutoApproveVenues} />
                  </div>
                </div>

                {/* Contact support */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-5 text-sm font-semibold text-neutral-400">Contact support</h3>
                  <div className="space-y-4">
                    <SettingInput label="Email support" value={supportEmail} onChange={setSupportEmail} />
                    <SettingInput label="Téléphone support" value={supportPhone} onChange={setSupportPhone} />
                  </div>
                </div>

                {/* Export de données */}
                <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                  <h3 className="mb-5 text-sm font-semibold text-neutral-400">Export de données (CSV)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Utilisateurs', key: 'users', count: users.length },
                      { label: 'Établissements', key: 'venues', count: venues.length },
                      { label: 'Transactions', key: 'transactions', count: txs.length },
                      { label: 'Réservations', key: 'reservations', count: resas.length },
                    ].map((item) => (
                      <button key={item.key} onClick={() => exportData(item.key)}
                        className="flex items-center justify-between rounded-xl border border-neutral-800/50 bg-neutral-950/50 px-4 py-3 text-sm transition hover:border-primary-500/30 hover:bg-primary-500/5">
                        <span className="font-medium text-neutral-300">{item.label}</span>
                        <span className="text-xs text-neutral-500">{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Statistiques DB */}
              <div className="mt-6 rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6">
                <h3 className="mb-4 text-sm font-semibold text-neutral-400">Statistiques de la base de données</h3>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  {[
                    { label: 'Profiles', value: users.length },
                    { label: 'Venues', value: venues.length },
                    { label: 'Transactions', value: txs.length },
                    { label: 'Réservations', value: resas.length },
                    { label: 'Audit logs', value: auditLogs.length },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-neutral-800/50 bg-neutral-950/50 p-4 text-center">
                      <p className="text-xs text-neutral-500">{s.label}</p>
                      <p className="mt-1 font-display text-2xl font-bold">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <div className="mt-6 flex justify-end">
                <button onClick={saveSettings} className="rounded-xl bg-primary-500 px-8 py-3 text-sm font-semibold text-white transition hover:bg-primary-600">
                  Sauvegarder les paramètres
                </button>
              </div>
            </>
          )}

          </>)}

        </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── */
/*  COMPONENTS                                         */
/* ─────────────────────────────────────────────────── */

const COLOR_MAP: Record<string, { bg: string; text: string; ring: string }> = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', ring: 'ring-blue-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', ring: 'ring-purple-500/20' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/20' },
};

function KpiCard({ label, value, sub, icon, color }: { label: string; value: number | string; sub: string; icon: React.ReactNode; color: string }) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="group rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 transition-all hover:border-neutral-700/50 hover:shadow-lg hover:shadow-black/20 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-neutral-500 sm:text-xs">{label}</p>
          <p className="mt-1 truncate font-display text-lg font-bold tracking-tight sm:mt-1.5 sm:text-2xl">{value}</p>
          <p className={`mt-1 truncate text-[11px] ${c.text} sm:text-xs`}>{sub}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${c.bg} ${c.text} ring-1 ${c.ring}`}>{icon}</div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-neutral-800/50 bg-neutral-900/30 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
      <div className={`h-2 w-2 shrink-0 rounded-full ${c.text.replace('text-', 'bg-')}`} />
      <span className="truncate text-[11px] text-neutral-500 sm:text-xs">{label}</span>
      <span className={`ml-auto text-xs font-bold sm:text-sm ${c.text}`}>{value}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-6"><h3 className="mb-4 text-sm font-semibold text-neutral-400">{title}</h3>{children}</div>;
}

function EmptyChart() {
  return <div className="flex h-[240px] items-center justify-center text-neutral-600"><div className="text-center"><IcoChart className="mx-auto mb-2 h-8 w-8 opacity-30" /><p className="text-xs">Pas assez de données</p></div></div>;
}

function InsightCard({ title, value, desc, trend, color }: { title: string; value: string; desc: string; trend: 'up' | 'down'; color: string }) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-5">
      <div className="flex items-center justify-between"><span className="text-xs font-medium text-neutral-500">{title}</span><span className={`text-lg ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>{trend === 'up' ? '↑' : '↓'}</span></div>
      <p className={`mt-2 font-display text-3xl font-bold ${c.text}`}>{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{desc}</p>
    </div>
  );
}

function StatusRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-neutral-300">{label}</span>
      <span className={`flex items-center gap-2 text-xs font-medium ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' : 'bg-amber-400 shadow-lg shadow-amber-500/50'}`} />{status}
      </span>
    </div>
  );
}

function SettingInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-500">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white transition focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30" />
    </div>
  );
}

function SettingToggle({ label, desc, checked, onChange, danger }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div><p className="text-sm font-medium text-neutral-300">{label}</p><p className="text-xs text-neutral-500">{desc}</p></div>
      <button onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? (danger ? 'bg-red-500' : 'bg-primary-500') : 'bg-neutral-700'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function AdminTable({ searchPlaceholder, search, onSearch, filterValue, onFilter, filterOptions, headers, rows, total }: {
  searchPlaceholder: string; search: string; onSearch: (v: string) => void; filterValue: string; onFilter: (v: string) => void;
  filterOptions: { value: string; label: string }[]; headers: string[]; rows: { key: string; cells: React.ReactNode[] }[]; total: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50">
      <div className="flex flex-col gap-4 border-b border-neutral-800/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <IcoSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input type="text" placeholder={searchPlaceholder} value={search} onChange={(e) => onSearch(e.target.value)} className="w-72 rounded-xl border border-neutral-800/50 bg-neutral-950 py-2.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 transition focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30" />
        </div>
        <select value={filterValue} onChange={(e) => onFilter(e.target.value)} className="rounded-xl border border-neutral-800/50 bg-neutral-950 px-4 py-2.5 text-sm text-white transition focus:border-primary-500 focus:outline-none">
          {filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="py-16 text-center text-neutral-600">Aucun résultat</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-neutral-800/50 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{headers.map((h) => <th key={h} className="px-6 py-3">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key} className="border-b border-neutral-800/30 transition hover:bg-neutral-800/20">{r.cells.map((cell, i) => <td key={i} className="px-6 py-3.5">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="border-t border-neutral-800/50 px-6 py-3 text-xs text-neutral-600">{total} résultat{total > 1 ? 's' : ''}</div>
    </div>
  );
}

function Badge({ meta }: { meta?: { label: string; color: string } }) {
  if (!meta) return <span className="text-neutral-600">—</span>;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>;
}

function ActionGroup({ loading, actions }: { loading: boolean; actions: (false | undefined | { label: string; cls: string; fn: () => void })[] }) {
  const valid = actions.filter(Boolean) as { label: string; cls: string; fn: () => void }[];
  if (loading) return <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-primary-500" />;
  if (valid.length === 0) return <span className="text-neutral-700">—</span>;
  return <div className="flex gap-1">{valid.map((a) => <button key={a.label} onClick={a.fn} className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${a.cls}`}>{a.label}</button>)}</div>;
}

/**
 * Cluster compact des 4 scores d'un venue (PR 8 / migration 0036).
 * Affiche popularity en grand (mis en avant) + 3 petites pills colorées
 * pour trust / quality / activity. Tooltip natif via `title`.
 */
function ScoreCluster({
  trust, quality, activity, popularity,
}: { trust?: number; quality?: number; activity?: number; popularity?: number }) {
  const pop = popularity ?? 0;
  const popColor = pop >= 70 ? 'text-emerald-300' : pop >= 40 ? 'text-amber-300' : 'text-neutral-400';
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`font-mono text-sm font-bold ${popColor}`}
        title={`Popularité ${pop}/100\nQualité ${quality ?? 0} · Confiance ${trust ?? 0} · Activité ${activity ?? 0}`}
      >
        {pop}
      </span>
      <div className="flex gap-0.5">
        <ScoreDot value={trust} label="C" />
        <ScoreDot value={quality} label="Q" />
        <ScoreDot value={activity} label="A" />
      </div>
    </div>
  );
}

function ScoreDot({ value, label }: { value?: number; label: string }) {
  const v = value ?? 0;
  const bg = v >= 70 ? 'bg-emerald-500/15 text-emerald-300' : v >= 40 ? 'bg-amber-500/15 text-amber-300' : 'bg-neutral-700/40 text-neutral-400';
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${bg}`} title={`${label} : ${v}/100`}>
      {label}
    </span>
  );
}

/* ─────────────────────────────────────────────────── */
/*  HELPERS                                            */
/* ─────────────────────────────────────────────────── */

function fmtDate(iso: string) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(iso: string) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function fmtShortDate(iso: string) { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }

/* ─────────────────────────────────────────────────── */
/*  SVG ICONS                                          */
/* ─────────────────────────────────────────────────── */

function IcoGrid({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>;
}
function IcoChart({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
}
function IcoUsers({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
}
function IcoBuilding({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" /></svg>;
}
function IcoCurrency({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IcoCalendar({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>;
}
function IcoTrend({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>;
}
function IcoMegaphone({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg>;
}
function IcoShield({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
}
function IcoCog({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function IcoAlert({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>;
}
function IcoRefresh({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.355v4.992" /></svg>;
}
function IcoSearch({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
}
function IcoLock({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>;
}
function IcoLogout({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>;
}
