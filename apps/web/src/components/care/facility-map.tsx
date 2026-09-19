'use client';

import type { GeoPoint } from '@sanjeevani/types';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

/** Decodes a Google encoded polyline (precision 5). */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '© OpenStreetMap contributors';

function pin(color: string, label: string) {
  return `<div class="sv-pin" style="--pin:${color}"><span>${label}</span></div>`;
}

export function FacilityMap({
  facility,
  origin,
  polyline,
  labels,
  className,
}: {
  facility: { location: GeoPoint; name: string };
  origin: GeoPoint | null;
  polyline?: string | undefined;
  labels: { you: string };
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;
    (async () => {
      try {
        const L = await import('leaflet');
        if (disposed || !container.current) return;
        map = L.map(container.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
        L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, className: 'sv-tiles' }).addTo(map);

        const dest = L.marker([facility.location.lat, facility.location.lng], {
          icon: L.divIcon({ className: '', html: pin('var(--u-emergency)', 'H'), iconSize: [36, 44], iconAnchor: [18, 42] }),
          title: facility.name,
          keyboard: true,
        }).addTo(map);
        dest.bindTooltip(facility.name, { direction: 'top', offset: [0, -40] });

        const bounds = L.latLngBounds([[facility.location.lat, facility.location.lng]]);
        if (origin) {
          L.marker([origin.lat, origin.lng], {
            icon: L.divIcon({ className: '', html: '<div class="sv-you" aria-hidden="true"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
            title: labels.you,
          }).addTo(map);
          bounds.extend([origin.lat, origin.lng]);
          if (polyline) {
            const path = decodePolyline(polyline);
            L.polyline(path, { color: '#2d6a5c', weight: 5, opacity: 0.9 }).addTo(map);
            path.forEach((p) => bounds.extend(p));
          } else {
            L.polyline(
              [
                [origin.lat, origin.lng],
                [facility.location.lat, facility.location.lng],
              ],
              { color: '#2d6a5c', weight: 3, opacity: 0.8, dashArray: '6 10' },
            ).addTo(map);
          }
        }
        map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [facility.location.lat, facility.location.lng, facility.name, origin, polyline, labels.you]);

  if (failed) return null;
  return (
    <div
      ref={container}
      role="img"
      aria-label={facility.name}
      className={
        className ??
        'h-64 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-sunk)] shadow-[var(--shadow-soft)]'
      }
    />
  );
}
