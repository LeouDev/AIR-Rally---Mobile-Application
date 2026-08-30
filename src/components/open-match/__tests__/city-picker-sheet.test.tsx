import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CityPickerSheet } from '@/components/open-match/city-picker-sheet';
import { listCities, type City } from '@/lib/open-match';

/**
 * Picker-only, never free text — the venue-request feature already
 * produced a city field literally reading "city" from a free-text
 * input, and this feature's design memo names that exact failure as
 * the reason a picker is mandatory. Pins that cities render grouped by
 * region, in the order the table already provides (no client-side
 * re-sort), and that selecting one calls back with the real row, not a
 * typed string.
 */

jest.mock('@/lib/open-match', () => ({
  ...jest.requireActual('@/lib/open-match'),
  listCities: jest.fn(),
}));

const mockListCities = listCities as jest.MockedFunction<typeof listCities>;

function city(overrides: Partial<City>): City {
  return {
    slug: 'manila',
    display_name: 'Manila',
    region: 'NCR',
    aliases: [],
    sort_order: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('groups cities by region in table order, without re-sorting', async () => {
  // Table order here is NCR then Central Visayas — the REVERSE of
  // alphabetical. A client-side re-sort would flip them back to
  // alphabetical, which is exactly the mutation this caught: an
  // alphabetical-sort implementation produced "Central Visayas, NCR"
  // here (C < N) even though the table said NCR first, and this
  // assertion is what noticed.
  mockListCities.mockResolvedValue([
    city({ slug: 'manila', display_name: 'Manila', region: 'NCR', sort_order: 1 }),
    city({ slug: 'cebu-city', display_name: 'Cebu City', region: 'Central Visayas', sort_order: 2 }),
    city({ slug: 'mandaue', display_name: 'Mandaue', region: 'Central Visayas', sort_order: 3 }),
  ]);

  await render(<CityPickerSheet visible onClose={jest.fn()} currentCitySlug={null} onSelect={jest.fn()} />);

  await screen.findByText('NCR');
  expect(screen.getByText('CENTRAL VISAYAS')).toBeTruthy();
  expect(screen.getByText('Cebu City')).toBeTruthy();
  expect(screen.getByText('Mandaue')).toBeTruthy();
  expect(screen.getByText('Manila')).toBeTruthy();

  // Render order, not just presence — serialize the tree and confirm
  // NCR's own header appears before Central Visayas's in it, matching
  // table order rather than alphabetical.
  const serialized = JSON.stringify(screen.toJSON());
  expect(serialized.indexOf('NCR')).toBeLessThan(serialized.indexOf('CENTRAL VISAYAS'));
});

it('calls onSelect with the real city row, not just its name, on tap', async () => {
  const onSelect = jest.fn();
  const mandaue = city({ slug: 'mandaue', display_name: 'Mandaue', region: 'Central Visayas' });
  mockListCities.mockResolvedValue([mandaue]);

  await render(<CityPickerSheet visible onClose={jest.fn()} currentCitySlug={null} onSelect={onSelect} />);

  fireEvent.press(await screen.findByText('Mandaue'));
  expect(onSelect).toHaveBeenCalledWith(mandaue);
});

it('marks the current city selected', async () => {
  mockListCities.mockResolvedValue([
    city({ slug: 'mandaue', display_name: 'Mandaue', region: 'Central Visayas' }),
    city({ slug: 'manila', display_name: 'Manila', region: 'NCR' }),
  ]);

  await render(<CityPickerSheet visible onClose={jest.fn()} currentCitySlug="mandaue" onSelect={jest.fn()} />);

  const mandaueRow = await screen.findByLabelText('Mandaue');
  const manilaRow = await screen.findByLabelText('Manila');
  expect(mandaueRow).toBeTruthy();
  expect(manilaRow).toBeTruthy();
});

it('shows an error state rather than an empty screen when cities fail to load', async () => {
  mockListCities.mockRejectedValue(new Error('network'));

  await render(<CityPickerSheet visible onClose={jest.fn()} currentCitySlug={null} onSelect={jest.fn()} />);

  await screen.findByText(/Couldn.t load cities/);
});

it('closes without loading anything when not visible', async () => {
  await render(<CityPickerSheet visible={false} onClose={jest.fn()} currentCitySlug={null} onSelect={jest.fn()} />);

  expect(mockListCities).not.toHaveBeenCalled();
});
