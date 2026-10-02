'use client';

/**
 * Carte des résultats Explorer (Leaflet + OpenStreetMap, comme VenueLocationPicker :
 * sans clé, gratuit). Chargée en dynamic ssr:false via VenuesMapLazy.
 * Un clic sur un point ouvre une fiche rapide (photo, note, prix, liens).
 */
import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { categoryEmoji, categoryLabel, formatXOF } from '@soutra/shared';

export interface MapVenue {
  id: string; slug: string; name: string; category: string; lat: number; lng: number;
  rating_avg: number | null; rating_count: number | null; avg_price_xof: number | null;
  cover_url: string | null; district: string | null; city: string | null;
}

const CI_CENTER: [number, number] = [6.8, -5.3];

function icon(emoji: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#FF6B1A;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:16px">${emoji}</span></div>`,
    iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30],
  });
}

function FitBounds({ venues, user }: { venues: MapVenue[]; user?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = venues.map((v) => [v.lat, v.lng]);
    if (user) pts.push(user);
    if (pts.length === 0) return;
    if (pts.length === 1) map.setView(pts[0], 14);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [venues, user, map]);
  return null;
}

export default function VenuesMap({ venues, user }: { venues: MapVenue[]; user?: [number, number] }) {
  return (
    <MapContainer center={user ?? CI_CENTER} zoom={user ? 12 : 7} scrollWheelZoom
      className="h-[70vh] min-h-[420px] w-full rounded-2xl border border-neutral-200">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds venues={venues} user={user} />
      {user && <Marker position={user} icon={L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb55"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })}><Popup>Vous êtes ici</Popup></Marker>}
      {venues.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lng]} icon={icon(categoryEmoji(v.category as any))}>
          <Popup>
            <div style={{ width: 210 }}>
              {v.cover_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={v.cover_url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8 }} />}
              <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{v.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#555' }}>{categoryEmoji(v.category as any)} {categoryLabel(v.category as any)} · {[v.district, v.city].filter(Boolean).join(', ')}</p>
              <p style={{ margin: '2px 0', fontSize: 12 }}>
                {(v.rating_count ?? 0) > 0 ? `★ ${Number(v.rating_avg).toFixed(1)} (${v.rating_count})` : 'Nouveau'}
                {v.avg_price_xof ? ` · ~ ${formatXOF(v.avg_price_xof)}` : ''}
              </p>
              <div style={{ display: 'flex', gap: 8, fontSize: 12, marginTop: 4 }}>
                <a href={`/v/${v.slug}`} style={{ fontWeight: 700, color: '#EA580C' }}>Voir la fiche</a>
                <a href={`https://www.openstreetmap.org/directions?to=${v.lat}%2C${v.lng}`} target="_blank" rel="noreferrer">Itinéraire</a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
