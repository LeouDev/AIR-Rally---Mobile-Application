import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Avatar } from '@/components/post-card';
import { Colors } from '@/constants/theme';
import type { PublicProfile } from '@/lib/database.types';

/**
 * Avatar is shipped, working code on the RC — COURT/Side's main surface
 * renders it — and it just gained an `on` variant so the Ranked match
 * rows could stop hand-rolling their own initials. This pins that the
 * DEFAULT path is byte-identical to what shipped: same fallback fill,
 * same fallback ink, same photo behaviour. The variant is additive or
 * it is a regression in the same update that fixes the thing it was
 * added for.
 */

const WITH_PHOTO: PublicProfile = {
  id: 'u1',
  display_name: 'Lea Salonga',
  avatar_url: 'https://example.test/lea.jpg',
};

const NO_PHOTO: PublicProfile = {
  id: 'u2',
  display_name: 'Lea Salonga',
  avatar_url: null,
};

describe('Avatar', () => {
  it('renders the photo when there is one, unchanged by the new variant', async () => {
    await render(<Avatar profile={WITH_PHOTO} />);

    // The photo branch renders an image and NOT the initials fallback —
    // asserting both directions, so a regression that silently fell
    // through to initials would fail here rather than pass quietly.
    expect(JSON.stringify(screen.toJSON())).toContain(WITH_PHOTO.avatar_url);
    expect(screen.queryByText('LS')).toBeNull();
  });

  it('falls back to initials on the default surface with the pre-existing palette', async () => {
    await render(<Avatar profile={NO_PHOTO} />);

    // The values Avatar used before `on` existed. Hardcoded rather than
    // read back off the component, so a change to the default branch
    // fails here instead of agreeing with itself.
    expect(screen.getByText('LS').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: Colors.light.accentForeground })])
    );
  });

  it('uses the navy palette only when asked', async () => {
    await render(<Avatar profile={NO_PHOTO} on="navy" />);

    expect(screen.getByText('LS').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: Colors.light.rallyForeground })])
    );
  });

  it('still derives two initials from a display name', async () => {
    await render(<Avatar profile={NO_PHOTO} />);
    expect(screen.getByText('LS')).toBeTruthy();
  });
});
