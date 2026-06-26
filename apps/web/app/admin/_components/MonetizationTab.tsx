'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { formatXOF, VENUE_CATEGORIES, VENUE_CATEGORY_GROUPS, type VenueCategoryGroup } from '@soutra/shared';

// ============================================================================
// Super Dashboard Monétisation — onglet /admin?tab=monetization
//
// Sous-onglets internes :
//   - rules     : liste + édition inline des règles (18 paramètres)
//   - dashboard : KPIs + breakdowns revenus
//   - campaigns : promotions temporaires sur commissions
//   - targets   : objectifs financiers par mois
// ============================================================================

type Section = 'rules' | 'dashboard' | 'campaigns' | 'targets';

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  category: string | null;
  city: string | null;
  commune: string | null;
  subscription_tier: string | null;
  volume_tier: string | null;
  valid_from: string | null;
  valid_until: string | null;
  commission_reservation_pct: number | null;
  commission_reservation_fixed_xof: number | null;
  service_fee_pct: number | null;
  service_fee_fixed_xof: number | null;
  commission_payment_pct: number | null;
  commission_subscription_pct: number | null;
  commission_ticket_pct: number | null;
  commission_marketplace_pct: number | null;
  commission_affiliation_pct: number | null;
  cashback_user_pct: number | null;
  loyalty_bonus_pct: number | null;
  featured_listing_xof: number | null;
  advertising_xof: number | null;
  account_verification_xof: number | null;
  venue_certification_xof: number | null;
  event_publication_xof: number | null;
  promo_publication_xof: number | null;
}

const PCT_FIELDS: (keyof RuleRow)[] = [
  'commission_reservation_pct',
  'service_fee_pct',
  'commission_payment_pct',
  'commission_subscription_pct',
  'commission_ticket_pct',
  'commission_marketplace_pct',
  'commission_affiliation_pct',
  'cashback_user_pct',
  'loyalty_bonus_pct',
];
const XOF_FIELDS: (keyof RuleRow)[] = [
  'commission_reservation_fixed_xof',
  'service_fee_fixed_xof',
  'featured_listing_xof',
  'advertising_xof',
  'account_verification_xof',
  'venue_certification_xof',
  'event_publication_xof',
  'promo_publication_xof',
];

const FIELD_LABELS: Record<string, string> = {
  commission_reservation_pct: 'Commission réservation',
  commission_reservation_fixed_xof: 'Commission réservation fixe',
  service_fee_pct: 'Frais de service',
  service_fee_fixed_xof: 'Frais de service fixes',
  commission_payment_pct: 'Commission paiement',
  commission_subscription_pct: 'Commission abonnement',
  commission_ticket_pct: 'Commission billetterie',
  commission_marketplace_pct: 'Commission marketplace',
  commission_affiliation_pct: 'Commission affiliation',
  cashback_user_pct: 'Cashback utilisateur',
  loyalty_bonus_pct: 'Bonus fidélité',
  featured_listing_xof: 'Frais mise en avant',
  advertising_xof: 'Frais publicitaires',
  account_verification_xof: 'Frais vérification compte',
  venue_certification_xof: 'Frais certification venue',
  event_publication_xof: 'Frais publication événement',
  promo_publication_xof: 'Frais publication promo',
};

const SUBSCRIPTION_TIERS = ['free', 'basic', 'pro', 'premium', 'enterprise'] as const;
const VOLUME_TIERS = ['nano', 'micro', 'small', 'medium', 'large', 'xlarge'] as const;
const GROUP_ORDER: VenueCategoryGroup[] = [
  'restauration', 'hebergement', 'loisirs', 'sport',
  'commerce', 'education', 'sante', 'services', 'tourisme', 'autres',
];

export function MonetizationTab() {
  const [section, setSection] = useState<Section>('rules');

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { id: 'rules' as const,     label: 'Règles & paramètres', icon: '⚙️' },
          { id: 'dashboard' as const, label: 'Dashboard revenus',   icon: '📊' },
          { id: 'campaigns' as const, label: 'Campagnes temporaires', icon: '🎯' },
          { id: 'targets' as const,   label: 'Objectifs financiers', icon: '🏁' },
        ].map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-primary-500 bg-primary-500/15 text-primary-400'
                  : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              {s.icon} {s.label}
            </button>
          );
        })}
      </div>

      {section === 'rules' && <RulesSection />}
      {section === 'dashboard' && <DashboardSection />}
      {section === 'campaigns' && <CampaignsSection />}
      {section === 'targets' && <TargetsSection />}
    </div>
  );
}

