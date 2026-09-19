import type { Facility, FacilityType, GeoPoint, Language, Specialty, TravelEstimate } from '@sanjeevani/types';

export interface FacilitySearch {
  origin: GeoPoint;
  facilityType: FacilityType;
  specialty: Specialty;
  radiusMeters: number;
  language: Language;
  maxResults: number;
}

export interface HospitalProvider {
  readonly id: 'google_places' | 'curated_directory';
  readonly attribution: string;
  search(query: FacilitySearch): Promise<Facility[]>;
  getById(id: string, language: Language): Promise<Facility | null>;
}

export interface RoutingProvider {
  readonly id: 'google_routes' | 'haversine_estimate';
  /** Travel estimates from one origin to many destinations, in the same order. */
  estimate(origin: GeoPoint, destinations: GeoPoint[]): Promise<TravelEstimate[]>;
  /** Single route with a polyline, when the provider supports it. */
  route(origin: GeoPoint, destination: GeoPoint): Promise<TravelEstimate>;
}

export type MapsErrorKind = 'timeout' | 'rate_limited' | 'unavailable' | 'auth' | 'bad_response';

export class MapsError extends Error {
  constructor(
    readonly kind: MapsErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MapsError';
  }
}

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const kind: MapsErrorKind =
        res.status === 429 ? 'rate_limited' : res.status === 401 || res.status === 403 ? 'auth' : 'unavailable';
      throw new MapsError(kind, `Maps provider responded ${res.status}`, res.status);
    }
    return res;
  } catch (error) {
    if (error instanceof MapsError) throw error;
    if (controller.signal.aborted) throw new MapsError('timeout', 'Maps request timed out');
    throw new MapsError('unavailable', `Maps request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
