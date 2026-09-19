import type {
  FacilitiesStatus,
  Facility,
  FacilityType,
  GeoPoint,
  Language,
  RankedFacility,
  Specialty,
  TravelEstimate,
  Urgency,
} from '@sanjeevani/types';
import { directionsUrl } from './directions';
import { haversineMeters, roundPoint } from './geo';
import type { HospitalProvider, RoutingProvider } from './providers/types';
import { rankFacilities } from './ranking';

export interface FacilityCacheStore {
  get(key: string): Promise<Facility[] | null>;
  set(key: string, value: Facility[], ttlSeconds: number): Promise<void>;
}

export class InMemoryFacilityCache implements FacilityCacheStore {
  private readonly entries = new Map<string, { value: Facility[]; expires: number }>();

  async get(key: string) {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: Facility[], ttlSeconds: number) {
    if (ttlSeconds <= 0) return;
    if (this.entries.size > 500) this.entries.clear();
    this.entries.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

export interface FacilityServiceOptions {
  primary: HospitalProvider;
  /** Used when the primary provider fails (e.g. Google quota). */
  fallback?: HospitalProvider;
  routing: RoutingProvider;
  estimateRouting: RoutingProvider;
  cache: FacilityCacheStore;
  cacheTtlSeconds: number;
  radiusMeters: number;
  onError?: (error: unknown, context: string) => void;
}

export interface FindQuery {
  location: GeoPoint;
  facilityType: FacilityType;
  specialty: Specialty;
  urgency: Urgency;
  language: Language;
  limit: number;
}

export interface FindResult {
  facilities: RankedFacility[];
  status: FacilitiesStatus;
  provider: HospitalProvider['id'];
  attribution: string;
}

export class FacilityService {
  constructor(private readonly options: FacilityServiceOptions) {}

  get providerId() {
    return this.options.primary.id;
  }

  async find(query: FindQuery): Promise<FindResult> {
    const { primary, fallback } = this.options;
    let provider = primary;
    let candidates: Facility[];
    try {
      candidates = await this.search(primary, query);
    } catch (error) {
      this.options.onError?.(error, 'facility_search');
      if (!fallback) return { facilities: [], status: 'unavailable', provider: primary.id, attribution: primary.attribution };
      try {
        provider = fallback;
        candidates = await this.search(fallback, query);
      } catch (fallbackError) {
        this.options.onError?.(fallbackError, 'facility_search_fallback');
        return { facilities: [], status: 'unavailable', provider: primary.id, attribution: primary.attribution };
      }
    }

    if (candidates.length === 0) {
      return { facilities: [], status: 'none_found', provider: provider.id, attribution: provider.attribution };
    }

    const travel = await this.estimate(query.location, candidates);
    const straight = candidates.map((c) => haversineMeters(query.location, c.location));
    const ranked = rankFacilities(candidates, travel, straight, query, (f) =>
      directionsUrl({ destinationName: f.name, destinationAddress: f.address, destinationPlaceId: f.placeId, origin: query.location }),
    ).slice(0, query.limit);

    return {
      facilities: ranked,
      status: ranked.length ? 'ok' : 'none_found',
      provider: provider.id,
      attribution: provider.attribution,
    };
  }

  async details(id: string, language: Language, origin: GeoPoint | null): Promise<RankedFacility | null> {
    const wanted = id.startsWith('gp_') ? 'google_places' : id.startsWith('cd_') ? 'curated_directory' : null;
    const provider = [this.options.primary, this.options.fallback].find((p) => p?.id === wanted);
    if (!provider) return null;
    const facility = await provider.getById(id, language);
    if (!facility) return null;
    let travel: TravelEstimate | null = null;
    if (origin) {
      try {
        travel = await this.options.routing.route(origin, facility.location);
      } catch (error) {
        this.options.onError?.(error, 'route');
        travel = await this.options.estimateRouting.route(origin, facility.location);
      }
    }
    const ranked = rankFacilities(
      [facility],
      [travel ?? { distanceMeters: 0, durationSeconds: 0, estimated: true, source: 'haversine_estimate' }],
      [origin ? haversineMeters(origin, facility.location) : 0],
      { facilityType: 'hospital', specialty: 'general_medicine', urgency: 'routine' },
      (f) => directionsUrl({ destinationName: f.name, destinationAddress: f.address, destinationPlaceId: f.placeId, origin }),
    )[0];
    return ranked ?? null;
  }

  private async search(provider: HospitalProvider, query: FindQuery): Promise<Facility[]> {
    const point = roundPoint(query.location);
    const key = [provider.id, query.facilityType, query.specialty, query.language, point.lat, point.lng].join('|');
    const cached = await this.options.cache.get(key).catch(() => null);
    if (cached) return cached;
    const results = await provider.search({
      origin: query.location,
      facilityType: query.facilityType,
      specialty: query.specialty,
      radiusMeters: this.options.radiusMeters,
      language: query.language,
      maxResults: 20,
    });
    await this.options.cache.set(key, results, this.options.cacheTtlSeconds).catch(() => undefined);
    return results;
  }

  private async estimate(origin: GeoPoint, facilities: Facility[]): Promise<TravelEstimate[]> {
    const points = facilities.map((f) => f.location);
    try {
      return await this.options.routing.estimate(origin, points);
    } catch (error) {
      this.options.onError?.(error, 'routing');
      return this.options.estimateRouting.estimate(origin, points);
    }
  }
}
