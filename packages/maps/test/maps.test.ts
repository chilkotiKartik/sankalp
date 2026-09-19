import type { Facility, TravelEstimate } from '@sanjeevani/types';
import { describe, expect, it, vi } from 'vitest';
import {
  CuratedDirectoryProvider,
  EstimatedRoutingProvider,
  FacilityService,
  GURUGRAM_FACILITIES,
  GooglePlacesProvider,
  GoogleRoutesProvider,
  InMemoryFacilityCache,
  MapsError,
  directionsUrl,
  geohash,
  haversineMeters,
  isEligible,
  mapGooglePlace,
  parseMatrix,
  rankFacilities,
  type HospitalProvider,
} from '../src';

const CYBER_CITY = { lat: 28.4952, lng: 77.0888 };

function fac(id: string, overrides: Partial<Facility> = {}): Facility {
  return {
    id,
    placeId: null,
    name: id,
    address: 'Gurugram',
    location: CYBER_CITY,
    coordinatesApproximate: false,
    phone: null,
    emergencyPhone: null,
    types: ['hospital'],
    verifiedSpecialties: [],
    emergency24x7: null,
    openNow: null,
    ownership: null,
    rating: null,
    userRatingCount: null,
    mapsUrl: 'https://maps.example/x',
    website: null,
    source: { provider: 'curated_directory', label: 't' },
    ...overrides,
  };
}

const t = (minutes: number): TravelEstimate => ({ distanceMeters: minutes * 500, durationSeconds: minutes * 60, estimated: true, source: 'haversine_estimate' });
const dir = () => 'https://www.google.com/maps/dir/?api=1&destination=x';

describe('geo helpers', () => {
  it('computes realistic distances', () => {
    const d = haversineMeters(CYBER_CITY, { lat: 28.431627, lng: 77.072103 });
    expect(d).toBeGreaterThan(6500);
    expect(d).toBeLessThan(7500);
  });

  it('encodes coarse geohashes', () => {
    expect(geohash({ lat: 57.64911, lng: 10.40744 }, 5)).toBe('u4pru');
    expect(geohash(CYBER_CITY)).toHaveLength(5);
  });

  it('builds key-less Google Maps direction links', () => {
    const url = new URL(directionsUrl({ destinationName: 'Artemis Hospital', destinationAddress: 'Sector 51', destinationPlaceId: 'abc', origin: CYBER_CITY }));
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('destination')).toBe('Artemis Hospital, Sector 51');
    expect(url.searchParams.get('destination_place_id')).toBe('abc');
    expect(url.searchParams.get('origin')).toBe('28.49520,77.08880');
  });
});

