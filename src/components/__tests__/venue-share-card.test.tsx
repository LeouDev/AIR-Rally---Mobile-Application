import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { VenueShareCard, venueShareMessage, venueShareUrl } from '@/components/venue-share-card';
import type { VenueDetail } from '@/lib/venues';

/**
 * This card leaves the app and quotes a venue's prices publicly, so the
 * units matter more here than anywhere else in the UI.
 * venue_marketplace.starting_price is WHOLE PESOS — unlike bookings'
 * price_amount, which is centavos. Dividing here printed "₱7/hr" for a
 * ₱700 court on a branded card representing the business. Caught by
 * looking at the rendered image, not by reading the code, which is why
 * it's pinned here.
 */

function venueFixture(overrides: Partial<VenueDetail> = {}): VenueDetail {
  return {
    id: 'venue-1',
    name: 'BGC Smash Pickleball',
    description: 'Premium indoor facility.',
    address: '7th Avenue',
    city: 'Taguig',
    state_province: 'Metro Manila',
    country: 'PH',
    latitude: null,
    longitude: null,
    phone: null,
    email: null,
    website: null,
    indoor_outdoor: 'both',
    number_of_courts: 3,
    average_rating: 5,
    review_count: 1,
    created_at: '2026-08-01T00:00:00.000Z',
    timezone: 'Asia/Manila',
    starting_price: 700,
    active_court_count: 3,
    cover_image_path: null,
    courts: [],
    amenities: [],
    hours: [],
    imagePaths: [],
    ...overrides,
  } as VenueDetail;
}

describe('VenueShareCard', () => {
  it('quotes starting_price as whole pesos, not centavos', async () => {
    await render(<VenueShareCard venue={venueFixture({ starting_price: 700 })} viewRef={{ current: null }} />);

    expect(screen.getByText('₱700/hr')).toBeTruthy();
    expect(screen.queryByText('₱7/hr')).toBeNull();
  });

  it('omits the price row entirely rather than printing a bogus ₱0', async () => {
    await render(<VenueShareCard venue={venueFixture({ starting_price: null })} viewRef={{ current: null }} />);

    expect(screen.queryByText('FROM')).toBeNull();
  });

  it('uses the first LETTER for the badge, never leading punctuation', async () => {
    // "'t Kasteel" is the shape that matters: a bare [0] would put an
    // apostrophe in the badge on a card that leaves the app.
    await render(<VenueShareCard venue={venueFixture({ name: "'t Kasteel Courts" })} viewRef={{ current: null }} />);

    expect(screen.getByText('T')).toBeTruthy();
    expect(screen.queryByText("'")).toBeNull();
  });

  it('falls back to ? for a name with no letters at all', async () => {
    await render(<VenueShareCard venue={venueFixture({ name: '123' })} viewRef={{ current: null }} />);

    expect(screen.getByText('?')).toBeTruthy();
  });

  it('hides the rating until at least one review exists', async () => {
    await render(
      <VenueShareCard venue={venueFixture({ review_count: 0, average_rating: 0 })} viewRef={{ current: null }} />
    );

    expect(screen.queryByText('RATING')).toBeNull();
  });
});

describe('venueShareUrl', () => {
  it('points at /courts/{id} — the venue page, which is public and unfurls', () => {
    // NOT /venues/{id}: that route does not exist on the web. Courts and
    // venues are one object with one URL.
    expect(venueShareUrl('venue-1')).toBe('https://air-rally.com/courts/venue-1');
  });
});

describe('venueShareMessage', () => {
  it('names the venue and its city', () => {
    expect(venueShareMessage(venueFixture())).toBe('BGC Smash Pickleball in Taguig on AIR/Rally.');
  });

  it('drops the city clause cleanly when there is no city', () => {
    expect(venueShareMessage(venueFixture({ city: null }))).toBe('BGC Smash Pickleball on AIR/Rally.');
  });
});
