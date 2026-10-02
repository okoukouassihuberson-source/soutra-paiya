'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type Prefs = Record<string, Record<string, boolean>>;

const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: 'bookings', label: 'Réservations', hint: 'Nouvelle réservation, annulation, expiration' },
  { key: 'payments', label: 'Paiements', hint: 'Paiement confirmé ou reçu, solde à payer' },
  { key: 'reminders', label: 'Rappels', hint: 'Départ proche, activité demain, paiement à finaliser' },
  { key: 'updates', label: 'Modifications', hint: 'Changement d’horaire ou de voyage, avis reçus' },
  { key: 'moderation', label: 'Partenaires et validations', hint: 'Voyage ou activité publié, à valider, nouveau partenaire' },
  { key: 'promotions', label: 'Promotions', hint: 'Offres et bons plans' },
];
// SMS / WhatsApp : prévus par l'architecture, aucun fournisseur branché pour l'instant.
const CHANNELS: { key: string; label: string }[] = [
  { key: 'in_app', label: 'Dans l’app' }, { key: 'push', label: 'Push mobile' }, { key: 'webpush', label: 'Push navigateur' }, { key: 'email', label: 'Email' },
];

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PreferencesForm({ vapidKey }: { vapidKey: string }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [push, setPush] = useState<'unsupported' | 'off' | 'on' | 'denied' | 'busy'>('unsupported');

  useEffect(() => {
    (supabaseBrowser() as any).rpc('get_my_notification_preferences').then(({ data, error }: any) => {
      if (error) setErr('Impossible de charger vos préférences.'); else setPrefs(data as Prefs);
    });
    if (vapidKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      if (Notification.permission === 'denied') { setPush('denied'); return; }
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setPush(sub ? 'on' : 'off')).catch(() => setPush('off'));
    }
  }, [vapidKey]);

  async function toggle(cat: string, ch: string, value: boolean) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [cat]: { ...prefs[cat], [ch]: value } });
    const { error } = await (supabaseBrowser() as any).rpc('set_notification_preference', { p_category: cat, p_channel: ch, p_enabled: value });
    if (error) { setPrefs(before); setErr('Enregistrement impossible, réessayez.'); } else setErr(null);
  }

  async function enablePush() {
    setPush('busy'); setErr(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPush(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { error } = await (supabaseBrowser() as any).rpc('register_web_push', {
        p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setPush('on');
    } catch { setPush('off'); setErr('Activation impossible sur cet appareil.'); }
  }

  async function disablePush() {
    setPush('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await (supabaseBrowser() as any).rpc('unregister_web_push', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
    } finally { setPush('off'); }
  }

  if (!prefs) return <p className="mt-8 text-center text-neutral-500">{err ?? 'Chargement…'}</p>;
  return (
    <div className="mt-6 space-y-6">
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="font-display text-lg font-bold">Notifications sur cet appareil</h2>
        {push === 'unsupported' && <p className="mt-1 text-sm text-neutral-600">Les notifications push du navigateur ne sont pas disponibles ici (navigateur non compatible ou service non configuré).</p>}
        {push === 'denied' && <p className="mt-1 text-sm text-neutral-600">Les notifications sont bloquées dans votre navigateur. Autorisez-les dans les réglages du site pour les activer.</p>}
        {(push === 'off' || push === 'busy') && <button disabled={push === 'busy'} onClick={enablePush} className="mt-3 rounded-xl bg-primary-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">Activer les notifications push</button>}
        {push === 'on' && <div className="mt-2 flex items-center gap-4 text-sm"><span className="font-semibold text-emerald-700">✅ Activées sur cet appareil</span><button onClick={disablePush} className="underline">Désactiver</button></div>}
      </section>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs text-neutral-500">
            <tr><th className="p-4">Type</th>{CHANNELS.map((c) => <th key={c.key} className="p-4 text-center">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.key} className="border-t border-neutral-100">
                <td className="p-4"><b>{cat.label}</b><br /><span className="text-xs text-neutral-500">{cat.hint}</span></td>
                {CHANNELS.map((ch) => (
                  <td key={ch.key} className="p-4 text-center">
                    <input type="checkbox" className="h-5 w-5" checked={!!prefs[cat.key]?.[ch.key]} onChange={(e) => toggle(cat.key, ch.key, e.target.checked)} aria-label={`${cat.label} — ${ch.label}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">SMS et WhatsApp seront proposés prochainement.</p>
    </div>
  );
}
