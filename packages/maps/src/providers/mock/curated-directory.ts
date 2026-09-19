import type { Facility, Language } from '@sanjeevani/types';
import type { CuratedFacilityRecord } from '../../data/gurugram';
import { searchUrl } from '../../directions';
import { haversineMeters } from '../../geo';
import type { FacilitySearch, HospitalProvider } from '../types';

export function curatedToFacility(r: CuratedFacilityRecord): Facility {
  return {
    id: `cd_${r.slug}`,
    placeId: null,
    name: r.name,
    address: r.address,
    location: { lat: r.lat, lng: r.lng },
    coordinatesApproximate: r.coordinatesApprox,
    phone: r.phone,
    emergencyPhone: r.emergencyPhone,
    types: r.types,
    verifiedSpecialties: r.verifiedSpecialties,
    emergency24x7: r.emergency24x7,
    // Opening hours for OPDs aren't verified in the curated set.
    openNow: r.emergency24x7 ? true : null,
    ownership: r.ownership,
    rating: null,
    userRatingCount: null,
    mapsUrl: searchUrl(`${r.name}, ${r.address}`),
    website: r.website,
    source: { provider: 'curated_directory', label: r.sourceLabel, url: r.sourceUrl, verifiedOn: r.verifiedOn },
  };
}

/**
 * Local directory provider for demo mode and for regions without a Places key.
 * Records come from the database (seeded) or the bundled verified list.
 */
export class CuratedDirectoryProvider implements HospitalProvider {
  readonly id = 'curated_directory' as const;
  readonly attribution = 'Sanjeevani curated directory — details from each hospital’s official website';

  constructor(private readonly loadRecords: () => Promise<readonly CuratedFacilityRecord[]>) {}

  async search(query: FacilitySearch): Promise<Facility[]> {
    const records = await this.loadRecords();
    return records
      .map(curatedToFacility)
      .filter((f) => haversineMeters(query.origin, f.location) <= query.radiusMeters)
      .filter((f) => {
        if (query.facilityType === 'pharmacy') return f.types.includes('pharmacy');
        if (query.facilityType === 'diagnostic_lab') return f.types.includes('diagnostic_lab') || f.types.includes('hospital');
        return true;
      })
      .sort((a, b) => haversineMeters(query.origin, a.location) - haversineMeters(query.origin, b.location))
      .slice(0, query.maxResults);
  }

  async getById(id: string, _language: Language): Promise<Facility | null> {
    const slug = id.startsWith('cd_') ? id.slice(3) : id;
    const record = (await this.loadRecords()).find((r) => r.slug === slug);
    return record ? curatedToFacility(record) : null;
  }
}
