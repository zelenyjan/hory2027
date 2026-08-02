import type { Accommodation } from '@shared/types';

export function placeHeading(place: Accommodation): string {
  return place.title ?? place.ogTitle ?? place.location;
}

export function placeImageUrl(place: Accommodation): string | null {
  return place.hasOgImage ? `/api/accommodations/${place.id}/image` : null;
}
