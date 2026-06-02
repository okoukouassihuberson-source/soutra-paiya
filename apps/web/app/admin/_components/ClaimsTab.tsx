'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type ClaimStatusFilter = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'cancelled' | 'all';

interface ClaimRow {
  id: string;
  venue_id: string;
  venue_name: string;
  venue_cover: string | null;
  venue_category: string;
  venue_district: string | null;
  venue_city: string | null;
  current_owner_id: string | null;
  current_owner_name: string | null;
  claimant_user_id: string;
  claimant_name: string | null;
  claimant_phone: string | null;
  id_doc_url: string | null;
  business_doc_url: string | null;
  proof_url: string | null;
  business_name: string | null;
  business_role: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'cancelled';
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

const STATUS_META: Record<ClaimRow['status'], { label: string; bg: string; text: string }> = {
  pending:   { label: 'En attente',  bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  reviewing: { label: 'En examen',   bg: 'bg-blue-500/15',    text: 'text-blue-400' },
  approved:  { label: 'Approuvée',   bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  rejected:  { label: 'Refusée',     bg: 'bg-red-500/15',     text: 'text-red-400' },
  cancelled: { label: 'Annulée',     bg: 'bg-neutral-500/15', text: 'text-neutral-400' },
};

/**
 * Tab "Revendications" du dashboard admin (PR 8 Découverte).
 *
 * Affiche la queue des venue_claims, avec actions :
 *   • Prendre en charge (pending → reviewing)
 *   • Approuver (→ venues.owner_id = claimant + profiles.role = venue_owner)
 *   • Refuser
 *
 * Les documents KYC (id_doc_url, business_doc_url, proof_url) sont ouvrables
 * dans un nouvel onglet pour vérification visuelle.
 */
export function ClaimsTab() {
  const sb = supabaseBrowser();
  const [status, setStatus] = useState<ClaimStatusFilter>('pending');
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async (s: ClaimStatusFilter) => {
    setLoading(true);
    try {
      const { data, error } = await (sb.rpc as any)('list_venue_claims', {
        p_status: s,
        p_limit: 200,
      });
      if (error) { console.error('[claims] load:', error); setRows([]); }
      else setRows((data as ClaimRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { load(status); }, [load, status]);

  const approve = async (id: string) => {
    if (!confirm('Approuver cette revendication ? Cela transfère la propriété du lieu au demandeur.')) return;
    setActionId(id);
    try {
      const { error } = await (sb.rpc as any)('approve_venue_claim', {
        p_claim_id: id,
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
      const { error } = await (sb.rpc as any)('reject_venue_claim', {
        p_claim_id: id,
        p_decision_note: note[id] || null,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  // Transition pending → reviewing : pas de RPC dédiée (update direct via RLS admin).
  const takeOver = async (id: string) => {
    setActionId(id);
    try {
      const { error } = await (sb as any)
        .from('venue_claims')
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
        {(['pending', 'reviewing', 'approved', 'rejected', 'cancelled', 'all'] as const).map((s) => {
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
          <p className="text-sm text-neutral-400">Aucune revendication pour ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const statusMeta = STATUS_META[r.status];
            const isActionable = r.status === 'pending' || r.status === 'reviewing';
            return (
              <li key={r.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 sm:p-5">
                {/* Header : venue + status */}
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
                    {r.venue_cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.venue_cover} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusMeta.bg} ${statusMeta.text}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                        {r.venue_category}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-display text-base font-bold text-white">{r.venue_name}</p>
                    <p className="text-xs text-neutral-500">
                      {[r.venue_district, r.venue_city].filter(Boolean).join(' · ') || '—'} ·{' '}
                      {new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Claimant + current owner */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-800/50 bg-neutral-950/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Demandeur</p>
                    <p className="mt-1 text-sm font-semibold text-white">{r.claimant_name || '—'}</p>
                    {r.contact_phone && (
                      <p className="text-xs text-neutral-400">📞 {r.contact_phone}</p>
                    )}
                    {r.business_name && (
                      <p className="mt-1 text-xs text-neutral-300">{r.business_name}{r.business_role ? ` — ${r.business_role}` : ''}</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-neutral-800/50 bg-neutral-950/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Owner actuel</p>
                    <p className="mt-1 text-sm font-semibold text-white">{r.current_owner_name || '— (aucun)'}</p>
                  </div>
                </div>

                {/* Documents KYC */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <DocLink label="Pièce d'identité" url={r.id_doc_url} />
                  <DocLink label="Justificatif activité" url={r.business_doc_url} />
                  <DocLink label="Preuve" url={r.proof_url} optional />
                </div>

                {/* Notes du demandeur */}
                {r.notes && (
                  <div className="mt-3 rounded-xl border border-neutral-800/50 bg-neutral-950/50 p-3 text-sm text-neutral-300">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Notes du demandeur</span>
                    <p className="mt-1 whitespace-pre-wrap">{r.notes}</p>
                  </div>
                )}

                {/* Décision admin */}
                {r.decision_note && (
                  <div className="mt-3 rounded-xl border border-emerald-800/30 bg-emerald-500/5 p-3 text-xs">
                    <span className="font-bold text-emerald-400">Note admin :</span>{' '}
                    <span className="text-neutral-300">{r.decision_note}</span>
                  </div>
                )}

                {/* Actions */}
                {isActionable && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={note[r.id] || ''}
                      onChange={(e) => setNote((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="Note de décision (optionnelle, visible côté demandeur)"
                      rows={2}
                      maxLength={2000}
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
                        ✓ Approuver
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

function DocLink({ label, url, optional }: { label: string; url: string | null; optional?: boolean }) {
  if (!url) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        optional ? 'bg-neutral-800/50 text-neutral-500' : 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30'
      }`}>
        {label} : {optional ? '—' : 'manquant'}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-300 ring-1 ring-primary-500/30 hover:bg-primary-500/20"
    >
      📎 {label}
    </a>
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
