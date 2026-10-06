'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { supabaseBrowser } from '@/lib/supabase';

export interface PricePreview {
  gross_xof: number; discount_xof: number; total_xof: number;
  offer: { id: string; title: string; kind: string; code: string | null } | null; error: string | null;
}

/**
 * Aperçu serveur du prix (offres automatiques + code). Le prix réellement facturé est recalculé
 * côté base à la réservation : cet aperçu n'est qu'informatif.
 */
export function usePricePreview(kind: 'trip' | 'activity', target: string | null, participants: number, pkg: string | null, code: string) {
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!target) { setPreview(null); return; }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const { data, error } = await (supabaseBrowser() as any).rpc('preview_booking_price', {
        p_kind: kind, p_target: target, p_participants: participants, p_package: pkg, p_code: code.trim() || null,
      });
      if (id === seq.current) setPreview(error ? null : (data as PricePreview));
    }, 250);
    return () => clearTimeout(timer);
  }, [kind, target, participants, pkg, code]);
  return preview;
}

export function PromoField({ value, onChange, preview }: {
  value: string; onChange: (v: string) => void; preview: PricePreview | null;
}) {
  const { t, fmtXOF } = useI18n();
  const [draft, setDraft] = useState(value);
  const err = preview?.error;
  return (
    <div className="space-y-1">
      <label className="block text-sm font-semibold" htmlFor="promo-code">{t('promo.label')}</label>
      <div className="flex gap-2">
        <input id="promo-code" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder={t('promo.placeholder')}
               autoComplete="off" maxLength={40}
               className="w-full rounded-xl border border-neutral-300 px-3 py-2 uppercase" />
        <button type="button" onClick={() => onChange(draft.trim())}
                className="whitespace-nowrap rounded-xl border border-primary-500 px-4 text-sm font-semibold text-primary-700 hover:bg-primary-50">
          {t('promo.apply')}
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {err && value && <p className="text-red-700">{t(`promo.err.${err}` as 'promo.err.generic') === `promo.err.${err}` ? t('promo.err.generic') : t(`promo.err.${err}` as 'promo.err.generic')}</p>}
        {!err && preview?.offer && preview.discount_xof > 0 && (
          <p className="font-medium text-success">
            {t(value && preview.offer.code ? 'promo.applied' : 'promo.auto', { title: preview.offer.title, amount: fmtXOF(preview.discount_xof) })}
          </p>
        )}
      </div>
    </div>
  );
}

/** Lignes prix avant/après réduction + total. */
export function PriceSummary({ preview, fallback, label }: { preview: PricePreview | null; fallback: number; label: string }) {
  const { t, fmtXOF } = useI18n();
  const discounted = preview && preview.discount_xof > 0;
  return (
    <div className="border-t pt-3">
      {discounted && (
        <>
          <div className="flex justify-between text-sm text-neutral-500"><span>{t('promo.gross')}</span><span className="line-through">{fmtXOF(preview!.gross_xof)}</span></div>
          <div className="flex justify-between text-sm text-success"><span>{t('promo.discount')}</span><span>−{fmtXOF(preview!.discount_xof)}</span></div>
        </>
      )}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm text-neutral-600">{label}</span>
        <span className="text-xl font-bold text-primary-700">{fmtXOF(preview ? preview.total_xof : fallback)}</span>
      </div>
    </div>
  );
}
