import { router, Stack, Tabs } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import React from 'react';
import { Text } from 'react-native';

/**
 * The semantics the app's "back to a tab" exits rely on, pinned against
 * expo-router's real routing (in-memory routes; JS Tabs standing in for
 * NativeTabs — both are tab routers under the root Stack).
 *
 * After paying, "See my bookings" used router.replace('/(tabs)/bookings')
 * from a screen stacked above the tabs. Replace/push always create a NEW
 * route, so that built [tabs, venue, tabs#2]: a second tab bar, with a
 * swipe-back from Bookings landing on the venue page. dismissTo pops back
 * to the existing tabs and switches tab instead.
 */

const routes = {
  _layout: () => <Stack />,
  '(tabs)/_layout': () => <Tabs />,
  '(tabs)/index': () => <Text>Explore</Text>,
  '(tabs)/bookings': () => <Text>Bookings</Text>,
  '(tabs)/notifications': () => <Text>Alerts</Text>,
  'venue/[id]': () => <Text>Venue</Text>,
  'booking/[id]': () => <Text>Booking</Text>,
};

// renderRouter predates this repo's async render(): its getPathname()
// lands on the object it returns (a promise here), not on `screen`. Kept
// in a box so no `await`/`return` unwraps it and drops the method.
async function start(initialUrl: string) {
  const rendered = renderRouter(routes, { initialUrl });
  await rendered;
  return {
    pathname: () => rendered.getPathname(),
    // The ROOT stack's screens, bottom to top. (router.canGoBack() can't
    // tell this apart: on any non-first tab it's true, since tabs "go
    // back" to their first tab.)
    // The store wraps everything in a synthetic '__root' route.
    rootStack: () => (rendered.getRouterState()?.routes[0]?.state?.routes ?? []).map((r) => r.name),
  };
}

// expo-router queues navigations and drains them in an effect, so each
// needs an async act to land before the next assertion.
async function go(navigate: () => void) {
  await act(async () => {
    navigate();
  });
}

async function openBookingFromVenue() {
  const app = await start('/');
  await go(() => router.push('/venue/v1'));
  await go(() => router.push('/booking/b1'));
  expect(app.pathname()).toBe('/booking/b1');
  return app;
}

it('replace() from a stacked screen leaves the old screens underneath — the bug', async () => {
  const app = await openBookingFromVenue();
  await go(() => router.replace('/(tabs)/bookings'));

  expect(app.pathname()).toBe('/bookings');
  expect(app.rootStack()).toEqual(['(tabs)', 'venue/[id]', '(tabs)']);
});

it('dismissTo() returns to the existing tab bar with the right tab selected', async () => {
  const app = await openBookingFromVenue();
  await go(() => router.dismissTo('/(tabs)/bookings'));

  expect(app.pathname()).toBe('/bookings');
  expect(screen.getByText('Bookings')).toBeTruthy();
  expect(app.rootStack()).toEqual(['(tabs)']);
});

it('dismissTo() still lands on the tab when nothing is underneath (a cold deep link)', async () => {
  const app = await start('/booking/b1');
  await go(() => router.dismissTo('/(tabs)/bookings'));

  expect(app.pathname()).toBe('/bookings');
  expect(app.rootStack()).toEqual(['(tabs)']);
});

it('push() from inside the tab bar (the Alerts list) just switches tab — nothing stacks', async () => {
  const app = await start('/notifications');
  await go(() => router.push('/(tabs)/bookings'));

  expect(app.pathname()).toBe('/bookings');
  expect(app.rootStack()).toEqual(['(tabs)']);
});
