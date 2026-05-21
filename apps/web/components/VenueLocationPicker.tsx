'use client';

/**
 * VenueLocationPicker — picker GPS Leaflet+OpenStreetMap pour le PRO dashboard.
 *
 * Pourquoi pas Google Maps : nécessite une clé payante et expose le quota
 * côté client. Leaflet+OSM est gratuit, sans clé, et largement suffisant pour
 * picker une position. Si on veut basculer plus tard, le swap est local à
 * ce composant.
 *
 * Reverse geocoding : Nominatim (OSM). Gratuit, sans clé, mais rate-limité
 * à 1 req/sec — on debounce côté UI et on n'appelle qu'au drop du marker
 * ou à la fin d'une recherche.
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet bundle ses propres icônes via des URL relatives — en Next on
// override pour pointer sur le CDN unpkg (sinon les pins sont cassés).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Composants react-leaflet en dynamic import (SSR-incompatibles).
const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });

// Abidjan, place de la République (centre de gravité par défaut).
const DEFAULT_CENTER: [number, number] = [5.32, -4.02];
const DEFAULT_ZOOM = 13;

// Côte d'Ivoire bounding box élargie (cohérent avec migration 0019).
const CI_BOUNDS: [[number, number], [number, number]] = [[4.0, -9.0], [11.0, -2.0]];

function inCI(lat: number, lng: number): boolean {
  return lat >= CI_BOUNDS[0][0] && lat <= CI_BOUNDS[1][0]
      && lng >= CI_BOUNDS[0][1] && lng <= CI_BOUNDS[1][1];
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  address?: string;
  district?: string;
  city?: string;
};

async function reverseGeocode(lat: number, lng: number): Promise<Partial<GeocodeResult>> {
  // Nominatim : respect du rate limit + user agent obligatoire (politique OSM).
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&accept-language=fr`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    if (!res.ok) return {};
    const data = await res.json();
    const a = data?.address || {};
    return {
      address: data?.display_name || '',
      district: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.county || '',
      city: a.city || a.town || a.village || a.municipality || '',
    };
  } catch {
    return {};
  }
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number; display: string }[]> {
  // Recherche limitée à la Côte d'Ivoire (countrycodes=ci).
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&countrycodes=ci&limit=6&accept-language=fr`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((d: { lat: string; lon: string; display_name: string }) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      display: d.display_name,
    }));
  } catch {
    return [];
  }
}

type Props = {
  initialLat?: number | null;
  initialLng?: number | null;
  onSave: (result: GeocodeResult) => Promise<{ ok: boolean; error?: string }>;
};

export default function VenueLocationPicker({ initialLat, initialLng, onSave }: Props) {
  const [pos, setPos] = useState<[number, number]>(
    initialLat != null && initialLng != null ? [initialLat, initialLng] : DEFAULT_CENTER
  );
  const [hasInitial] = useState(initialLat != null && initialLng != null);
  const [meta, setMeta] = useState<Partial<GeocodeResult>>({});
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ lat: number; lng: number; display: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const markerRef = useRef<L.Marker | null>(null);

  // Reverse geocode au montage si on a une position initiale, pour pré-remplir.
  useEffect(() => {
    if (hasInitial) {
      reverseGeocode(pos[0], pos[1]).then(setMeta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDrag(lat: number, lng: number) {
    setPos([lat, lng]);
    setFeedback(null);
    reverseGeocode(lat, lng).then(setMeta);
  }

  async function locateMe() {
    if (!navigator.geolocation) {
      setFeedback({ kind: 'err', msg: 'Géolocalisation indisponible sur ce navigateur' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        if (!inCI(lat, lng)) {
          setFeedback({ kind: 'err', msg: 'Position hors Côte d\'Ivoire — déplace le pin manuellement' });
          setLocating(false);
          return;
        }
        setPos([lat, lng]);
        reverseGeocode(lat, lng).then(setMeta);
        setLocating(false);
      },
      (err) => {
        setFeedback({ kind: 'err', msg: `Localisation refusée (${err.message})` });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function runSearch() {
    const q = search.trim();
    if (q.length < 3) return;
    setSearching(true);
    const r = await forwardGeocode(q);
    setResults(r);
    setSearching(false);
  }

  function pickResult(r: { lat: number; lng: number; display: string }) {
    if (!inCI(r.lat, r.lng)) {
      setFeedback({ kind: 'err', msg: 'Adresse hors Côte d\'Ivoire' });
      return;
    }
    setPos([r.lat, r.lng]);
    setMeta({ address: r.display });
    setResults([]);
    setSearch('');
    reverseGeocode(r.lat, r.lng).then((m) => setMeta((prev) => ({ ...prev, ...m })));
  }

  async function handleSave() {
    if (!inCI(pos[0], pos[1])) {
      setFeedback({ kind: 'err', msg: 'Position hors Côte d\'Ivoire — déplace le pin' });
      return;
    }
    setSaving(true);
    const out = await onSave({
      lat: pos[0],
      lng: pos[1],
      address: meta.address,
      district: meta.district,
      city: meta.city,
    });
    setSaving(false);
    setFeedback(out.ok
      ? { kind: 'ok', msg: 'Localisation sauvegardée' }
      : { kind: 'err', msg: out.error || 'Échec sauvegarde' });
  }

  return (
    <div className="space-y-3">
      {/* Barre de recherche d'adresse */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
          placeholder="Cherche une adresse (ex. Rue des Jardins, Cocody)"
          className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-dark focus:border-primary-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={searching || search.trim().length < 3}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-primary-500/30 hover:text-primary-500 disabled:opacity-50"
        >
          {searching ? '…' : 'Rechercher'}
        </button>
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-primary-500/30 hover:text-primary-500 disabled:opacity-50"
          title="Détecter ma position GPS"
        >
          {locating ? '…' : '📍 Moi'}
        </button>
      </div>

      {/* Résultats de recherche */}
      {results.length > 0 && (
        <ul className="rounded-xl border border-neutral-200 bg-white">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => pickResult(r)}
                className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 transition hover:bg-primary-50"
              >
                {r.display}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Carte */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200" style={{ height: 360 }}>
        <MapContainer
          center={pos}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={pos}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as L.Marker;
                const { lat, lng } = m.getLatLng();
                applyDrag(lat, lng);
              },
            }}
            ref={(r) => { markerRef.current = r as unknown as L.Marker | null; }}
          />
          <RecenterMap pos={pos} />
        </MapContainer>
      </div>

      {/* Coords + meta */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-neutral-50 px-3 py-2">
          <div className="font-semibold text-neutral-500">Latitude</div>
          <div className="font-mono text-dark">{pos[0].toFixed(6)}</div>
        </div>
        <div className="rounded-xl bg-neutral-50 px-3 py-2">
          <div className="font-semibold text-neutral-500">Longitude</div>
          <div className="font-mono text-dark">{pos[1].toFixed(6)}</div>
        </div>
        {meta.address && (
          <div className="col-span-2 rounded-xl bg-neutral-50 px-3 py-2">
            <div className="font-semibold text-neutral-500">Adresse détectée</div>
            <div className="text-dark">{meta.address}</div>
          </div>
        )}
        {meta.district && (
          <div className="rounded-xl bg-neutral-50 px-3 py-2">
            <div className="font-semibold text-neutral-500">Quartier / Commune</div>
            <div className="text-dark">{meta.district}</div>
          </div>
        )}
        {meta.city && (
          <div className="rounded-xl bg-neutral-50 px-3 py-2">
            <div className="font-semibold text-neutral-500">Ville</div>
            <div className="text-dark">{meta.city}</div>
          </div>
        )}
      </div>

      {feedback && (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {feedback.msg}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full disabled:opacity-50"
      >
        {saving ? 'Sauvegarde…' : 'Enregistrer la position GPS'}
      </button>

      <p className="text-xs text-neutral-400">
        Astuce : déplace le pin sur la carte pour ajuster manuellement. Le pin doit être dans
        l'enceinte de ton établissement — c'est cette position qui sera utilisée pour les itinéraires
        des clients.
      </p>
    </div>
  );
}

// Petit helper interne : recentre la carte quand `pos` change (search/locate).
// useMap est un hook synchrone qui doit être appelé dans un enfant rendu sous
// MapContainer — d'où ce micro-composant.
function RecenterMap({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(pos, map.getZoom(), { duration: 0.6 });
  }, [pos, map]);
  return null;
}
