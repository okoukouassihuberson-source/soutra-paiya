'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase';
import {
  categoriesByGroup,
  businessTypeOf,
  modulesForBusinessType,
  BUSINESS_TYPE_LABELS,
  type VenueCategoryMeta,
  type ProModule,
} from '@soutra/shared';

/**
 * /pro/onboard — wizard 4 étapes d'inscription Pro.
 *
 * Spec PO (Soutra-Paiya) :
 *   "L'inscription doit être ultra simple. Maximum 2 minutes pour être
 *    opérationnel."
 *
 * Étape 1 : Vérification compte (nom complet)
 * Étape 2 : Sélection catégorie + preview live des modules débloqués
 * Étape 3 : Nom + ville + adresse de l'établissement
 * Étape 4 : Récapitulatif + appel RPC pro_create_venue (migration 0061)
 *           → redirect /pro?venue=<id_créé>
 *
 * Pas de ProShell ici : bypass dans apps/web/app/pro/_components/ProShell.tsx
 * sur pathname commençant par /pro/onboard.
 */

type Step = 1 | 2 | 3 | 4;

const MODULE_LABELS: Record<ProModule, string> = {
  'dashboard':      'Dashboard',
  'reservations':   'Réservation de table',
  'events':         'Événements & billetterie',
  'menu':           'Menus, plats, boissons',
  'shop-products':  'Catalogue produits + stock',
  'shop-orders':    'Commandes + livraison',
  'hotel-rooms':    'Chambres & disponibilités',
  'hotel-bookings': 'Réservations nuitées',
  'analytics':      'Analytics & statistiques',
  'finances':       'Finances & paiements',
  'marketing':      'Promotions & marketing',
  'settings':       'Paramètres',
};

const CATEGORY_GROUPS = categoriesByGroup();

