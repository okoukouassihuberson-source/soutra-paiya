'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';
import { PaymentLogo, type PaymentMethodName } from '@/components/marketing/PaymentLogo';

/**
 * Panel « Moyens de paiement acceptés » de l'onglet Paramètres /pro.
 *
 * Le Pro peut :
 *   • activer / désactiver chaque méthode (toggle)
 *   • réordonner via les flèches ▲ ▼ (l'ordre est utilisé sur la fiche
 *     venue mobile pour l'affichage public)
 *   • sauvegarder via RPC update_venue_payment_methods (migration 0063)
 *
 * RPC valide les slugs, dédoublonne et préserve l'ordre. Refuse une liste
 * vide (AT_LEAST_ONE_METHOD_REQUIRED).
 */

const ALL_METHODS: PaymentMethodName[] = [
  'paiya-pay',
  'orange-money',
  'mtn-money',
  'moov-money',
  'wave',
  'visa',
  'mastercard',
];

const METHOD_DESCRIPTIONS: Record<PaymentMethodName, string> = {
  'paiya-pay':    'Wallet interne Soutra-Paiya — instantané, sans frais',
  'orange-money': 'Mobile Money Orange — leader Côte d\'Ivoire',
  'mtn-money':    'MTN Mobile Money — large couverture',
  'moov-money':   'Moov Money — populaire en zones rurales',
  'wave':         'Wave — frais réduits, jeune public',
  'visa':         'Carte Visa — clients internationaux & business',
  'mastercard':   'Mastercard — clients internationaux & business',
};

export function PaymentMethodsPanel({ venueId }: { venueId: string }) {
  const sb = supabaseBrowser();
  const [loaded, setLoaded] = useState(false);
  const [methods, setMethods] = useState<PaymentMethodName[]>([]);
  const [initial, setInitial] = useState<PaymentMethodName[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    if (!venueId) return;
    let mounted = true;
    (async () => {
      const { data } = await (sb as any)
        .from('venues')
        .select('payment_methods')
        .eq('id', venueId)
        .maybeSingle();
      if (!mounted) return;
      const raw = (data?.payment_methods ?? []) as string[];
      const clean = raw.filter((m): m is PaymentMethodName =>
        (ALL_METHODS as readonly string[]).includes(m),
      );
      setMethods(clean);
      setInitial(clean);
      setLoaded(true);
    })();
    return () => { mounted = false; };
  }, [sb, venueId]);

  const inactive = useMemo(
    () => ALL_METHODS.filter((m) => !methods.includes(m)),
    [methods],
  );

  const dirty = useMemo(() => {
    if (methods.length !== initial.length) return true;
    return methods.some((m, i) => initial[i] !== m);
  }, [methods, initial]);

  const enable = useCallback((m: PaymentMethodName) => {
    setMethods((p) => p.includes(m) ? p : [...p, m]);
  }, []);
  const disable = useCallback((m: PaymentMethodName) => {
    setMethods((p) => p.filter((x) => x !== m));
  }, []);
  const moveUp = useCallback((i: number) => {
    if (i <= 0) return;
    setMethods((p) => {
      const next = [...p];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }, []);
  const moveDown = useCallback((i: number) => {
    setMethods((p) => {
      if (i >= p.length - 1) return p;
      const next = [...p];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (methods.length === 0) {
      flash('Au moins une méthode requise', false);
      return;
    }
    setSaving(true);
    const { data, error } = await (sb.rpc as any)('update_venue_payment_methods', {
      p_venue_id: venueId,
      p_methods: methods,
    });
    setSaving(false);
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('AT_LEAST_ONE_METHOD_REQUIRED')) flash('Au moins une méthode requise', false);
      else if (msg.includes('NOT_AUTHORIZED')) flash('Vous n\'êtes pas propriétaire de ce venue', false);
      else if (msg.includes('VENUE_NOT_FOUND')) flash('Venue introuvable', false);
      else flash(error.message || 'Erreur', false);
      return;
    }
    if (data?.ok) {
      const saved = (data.methods as PaymentMethodName[]) ?? methods;
      setMethods(saved);
      setInitial(saved);
      flash('Moyens de paiement sauvegardés');
    }
  }, [sb, venueId, methods, flash]);

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
        Chargement…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-dark">Moyens de paiement acceptés</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Choisis et réordonne les moyens visibles par tes clients sur l&apos;app mobile.
          </p>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-primary-500/30 transition hover:bg-primary-600 disabled:opacity-50"
          >
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        )}
      </div>

      {/* Méthodes actives — réordonnable */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Actives ({methods.length})
        </p>
        {methods.length === 0 ? (
          <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Aucune méthode active — tes clients ne pourront pas payer.
            Active au moins une méthode ci-dessous.
          </p>
        ) : (
          <ul className="space-y-2">
            {methods.map((m, i) => (
              <li
                key={m}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3"
              >
                <span className="w-6 text-center font-mono text-xs font-bold text-neutral-400">
                  {i + 1}
                </span>
                <PaymentLogo name={m} className="h-9 w-auto" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-dark">
                    {labelOf(m)}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {METHOD_DESCRIPTIONS[m]}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn
                    title="Monter"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                  >▲</IconBtn>
                  <IconBtn
                    title="Descendre"
                    onClick={() => moveDown(i)}
                    disabled={i === methods.length - 1}
                  >▼</IconBtn>
                  <button
                    type="button"
                    onClick={() => disable(m)}
                    className="ml-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    title="Désactiver"
                  >
                    Désactiver
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Méthodes inactives — à activer */}
      {inactive.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Inactives ({inactive.length})
          </p>
          <ul className="space-y-2">
            {inactive.map((m) => (
              <li
                key={m}
                className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-3 opacity-90"
              >
                <PaymentLogo name={m} className="h-9 w-auto opacity-60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-600">
                    {labelOf(m)}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {METHOD_DESCRIPTIONS[m]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => enable(m)}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  Activer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-xl ${
          toast.ok
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800'
            : 'border-red-500/40 bg-red-500/15 text-red-800'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function labelOf(m: PaymentMethodName): string {
  switch (m) {
    case 'visa':         return 'Visa';
    case 'mastercard':   return 'Mastercard';
    case 'orange-money': return 'Orange Money';
    case 'mtn-money':    return 'MTN Mobile Money';
    case 'moov-money':   return 'Moov Money';
    case 'wave':         return 'Wave';
    case 'paiya-pay':    return 'Paiya-Pay';
  }
}

function IconBtn({
  children, onClick, disabled, title,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-xs font-bold text-neutral-600 transition hover:border-primary-300 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-neutral-200 disabled:hover:text-neutral-600"
    >
      {children}
    </button>
  );
}
