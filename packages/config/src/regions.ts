import type { GeoPoint } from '@sanjeevani/types';

export interface RegionConfig {
  id: string;
  name: string;
  countryCode: string;
  center: GeoPoint;
  /** Where the demo "use sample location" button places the user. */
  demoLocation: GeoPoint;
  demoLocationLabel: string;
  /** Typical urban driving speed used only for estimated travel times (km/h). */
  estimatedUrbanSpeedKmh: number;
  /** Straight-line → road distance multiplier used only for estimates. */
  roadDistanceFactor: number;
  timeZone: string;
}

export const REGIONS: Record<string, RegionConfig> = {
  gurugram: {
    id: 'gurugram',
    name: 'Gurugram, Haryana',
    countryCode: 'IN',
    center: { lat: 28.4595, lng: 77.0266 },
    // DLF Cyber City area.
    demoLocation: { lat: 28.4952, lng: 77.0888 },
    demoLocationLabel: 'Cyber City, Gurugram',
    estimatedUrbanSpeedKmh: 22,
    roadDistanceFactor: 1.35,
    timeZone: 'Asia/Kolkata',
  },
};

export function getRegion(id: string): RegionConfig {
  const region = REGIONS[id];
  if (!region) throw new Error(`Unknown region "${id}"`);
  return region;
}
