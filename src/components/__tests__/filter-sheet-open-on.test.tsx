import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { FilterSheet } from '@/components/filter-sheet';

/**
 * The "Open on" filter had a silent discard: apply() regex-tested the
 * typed date and, on a miss, dropped `availableOn` without a word. The
 * sheet closed, no filter applied, and the Explore header's active
 * filter count didn't include it either — so the app positively told
 * the player nothing was filtered while they believed they had filtered.
 *
 * These are deliberately behavioural, in the same spirit as
 * booking-panel.test.tsx's invited-player cover: they assert on what a
 * player can observe, not on which regex runs. Once the native picker
 * lands, typing an unparseable date is unreachable through the UI —
 * which is exactly why the property has to be pinned as a property. A
 * test that asserted "the regex exists" would pass against any future
 * rewrite that reintroduced the same quiet drop by another route, and
 * nobody would ever trip it by hand again to notice.
 *
 * The property, stated once: THE SHEET MUST NEVER SHOW A PLAYER A DATE
 * AND THEN APPLY A FILTER SET THAT OMITS IT.
 */

const NOOP_LISTS = { amenities: [], surfaceTypes: [] };

function renderSheet(overrides: Partial<React.ComponentProps<typeof FilterSheet>> = {}) {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const props = {
    visible: true,
    onClose,
    onApply,
    filters: {},
    ...NOOP_LISTS,
    ...overrides,
  } as React.ComponentProps<typeof FilterSheet>;
  return { onApply, onClose, props };
}

describe('FilterSheet — "Open on" cannot silently drop a date', () => {
  it('does not display a date it will then omit from the applied filters', async () => {
    // A value the sheet cannot honour, arriving the way any non-typed
    // value would — restored state, a deep link, a saved search.
    const { onApply, props } = renderSheet({ filters: { availableOn: '8/24/2026' } });
    await render(<FilterSheet {...props} />);

    const showedTheDate = screen.queryAllByDisplayValue('8/24/2026').length > 0;

    await fireEvent.press(screen.getByLabelText('Apply'));

    // Deliberately NOT asserting onApply fired. Two different honest
    // fixes are possible — refuse to apply and say so, or never show an
    // unhonourable value in the first place — and this property has to
    // hold under both. Requiring the call would fail the first one for
    // being the wrong shape rather than for being wrong.
    const applied = onApply.mock.calls[0]?.[0];
    const omittedIt = applied !== undefined && applied.availableOn === undefined;

    // Showing it and then dropping it is the bug. Either alone is fine:
    // never showing it promises nothing, applying it keeps the promise.
    // Only the pair is a lie.
    expect(showedTheDate && omittedIt).toBe(false);
  });

  it('stays open rather than closing on a date it declined to apply', async () => {
    const { onApply, onClose, props } = renderSheet({ filters: { availableOn: '8/24/2026' } });
    await render(<FilterSheet {...props} />);

    await fireEvent.press(screen.getByLabelText('Apply'));

    const applied = onApply.mock.calls[0]?.[0];
    const declinedTheDate = applied === undefined || applied.availableOn === undefined;

    // Closing IS the silence. A player whose sheet dismissed itself has
    // been told the interaction succeeded.
    if (declinedTheDate && screen.queryAllByDisplayValue('8/24/2026').length > 0) {
      expect(onClose).not.toHaveBeenCalled();
    }
  });

  it('applies a date it did show the player', async () => {
    const { onApply, props } = renderSheet({ filters: { availableOn: '2026-08-24' } });
    await render(<FilterSheet {...props} />);

    await fireEvent.press(screen.getByLabelText('Apply'));

    expect(onApply.mock.calls[0][0].availableOn).toBe('2026-08-24');
  });
});
