'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type KycStatusFilter = 'pending' | 'none' | 'verified' | 'rejected' | 'all';

interface ProKycRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  kyc_status: 'none' | 'pending' | 'verified' | 'rejected';
  kyc_doc_url: string | null;
  city: string | null;
  created_at: string;
  venues_count: number;
}

const STATUS_META: Record<ProKycRow['kyc_status'], { label: string; bg: string; text: string }> = {
  pending:  { label: 'En attente', bg: 'bg-amber-500/15',   text: 'text-amber-400' },
  none:     { label: 'Non soumis', bg: 'bg-neutral-500/15', text: 'text-neutral-400' },
  verified: { label: 'Vérifié',    bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  rejected: { label: 'Rejeté',     bg: 'bg-red-500/15',     text: 'text-red-400' },
};

/**
 * Sous-onglet « KYC Pro » de l'onglet Modération.
 *
 * Liste les profils role='venue_owner' avec leur kyc_status, et permet :
 *   • Vérifier le KYC (→ kyc_status='verified', audit log)
 *   • Rejeter le KYC (→ kyc_status='rejected' avec note de raison, audit log)
 *
 * Les RPC `list_pro_kyc`, `verify_pro_kyc` et `reject_pro_kyc` (migration 0045)
 * autorisent l'appel pour admin ET moderator.
 */
export function ProKycTab() {
  const sb = supabaseBrowser();
  const [status, setStatus] = useState<KycStatusFilter>('pending');
  const [rows, setRows] = useState<ProKycRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async (s: KycStatusFilter) => {
    setLoading(true);
    try {
      const { data, error } = await (sb.rpc as any)('list_pro_kyc', {
        p_status: s,
        p_limit: 200,
      });
      if (error) { console.error('[pro-kyc] load:', error); setRows([]); }
      else setRows((data as ProKycRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { load(status); }, [load, status]);

  const verify = async (id: string) => {
    if (!confirm('Vérifier le KYC de ce propriétaire ? Son statut passera à "vérifié".')) return;
    setActionId(id);
    try {
      const { error } = await (sb.rpc as any)('verify_pro_kyc', {
        p_user_id: id,
        p_note: note[id] || null,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  const reject = async (id: string) => {
    if (!(note[id] || '').trim()) {
      if (!confirm('Aucune note de raison saisie. Rejeter quand même ?')) return;
    }
    setActionId(id);
    try {
      const { error } = await (sb.rpc as any)('reject_pro_kyc', {
        p_user_id: id,
        p_note: note[id] || null,
      });
      if (error) { alert(error.message || 'Erreur'); return; }
      await load(status);
    } finally {
      setActionId(null);
    }
  };

  const counts = {
    pending: rows.filter((r) => r.kyc_status === 'pending').length,
    none: rows.filter((r) => r.kyc_status === 'none').length,
    verified: rows.filter((r) => r.kyc_status === 'verified').length,
    rejected: rows.filter((r) => r.kyc_status === 'rejected').length,
  };

  return (
    <div>
      {/* Status filter pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['pending', 'none', 'verified', 'rejected', 'all'] as const).map((s) => {
          const active = status === s;
          const label = s === 'all' ? 'Tous' : STATUS_META[s].label;
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
        <SummaryCard label="Non soumis" value={counts.none} tone="neutral" />
        <SummaryCard label="Vérifiés (vue)" value={counts.verified} tone="emerald" />
        <SummaryCard label="Rejetés (vue)" value={counts.rejected} tone="red" />
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center text-neutral-500">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-12 text-center">
          <p className="text-sm text-neutral-400">Aucun propriétaire dans ce filtre.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const statusMeta = STATUS_META[r.kyc_status];
            const isActionable = r.kyc_status !== 'verified';
            return (
              <li key={r.id} className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4 sm:p-5">
                {/* Header : identité + statut */}
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-base font-bold text-neutral-400">
                    {(r.full_name || r.phone || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusMeta.bg} ${statusMeta.text}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                        {r.venues_count} établissement{r.venues_count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-display text-base font-bold text-white">{r.full_name || '— (sans nom)'}</p>
                    <p className="text-xs text-neutral-500">
                      {r.phone ? `📞 ${r.phone}` : '— pas de téléphone'}
                      {r.email ? ` · ✉ ${r.email}` : ''}
                      {r.city ? ` · ${r.city}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      Inscrit le {new Date(r.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Document KYC */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <DocLink label="Pièce d'identité" url={r.kyc_doc_url} />
                </div>

                {/* Actions */}
                {isActionable && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={note[r.id] || ''}
                      onChange={(e) => setNote((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="Note de décision (optionnelle si vérification, recommandée si rejet)"
                      rows={2}
                      maxLength={2000}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-primary-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={actionId === r.id}
                        onClick={() => verify(r.id)}
                        className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        ✓ Vérifier KYC
                      </button>
                      <button
                        disabled={actionId === r.id}
                        onClick={() => reject(r.id)}
                        className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        ✕ Rejeter KYC
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

function DocLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-300 ring-1 ring-red-500/30">
        {label} : manquant
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

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'emerald' | 'red' | 'neutral' }) {
  const map = {
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    neutral: 'text-neutral-400',
  } as const;
  return (
    <div className="rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${map[tone]}`}>{value}</p>
    </div>
  );
}