describe('ranking', () => {
  it('does not simply pick the nearest: a 24×7 hospital beats a closer clinic in an emergency-ish case', () => {
    const clinic = fac('clinic', { types: ['clinic'], openNow: true });
    const hospital = fac('hospital', { types: ['hospital', 'emergency_department'], emergency24x7: true });
    const ranked = rankFacilities([clinic, hospital], [t(5), t(12)], [2000, 5000], { facilityType: 'hospital', specialty: 'general_medicine', urgency: 'urgent' }, dir);
    expect(ranked[0]?.id).toBe('hospital');
    expect(ranked.find((r) => r.id === 'clinic')?.reasons).toContain('closest_option');
  });

  it('prefers the verified department for routine care', () => {
    const a = fac('a', { verifiedSpecialties: ['general_medicine'] });
    const b = fac('b', { verifiedSpecialties: ['pediatrics'] });
    const ranked = rankFacilities([a, b], [t(15), t(14)], [0, 0], { facilityType: 'hospital', specialty: 'pediatrics', urgency: 'routine' }, dir);
    expect(ranked[0]?.id).toBe('b');
    expect(ranked[0]?.reasons).toContain('specialty_verified');
    expect(ranked[1]?.reasons).toContain('specialty_unverified');
  });

  it('excludes closed facilities and clinics in emergencies', () => {
    const ctx = { facilityType: 'emergency_department' as const, specialty: 'emergency_medicine' as const, urgency: 'emergency' as const };
    expect(isEligible(fac('c', { types: ['clinic'] }), ctx)).toBe(false);
    expect(isEligible(fac('closed', { openNow: false }), ctx)).toBe(false);
    expect(isEligible(fac('er', { openNow: false, emergency24x7: true }), ctx)).toBe(true);
  });

  it('exposes transparent factor scores between 0 and 1', () => {
    const [r] = rankFacilities([fac('x', { emergency24x7: true })], [t(10)], [100], { facilityType: 'hospital', specialty: 'general_medicine', urgency: 'routine' }, dir);
    for (const v of Object.values(r!.factors)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(r!.reasons).toContain('has_24x7_emergency');
  });
});

describe('curated directory', () => {
  it('only contains sourced, dated records', () => {
    for (const f of GURUGRAM_FACILITIES) {
      expect(f.sourceUrl).toMatch(/^https:\/\//);
      expect(f.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (f.verifiedSpecialties.length === 0) expect(f.emergency24x7).toBeNull();
    }
  });

  it('searches by radius and sorts by distance', async () => {
    const provider = new CuratedDirectoryProvider(async () => GURUGRAM_FACILITIES);
    const results = await provider.search({ origin: CYBER_CITY, facilityType: 'hospital', specialty: 'general_medicine', radiusMeters: 15000, language: 'en', maxResults: 10 });
    expect(results.length).toBeGreaterThan(3);
    const d = results.map((r) => haversineMeters(CYBER_CITY, r.location));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(await provider.getById('cd_artemis-hospital-gurugram', 'en')).not.toBeNull();
    expect(await provider.getById('cd_nope', 'en')).toBeNull();
  });
});

describe('Google providers', () => {
  const place = {
    id: 'ChIJ123456789abc',
    displayName: { text: 'City Hospital' },
    formattedAddress: 'MG Road, Gurugram',
    location: { latitude: 28.48, longitude: 77.08 },
    types: ['hospital', 'point_of_interest'],
    nationalPhoneNumber: '0124 400 0000',
    currentOpeningHours: { openNow: true },
    businessStatus: 'OPERATIONAL',
    rating: 4.4,
    userRatingCount: 1200,
    googleMapsUri: 'https://maps.google.com/?cid=1',
  };

  it('maps Places (New) results without inventing emergency availability', () => {
    const f = mapGooglePlace(place)!;
    expect(f.id).toBe('gp_ChIJ123456789abc');
    expect(f.types).toEqual(['hospital']);
    expect(f.emergency24x7).toBeNull();
    expect(f.verifiedSpecialties).toEqual([]);
    expect(f.openNow).toBe(true);
    expect(mapGooglePlace({ ...place, businessStatus: 'CLOSED_PERMANENTLY' })).toBeNull();
  });

  it('calls Nearby Search with a field mask and location restriction', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ places: [place] }), { status: 200 }));
    const provider = new GooglePlacesProvider({ apiKey: 'k', timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await provider.search({ origin: CYBER_CITY, facilityType: 'hospital', specialty: 'general_medicine', radiusMeters: 5000, language: 'hi', maxResults: 30 });
    expect(out).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toContain('places.displayName');
    const body = JSON.parse(String(init.body));
    expect(body.maxResultCount).toBe(20);
    expect(body.locationRestriction.circle.radius).toBe(5000);
    expect(body.languageCode).toBe('hi');
  });

  it('maps HTTP failures to typed errors', async () => {
    const provider = new GooglePlacesProvider({ apiKey: 'k', timeoutMs: 1000, fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch });
    await expect(provider.search({ origin: CYBER_CITY, facilityType: 'hospital', specialty: 'general_medicine', radiusMeters: 5000, language: 'en', maxResults: 5 })).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('parses route matrix responses and falls back per destination', async () => {
    expect(parseMatrix('[{"destinationIndex":0,"duration":"60s"}]')).toHaveLength(1);
    const matrix = [
      { originIndex: 0, destinationIndex: 0, distanceMeters: 4200, duration: '780s', condition: 'ROUTE_EXISTS' },
      { originIndex: 0, destinationIndex: 1, condition: 'ROUTE_NOT_FOUND' },
    ];
    const routes = new GoogleRoutesProvider({
      apiKey: 'k',
      timeoutMs: 1000,
      fallback: new EstimatedRoutingProvider(1.35, 22),
      fetchImpl: (async () => new Response(JSON.stringify(matrix), { status: 200 })) as unknown as typeof fetch,
    });
    const [a, b] = await routes.estimate(CYBER_CITY, [{ lat: 28.47, lng: 77.07 }, { lat: 28.43, lng: 77.07 }]);
    expect(a).toMatchObject({ distanceMeters: 4200, durationSeconds: 780, estimated: false });
    expect(b?.estimated).toBe(true);
  });
});

describe('facility service', () => {
  const curated = new CuratedDirectoryProvider(async () => GURUGRAM_FACILITIES);
  const estimate = new EstimatedRoutingProvider(1.35, 22);

  it('falls back to the curated directory when the primary provider fails', async () => {
    const failing: HospitalProvider = {
      id: 'google_places',
      attribution: 'Google',
      search: async () => {
        throw new MapsError('unavailable', 'down');
      },
      getById: async () => null,
    };
    const onError = vi.fn();
    const service = new FacilityService({ primary: failing, fallback: curated, routing: estimate, estimateRouting: estimate, cache: new InMemoryFacilityCache(), cacheTtlSeconds: 60, radiusMeters: 15000, onError });
    const result = await service.find({ location: CYBER_CITY, facilityType: 'hospital', specialty: 'general_medicine', urgency: 'urgent', language: 'en', limit: 3 });
    expect(result.status).toBe('ok');
    expect(result.provider).toBe('curated_directory');
    expect(result.facilities).toHaveLength(3);
    expect(onError).toHaveBeenCalled();
  });

  it('reports unavailable when every provider fails, and none_found when empty', async () => {
    const failing: HospitalProvider = { id: 'curated_directory', attribution: '', search: async () => Promise.reject(new Error('x')), getById: async () => null };
    const service = new FacilityService({ primary: failing, routing: estimate, estimateRouting: estimate, cache: new InMemoryFacilityCache(), cacheTtlSeconds: 0, radiusMeters: 1000 });
    expect((await service.find({ location: CYBER_CITY, facilityType: 'hospital', specialty: 'general_medicine', urgency: 'routine', language: 'en', limit: 3 })).status).toBe('unavailable');
    const far = new FacilityService({ primary: curated, routing: estimate, estimateRouting: estimate, cache: new InMemoryFacilityCache(), cacheTtlSeconds: 0, radiusMeters: 1000 });
    expect((await far.find({ location: { lat: 19.07, lng: 72.87 }, facilityType: 'hospital', specialty: 'general_medicine', urgency: 'routine', language: 'en', limit: 3 })).status).toBe('none_found');
  });

  it('uses the cache for repeated nearby searches', async () => {
    const search = vi.fn(curated.search.bind(curated));
    const spy: HospitalProvider = { id: 'curated_directory', attribution: '', search, getById: curated.getById.bind(curated) };
    const service = new FacilityService({ primary: spy, routing: estimate, estimateRouting: estimate, cache: new InMemoryFacilityCache(), cacheTtlSeconds: 60, radiusMeters: 15000 });
    const q = { location: CYBER_CITY, facilityType: 'hospital' as const, specialty: 'general_medicine' as const, urgency: 'routine' as const, language: 'en' as const, limit: 3 };
    await service.find(q);
    await service.find({ ...q, location: { lat: 28.49521, lng: 77.08881 } });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('returns details with a route when an origin is known', async () => {
    const service = new FacilityService({ primary: curated, routing: estimate, estimateRouting: estimate, cache: new InMemoryFacilityCache(), cacheTtlSeconds: 0, radiusMeters: 15000 });
    const d = await service.details('cd_medanta-the-medicity-gurugram', 'en', CYBER_CITY);
    expect(d?.travel.distanceMeters).toBeGreaterThan(0);
    expect(d?.reasons).not.toContain('closest_option');
    expect(await service.details('gp_unknown', 'en', null)).toBeNull();
  });
});