// ============================================================================
// SECTION 1 : RULES — édition des règles par catégorie / contexte
// ============================================================================

function RulesSection() {
  const sb = supabaseBrowser();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('');
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (sb as any)
        .from('monetization_rules_view')
        .select('*')
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) { console.error('[monetization] rules:', error); setRules([]); }
      else setRules((data as RuleRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      if (filterCity.trim() && !(r.city || '').toLowerCase().includes(filterCity.toLowerCase())) return false;
      return true;
    });
  }, [rules, filterCategory, filterCity]);

  const toggleEnabled = async (r: RuleRow) => {
    const { error } = await (sb as any)
      .from('monetization_rules')
      .update({ enabled: !r.enabled })
      .eq('id', r.id);
    if (error) { alert(error.message); return; }
    void load();
  };

  const deleteRule = async (r: RuleRow) => {
    if (!confirm(`Supprimer la règle "${r.name}" ?`)) return;
    const { error } = await (sb as any)
      .from('monetization_rules')
      .delete()
      .eq('id', r.id);
    if (error) { alert(error.message); return; }
    void load();
  };

  return (
    <div>
      {/* Filters + create */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white"
        >
          <option value="all">Toutes catégories</option>
          {GROUP_ORDER.map((g) => (
            <optgroup key={g} label={VENUE_CATEGORY_GROUPS[g]}>
              {VENUE_CATEGORIES.filter((c) => c.group === g).map((c) => (
                <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <input
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          placeholder="Filtrer par ville…"
          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-600"
        />
        <button
          onClick={() => { setEditing({
            id: '', name: 'Nouvelle règle', description: '', enabled: true, priority: 0,
            category: null, city: null, commune: null, subscription_tier: null, volume_tier: null,
            valid_from: null, valid_until: null,
            commission_reservation_pct: null, commission_reservation_fixed_xof: null,
            service_fee_pct: null, service_fee_fixed_xof: null,
            commission_payment_pct: null, commission_subscription_pct: null,
            commission_ticket_pct: null, commission_marketplace_pct: null, commission_affiliation_pct: null,
            cashback_user_pct: null, loyalty_bonus_pct: null,
            featured_listing_xof: null, advertising_xof: null,
            account_verification_xof: null, venue_certification_xof: null,
            event_publication_xof: null, promo_publication_xof: null,
          }); setCreating(true); }}
          className="ml-auto rounded-full bg-primary-500 px-4 py-2 text-xs font-bold text-white hover:bg-primary-600"
        >
          + Nouvelle règle
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center">
          <p className="text-sm text-neutral-400">Aucune règle pour ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li key={r.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      r.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-neutral-700/50 text-neutral-400'
                    }`}>
                      {r.enabled ? 'Active' : 'Désactivée'}
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                      Priorité {r.priority}
                    </span>
                    {r.category && (
                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400">
                        {r.category}
                      </span>
                    )}
                    {r.city && <span className="text-[10px] uppercase tracking-wide text-neutral-500">📍 {r.city}</span>}
                    {r.commune && <span className="text-[10px] uppercase tracking-wide text-neutral-500">· {r.commune}</span>}
                    {r.subscription_tier && (
                      <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-400">
                        {r.subscription_tier}
                      </span>
                    )}
                    {r.volume_tier && (
                      <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-400">
                        Vol {r.volume_tier}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-display text-base font-bold text-white">{r.name}</p>
                  {r.description && <p className="text-xs text-neutral-400">{r.description}</p>}

                  {/* Snapshot des principaux taux */}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {PCT_FIELDS.map((f) => {
                      const v = r[f] as number | null;
                      if (v == null || v === 0) return null;
                      return (
                        <div key={f as string} className="rounded-lg bg-neutral-950/60 px-2 py-1.5">
                          <p className="truncate text-[10px] uppercase tracking-wide text-neutral-500">{FIELD_LABELS[f as string]}</p>
                          <p className="text-sm font-bold text-emerald-300">{v}%</p>
                        </div>
                      );
                    })}
                    {XOF_FIELDS.map((f) => {
                      const v = r[f] as number | null;
                      if (v == null || v === 0) return null;
                      return (
                        <div key={f as string} className="rounded-lg bg-neutral-950/60 px-2 py-1.5">
                          <p className="truncate text-[10px] uppercase tracking-wide text-neutral-500">{FIELD_LABELS[f as string]}</p>
                          <p className="text-sm font-bold text-amber-300">{formatXOF(v)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-row gap-2 sm:flex-col">
                  <button
                    onClick={() => { setEditing(r); setCreating(false); }}
                    className="rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/25"
                  >
                    ✏️ Éditer
                  </button>
                  <button
                    onClick={() => toggleEnabled(r)}
                    className="rounded-full bg-neutral-700/40 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700/70"
                  >
                    {r.enabled ? '⏸️ Pause' : '▶️ Activer'}
                  </button>
                  <button
                    onClick={() => deleteRule(r)}
                    className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25"
                  >
                    🗑️ Suppr.
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RuleEditor
          rule={editing}
          isCreating={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); void load(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// MODAL : Éditeur de règle
// ============================================================================

function RuleEditor({
  rule, isCreating, onClose, onSaved,
}: { rule: RuleRow; isCreating: boolean; onClose: () => void; onSaved: () => void }) {
  const sb = supabaseBrowser();
  const [draft, setDraft] = useState<RuleRow>(rule);
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof RuleRow>(k: K, v: RuleRow[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setNum = (k: keyof RuleRow, raw: string) => {
    if (raw === '') setField(k, null as any);
    else {
      const n = Number(raw);
      if (Number.isFinite(n)) setField(k, n as any);
    }
  };

  const save = async () => {
    if (!draft.name.trim()) { alert('Le nom est requis.'); return; }
    setSaving(true);
    try {
      const { error } = await (sb.rpc as any)('upsert_monetization_rule', {
        p_id: isCreating ? null : draft.id,
        p_name: draft.name.trim(),
        p_description: draft.description?.trim() || null,
        p_category: draft.category || null,
        p_city: draft.city?.trim() || null,
        p_commune: draft.commune?.trim() || null,
        p_subscription_tier: draft.subscription_tier || null,
        p_volume_tier: draft.volume_tier || null,
        p_priority: draft.priority,
        p_enabled: draft.enabled,
        p_valid_from: draft.valid_from,
        p_valid_until: draft.valid_until,
        p_commission_reservation_pct: draft.commission_reservation_pct,
        p_commission_reservation_fixed_xof: draft.commission_reservation_fixed_xof,
        p_service_fee_pct: draft.service_fee_pct,
        p_service_fee_fixed_xof: draft.service_fee_fixed_xof,
        p_commission_payment_pct: draft.commission_payment_pct,
        p_commission_subscription_pct: draft.commission_subscription_pct,
        p_commission_ticket_pct: draft.commission_ticket_pct,
        p_commission_marketplace_pct: draft.commission_marketplace_pct,
        p_commission_affiliation_pct: draft.commission_affiliation_pct,
        p_cashback_user_pct: draft.cashback_user_pct,
        p_loyalty_bonus_pct: draft.loyalty_bonus_pct,
        p_featured_listing_xof: draft.featured_listing_xof,
        p_advertising_xof: draft.advertising_xof,
        p_account_verification_xof: draft.account_verification_xof,
        p_venue_certification_xof: draft.venue_certification_xof,
        p_event_publication_xof: draft.event_publication_xof,
        p_promo_publication_xof: draft.promo_publication_xof,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full max-w-3xl flex-col rounded-t-2xl border border-neutral-800 bg-neutral-950 sm:max-h-[92vh] sm:rounded-2xl">
        {/* Header — non scrollable */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800 px-5 pb-3 pt-5">
          <h3 className="font-display text-lg font-bold text-white">
            {isCreating ? '+ Nouvelle règle' : '✏️ Éditer la règle'}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">✕</button>
        </div>

        {/* Body scrollable */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {/* Identité */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nom *">
              <input
                value={draft.name}
                onChange={(e) => setField('name', e.target.value)}
                className="inp"
              />
            </Field>
            <Field label="Priorité">
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => setField('priority', Number(e.target.value) || 0)}
                className="inp"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea
                value={draft.description ?? ''}
                onChange={(e) => setField('description', e.target.value)}
                rows={2}
                className="inp"
              />
            </Field>
          </div>

          {/* Cibles */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Cibles (laisser vide = applique à tout)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Catégorie">
                <select
                  value={draft.category ?? ''}
                  onChange={(e) => setField('category', e.target.value || null)}
                  className="inp"
                >
                  <option value="">— Toutes —</option>
                  {GROUP_ORDER.map((g) => (
                    <optgroup key={g} label={VENUE_CATEGORY_GROUPS[g]}>
                      {VENUE_CATEGORIES.filter((c) => c.group === g).map((c) => (
                        <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Ville">
                <input
                  value={draft.city ?? ''}
                  onChange={(e) => setField('city', e.target.value || null)}
                  placeholder="Abidjan"
                  className="inp"
                />
              </Field>
              <Field label="Commune">
                <input
                  value={draft.commune ?? ''}
                  onChange={(e) => setField('commune', e.target.value || null)}
                  placeholder="Cocody"
                  className="inp"
                />
              </Field>
              <Field label="Tier d'abonnement">
                <select
                  value={draft.subscription_tier ?? ''}
                  onChange={(e) => setField('subscription_tier', e.target.value || null)}
                  className="inp"
                >
                  <option value="">— Tous —</option>
                  {SUBSCRIPTION_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Tier de volume">
                <select
                  value={draft.volume_tier ?? ''}
                  onChange={(e) => setField('volume_tier', e.target.value || null)}
                  className="inp"
                >
                  <option value="">— Tous —</option>
                  {VOLUME_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Commissions % */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-400">Commissions / frais en %</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {PCT_FIELDS.map((f) => (
                <Field key={f as string} label={FIELD_LABELS[f as string]} suffix="%">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={(draft[f] as number | null) ?? ''}
                    onChange={(e) => setNum(f, e.target.value)}
                    className="inp"
                  />
                </Field>
              ))}
            </div>
          </div>

          {/* Frais fixes / forfaits XOF */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-400">Frais fixes / forfaits (XOF)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {XOF_FIELDS.map((f) => (
                <Field key={f as string} label={FIELD_LABELS[f as string]} suffix="XOF">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={(draft[f] as number | null) ?? ''}
                    onChange={(e) => setNum(f, e.target.value)}
                    className="inp"
                  />
                </Field>
              ))}
            </div>
          </div>

          {/* Fenêtre de validité */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Fenêtre de validité (optionnel)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Début">
                <input
                  type="datetime-local"
                  value={draft.valid_from ? draft.valid_from.slice(0, 16) : ''}
                  onChange={(e) => setField('valid_from', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className="inp"
                />
              </Field>
              <Field label="Fin">
                <input
                  type="datetime-local"
                  value={draft.valid_until ? draft.valid_until.slice(0, 16) : ''}
                  onChange={(e) => setField('valid_until', e.target.value ? new Date(e.target.value).toISOString() : null)}
                  className="inp"
                />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setField('enabled', e.target.checked)}
              />
              Règle active
            </label>
          </div>

        </div>

        {/* Footer — non scrollable, sticky bottom */}
        <div
          className="flex flex-shrink-0 justify-end gap-2 border-t border-neutral-800 bg-neutral-950 px-5 py-3 sm:rounded-b-2xl"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button onClick={onClose} className="rounded-full bg-neutral-700/40 px-4 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-700/70">
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-primary-500 px-5 py-2 text-xs font-bold text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.inp) {
          width: 100%;
          background: rgb(10, 10, 10);
          border: 1px solid rgb(38, 38, 38);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          color: white;
        }
        :global(.inp:focus) {
          outline: none;
          border-color: rgb(255, 107, 26);
        }
      `}</style>
    </div>
  );
}

function Field({ label, suffix, className, children }: { label: string; suffix?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
        {label}{suffix ? <span className="ml-1 text-neutral-600">({suffix})</span> : null}
      </p>
      {children}
    </div>
  );
}

// ============================================================================
// SECTION 2 : DASHBOARD REVENUS
// ============================================================================

interface Bucket { bucket: string; total_xof: number; event_count: number }
interface Summary {
  total_xof: number;
  event_count: number;
  previous_total_xof: number;
  delta_pct: number | null;
  top_kind: string | null;
  top_category: string | null;
}

const PERIODS: { id: string; label: string; days: number }[] = [
  { id: '7d', label: '7 jours', days: 7 },
  { id: '30d', label: '30 jours', days: 30 },
  { id: '90d', label: '90 jours', days: 90 },
  { id: '365d', label: '12 mois', days: 365 },
];

const GROUP_BYS: { id: string; label: string }[] = [
  { id: 'kind',     label: 'Par source' },
  { id: 'category', label: 'Par catégorie' },
  { id: 'city',     label: 'Par ville' },
  { id: 'commune',  label: 'Par commune' },
  { id: 'day',      label: 'Par jour' },
  { id: 'venue',    label: 'Par établissement' },
];

interface VenueRevRow {
  venue_id: string;
  venue_name: string;
  category: string | null;
  city: string | null;
  commune: string | null;
  event_count: number;
  total_xof: number;
  resa_xof: number;
  ticket_xof: number;
  payment_xof: number;
  last_event_at: string | null;
}

function DashboardSection() {
  const sb = supabaseBrowser();
  const [period, setPeriod] = useState('30d');
  const [groupBy, setGroupBy] = useState('kind');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [topVenues, setTopVenues] = useState<VenueRevRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const days = PERIODS.find((p) => p.id === period)?.days ?? 30;
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();
    try {
      const [s, b, tv] = await Promise.all([
        (sb.rpc as any)('revenue_summary', { p_from: from, p_to: to }),
        (sb.rpc as any)('revenue_dashboard', { p_from: from, p_to: to, p_group_by: groupBy }),
        (sb as any).from('venue_revenue_summary').select('*').order('total_xof', { ascending: false }).limit(10),
      ]);
      if (s.error) { console.error('[summary]', s.error); setSummary(null); }
      else setSummary(s.data as Summary);
      if (b.error) { console.error('[dashboard]', b.error); setBuckets([]); }
      else setBuckets((b.data as Bucket[]) ?? []);
      if (tv.error) { console.error('[venue rev]', tv.error); setTopVenues([]); }
      else setTopVenues((tv.data as VenueRevRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb, period, groupBy]);

  useEffect(() => { void load(); }, [load]);

  const runBackfill = async () => {
    if (!confirm('Lancer le backfill ? Cela parcourt l\'historique (tickets, réservations, paiements) et alimente le dashboard. Idempotent : peut être relancé sans risque.')) return;
    setBackfilling(true);
    try {
      const { data, error } = await (sb.rpc as any)('backfill_revenue_log', { p_max_per_source: 5000 });
      if (error) { alert(error.message); return; }
      const r = data as { tickets_logged: number; reservations_logged: number; transactions_logged: number; total_logged: number };
      alert(`Backfill terminé.\nTickets : ${r.tickets_logged}\nRéservations : ${r.reservations_logged}\nTransactions : ${r.transactions_logged}\nTotal : ${r.total_logged}`);
      await load();
    } finally {
      setBackfilling(false);
    }
  };

  const maxBucket = useMemo(() => Math.max(1, ...buckets.map((b) => b.total_xof)), [buckets]);

  return (
    <div>
      {/* Period filter + backfill */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              period === p.id
                ? 'border-primary-500 bg-primary-500/15 text-primary-400'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={runBackfill}
          disabled={backfilling}
          className="ml-auto rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
          title="Rattrape l'historique des tickets/réservations/transactions pour alimenter le dashboard"
        >
          {backfilling ? '⏳ Backfill en cours…' : '🔄 Backfill historique'}
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Revenus totaux" value={summary ? formatXOF(summary.total_xof) : '—'} tone="emerald" />
        <Kpi
          label="Variation vs. période préc."
          value={summary?.delta_pct != null ? `${summary.delta_pct > 0 ? '+' : ''}${summary.delta_pct}%` : '—'}
          tone={summary?.delta_pct != null && summary.delta_pct >= 0 ? 'emerald' : 'red'}
        />
        <Kpi label="Source #1" value={summary?.top_kind || '—'} tone="blue" />
        <Kpi label="Catégorie #1" value={summary?.top_category || '—'} tone="amber" />
      </div>

      {/* Group by selector */}
      <div className="mb-3 flex flex-wrap gap-2">
        {GROUP_BYS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGroupBy(g.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              groupBy === g.id
                ? 'border-primary-500 bg-primary-500/15 text-primary-400'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Bars */}
      <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
        {loading ? (
          <p className="py-8 text-center text-xs text-neutral-500">Chargement…</p>
        ) : buckets.length === 0 ? (
          <p className="py-8 text-center text-xs text-neutral-500">
            Aucun événement enregistré sur la période.
            <br/>
            <span className="text-neutral-600">
              (Les revenus apparaîtront ici dès qu'une réservation, billet ou abonnement sera traité par <code>log_revenue_event</code>.)
            </span>
          </p>
        ) : (
          <ul className="space-y-2">
            {buckets.map((b) => {
              const pct = (b.total_xof / maxBucket) * 100;
              return (
                <li key={b.bucket} className="">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-semibold text-neutral-200">{b.bucket}</span>
                    <span className="ml-2 shrink-0 text-emerald-300">{formatXOF(b.total_xof)} <span className="text-neutral-500">({b.event_count})</span></span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-emerald-500"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Top 10 venues par revenu */}
      {topVenues.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Top 10 établissements par revenu</p>
          <ul className="space-y-2">
            {topVenues.map((v) => (
              <li key={v.venue_id} className="flex items-center justify-between rounded-xl border border-neutral-800/50 bg-neutral-900/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{v.venue_name}</p>
                  <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                    {v.category} · {v.city}{v.commune ? ` · ${v.commune}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-neutral-400">
                    {v.resa_xof > 0 && <span>🍽️ Résa : {formatXOF(v.resa_xof)}</span>}
                    {v.ticket_xof > 0 && <span>🎟️ Billets : {formatXOF(v.ticket_xof)}</span>}
                    {v.payment_xof > 0 && <span>💳 Paiements : {formatXOF(v.payment_xof)}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-emerald-300">{formatXOF(v.total_xof)}</p>
                  <p className="text-[10px] text-neutral-500">{v.event_count} event{v.event_count > 1 ? 's' : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'blue' | 'amber' | 'red' | 'neutral' }) {
  const map = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    neutral: 'text-neutral-300',
  } as const;
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold ${map[tone]}`}>{value}</p>
    </div>
  );
}

// ============================================================================
// SECTION 3 : CAMPAGNES TEMPORAIRES
// ============================================================================

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  override_commission_reservation_pct: number | null;
  override_service_fee_pct: number | null;
  override_cashback_user_pct: number | null;
  override_loyalty_bonus_pct: number | null;
  override_event_publication_xof: number | null;
  override_promo_publication_xof: number | null;
}

function CampaignsSection() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Partial<CampaignRow>>({
    name: '',
    description: '',
    enabled: true,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (sb as any)
      .from('monetization_campaigns')
      .select('*')
      .order('starts_at', { ascending: false });
    if (error) { console.error('[campaigns]', error); setRows([]); }
    else setRows((data as CampaignRow[]) ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.name?.trim()) { alert('Nom requis'); return; }
    const { error } = await (sb as any)
      .from('monetization_campaigns')
      .insert({
        name: draft.name.trim(),
        description: draft.description || null,
        category: draft.category || null,
        city: draft.city || null,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        enabled: draft.enabled ?? true,
        override_commission_reservation_pct: draft.override_commission_reservation_pct ?? null,
        override_service_fee_pct: draft.override_service_fee_pct ?? null,
        override_cashback_user_pct: draft.override_cashback_user_pct ?? null,
        override_loyalty_bonus_pct: draft.override_loyalty_bonus_pct ?? null,
        override_event_publication_xof: draft.override_event_publication_xof ?? null,
        override_promo_publication_xof: draft.override_promo_publication_xof ?? null,
      });
    if (error) { alert(error.message); return; }
    setShowForm(false);
    setDraft({ name: '', description: '', enabled: true, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 14 * 86400000).toISOString() });
    void load();
  };

  const toggleEnabled = async (c: CampaignRow) => {
    const { error } = await (sb as any)
      .from('monetization_campaigns')
      .update({ enabled: !c.enabled })
      .eq('id', c.id);
    if (error) { alert(error.message); return; }
    void load();
  };

  const delCampaign = async (c: CampaignRow) => {
    if (!confirm(`Supprimer la campagne "${c.name}" ?`)) return;
    const { error } = await (sb as any)
      .from('monetization_campaigns')
      .delete()
      .eq('id', c.id);
    if (error) { alert(error.message); return; }
    void load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          Les campagnes écrasent temporairement les commissions standards. Idéal pour des promos saisonnières.
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-primary-500 px-4 py-2 text-xs font-bold text-white hover:bg-primary-600"
        >
          {showForm ? 'Annuler' : '+ Nouvelle campagne'}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-2xl border border-primary-500/30 bg-neutral-900/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nom *">
              <input className="inp" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Description">
              <input className="inp" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="Catégorie cible">
              <select className="inp" value={draft.category ?? ''} onChange={(e) => setDraft({ ...draft, category: e.target.value || null })}>
                <option value="">— Toutes —</option>
                {GROUP_ORDER.map((g) => (
                  <optgroup key={g} label={VENUE_CATEGORY_GROUPS[g]}>
                    {VENUE_CATEGORIES.filter((c) => c.group === g).map((c) => (
                      <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Ville cible">
              <input className="inp" value={draft.city ?? ''} onChange={(e) => setDraft({ ...draft, city: e.target.value || null })} />
            </Field>
            <Field label="Début *">
              <input
                type="datetime-local"
                className="inp"
                value={draft.starts_at ? draft.starts_at.slice(0, 16) : ''}
                onChange={(e) => setDraft({ ...draft, starts_at: new Date(e.target.value).toISOString() })}
              />
            </Field>
            <Field label="Fin *">
              <input
                type="datetime-local"
                className="inp"
                value={draft.ends_at ? draft.ends_at.slice(0, 16) : ''}
                onChange={(e) => setDraft({ ...draft, ends_at: new Date(e.target.value).toISOString() })}
              />
            </Field>
            <Field label="Override commission réservation %">
              <input type="number" step="0.01" className="inp" value={draft.override_commission_reservation_pct ?? ''} onChange={(e) => setDraft({ ...draft, override_commission_reservation_pct: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Override frais de service %">
              <input type="number" step="0.01" className="inp" value={draft.override_service_fee_pct ?? ''} onChange={(e) => setDraft({ ...draft, override_service_fee_pct: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Override cashback user %">
              <input type="number" step="0.01" className="inp" value={draft.override_cashback_user_pct ?? ''} onChange={(e) => setDraft({ ...draft, override_cashback_user_pct: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Override bonus fidélité %">
              <input type="number" step="0.01" className="inp" value={draft.override_loyalty_bonus_pct ?? ''} onChange={(e) => setDraft({ ...draft, override_loyalty_bonus_pct: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Override pub. événement XOF">
              <input type="number" className="inp" value={draft.override_event_publication_xof ?? ''} onChange={(e) => setDraft({ ...draft, override_event_publication_xof: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Override pub. promo XOF">
              <input type="number" className="inp" value={draft.override_promo_publication_xof ?? ''} onChange={(e) => setDraft({ ...draft, override_promo_publication_xof: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={save} className="rounded-full bg-primary-500 px-5 py-2 text-xs font-bold text-white hover:bg-primary-600">
              Créer la campagne
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
          Aucune campagne. Crées-en une pour lancer une promo.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => {
            const now = Date.now();
            const active = c.enabled && new Date(c.starts_at).getTime() <= now && new Date(c.ends_at).getTime() > now;
            return (
              <li key={c.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-neutral-700/50 text-neutral-400'}`}>
                        {active ? 'EN COURS' : c.enabled ? 'Programmée' : 'Désactivée'}
                      </span>
                      {c.category && <span className="text-[10px] uppercase text-blue-300">{c.category}</span>}
                      {c.city && <span className="text-[10px] uppercase text-neutral-500">📍 {c.city}</span>}
                    </div>
                    <p className="mt-1 font-display text-base font-bold text-white">{c.name}</p>
                    {c.description && <p className="text-xs text-neutral-400">{c.description}</p>}
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Du {new Date(c.starts_at).toLocaleDateString('fr-FR')} au {new Date(c.ends_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button onClick={() => toggleEnabled(c)} className="rounded-full bg-neutral-700/40 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700/70">
                      {c.enabled ? '⏸️' : '▶️'}
                    </button>
                    <button onClick={() => delCampaign(c)} className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">
                      🗑️
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// SECTION 4 : OBJECTIFS FINANCIERS
// ============================================================================

interface TargetRow {
  id: string;
  period_month: string;
  kind: string | null;
  category: string | null;
  target_xof: number;
  notes: string | null;
}

function TargetsSection() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const [draft, setDraft] = useState<Partial<TargetRow>>({ period_month: defaultMonth, target_xof: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (sb as any)
      .from('monetization_targets')
      .select('*')
      .order('period_month', { ascending: false })
      .limit(50);
    if (error) { console.error('[targets]', error); setRows([]); }
    else setRows((data as TargetRow[]) ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.target_xof || draft.target_xof <= 0) { alert('Cible > 0 requise'); return; }
    const { error } = await (sb as any)
      .from('monetization_targets')
      .upsert({
        period_month: draft.period_month,
        kind: draft.kind || null,
        category: draft.category || null,
        target_xof: draft.target_xof,
        notes: draft.notes || null,
      }, { onConflict: 'period_month,kind,category' });
    if (error) { alert(error.message); return; }
    setDraft({ period_month: defaultMonth, target_xof: 0 });
    void load();
  };

  const del = async (t: TargetRow) => {
    if (!confirm('Supprimer cet objectif ?')) return;
    const { error } = await (sb as any).from('monetization_targets').delete().eq('id', t.id);
    if (error) { alert(error.message); return; }
    void load();
  };

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-primary-500/30 bg-neutral-900/50 p-4">
        <p className="mb-3 text-xs font-semibold text-neutral-300">Définir un objectif</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Mois cible *">
            <input type="month" className="inp"
              value={draft.period_month ? draft.period_month.slice(0, 7) : ''}
              onChange={(e) => setDraft({ ...draft, period_month: e.target.value + '-01' })}
            />
          </Field>
          <Field label="Catégorie (vide = toutes)">
            <select className="inp" value={draft.category ?? ''} onChange={(e) => setDraft({ ...draft, category: e.target.value || null })}>
              <option value="">— Toutes —</option>
              {GROUP_ORDER.map((g) => (
                <optgroup key={g} label={VENUE_CATEGORY_GROUPS[g]}>
                  {VENUE_CATEGORIES.filter((c) => c.group === g).map((c) => (
                    <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Source (vide = total)">
            <input className="inp" placeholder="reservation_commission_pct…" value={draft.kind ?? ''} onChange={(e) => setDraft({ ...draft, kind: e.target.value || null })} />
          </Field>
          <Field label="Cible (XOF) *">
            <input type="number" className="inp" value={draft.target_xof ?? ''} onChange={(e) => setDraft({ ...draft, target_xof: Number(e.target.value) })} />
          </Field>
          <Field label="Notes">
            <input className="inp" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={save} className="rounded-full bg-primary-500 px-5 py-2 text-xs font-bold text-white hover:bg-primary-600">
            Enregistrer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
          Aucun objectif défini.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-xl border border-neutral-800/50 bg-neutral-900/50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  {new Date(t.period_month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  {t.category && <span className="ml-2 text-[10px] text-blue-300 uppercase">{t.category}</span>}
                  {t.kind && <span className="ml-2 text-[10px] text-purple-300 uppercase">{t.kind}</span>}
                </p>
                <p className="text-xs text-emerald-300">Cible : {formatXOF(t.target_xof)}</p>
                {t.notes && <p className="mt-0.5 text-[11px] text-neutral-500">{t.notes}</p>}
              </div>
              <button onClick={() => del(t)} className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
