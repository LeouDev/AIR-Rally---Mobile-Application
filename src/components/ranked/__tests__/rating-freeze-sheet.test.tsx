import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RatingFreezeSheet } from '@/components/ranked/rating-freeze-sheet';

/**
 * Confirm mode (reached from "Find match") and info mode (reached by
 * tapping "Your court not here?" on the Play doorway) share one sheet
 * but answer two different questions — the CTO's flag: a player who
 * tapped a question about their court shouldn't land on a header and
 * a paragraph about something else first. Pins both the header text
 * and the actual render order (mocked VenueRequestForm vs. the
 * explanation string) via the serialized tree, not just that both
 * pieces of content exist somewhere.
 */

jest.mock('@/components/venue-request-form', () => ({
  VenueRequestForm: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>VENUE_REQUEST_FORM</Text>;
  },
}));

function renderOrder(tree: unknown): string {
  return JSON.stringify(tree);
}

it('confirm mode leads with the explanation, form after, and Cancel/Play anyway', async () => {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const view = await render(<RatingFreezeSheet visible userId="me" onClose={onClose} onConfirm={onConfirm} />);

  await screen.findByText('Playing without a booking');
  const order = renderOrder(view.toJSON());
  expect(order.indexOf('finished calibration')).toBeGreaterThan(-1);
  expect(order.indexOf('finished calibration')).toBeLessThan(order.indexOf('VENUE_REQUEST_FORM'));

  await screen.findByText('Cancel');
  const playAnyway = await screen.findByText('Play anyway');
  fireEvent.press(playAnyway);
  expect(onConfirm).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

it('info mode leads with the venue-request form, header matches the tap, no Cancel/Play anyway', async () => {
  const onClose = jest.fn();
  const view = await render(<RatingFreezeSheet visible userId="me" onClose={onClose} />);

  await screen.findByText('Your court not here?');
  expect(screen.queryByText('Playing without a booking')).toBeNull();
  expect(screen.queryByText('Cancel')).toBeNull();
  expect(screen.queryByText('Play anyway')).toBeNull();

  const order = renderOrder(view.toJSON());
  // Info mode: form before the explanation — the opposite of confirm mode.
  expect(order.indexOf('VENUE_REQUEST_FORM')).toBeGreaterThan(-1);
  expect(order.indexOf('VENUE_REQUEST_FORM')).toBeLessThan(order.indexOf('finished calibration'));

  fireEvent.press(screen.getByLabelText('Close'));
  expect(onClose).toHaveBeenCalled();
});

it('renders nothing when not visible', async () => {
  await render(<RatingFreezeSheet visible={false} userId="me" onClose={jest.fn()} />);
  expect(screen.queryByText(/finished calibration/)).toBeNull();
});
