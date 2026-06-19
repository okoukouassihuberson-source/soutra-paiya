'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Onglet « À vérifier » de /admin → Modération.
 *
 * Liste les venues que le trigger AFTER INSERT venues (migration 0062) a
 * automatiquement flaggés à la création : terme banni, doublon proche d'un
 * venue existant, création rapide (5+ venues dans l'heure).
 *
 * L'admin peut :
 *   • Ignorer le flag (faux positif) → dismiss_venue_flag
 *   • Marquer traité (a regardé, OK) → resolve_venue_flag
 *   • Suspendre le venue (abus avéré) → suspend_venue (résout aussi tous
 *     les flags ouverts du venue)
 *
 * Tout ça en activation immédiate : le venue est resté visible pendant que
 * l'admin l'examine — c'est l'esprit de la PR4 (modération a posteriori).
 */

type FlagStatus = 'open' | 'reviewing' | 'dismissed' | 'resolved' | 'all';
type FlagSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type FlagReason =
  | 'banned_term' | 'duplicate_close' | 'rapid_create'
  | 'thin_content' | 'suspicious_metadata' | 'user_report' | 'other';

interface FlagRow {
  flag_id: string;
  venue_id: string;
  venue_name: string;
  venue_status: string;
  venue_category: string;
  venue_city: string;
  owner_id: string;
  owner_name: string | null;
  reason: FlagReason;
  severity: FlagSeverity;
  details: Record<string, unknown>;
  status: 'open' | 'reviewing' | 'dismissed' | 'resolved';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

const SEVERITY_META: Record<FlagSeverity, { label: string; tone: string }> = {
  critical: { label: 'Critique', tone: 'bg-red-500/15 text-red-300 border-red-500/30' },
  high:     { label: 'Élevé',    tone: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  medium:   { label: 'Moyen',    tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  low:      { label: 'Faible',   tone: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  info:     { label: 'Info',     tone: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30' },
};

const REASON_LABELS: Record<FlagReason, string> = {
  banned_term:         'Terme banni',
  duplicate_close:     'Doublon probable',
  rapid_create:        'Création rapide',
  thin_content:        'Contenu pauvre',
  suspicious_metadata: 'Métadonnée suspecte',
  user_report:         'Signalement utilisateur',
  other:               'Autre',
};

const STATUS_FILTERS: { id: FlagStatus; label: string }[] = [
  { id: 'open',      label: 'Ouverts' },
  { id: 'reviewing', label: 'En cours' },
  { id: 'dismissed', label: 'Ignorés' },
  { id: 'resolved',  label: 'Résolus' },
  { id: 'all',       label: 'Tous' },
];

export function AutoFlagsTab() {
  const sb = supabaseBrowser();
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FlagStatus>('open');
  const [severityFilter, setSeverityFilter] = useState<FlagSeverity | 'all'>('all');
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (sb.rpc as any)('list_flagged_venues', {
      p_status: statusFilter,
      p_severity: severityFilter === 'all' ? null : severityFilter,
      p_limit: 200,
    });
    if (error) {
      console.error('[auto-flags] list:', error);
      setFlags([]);
    } else {
      setFlags((data as FlagRow[]) ?? []);
    }
    setLoading(false);
  }, [sb, statusFilter, severityFilter]);

  useEffect(() => { load(); }, [load]);

  const dismiss = useCallback(async (flagId: string) => {
    setActioning(flagId);
    const { error } = await (sb.rpc as any)('dismiss_venue_flag', {
      p_flag_id: flagId, p_note: 'Faux positif',
    });
    setActioning(null);
    if (error) { flash(error.message || 'Erreur', false); return; }
    flash('Flag ignoré');
    load();
  }, [sb, flash, load]);

  const resolve = useCallback(async (flagId: string) => {
    setActioning(flagId);
    const { error } = await (sb.rpc as any)('resolve_venue_flag', {
      p_flag_id: flagId, p_note: 'Examiné, OK',
    });
    setActioning(null);
    if (error) { flash(error.message || 'Erreur', false); return; }
    flash('Flag résolu');
    load();
  }, [sb, flash, load]);

  const suspend = useCallback(async (venueId: string) => {
    const reason = window.prompt('Raison de la suspension (visible dans l\'audit) ?');
    if (!reason || reason.trim().length < 4) return;
    setActioning(venueId);
    const { error } = await (sb.rpc as any)('suspend_venue', {
      p_venue_id: venueId, p_reason: reason.trim(),
    });
    setActioning(null);
    if (error) { flash(error.message || 'Erreur', false); return; }
    flash('Venue suspendu');
    load();
  }, [sb, flash, load]);

  const counts = useMemo(() => {
    return {
      total: flags.length,
      critical: flags.filter((f) => f.severity === 'critical').length,
      high: flags.filter((f) => f.severity === 'high').length,
    };
  }, [flags]);

  return (
    <div>
      {/* Bandeau récap */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Flags affichés" value={counts.total} tone="text-white" />
        <Kpi label="Critique" value={counts.critical} tone="text-red-300" />
        <Kpi label="Élevé" value={counts.high} tone="text-orange-300" />
      </div>

      {/* Filtres */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? 'border-primary-500/60 bg-primary-500/15 text-primary-200'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-neutral-600">·</span>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as FlagSeverity | 'all')}
          className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-300 focus:border-primary-500 focus:outline-none"
        >
          <option value="all">Toutes sévérités</option>
          {(['critical','high','medium','low','info'] as FlagSeverity[]).map((s) => (
            <option key={s} value={s}>{SEVERITY_META[s].label}</option>
          ))}
        </select>
        <button
          onClick={load}
          className="ml-auto rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-300 transition hover:text-white"
        >
          ↻ Recharger
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-sm text-neutral-500">
          Chargement…
        </div>
      ) : flags.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-sm text-neutral-500">
          Aucun flag {statusFilter !== 'all' ? `(${STATUS_FILTERS.find((s) => s.id === statusFilter)?.label.toLowerCase()})` : ''} à afficher.
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((f) => (
            <FlagCard
              key={f.flag_id}
              flag={f}
              busy={actioning === f.flag_id || actioning === f.venue_id}
              onDismiss={() => dismiss(f.flag_id)}
              onResolve={() => resolve(f.flag_id)}
              onSuspend={() => suspend(f.venue_id)}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-xl ${
          toast.ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function FlagCard({
  flag, busy, onDismiss, onResolve, onSuspend,
}: {
  flag: FlagRow;
  busy: boolean;
  onDismiss: () => void;
  onResolve: () => void;
  onSuspend: () => void;
}) {
  const sev = SEVERITY_META[flag.severity];
  const detailsList = useMemo(() => {
    const entries: { k: string; v: string }[] = [];
    if (flag.reason === 'banned_term' && Array.isArray(flag.details.matched_terms)) {
      entries.push({ k: 'Termes', v: (flag.details.matched_terms as string[]).join(', ') });
    }
    if (flag.reason === 'duplicate_close' && typeof flag.details.existing_venue_id === 'string') {
      entries.push({ k: 'Doublon de', v: flag.details.existing_venue_id });
    }
    if (flag.reason === 'rapid_create' && typeof flag.details.venues_last_hour === 'number') {
      entries.push({ k: 'Venues / heure', v: String(flag.details.venues_last_hour) });
    }
    return entries;
  }, [flag]);

  const isFinal = flag.status === 'dismissed' || flag.status === 'resolved';

  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-5">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase ${sev.tone}`}>
          {sev.label}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {REASON_LABELS[flag.reason]}
          </p>
          <p className="mt-1 font-display text-base font-bold text-white">
            {flag.venue_name}{' '}
            <span className="text-xs font-normal text-neutral-500">· {flag.venue_category} · {flag.venue_city}</span>
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Propriétaire : <span className="text-neutral-300">{flag.owner_name || '—'}</span>
            {' · '}
            Status : <code className="rounded bg-neutral-800/70 px-1 py-px font-mono">{flag.venue_status}</code>
            {' · '}
            {new Date(flag.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>

          {detailsList.length > 0 && (
            <div className="mt-3 rounded-lg border border-neutral-800/50 bg-neutral-950/40 p-3">
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Détails</p>
              <dl className="mt-1 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {detailsList.map((e) => (
                  <div key={e.k} className="flex items-start gap-2">
                    <dt className="shrink-0 text-neutral-500">{e.k} :</dt>
                    <dd className="break-all text-neutral-200">{e.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {flag.resolution_note && (
            <p className="mt-2 text-xs italic text-neutral-500">
              Note : {flag.resolution_note}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {!isFinal && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onResolve}
            disabled={busy}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            ✓ Examiné, OK
          </button>
          <button
            onClick={onDismiss}
            disabled={busy}
            className="rounded-lg border border-neutral-700/60 bg-neutral-800/40 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
          >
            Ignorer (faux positif)
          </button>
          <button
            onClick={onSuspend}
            disabled={busy}
            className="ml-auto rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            ⛔ Suspendre le venue
          </button>
        </div>
      )}
    </div>
  );
}
