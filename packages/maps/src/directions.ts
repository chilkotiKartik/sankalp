import type { GeoPoint } from '@sanjeevani/types';

/**
 * Google Maps URLs (no API key required).
 * https://developers.google.com/maps/documentation/urls/get-started
 */
export function directionsUrl(params: {
  destinationName: string;
  destinationAddress: string;
  destinationPlaceId?: string | null;
  origin?: GeoPoint | null;
  travelMode?: 'driving' | 'walking' | 'two-wheeler' | 'transit';
}): string {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', `${params.destinationName}, ${params.destinationAddress}`);
  if (params.destinationPlaceId) url.searchParams.set('destination_place_id', params.destinationPlaceId);
  if (params.origin) url.searchParams.set('origin', `${params.origin.lat.toFixed(5)},${params.origin.lng.toFixed(5)}`);
  url.searchParams.set('travelmode', params.travelMode ?? 'driving');
  return url.toString();
}

export function searchUrl(query: string, placeId?: string | null): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  if (placeId) url.searchParams.set('query_place_id', placeId);
  return url.toString();
}