export default function ProOnboardPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape 1 — compte
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Étape 2 — catégorie
  const [category, setCategory] = useState<string>('restaurant');

  // Étape 3 — établissement
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('Abidjan');
  const [address, setAddress] = useState('');

  // Charge le profil et redirige si l'user a déjà un venue (ne pas refaire
  // le wizard).
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      // Si l'user a déjà un venue actif, il a déjà fait l'onboarding → /pro
      const { data: existing } = await (supabase as any)
        .from('venues')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();
      if (existing && mounted) {
        router.replace(`/pro?venue=${existing.id}`);
        return;
      }

      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('full_name, phone')
        .eq('id', user.id)
        .maybeSingle();
      if (mounted) {
        setFullName(profile?.full_name || '');
        setPhone(profile?.phone || (user.phone ? `+${user.phone}` : ''));
        setProfileLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [supabase, router]);

  // Catégorie sélectionnée → meta + modules dispo (preview étape 2)
  const selectedCategoryMeta = useMemo<VenueCategoryMeta | null>(() => {
    for (const g of CATEGORY_GROUPS) {
      const m = g.items.find((c) => c.value === category);
      if (m) return m;
    }
    return null;
  }, [category]);

  const previewModules = useMemo<ProModule[]>(() => {
    if (!selectedCategoryMeta) return [];
    return modulesForBusinessType(businessTypeOf(selectedCategoryMeta.value))
      .filter((m) => m !== 'dashboard' && m !== 'settings');
  }, [selectedCategoryMeta]);

  // Navigation
  const canGoNext = (() => {
    if (step === 1) return fullName.trim().length >= 2;
    if (step === 2) return !!selectedCategoryMeta;
    if (step === 3) return venueName.trim().length >= 2 && address.trim().length >= 4;
    return true;
  })();

  const next = useCallback(() => {
    if (!canGoNext) return;
    setError(null);
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }, [canGoNext]);
  const prev = useCallback(() => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }, []);

  // Étape 4 — submit final
  const finalize = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // 1) Sauvegarde du nom complet si modifié à l'étape 1
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      if (fullName.trim()) {
        await (supabase as any)
          .from('profiles')
          .update({ full_name: fullName.trim() })
          .eq('id', user.id);
      }

      // 2) Création du venue via RPC pro_create_venue (migration 0061)
      //    → status='active' direct, defaults intelligents par businessType
      const { data, error: rpcErr } = await (supabase.rpc as any)('pro_create_venue', {
        p_name: venueName.trim(),
        p_category: category,
        p_address: address.trim(),
        p_city: city.trim() || 'Abidjan',
      });

      if (rpcErr) {
        const msg = String(rpcErr.message || '');
        if (msg.includes('NAME_REQUIRED'))         setError('Nom de l\'établissement requis.');
        else if (msg.includes('ADDRESS_REQUIRED')) setError('Adresse requise.');
        else if (msg.includes('NAME_TOO_LONG'))    setError('Nom trop long (200 caractères max).');
        else if (msg.includes('INVALID_CATEGORY')) setError('Catégorie invalide.');
        else if (msg.includes('NOT_AUTHENTICATED'))setError('Session expirée — reconnecte-toi.');
        else                                       setError(rpcErr.message || 'Création impossible.');
        return;
      }
      const result = data as { ok: boolean; reason?: string; venue_id?: string };
      if (!result?.ok) {
        if (result?.reason === 'ALREADY_EXISTS') {
          setError('Tu as déjà un établissement avec ce nom et cette adresse.');
        } else {
          setError('Création impossible.');
        }
        return;
      }

      // 3) Redirect direct vers le dashboard du venue créé
      router.replace(`/pro?venue=${result.venue_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setSubmitting(false);
    }
  }, [supabase, router, fullName, venueName, category, address, city]);

  if (!profileLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-primary-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500 text-2xl">
            🚀
          </div>
          <h1 className="font-display text-2xl font-bold text-dark sm:text-3xl">
            Lance ton établissement en 2 minutes
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Activation immédiate — aucun délai d&apos;attente, aucune validation manuelle.
          </p>
        </div>

        {/* Stepper */}
        <ol className="mb-8 flex items-center justify-center gap-2 sm:gap-4">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex items-center gap-2">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition',
                  step === n
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                    : step > n
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-200 text-neutral-500',
                ].join(' ')}
              >
                {step > n ? '✓' : n}
              </div>
              {n < 4 && (
                <div
                  className={[
                    'h-0.5 w-6 transition sm:w-12',
                    step > n ? 'bg-emerald-500' : 'bg-neutral-200',
                  ].join(' ')}
                />
              )}
            </li>
          ))}
        </ol>

        {/* Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {/* ─────── ÉTAPE 1 : COMPTE ─────── */}
          {step === 1 && (
            <section>
              <h2 className="font-display text-xl font-bold text-dark">Tes informations</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Comment doit-on t&apos;appeler ?
              </p>
              <div className="mt-5 space-y-4">
                <Field
                  label="Nom complet *"
                  value={fullName}
                  onChange={setFullName}
                  placeholder="Jean-Marc Konan"
                  autoFocus
                />
                <Field
                  label="Téléphone"
                  value={phone}
                  onChange={() => {}} // verrouillé (vient de l'auth)
                  placeholder="+225XXXXXXXXXX"
                  disabled
                  hint="Numéro lié à ton compte. Modifiable plus tard dans Paramètres."
                />
              </div>
            </section>
          )}

          {/* ─────── ÉTAPE 2 : CATÉGORIE ─────── */}
          {step === 2 && (
            <section>
              <h2 className="font-display text-xl font-bold text-dark">
                Quelle activité exerces-tu ?
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                On adapte ton dashboard automatiquement à ton métier.
              </p>

              <div className="mt-5">
                <label className="mb-1 block text-xs font-medium text-neutral-500">
                  Catégorie de l&apos;établissement
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-dark focus:border-primary-500 focus:outline-none"
                >
                  {CATEGORY_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.label}>
                      {g.items.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.emoji} {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Live preview des modules débloqués */}
              {selectedCategoryMeta && (
                <div className="mt-6 rounded-xl border border-primary-100 bg-primary-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
                      {selectedCategoryMeta.emoji}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
                        Ton mode d&apos;interaction
                      </p>
                      <p className="font-display text-base font-bold text-dark">
                        {BUSINESS_TYPE_LABELS[selectedCategoryMeta.businessType].emoji}{' '}
                        {BUSINESS_TYPE_LABELS[selectedCategoryMeta.businessType].label}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-700">
                      Tu auras accès à
                    </p>
                    <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {previewModules.map((m) => (
                        <li
                          key={m}
                          className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-dark"
                        >
                          <span className="text-emerald-500">✓</span>
                          {MODULE_LABELS[m]}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ─────── ÉTAPE 3 : ÉTABLISSEMENT ─────── */}
          {step === 3 && (
            <section>
              <h2 className="font-display text-xl font-bold text-dark">
                Présente ton établissement
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Juste les infos essentielles — tu pourras enrichir ensuite.
              </p>
              <div className="mt-5 space-y-4">
                <Field
                  label="Nom de l'établissement *"
                  value={venueName}
                  onChange={setVenueName}
                  placeholder={
                    selectedCategoryMeta?.value === 'maquis'
                      ? 'Maquis du Coin'
                      : selectedCategoryMeta?.value === 'hotel'
                        ? 'Hôtel Akwaba'
                        : 'Mon établissement'
                  }
                  autoFocus
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Ville / commune"
                    value={city}
                    onChange={setCity}
                    placeholder="Abidjan"
                  />
                  <Field
                    label="Adresse *"
                    value={address}
                    onChange={setAddress}
                    placeholder="Rue, quartier, repère"
                  />
                </div>
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                💡 Une photo de couverture par défaut sera ajoutée selon ton activité.
                Tu pourras la remplacer dans Paramètres.
              </p>
            </section>
          )}

          {/* ─────── ÉTAPE 4 : RÉCAP + SUBMIT ─────── */}
          {step === 4 && selectedCategoryMeta && (
            <section>
              <h2 className="font-display text-xl font-bold text-dark">
                On y est presque !
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Voici ce qu&apos;on va créer — vérifie et confirme.
              </p>

              <dl className="mt-5 space-y-3 rounded-xl bg-neutral-50 p-5">
                <RecapRow label="Propriétaire" value={fullName} />
                <RecapRow
                  label="Activité"
                  value={`${selectedCategoryMeta.emoji} ${selectedCategoryMeta.label}`}
                />
                <RecapRow label="Établissement" value={venueName} />
                <RecapRow label="Ville" value={city} />
                <RecapRow label="Adresse" value={address} />
              </dl>

              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-2">
                  <span className="text-lg">⚡</span>
                  <div>
                    <p className="font-semibold">Activation immédiate</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Ton établissement sera <strong>visible sur l&apos;app mobile</strong> dès
                      validation. Aucune attente, aucune validation manuelle.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </section>
          )}

          {/* Erreurs aux étapes précédentes */}
          {step !== 4 && error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-6">
            <button
              type="button"
              onClick={prev}
              disabled={step === 1 || submitting}
              className="text-sm font-medium text-neutral-600 transition hover:text-dark disabled:opacity-30"
            >
              ← Retour
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canGoNext}
                className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:bg-primary-600 disabled:opacity-50 disabled:shadow-none"
              >
                Continuer →
              </button>
            ) : (
              <button
                type="button"
                onClick={finalize}
                disabled={submitting}
                className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {submitting ? 'Création…' : 'Lancer mon établissement 🚀'}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-neutral-400">
          Étape {step} sur 4 · Aucune carte bancaire requise · Modification possible à tout moment
        </p>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────── *
 *  CHAMPS                                             *
 * ─────────────────────────────────────────────────── */

function Field({
  label, value, onChange, placeholder, autoFocus, disabled, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark transition focus:border-primary-500 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-500"
      />
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-dark">{value || '—'}</dd>
    </div>
  );
}
