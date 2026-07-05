'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabaseBrowser } from '@/lib/supabase';

/**
 * Sections de photos taguées par type (Menu, Chambres, Vitrine...), en
 * complément de la galerie hero existante (VenueGallery, jamais retouchée).
 * Table dédiée venue_photos (migration 0078).
 */
interface VenuePhoto {
  url: string;
  category: string;
  position: number;
}

export function CategorizedPhotos({ venueId }: { venueId: string }) {
  const [photos, setPhotos] = useState<VenuePhoto[]>([]);

  useEffect(() => {
    if (!venueId) return;
    const sb = supabaseBrowser();
    (async () => {
      const { data } = await (sb as any)
        .from('venue_photos')
        .select('url, category, position')
        .eq('venue_id', venueId)
        .order('category', { ascending: true })
        .order('position', { ascending: true });
      setPhotos((data as VenuePhoto[]) ?? []);
    })();
  }, [venueId]);

  if (photos.length === 0) return null;

  const groups: { category: string; items: VenuePhoto[] }[] = [];
  const order: string[] = [];
  const map = new Map<string, VenuePhoto[]>();
  for (const p of photos) {
    if (!map.has(p.category)) {
      map.set(p.category, []);
      order.push(p.category);
    }
    map.get(p.category)!.push(p);
  }
  for (const category of order) groups.push({ category, items: map.get(category)! });

  return (
    <div className="mt-8">
      {groups.map((group) => (
        <div key={group.category} className="mb-6">
          <p className="mb-2 text-sm font-bold text-dark">{group.category}</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {group.items.map((item, idx) => (
              <div key={`${item.url}-${idx}`} className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl border border-neutral-200">
                <Image src={item.url} alt={group.category} fill sizes="112px" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
