import type { GeoPoint, TravelEstimate } from '@sanjeevani/types';
import { MapsError, fetchWithTimeout, type RoutingProvider } from '../types';

/**
 * Google Routes API.
 *  - computeRouteMatrix: POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
 *  - computeRoutes:      POST https://routes.googleapis.com/directions/v2:computeRoutes
 */
interface MatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
}

function parseDuration(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return m ? Number(m[1]) : null;
}

const waypoint = (p: GeoPoint) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

export interface GoogleRoutesOptions {
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  /** Used for destinations the matrix couldn't route. */
  fallback: RoutingProvider;
}

export class GoogleRoutesProvider implements RoutingProvider {
  readonly id = 'google_routes' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GoogleRoutesOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async estimate(origin: GeoPoint, destinations: GeoPoint[]): Promise<TravelEstimate[]> {
    if (destinations.length === 0) return [];
    const res = await fetchWithTimeout(
      this.fetchImpl,
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
        },
        body: JSON.stringify({
          origins: [waypoint(origin)],
          destinations: destinations.map(waypoint),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
      },
      this.options.timeoutMs,
    );
    const raw = await res.text();
    const elements = parseMatrix(raw);
    const fallback = await this.options.fallback.estimate(origin, destinations);
    return destinations.map((_, i) => {
      const el = elements.find((e) => (e.destinationIndex ?? 0) === i);
      const seconds = parseDuration(el?.duration);
      if (!el || el.condition !== 'ROUTE_EXISTS' || seconds === null || el.distanceMeters === undefined) return fallback[i]!;
      return { distanceMeters: el.distanceMeters, durationSeconds: seconds, estimated: false, source: 'google_routes' };
    });
  }

  async route(origin: GeoPoint, destination: GeoPoint): Promise<TravelEstimate> {
    const res = await fetchWithTimeout(
      this.fetchImpl,
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          polylineEncoding: 'ENCODED_POLYLINE',
        }),
      },
      this.options.timeoutMs,
    );
    const body = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] };
    const r = body.routes?.[0];
    const seconds = parseDuration(r?.duration);
    if (!r || seconds === null || r.distanceMeters === undefined) {
      const [estimate] = await this.options.fallback.estimate(origin, [destination]);
      if (!estimate) throw new MapsError('bad_response', 'No route found');
      return estimate;
    }
    return {
      distanceMeters: r.distanceMeters,
      durationSeconds: seconds,
      estimated: false,
      source: 'google_routes',
      ...(r.polyline?.encodedPolyline ? { polyline: r.polyline.encodedPolyline } : {}),
    };
  }
}

/** The matrix endpoint returns a JSON array; tolerate newline-delimited objects too. */
export function parseMatrix(raw: string): MatrixElement[] {
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as MatrixElement[]) : [parsed as MatrixElement];
  } catch {
    return text
      .split('\n')
      .map((line) => line.trim().replace(/^[[,]|[\],]$/g, ''))
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as MatrixElement];
        } catch {
          return [];
        }
      });
  }
}
