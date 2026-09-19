import type { GeoPoint, TravelEstimate } from '@sanjeevani/types';
import { haversineMeters } from '../../geo';
import type { RoutingProvider } from '../types';

/**
 * Straight-line estimate × road factor at a typical urban speed. Always flagged
 * `estimated: true` so the UI can say "approx." instead of pretending to be a route.
 */
export class EstimatedRoutingProvider implements RoutingProvider {
  readonly id = 'haversine_estimate' as const;

  constructor(
    private readonly roadFactor: number,
    private readonly speedKmh: number,
  ) {}

  async estimate(origin: GeoPoint, destinations: GeoPoint[]): Promise<TravelEstimate[]> {
    return destinations.map((d) => this.one(origin, d));
  }

  async route(origin: GeoPoint, destination: GeoPoint): Promise<TravelEstimate> {
    return this.one(origin, destination);
  }

  private one(origin: GeoPoint, destination: GeoPoint): TravelEstimate {
    const distanceMeters = Math.round(haversineMeters(origin, destination) * this.roadFactor);
    const durationSeconds = Math.round((distanceMeters / 1000 / this.speedKmh) * 3600) + 120;
    return { distanceMeters, durationSeconds, estimated: true, source: 'haversine_estimate' };
  }
}
