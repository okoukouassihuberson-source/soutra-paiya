'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Lien « Espace établissement / Espace Pro » de la vitrine publique.
 *
 * Cible `/pro` par défaut (même comportement qu'avant, pas de flash SSR
 * possible puisque le serveur rendait déjà `/pro` en dur). Si une session
 * admin existe déjà (l'utilisateur ne s'est pas déconnecté), on bascule
 * vers `/admin` une fois la vérification faite côté client — sinon un
 * admin déjà connecté qui revient sur la page d'accueil se retrouve
 * renvoyé sur le dashboard Pro au lieu du dashboard admin.
 */
export function EstablishmentLink({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const [href, setHref] = useState('/pro');

  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (cancelled || !session?.user) return;
      const { data: profile } = await (sb as any)
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (!cancelled && profile?.role === 'admin') setHref('/admin');
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
