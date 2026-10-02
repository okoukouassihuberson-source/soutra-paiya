'use client';

import dynamic from 'next/dynamic';
import type { MapVenue } from './VenuesMap';

// Leaflet touche `window` à l'import : chargement client uniquement.
const VenuesMap = dynamic(() => import('./VenuesMap'), {
  ssr: false,
  loading: () => <div className="h-[70vh] min-h-[420px] w-full animate-pulse rounded-2xl bg-neutral-100" />,
});

export function VenuesMapLazy(props: { venues: MapVenue[]; user?: [number, number] }) {
  return <VenuesMap {...props} />;
}
