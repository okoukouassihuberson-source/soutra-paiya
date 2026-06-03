'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

// ============================================================================
// NotificationPrefsPanel — panneau des préférences de notifications pro.
//
// Lit / écrit via les RPCs SECURITY DEFINER de la migration 0045
// (get_my_notification_preferences / update_notification_preferences).
// ============================================================================

interface NotificationPreferences {
  user_id: string;
  new_reservation: boolean;
  payment_received: boolean;
  payout_settled: boolean;
  revenue_milestone: boolean;
  updated_at: string;
}

type PrefKey = 'new_reservation' | 'payment_received' | 'payout_settled' | 'revenue_milestone';

const PREF_META: Record<PrefKey, { label: string; description: string; emoji: string }> = {
  new_reservation: {
    label: 'Nouvelles réservations',
    description: 'Reçois une alerte dès qu\'un client réserve dans ton établissement.',
    emoji: '📅',
  },
  payment_received: {
    label: 'Paiements reçus',
    description: 'Sois prévenu quand un client paie via l\'app (acompte, addition).',
    emoji: '💳',
  },
  payout_settled: {
    label: 'Retraits réglés',
    description: 'Confirmation succès / échec de tes virements mobile money.',
    emoji: '💸',
  },
  revenue_milestone: {
    label: 'Jalons de revenus',
    description: '50 k, 250 k, 1 M XOF franchis dans le mois courant.',
    emoji: '🎉',
  },
};

const KEYS: PrefKey[] = ['new_reservation', 'payment_received', 'payout_settled', 'revenue_milestone'];

export function NotificationPrefsPanel() {
  const sb = supabaseBrowser();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await (sb.rpc as any)('get_my_notification_preferences');
      if (rpcErr) {
        const raw = rpcErr.message ?? '';
        if (raw.includes('NOT_AUTHENTICATED')) setError('Tu dois être connecté pour gérer tes notifications.');
        else setError(raw || 'Chargement impossible');
        return;
      }
      setPrefs(data as NotificationPreferences);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: PrefKey, value: boolean) => {
    if (!prefs) return;
    setSavingKey(key);
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    try {
      const { data, error: rpcErr } = await (sb.rpc as any)('update_notification_preferences', {
        p_prefs: { [key]: value },
      });
      if (rpcErr) {
        setPrefs(prev); // rollback
        setError(rpcErr.message ?? 'Échec de l\'enregistrement');
        return;
      }
      setPrefs(data as NotificationPreferences);
      setError(null);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Notifications pro
        </p>
      </div>

      <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-xs text-primary-700">
        Ces préférences s'appliquent aux notifications business côté gérant. Les
        messages personnels (chats, transferts, matches…) restent toujours actifs.
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {KEYS.map((key, idx) => {
          const meta = PREF_META[key];
          const value = prefs?.[key] ?? true;
          const isSaving = savingKey === key;
          return (
            <div
              key={key}
              className={`flex items-center gap-4 p-4 ${idx < KEYS.length - 1 ? 'border-b border-neutral-100' : ''}`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-50 text-xl">
                {meta.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark">{meta.label}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{meta.description}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(key, !value)}
                disabled={loading || isSaving}
                role="switch"
                aria-checked={value}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 ${
                  value ? 'bg-primary-500' : 'bg-neutral-300'
                } ${isSaving || loading ? 'opacity-60' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    value ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-neutral-400">
        Modifications appliquées immédiatement sur tous tes appareils enregistrés.
      </p>
    </div>
  );
}
