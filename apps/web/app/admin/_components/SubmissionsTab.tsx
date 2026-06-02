'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type SubmissionStatusFilter = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'duplicate' | 'all';

interface SubmissionRow {
  id: string;
  submitted_by: string;
  submitter_name: string | null;
  submitter_phone: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  address: string;
  city: string;
  district: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  cover_url: string | null;
  gallery_urls: string[];
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'duplicate';
  created_venue_id: string | null;
  duplicate_of: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

const STATUS_META: Record<SubmissionRow['status'], { label: string; bg: string; text: string }> = {
  pending:   { label: 'En attente', bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  reviewing: { label: 'En examen',  bg: 'bg-blue-500/15',    text: 'text-blue-400' },
  approved:  { label: 'Approuvée',  bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  rejected:  { label: 'Refusée',    bg: 'bg-red-500/15',     text: 'text-red-400' },
  duplicate: { label: 'Doublon',    bg: 'bg-purple-500/15',  text: 'text-purple-400' },
};

/**
 * Tab "Contributions" du dashboard admin (PR 9 Découverte).
 *
 * Affiche la queue des venue_submissions soumises par la communauté.
 * Actions :
 *   • Prendre en charge (pending → reviewing)
 *   • Approuver → crée le venue réel (RPC approve_venue_submission)
 *   • Refuser → status=rejected + note
 *   • Marquer comme doublon → status=duplicate + lien vers le venue existant
 */
export function SubmissionsTab() {
  const sb = supabaseBrowser();
  const [status, setStatus] = useState<SubmissionStatusFilter>('pending');
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [duplicateInput, setDuplicateInput] = useState<Record<string, string>>({});

  const load = useCallback(async (s: SubmissionStatusFilter) => {
    setLoading(true);
    try {
      const { data, error } = await (sb.rpc as any)('list_venue_submissions', {
        p_status: s,
        p_limit: 200,
      });
      if (error) { console.error('[submissions] load:', error); setRows([]); }
      else setRows((data as SubmissionRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { load(status); }, [load, status]);

  const approve = async (id: string) => {
    if (!confirm('Approuver cette contribution et créer le venue ?')) return;
    setActionId(id);
    try {
      const { error } = await (sb.rpc as any)('approve_venue_submission', {
        p_submission_id: id,
        p_decision_note: note[id] || null,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  const reject = async (id: string) => {
    setActionId(id);
    try {
      const dup = duplicateInput[id]?.trim() || null;
      const { error } = await (sb.rpc as any)('reject_venue_submission', {
        p_submission_id: id,
        p_decision_note: note[id] || null,
        p_duplicate_of: dup,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  const takeOver = async (id: string) => {
    setActionId(id);
    try {
      const { error } = await (sb as any)
        .from('venue_submissions')
        .update({ status: 'reviewing' })
        .eq('id', id);
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    reviewing: rows.filter((r) => r.status === 'reviewing').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  };

  return (
    <div>
      {/* Status filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['pending', 'reviewing', 'approved', 'rejected', 'duplicate', 'all'] as const).map((s) => {
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
        <SummaryCard label="À traiter" value={counts.pending} tone="amber" />
        <SummaryCard label="En examen" value={counts.reviewing} tone="blue" />
        <SummaryCard label="Approuvées (vue)" value={counts.approved} tone="emerald" />
        <SummaryCard label="Refusées (vue)" value={counts.rejected} tone="neutral" />
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center">
          <p className="text-sm text-neutral-400">Aucune contribution pour ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const statusMeta = STATUS_META[r.status];
            const isActionable = r.status === 'pending' || r.status === 'reviewing';
            return (
              <li key={r.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 sm:p-5">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
                    {r.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusMeta.bg} ${statusMeta.text}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                        {r.category}
                      </span>
                      {r.subcategory && (
                        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                          · {r.subcategory}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-display text-base font-bold text-white">{r.name}</p>
                    <p className="text-xs text-neutral-500">
                      📍 {r.address} · {[r.district, r.city].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Par {r.submitter_name || 'utilisateur'}
                      {r.submitter_phone ? ` (${r.submitter_phone})` : ''}
                      {' · '}
                      {new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Description */}
                {r.description && (
                  <div className="mt-3 rounded-xl border border-neutral-800/50 bg-neutral-950/50 p-3 text-sm text-neutral-300">
                    {r.description}
                  </div>
                )}

                {/* Contact + GPS */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                  {r.phone && <span>📞 {r.phone}</span>}
                  {r.whatsapp && <span>💬 {r.whatsapp}</span>}
                  {r.email && <span>✉️ {r.email}</span>}
                  {r.website && (
                    <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-primary-300 hover:underline">
                      🌐 {r.website}
                    </a>
                  )}
                  {r.lat != null && r.lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-300 hover:underline"
                    >
                      🗺️ {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    </a>
                  )}
                </div>

                {/* Galerie thumbs */}
                {r.gallery_urls && r.gallery_urls.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {r.gallery_urls.slice(0, 8).map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ))}
                  </div>
                )}

                {/* Décision admin existante */}
                {r.decision_note && (
                  <div className="mt-3 rounded-xl border border-emerald-800/30 bg-emerald-500/5 p-3 text-xs">
                    <span className="font-bold text-emerald-400">Note admin :</span>{' '}
                    <span className="text-neutral-300">{r.decision_note}</span>
                  </div>
                )}
                {r.created_venue_id && (
                  <p className="mt-2 text-[11px] text-emerald-400">
                    ✓ Venue créé : <code className="text-neutral-300">{r.created_venue_id}</code>
                  </p>
                )}

                {/* Actions */}
                {isActionable && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={note[r.id] || ''}
                      onChange={(e) => setNote((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="Note de décision (optionnelle)"
                      rows={2}
                      maxLength={2000}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-primary-500 focus:outline-none"
                    />
                    <input
                      value={duplicateInput[r.id] || ''}
                      onChange={(e) => setDuplicateInput((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="ID du venue original (si refus pour doublon)"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-primary-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'pending' && (
                        <button
                          disabled={actionId === r.id}
                          onClick={() => takeOver(r.id)}
                          className="rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
                        >
                          Prendre en charge
                        </button>
                      )}
                      <button
                        disabled={actionId === r.id}
                        onClick={() => approve(r.id)}
                        className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        ✓ Approuver (créer venue)
                      </button>
                      <button
                        disabled={actionId === r.id}
                        onClick={() => reject(r.id)}
                        className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        ✕ Refuser
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
