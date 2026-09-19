import type { Facility, FacilityType, Language, Specialty } from '@sanjeevani/types';
import { searchUrl } from '../../directions';
import { MapsError, fetchWithTimeout, type FacilitySearch, type HospitalProvider } from '../types';

/**
 * Google Places API (New).
 *  - Nearby Search: POST https://places.googleapis.com/v1/places:searchNearby
 *  - Place Details: GET  https://places.googleapis.com/v1/places/{id}
 * Field masks keep requests to the fields we actually render (and bill for).
 */
const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'primaryType',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'currentOpeningHours.openNow',
  'businessStatus',
  'rating',
  'userRatingCount',
  'googleMapsUri',
  'websiteUri',
];

const INCLUDED_TYPES: Record<FacilityType, string[]> = {
  emergency_department: ['hospital', 'general_hospital'],
  hospital: ['hospital', 'general_hospital', 'medical_center'],
  clinic: ['doctor', 'medical_clinic', 'medical_center'],
  pharmacy: ['pharmacy', 'drugstore'],
  diagnostic_lab: ['medical_lab'],
};

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  currentOpeningHours?: { openNow?: boolean };
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
}

function mapTypes(types: string[]): FacilityType[] {
  const out = new Set<FacilityType>();
  for (const t of types) {
    if (t === 'hospital' || t === 'general_hospital') out.add('hospital');
    if (t === 'medical_center' || t === 'medical_clinic' || t === 'doctor' || t === 'dental_clinic' || t === 'dentist') out.add('clinic');
    if (t === 'pharmacy' || t === 'drugstore') out.add('pharmacy');
    if (t === 'medical_lab') out.add('diagnostic_lab');
  }
  return [...out];
}

function mapSpecialties(types: string[]): Specialty[] {
  // Google doesn't list departments; only a few place types imply one.
  return types.includes('dental_clinic') || types.includes('dentist') ? ['dental'] : [];
}

export function mapGooglePlace(p: GooglePlace): Facility | null {
  if (!p.id || !p.displayName?.text || !p.location) return null;
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return null;
  const name = p.displayName.text;
  const address = p.formattedAddress ?? '';
  const types = p.types ?? [];
  return {
    id: `gp_${p.id}`,
    placeId: p.id,
    name,
    address,
    location: { lat: p.location.latitude, lng: p.location.longitude },
    coordinatesApproximate: false,
    phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
    emergencyPhone: null,
    types: mapTypes(types),
    verifiedSpecialties: mapSpecialties(types),
    // Google doesn't expose emergency-department availability; never infer it.
    emergency24x7: null,
    openNow: p.currentOpeningHours?.openNow ?? null,
    ownership: null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    mapsUrl: p.googleMapsUri ?? searchUrl(`${name} ${address}`, p.id),
    website: p.websiteUri ?? null,
    source: { provider: 'google_places', label: 'Google Maps' },
  };
}

export interface GooglePlacesOptions {
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class GooglePlacesProvider implements HospitalProvider {
  readonly id = 'google_places' as const;
  readonly attribution = 'Places data © Google Maps';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GooglePlacesOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: FacilitySearch): Promise<Facility[]> {
    const includedTypes =
      query.specialty === 'dental' && query.facilityType === 'clinic' ? ['dental_clinic', 'dentist'] : INCLUDED_TYPES[query.facilityType];
    const res = await fetchWithTimeout(
      this.fetchImpl,
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey,
          'X-Goog-FieldMask': PLACE_FIELDS.map((f) => `places.${f}`).join(','),
        },
        body: JSON.stringify({
          includedTypes,
          maxResultCount: Math.min(20, Math.max(1, query.maxResults)),
          rankPreference: 'DISTANCE',
          languageCode: languageCode(query.language),
          regionCode: 'IN',
          locationRestriction: {
            circle: {
              center: { latitude: query.origin.lat, longitude: query.origin.lng },
              radius: query.radiusMeters,
            },
          },
        }),
      },
      this.options.timeoutMs,
    );
    const body = (await res.json()) as { places?: GooglePlace[] };
    if (body.places !== undefined && !Array.isArray(body.places)) throw new MapsError('bad_response', 'Unexpected Places response');
    return (body.places ?? []).map(mapGooglePlace).filter((f): f is Facility => f !== null);
  }

  async getById(id: string, language: Language): Promise<Facility | null> {
    const placeId = id.startsWith('gp_') ? id.slice(3) : id;
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${languageCode(language)}&regionCode=IN`;
    try {
      const res = await fetchWithTimeout(
        this.fetchImpl,
        url,
        { headers: { 'X-Goog-Api-Key': this.options.apiKey, 'X-Goog-FieldMask': PLACE_FIELDS.join(',') } },
        this.options.timeoutMs,
      );
      return mapGooglePlace((await res.json()) as GooglePlace);
    } catch (error) {
      if (error instanceof MapsError && error.status === 404) return null;
      throw error;
    }
  }
}

function languageCode(language: Language): string {
  return language === 'hi' ? 'hi' : 'en';
}
