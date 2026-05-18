'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseBrowser } from './supabase';

export type RealtimeStatus = 'idle' | 'subscribing' | 'live' | 'error';

type Row = Record<string, unknown>;

interface Options<T extends Row> {
  /** Nom de la table Postgres écoutée (schéma `public`). */
  table: string;
  /** Filtre Realtime, ex. `venue_id=eq.<uuid>`. */
  filter?: string;
  /** Quand `false`, aucun abonnement n'est ouvert. */
  enabled?: boolean;
  onInsert?: (row: T) => void;
  onUpdate?: (row: T, old: Partial<T>) => void;
  onDelete?: (old: Partial<T>) => void;
  onError?: (message: string) => void;
}

/**
 * Abonne le composant aux changements Postgres d'une table via Supabase
 * Realtime (`postgres_changes`). Pas de polling : la connexion WebSocket
 * pousse chaque INSERT / UPDATE / DELETE dès qu'il survient en base.
 *
 * Le client Supabase reconnecte automatiquement le canal en cas de coupure
 * réseau ; `status` repasse à `live` une fois la connexion rétablie.
 */
export function useRealtime<T extends Row>(opts: Options<T>): RealtimeStatus {
  const { table, filter, enabled = true } = opts;
  const [status, setStatus] = useState<RealtimeStatus>('idle');

  // Garde les callbacks à jour sans relancer l'abonnement à chaque rendu.
  const cbRef = useRef(opts);
  cbRef.current = opts;

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let supabase;
    try {
      supabase = supabaseBrowser();
    } catch (err) {
      setStatus('error');
      cbRef.current.onError?.(err instanceof Error ? err.message : String(err));
      return;
    }

    setStatus('subscribing');

    const channelName = `rt-${table}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<T>) => {
          const cb = cbRef.current;
          if (payload.eventType === 'INSERT') {
            cb.onInsert?.(payload.new as T);
          } else if (payload.eventType === 'UPDATE') {
            cb.onUpdate?.(payload.new as T, payload.old as Partial<T>);
          } else if (payload.eventType === 'DELETE') {
            cb.onDelete?.(payload.old as Partial<T>);
          }
        },
      )
      .subscribe((channelStatus, err) => {
        if (channelStatus === 'SUBSCRIBED') {
          setStatus('live');
        } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setStatus('error');
          cbRef.current.onError?.(
            err?.message ??
              `Canal Realtime "${table}" indisponible. Vérifie que la table est ` +
                'publiée (migration 0002_realtime_notifications.sql).',
          );
        } else if (channelStatus === 'CLOSED') {
          setStatus('idle');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);

  return status;
}

/** Agrège plusieurs statuts de canaux en un seul indicateur pour l'UI. */
export function combineStatus(...statuses: RealtimeStatus[]): RealtimeStatus {
  const active = statuses.filter((s) => s !== 'idle');
  if (active.length === 0) return 'idle';
  if (active.some((s) => s === 'error')) return 'error';
  if (active.some((s) => s === 'subscribing')) return 'subscribing';
  return 'live';
}
