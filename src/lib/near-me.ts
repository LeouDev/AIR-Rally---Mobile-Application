import * as Location from 'expo-location';

/** How far "Near me" reaches. The web offers 5/10/25/50; 25 covers a
 * metro without turning into "everything". */
export const NEAR_ME_RADIUS_KM = 25;

export type Coords = { lat: number; lng: number };

/**
 * The device's position for "Near me", asking for permission the first
 * time it's needed rather than at launch (app.json already carries the
 * "show courts and open games near you" prompt text). A recent cached fix
 * is good enough for "which courts are close" and avoids waiting on GPS.
 */
export async function getCurrentCoords(): Promise<Coords | 'denied'> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return 'denied';
  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
