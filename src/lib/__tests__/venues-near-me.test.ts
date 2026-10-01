import * as Location from 'expo-location';

import { getCurrentCoords } from '@/lib/near-me';
import { supabase } from '@/lib/supabase';
import { formatDistance, listMarketplaceVenues } from '@/lib/venues';

/**
 * "Near me" on Explore: the app shipped expo-location and its permission
 * text, and the App Store listing promised "venues near you", but nothing
 * ever asked for a location or sorted by distance.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const mockFrom = supabase.from as jest.Mock;
const location = Location as unknown as Record<string, jest.Mock>;

// BGC, Taguig — where the player is standing.
const ME = { lat: 14.5509, lng: 121.0503 };
const venue = (id: string, latitude: number | null, longitude: number | null) => ({
  id,
  name: id,
  latitude,
  longitude,
  timezone: 'Asia/Manila',
});

/** The marketplace query records its row cap; awaiting resolves `rows`. */
function marketplace(rows: object[]) {
  const limits: number[] = [];
  const query = {
    limits,
    order: () => query,
    limit: (n: number) => {
      limits.push(n);
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listMarketplaceVenues with near', () => {
  it('keeps venues within the radius, nearest first, with their distance — and drops the rest', async () => {
    const query = marketplace([
      venue('ortigas', 14.5869, 121.0614), // ~4 km
      venue('tagaytay', 14.1153, 120.9621), // ~50 km
      venue('no-coordinates', null, null),
      venue('makati', 14.5547, 121.0244), // ~3 km
    ]);
    mockFrom.mockImplementation((name: string) =>
      name === 'venue_marketplace'
        ? { select: () => query }
        : { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
    );

    const venues = await listMarketplaceVenues({ near: { ...ME, radiusKm: 25 } });

    expect(venues.map((v) => v.id)).toEqual(['makati', 'ortigas']);
    expect(venues[0].distanceKm).toBeCloseTo(2.8, 0);
    // The radius cut must see more than one page, or nearby venues past
    // row 50 would silently vanish.
    expect(query.limits).toEqual([500]);
  });

  it('leaves the ordinary 50-row page alone when near is off', async () => {
    const query = marketplace([]);
    mockFrom.mockReturnValue({ select: () => query });

    await listMarketplaceVenues({});

    expect(query.limits).toEqual([50]);
  });

  it('formats distance the way the card shows it', () => {
    expect(formatDistance(0.8)).toBe('800 m');
    expect(formatDistance(2.84)).toBe('2.8 km');
  });
});

describe('getCurrentCoords', () => {
  it('reports denied rather than throwing when location is refused', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(getCurrentCoords()).resolves.toBe('denied');
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('uses a recent cached fix before waiting on a fresh one', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    location.getLastKnownPositionAsync.mockResolvedValue({ coords: { latitude: 14.55, longitude: 121.05 } });

    await expect(getCurrentCoords()).resolves.toEqual({ lat: 14.55, lng: 121.05 });
    expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('falls back to a fresh fix when there is no cached one', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    location.getLastKnownPositionAsync.mockResolvedValue(null);
    location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 10.31, longitude: 123.89 } });

    await expect(getCurrentCoords()).resolves.toEqual({ lat: 10.31, lng: 123.89 });
  });
});
