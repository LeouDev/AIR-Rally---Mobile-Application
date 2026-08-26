import { StyleSheet, Text, View } from 'react-native';

import { ShareCardFrame } from '@/components/share-card-frame';
import type { VenueDetail } from '@/lib/venues';

/** The web page a shared court/venue points at. `/courts/{id}` IS the
 * venue page — it resolves a VENUE id (see the web repo's
 * courts/[id]/page.tsx calling getVenueDetail). There is no
 * `/venues/{id}` route and there doesn't need to be: courts and venues
 * are one object with one URL here. Genuinely public, no sign-in gate,
 * and it carries its own openGraph/twitter metadata, so this link
 * unfurls with the venue's own photo rather than a generic preview. */
export function venueShareUrl(venueId: string): string {
  return `https://air-rally.com/courts/${venueId}`;
}

export function venueShareMessage(venue: VenueDetail): string {
  const where = venue.city ? ` in ${venue.city}` : '';
  return `${venue.name}${where} on AIR/Rally.`;
}

/** The image attached when a court/venue is shared externally — same
 * off-screen capture technique and same ShareCardFrame chrome as the
 * COURT/Side post and Ranked result cards. The frame's "author" row is
 * the venue itself here: a venue has no author, but the row is really
 * "who or what this card is about", which is exactly the venue. */
export function VenueShareCard({
  venue,
  viewRef,
}: {
  venue: VenueDetail;
  viewRef: React.RefObject<View | null>;
}) {
  // First LETTER, not first character — a name that opens with
  // punctuation ("[DEMO] BGC Smash", "'t Kasteel") otherwise puts a
  // bracket or apostrophe in the badge on a card that leaves the app.
  const initial = venue.name.match(/\p{L}/u)?.[0].toUpperCase() ?? '?';
  const location = [venue.city, venue.state_province].filter(Boolean).join(', ');
  const rating = venue.review_count > 0 ? venue.average_rating.toFixed(1) : null;

  return (
    <ShareCardFrame
      viewRef={viewRef}
      tag="COURT"
      authorInitial={initial}
      authorName={venue.name}
      authorSub={location || 'Philippines'}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Book a court</Text>
        <Text style={styles.headline} numberOfLines={3}>
          {venue.name}
        </Text>
        {venue.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {venue.description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {venue.active_court_count} {venue.active_court_count === 1 ? 'court' : 'courts'}
          </Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>
            {venue.indoor_outdoor === 'both' ? 'Indoor & outdoor' : venue.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor'}
          </Text>
        </View>
      </View>

      <View style={styles.statRow}>
        {venue.starting_price !== null ? (
          <View>
            <Text style={styles.statLabel}>FROM</Text>
            {/* Whole pesos already — NOT centavos, unlike bookings'
                price_amount. Same treatment as venue-card.tsx; dividing
                by 100 here printed ₱7 for a ₱700 court, on a card that
                leaves the app and quotes the venue's prices publicly. */}
            <Text style={styles.statValue}>₱{venue.starting_price.toLocaleString('en-PH')}/hr</Text>
          </View>
        ) : null}
        {rating ? (
          <View>
            <Text style={styles.statLabel}>RATING</Text>
            <Text style={styles.statValue}>
              ★ {rating}
              <Text style={styles.statSuffix}> ({venue.review_count})</Text>
            </Text>
          </View>
        ) : null}
      </View>
    </ShareCardFrame>
  );
}

// Fixed brand palette, not theme tokens — see share-card-frame.tsx.
const styles = StyleSheet.create({
  panel: {
    gap: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#ff8a3d',
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 31,
    color: '#f3ead9',
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
    color: '#93a2b8',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  meta: {
    fontSize: 11.5,
    color: '#cfd8e4',
  },
  metaDot: {
    fontSize: 11.5,
    color: '#93a2b8',
  },
  statRow: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: '#93a2b8',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f3ead9',
    marginTop: 2,
  },
  statSuffix: {
    fontSize: 12,
    fontWeight: '400',
    color: '#93a2b8',
  },
});
