'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected' | 'all';

interface ReportRow {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_cover: string | null;
  venue_category: string;
  reporter_id: string | null;
  reporter_name: string | null;
  kind: 'closed' | 'moved' | 'duplicate' | 'wrong_info' | 'wrong_price' | 'inappropriate' | 'other';
  details: string | null;
  duplicate_of: string | null;
  duplicate_name: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'rejected';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

const KIND_META: Record<ReportRow['kind'], { label: string; icon: string; tone: 'red' | 'amber' | 'blue' | 'purple' | 'neutral' }> = {
  closed:        { label: 'Fermé',           icon: '🚫', tone: 'red' },
  moved:         { label: 'Déménagé',        icon: '📦', tone: 'amber' },
  duplicate:     { label: 'Doublon',         icon: '👯', tone: 'purple' },
  wrong_info:    { label: 'Info erronée',    icon: '✏️', tone: 'blue' },
  wrong_price:   { label: 'Prix incorrect',  icon: '💰', tone: 'amber' },
  inappropriate: { label: 'Inapproprié',     icon: '⚠️', tone: 'red' },
  other:         { label: 'Autre',           icon: '📝', tone: 'neutral' },
};

const STATUS_META: Record<ReportRow['status'], { label: string; bg: string; text: string }> = {
  open:      { label: 'Ouvert',     bg: 'bg-amber-500/15', text: 'text-amber-400' },
  reviewing: { label: 'En examen',  bg: 'bg-blue-500/15',  text: 'text-blue-400' },
  resolved:  { label: 'Résolu',     bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  rejected:  { label: 'Rejeté',     bg: 'bg-neutral-500/15', text: 'text-neutral-400' },
};

const TONE_BG: Record<'red' | 'amber' | 'blue' | 'purple' | 'neutral', string> = {
  red:     'bg-red-500/10 text-red-400 ring-red-500/30',
  amber:   'bg-amber-500/10 text-amber-400 ring-amber-500/30',
  blue:    'bg-blue-500/10 text-blue-400 ring-blue-500/30',
  purple:  'bg-purple-500/10 text-purple-400 ring-purple-500/30',
  neutral: 'bg-neutral-700/30 text-neutral-300 ring-neutral-500/20',
};

/**
 * Tab "Signalements" du dashboard admin.
 *
 * Affiche la queue des reports (filtrable par statut), avec actions
 * Résoudre / Rejeter / Reprendre. Charge via RPC list_venue_reports
 * (security definer, admin-only). Update via RPC resolve_venue_report.
 */
export function ReportsTab() {
  const sb = supabaseBrowser();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async (s: ReportStatus) => {
    setLoading(true);
    try {
      const { data, error } = await (sb.rpc as any)('list_venue_reports', {
        p_status: s,
        p_limit: 200,
      });
      if (error) { console.error('[reports] load:', error); setRows([]); }
      else setRows((data as ReportRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { load(status); }, [load, status]);

  const transition = async (id: string, next: 'reviewing' | 'resolved' | 'rejected') => {
    setActionId(id);
    try {
      const { error } = await (sb.rpc as any)('resolve_venue_report', {
        p_report_id: id,
        p_status: next,
        p_note: note[id] || null,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  const counts = {
    open: rows.filter((r) => r.status === 'open').length,
    reviewing: rows.filter((r) => r.status === 'reviewing').length,
    resolved: rows.filter((r) => r.status === 'resolved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  };

  return (
    <div>
      {/* Status filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['open', 'reviewing', 'resolved', 'rejected', 'all'] as const).map((s) => {
          const active = status === s;
          const label = s === 'all' ? 'Toutes' : STATUS_META[s].label;
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-primary-500 bg-primary-500/15 text-primary-400'
                  : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Mini KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="À traiter" value={counts.open} tone="amber" />
        <SummaryCard label="En examen" value={counts.reviewing} tone="blue" />
        <SummaryCard label="Résolus (vue)" value={counts.resolved} tone="emerald" />
        <SummaryCard label="Rejetés (vue)" value={counts.rejected} tone="neutral" />
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center">
          <p className="text-sm text-neutral-400">Aucun signalement pour ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const kindMeta = KIND_META[r.kind];
            const statusMeta = STATUS_META[r.status];
            const isOpen = r.status === 'open' || r.status === 'reviewing';
            return (
              <li key={r.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Venue + kind */}
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
                      {r.venue_cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.venue_cover} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${TONE_BG[kindMeta.tone]}`}>
                          <span>{kindMeta.icon}</span> {kindMeta.label}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusMeta.bg} ${statusMeta.text}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-display text-base font-bold text-white">{r.venue_name}</p>
                      <p className="text-xs text-neutral-500">
                        {r.venue_category} · signalé par {r.reporter_name || 'utilisateur'} ·{' '}
                        {new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {r.duplicate_name && (
                        <p className="mt-1 text-xs text-purple-300">
                          → Doublon de <strong className="font-semibold">{r.duplicate_name}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details */}
                {r.details && (
                  <div className="mt-3 rounded-xl border border-neutral-800/50 bg-neutral-950/50 p-3 text-sm text-neutral-300">
                    {r.details}
                  </div>
                )}

                {/* Resolution note (resolved/rejected) */}
                {r.resolution_note && (
                  <div className="mt-3 rounded-xl border border-emerald-800/30 bg-emerald-500/5 p-3 text-xs">
                    <span className="font-bold text-emerald-400">Note admin :</span>{' '}
                    <span className="text-neutral-300">{r.resolution_note}</span>
                  </div>
                )}

                {/* Actions */}
                {isOpen && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={note[r.id] || ''}
                      onChange={(e) => setNote((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="Note de résolution (optionnelle)"
                      rows={2}
                      maxLength={1000}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-primary-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'open' && (
                        <button
                          disabled={actionId === r.id}
                          onClick={() => transition(r.id, 'reviewing')}
                          className="rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
                        >
                          Prendre en charge
                        </button>
                      )}
                      <button
                        disabled={actionId === r.id}
                        onClick={() => transition(r.id, 'resolved')}
                        className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        ✓ Résolu
                      </button>
                      <button
                        disabled={actionId === r.id}
                        onClick={() => transition(r.id, 'rejected')}
                        className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        ✕ Rejeter
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'emerald' | 'neutral' }) {
  const map = {
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    neutral: 'text-neutral-400',
  } as const;
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${map[tone]}`}>{value}</p>
    </div>
  );
}
