'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { supabaseBrowser } from '@/lib/supabase';

interface Item { kind: 'trip' | 'activity' | 'destination'; slug: string; title: string; price_xof?: number | null; detail?: string | null }
interface Msg { role: 'user' | 'assistant'; content: string; items?: Item[]; error?: boolean }

const PATH = { trip: '/voyages', activity: '/activites', destination: '/destinations' } as const;

/**
 * `compact` : version panneau latéral (AssistantDock) — pas de titre, zone de messages défilante,
 * champ de saisie en bas. `context` : page consultée, transmise à l'assistant avec la 1re question.
 */
export function AssistantChat({ initialText = '', compact = false, context = '' }: { initialText?: string; compact?: boolean; context?: string }) {
  const { t, lp, locale, fmtXOF } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history: Msg[] = [...msgs, { role: 'user', content: question }];
    setMsgs(history); setText(''); setBusy(true);
    const sent = history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    if (context && sent[0]?.role === 'user') sent[0] = { ...sent[0], content: `[${context}]\n${sent[0].content}`.slice(0, 600) };
    const { data, error } = await (supabaseBrowser() as any).functions.invoke('tourism-assistant', {
      body: { locale, messages: sent },
    });
    setBusy(false);
    if (error || !data?.reply) {
      let code = 'generic';
      try { const j = await error?.context?.json?.(); code = j?.error ?? (data as any)?.error ?? 'generic'; } catch { /* noop */ }
      const key = `assistant.err.${code}`;
      const msg = t(key as 'assistant.err.generic');
      setMsgs([...history, { role: 'assistant', content: msg === key ? t('assistant.err.generic') : msg, error: true }]);
      return;
    }
    setRemaining(typeof data.remaining === 'number' ? data.remaining : null);
    setMsgs([...history, { role: 'assistant', content: data.reply, items: data.items ?? [] }]);
  }

  return (
    <div className={compact ? 'flex h-full min-h-0 flex-col' : 'space-y-4'}>
      {!compact && <h1 className="font-display text-3xl font-bold">✨ {t('assistant.title')}</h1>}
      {!compact && <p className="text-neutral-600">{t('assistant.intro')}</p>}
      <div className={compact ? 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3' : 'contents'}>
      {compact && <p className="text-sm text-neutral-600">{t('assistant.intro')}</p>}

      {msgs.length === 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">{t('assistant.suggestions')}</p>
          <div className="flex flex-wrap gap-2">
            {(['s1', 's2', 's3', 's4'] as const).map((k) => (
              <button key={k} onClick={() => send(t(`assistant.${k}`))} className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">{t(`assistant.${k}`)}</button>
            ))}
          </div>
        </div>
      )}

      <ol className="space-y-3" aria-live="polite">
        {msgs.map((m, i) => (
          <li key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[90%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-sm ${m.role === 'user' ? 'bg-primary-500 text-white' : m.error ? 'bg-red-50 text-danger' : 'bg-neutral-100 text-dark'}`}>
              <span className="sr-only">{m.role === 'user' ? t('assistant.you') : t('assistant.bot')} : </span>{m.content}
            </div>
            {m.items && m.items.length > 0 && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p className="col-span-full text-xs font-semibold uppercase text-neutral-500">{t('assistant.results')}</p>
                {m.items.map((it) => (
                  <Link key={`${it.kind}-${it.slug}`} href={lp(`${PATH[it.kind]}/${it.slug}`)} className="rounded-xl border border-neutral-200 bg-white p-3 text-left text-sm shadow-sm hover:shadow-md">
                    <span className="text-xs font-semibold text-primary-600">{t(`assistant.kind.${it.kind}`)}</span>
                    <b className="block">{it.title}</b>
                    {it.detail && <span className="block text-xs text-neutral-500">{it.detail}</span>}
                    {it.price_xof != null && <span className="mt-1 block font-semibold text-primary-600">{t('common.from')} {fmtXOF(it.price_xof)}</span>}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
        {busy && <li className="text-sm text-neutral-500">{t('assistant.thinking')}</li>}
      </ol>
      <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className={compact ? 'm-3 flex gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm' : 'sticky bottom-20 flex gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg'}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t('assistant.placeholder')} aria-label={t('assistant.placeholder')}
               className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
        <button disabled={busy || !text.trim()} className="whitespace-nowrap rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('assistant.send')}</button>
      </form>
      <p className={compact ? 'px-4 pb-3 text-xs text-neutral-600' : 'text-xs text-neutral-500'}>{t('assistant.disclaimer')}{remaining !== null && ` · ${t('assistant.remaining', { n: remaining })}`}</p>
    </div>
  );
}
