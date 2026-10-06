'use client';

/**
 * Carte des résultats (Leaflet + OpenStreetMap : sans clé, gratuit). Chargée en dynamic ssr:false
 * via ResultsMapLazy. Épingles « pastille de prix », survol synchronisé avec la liste
 * (highlightId / onSelect) et bouton « Rechercher dans cette zone ».
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useI18n } from '@/lib/i18n/client';

export interface MapItem {
  id: string; href: string; title: string; sub: string; image: string | null; emoji: string;
  rating: number | null; ratingCount: number; price: number | null; lat: number; lng: number;
}
export interface Area { lat: number; lng: number; radiusKm: number }

const CI_CENTER: [number, number] = [6.8, -5.3];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function compact(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '')} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n);
}

function pin(it: MapItem, hot: boolean) {
  const label = it.price ? compact(it.price) : it.emoji;
  const bg = hot ? '#0E1116' : '#fff';
  const fg = hot ? '#fff' : '#0E1116';
  return L.divIcon({
    className: '',
    html: `<div style="width:max-content;transform:translate(-50%,-100%) scale(${hot ? 1.18 : 1});transform-origin:bottom center;transition:transform .15s;white-space:nowrap"><div style="background:${bg};color:${fg};border:2px solid ${hot ? '#FF6B1A' : '#0E1116'};border-radius:999px;padding:4px 10px;display:block;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)">${esc(label)}</div></div>`,
    iconSize: [0, 0],
  });
}

const rad = (d: number) => (d * Math.PI) / 180;
function km(a: [number, number], b: [number, number]) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function FitBounds({ items, user, quiet }: { items: MapItem[]; user?: [number, number]; quiet: React.MutableRefObject<number> }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = items.map((v) => [v.lat, v.lng]);
    if (user) pts.push(user);
    if (pts.length === 0) return;
    quiet.current = 2; // moveend déclenchés par nous : n'affichent pas « rechercher dans cette zone »
    if (pts.length === 1) map.setView(pts[0], 14);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [items, user, map, quiet]);
  return null;
}

function MoveWatcher({ quiet, onMoved }: { quiet: React.MutableRefObject<number>; onMoved: () => void }) {
  useMapEvents({ moveend: () => { if (quiet.current > 0) { quiet.current -= 1; return; } onMoved(); } });
  return null;
}

function AreaButton({ onSearch, label }: { onSearch: (a: Area) => void; label: string }) {
  const map = useMap();
  return (
    <div className="leaflet-top leaflet-left" style={{ left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
      <div className="leaflet-control" style={{ pointerEvents: 'auto', marginTop: 12 }}>
        <button type="button" onClick={() => {
          const c = map.getCenter(); const ne = map.getBounds().getNorthEast();
          onSearch({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), radiusKm: Math.min(500, Math.max(0.5, Math.round(km([c.lat, c.lng], [ne.lat, ne.lng]) * 10) / 10)) });
        }} style={{ background: '#0E1116', color: '#fff', border: 0, borderRadius: 999, padding: '9px 16px', font: '600 13px system-ui,sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.35)', cursor: 'pointer' }}>
          {label}
        </button>
      </div>
    </div>
  );
}

export default function ResultsMap({ items, user, highlightId, onSelect, onSearchArea, className }: {
  items: MapItem[]; user?: [number, number]; highlightId?: string | null; onSelect?: (id: string) => void;
  onSearchArea?: (a: Area) => void; className?: string;
}) {
  const { t, fmtXOF } = useI18n();
  const quiet = useRef(2);
  const [moved, setMoved] = useState(false);
  useEffect(() => { setMoved(false); }, [items]);

  return (
    <MapContainer center={user ?? CI_CENTER} zoom={user ? 12 : 7} scrollWheelZoom className={className ?? 'h-[70vh] min-h-[420px] w-full rounded-2xl border border-neutral-200'}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds items={items} user={user} quiet={quiet} />
      {onSearchArea && <MoveWatcher quiet={quiet} onMoved={() => setMoved(true)} />}
      {onSearchArea && moved && <AreaButton label={t('split.searchHere')} onSearch={(a) => { setMoved(false); onSearchArea(a); }} />}
      {user && <Marker position={user} icon={L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb55"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })}><Popup>{t('map.you')}</Popup></Marker>}
      {items.map((v) => {
        const hot = v.id === highlightId;
        return (
          <Marker key={v.id} position={[v.lat, v.lng]} icon={pin(v, hot)} zIndexOffset={hot ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(v.id) }}>
            <Popup>
              <div style={{ width: 210 }}>
                {v.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={v.image} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8 }} />}
                <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{v.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#555' }}>{v.emoji} {v.sub}</p>
                <p style={{ margin: '2px 0', fontSize: 12 }}>
                  {v.ratingCount > 0 ? `★ ${Number(v.rating).toFixed(1)} (${v.ratingCount})` : t('common.new')}
                  {v.price ? ` · ${fmtXOF(v.price)}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, marginTop: 4 }}>
                  <a href={v.href} style={{ fontWeight: 700, color: '#C2410C' }}>{t('common.viewSheet')}</a>
                  <a href={`https://www.openstreetmap.org/directions?to=${v.lat}%2C${v.lng}`} target="_blank" rel="noreferrer">{t('common.directions')}</a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
