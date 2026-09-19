import type { FacilityType, Specialty } from '@sanjeevani/types';

export interface CuratedFacilityRecord {
  slug: string;
  regionId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  coordinatesApprox: boolean;
  phone: string | null;
  emergencyPhone: string | null;
  types: FacilityType[];
  verifiedSpecialties: Specialty[];
  emergency24x7: boolean | null;
  ownership: 'government' | 'private' | null;
  website: string | null;
  sourceUrl: string;
  sourceLabel: string;
  verifiedOn: string;
}

/**
 * Curated Gurugram directory used when Google Places isn't configured.
 *
 * Every field comes from the hospital's own website (or the cited public listing) as
 * checked on the `verifiedOn` date. Specialties are listed only when the hospital's page
 * names them; `null` means "not verified", never "not available".
 * Coordinates are approximate map positions — directions links search by name and
 * address, so navigation does not depend on them.
 */
export const GURUGRAM_FACILITIES: readonly CuratedFacilityRecord[] = [
  {
    slug: 'medanta-the-medicity-gurugram',
    regionId: 'gurugram',
    name: 'Medanta – The Medicity',
    address: 'CH Baktawar Singh Road, Sector 38, Gurugram, Haryana 122001',
    lat: 28.439974,
    lng: 77.041782,
    coordinatesApprox: true,
    phone: '+91 88000 01068',
    emergencyPhone: '1068',
    types: ['hospital', 'emergency_department'],
    verifiedSpecialties: [
      'emergency_medicine', 'general_medicine', 'cardiology', 'neurology', 'gastroenterology', 'orthopedics',
      'obstetrics_gynecology', 'pediatrics', 'ent', 'pulmonology', 'ophthalmology', 'dermatology', 'dental', 'psychiatry',
    ],
    emergency24x7: true,
    ownership: 'private',
    website: 'https://www.medanta.org/hospitals-near-me/gurugram-hospital',
    sourceUrl: 'https://www.medanta.org/hospitals-near-me/gurugram-hospital',
    sourceLabel: 'medanta.org',
    verifiedOn: '2026-09-17',
  },
  {
    slug: 'artemis-hospital-gurugram',
    regionId: 'gurugram',
    name: 'Artemis Hospital',
    address: 'Sector 51, Gurugram, Haryana 122001',
    lat: 28.431627,
    lng: 77.072103,
    coordinatesApprox: true,
    phone: '+91 124 451 1111',
    emergencyPhone: '+91 124 458 8888',
    types: ['hospital', 'emergency_department'],
    verifiedSpecialties: [
      'emergency_medicine', 'general_medicine', 'cardiology', 'neurology', 'orthopedics', 'pediatrics', 'obstetrics_gynecology',
      'gastroenterology', 'ent', 'ophthalmology', 'dermatology', 'dental', 'psychiatry', 'urology', 'pulmonology',
    ],
    emergency24x7: true,
    ownership: 'private',
    website: 'https://www.artemishospitals.com/',
    sourceUrl: 'https://www.artemishospitals.com/contact-us',
    sourceLabel: 'artemishospitals.com',
    verifiedOn: '2026-09-17',
  },
  {
    slug: 'fortis-memorial-research-institute-gurugram',
    regionId: 'gurugram',
    name: 'Fortis Memorial Research Institute',
    address: 'Sector 44, opposite HUDA City Centre Metro Station, Gurugram, Haryana 122002',
    lat: 28.45797,
    lng: 77.07441,
    coordinatesApprox: false,
    phone: '+91 88600 22554',
    emergencyPhone: null,
    types: ['hospital', 'emergency_department'],
    verifiedSpecialties: [
      'emergency_medicine', 'general_medicine', 'cardiology', 'neurology', 'orthopedics', 'pediatrics', 'obstetrics_gynecology',
      'gastroenterology', 'ent', 'ophthalmology', 'dermatology', 'dental', 'psychiatry', 'urology', 'pulmonology',
    ],
    emergency24x7: true,
    ownership: 'private',
    website: 'https://www.fortishealthcare.com/location/fortis-memorial-research-institute-gurgaon',
    sourceUrl: 'https://www.fortishealthcare.com/location/fortis-memorial-research-institute-gurgaon',
    sourceLabel: 'fortishealthcare.com',
    verifiedOn: '2026-09-17',
  },
  {
    slug: 'max-hospital-gurugram',
    regionId: 'gurugram',
    name: 'Max Hospital, Gurugram',
    address: 'B Block, Sushant Lok 1, near HUDA City Centre, Sector 43, Gurugram, Haryana 122001',
    lat: 28.4601,
    lng: 77.0693,
    coordinatesApprox: true,
    phone: '+91 92688 80303',
    emergencyPhone: null,
    types: ['hospital', 'emergency_department'],
    verifiedSpecialties: [
      'emergency_medicine', 'general_medicine', 'cardiology', 'neurology', 'orthopedics', 'pediatrics', 'obstetrics_gynecology',
      'gastroenterology', 'ent', 'ophthalmology', 'dermatology', 'dental', 'psychiatry', 'urology', 'pulmonology',
    ],
    emergency24x7: true,
    ownership: 'private',
    website: 'https://www.maxhealthcare.in/hospital-network/max-hospital-gurgaon',
    sourceUrl: 'https://www.maxhealthcare.in/gurugram/hospital/best-emergency-care-hospital-gurugram',
    sourceLabel: 'maxhealthcare.in',
    verifiedOn: '2026-09-17',
  },
  {
    slug: 'paras-health-gurugram',
    regionId: 'gurugram',
    name: 'Paras Health, Gurugram',
    address: 'C-1, Sushant Lok-1, Sector 43, Phase-I, Gurugram, Haryana 122002',
    lat: 28.4633,
    lng: 77.0798,
    coordinatesApprox: true,
    phone: '+91 80808 08069',
    emergencyPhone: '+91 90917 90917',
    types: ['hospital', 'emergency_department'],
    verifiedSpecialties: [
      'emergency_medicine', 'general_medicine', 'cardiology', 'neurology', 'gastroenterology', 'orthopedics',
      'obstetrics_gynecology', 'dermatology', 'ent', 'dental', 'psychiatry', 'pulmonology', 'pediatrics',
    ],
    emergency24x7: true,
    ownership: 'private',
    website: 'https://www.parashospitals.com/gurugram',
    sourceUrl: 'https://www.parashospitals.com/gurugram',
    sourceLabel: 'parashospitals.com',
    verifiedOn: '2026-09-17',
  },
  {
    slug: 'civil-hospital-sector-10-gurugram',
    regionId: 'gurugram',
    name: 'District Civil Hospital, Sector 10',
    address: 'Basai Road, Sector 10, Gurugram, Haryana 122001',
    lat: 28.456176,
    lng: 76.997377,
    coordinatesApprox: true,
    phone: null,
    emergencyPhone: null,
    types: ['hospital'],
    verifiedSpecialties: [],
    emergency24x7: null,
    ownership: 'government',
    website: null,
    sourceUrl: 'https://nhsrcindia.org/node/1291',
    sourceLabel: 'NHSRC (Govt. of India)',
    verifiedOn: '2026-09-17',
  },
];
