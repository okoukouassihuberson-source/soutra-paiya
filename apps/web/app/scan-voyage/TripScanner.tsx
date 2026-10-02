'use client';

import { useEffect, useRef, useState } from 'react';
import { formatXOF } from '@soutra/shared';
import { supabaseBrowser } from '@/lib/supabase';

const PREFIX = 'soutra:trip:';
type Result = { ok: boolean; error?: string; reference?: string; traveler?: string; participants?: number; trip?: string; balance_due_xof?: number };

const ERRORS: Record<string, string> = {
  UNKNOWN_TICKET: 'Billet inconnu.', ALREADY_USED: 'Billet déjà utilisé.', NOT_PAID: 'Billet non payé / annulé.',
};

export function TripScanner() {
  const [code, setCode] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cam, setCam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);

  async function validate(raw: string) {
    if (busy.current) return;
    const token = raw.trim().replace(PREFIX, '');
    if (!/^[a-f0-9]{32}$/.test(token)) { setMsg('QR code invalide.'); setRes(null); return; }
    busy.current = true; setMsg(null);
    const { data, error } = await (supabaseBrowser() as any).rpc('scan_trip_ticket', { p_qr_token: token });
    busy.current = false;
    if (error) { setMsg(error.message?.includes('NOT_AUTHORIZED') ? "Ce billet n'appartient pas à l'un de vos voyages." : 'Erreur de validation.'); setRes(null); return; }
    setRes(data as Result);
  }

  // Caméra : BarcodeDetector (Chrome/Android/Safari récents). Sinon saisie manuelle.
  useEffect(() => {
    if (!cam) return;
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) { setMsg('Scan caméra non supporté sur ce navigateur : saisissez le code.'); setCam(false); return; }
    let stream: MediaStream | undefined; let raf = 0; let stopped = false;
    const detector = new Detector({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = videoRef.current!; v.srcObject = stream; await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(v);
            if (found[0]?.rawValue) { await validate(found[0].rawValue); setCam(false); return; }
          } catch { /* frame illisible */ }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setMsg('Caméra inaccessible.'); setCam(false); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam]);

  return (
    <div className="mt-6 space-y-4">
      {cam ? <video ref={videoRef} playsInline muted className="w-full rounded-2xl bg-black" /> : (
        <button onClick={() => { setRes(null); setMsg(null); setCam(true); }} className="w-full rounded-xl bg-primary-500 py-3 font-semibold text-white">📷 Scanner avec la caméra</button>
      )}
      <form onSubmit={(e) => { e.preventDefault(); validate(code); }} className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code du billet" className="flex-1 rounded-xl border border-neutral-300" aria-label="Code du billet" />
        <button className="rounded-xl border px-4 font-semibold">Valider</button>
      </form>
      {msg && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
      {res && (
        <div role="status" className={`rounded-2xl p-4 ${res.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>
          <p className="text-lg font-bold">{res.ok ? '✅ Billet valide' : `❌ ${ERRORS[res.error ?? ''] ?? 'Refusé'}`}</p>
          {res.traveler && <p>{res.traveler}</p>}
          {res.ok && <p className="text-sm">{res.trip} · {res.reference} · {res.participants} pers.</p>}
          {res.ok && !!res.balance_due_xof && <p className="mt-1 font-semibold text-amber-800">Solde à encaisser : {formatXOF(res.balance_due_xof)}</p>}
        </div>
      )}
    </div>
  );
}
