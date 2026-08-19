/**
 * The slice of the web app's Database type this mobile app actually
 * touches in Phase 0 — kept structurally identical to the corresponding
 * entries in the web repo's src/lib/supabase/types.ts (the source of
 * truth, maintained alongside the migrations). Extend per-phase as
 * screens gain real data; don't copy the whole 1300-line file wholesale
 * before anything reads those tables.
 */

export type UserRole = 'player' | 'venue_owner' | 'admin';
export type OwnerStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  owner_status: OwnerStatus;
  referral_code: string;
  email_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  link_url: string | null;
  created_at: string;
};

export type DevicePushToken = {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  created_at: string;
  updated_at: string;
};

export type IndoorOutdoor = 'indoor' | 'outdoor' | 'both';

/** Row shape of the public `venue_marketplace` view — active venues only,
 * owner/PayMongo fields deliberately excluded (see the web repo's
 * 20260809000008_marketplace_view.sql). Prices are whole pesos. */
export type VenueMarketplaceRow = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  indoor_outdoor: IndoorOutdoor;
  number_of_courts: number;
  average_rating: number;
  review_count: number;
  created_at: string;
  timezone: string;
  starting_price: number | null;
  active_court_count: number;
  cover_image_path: string | null;
};

export type Court = {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  surface_type: string | null;
  indoor_outdoor: 'indoor' | 'outdoor';
  capacity: number | null;
  hourly_price: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

export type Amenity = {
  id: string;
  name: string;
  icon: string | null;
  created_at: string;
};

export type VenueAmenity = {
  venue_id: string;
  amenity_id: string;
  created_at: string;
};

export type CourtImage = {
  id: string;
  venue_id: string;
  court_id: string | null;
  storage_path: string;
  alt_text: string | null;
  sort_order: number | null;
  created_at: string;
};

export type VenueOperatingHours = {
  id: string;
  venue_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
};

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

/** Mobile-relevant slice of the web repo's Booking row. price_amount,
 * credit_amount_applied, and processing_fee_amount are integer CENTAVOS
 * (divide by 100 to display) — unlike courts.hourly_price and
 * venue_marketplace.starting_price, which are whole pesos. Mobile only
 * ever READS bookings: creation goes through the web API's checkout
 * route, and cancellation stays web-only for now. */
export type Booking = {
  id: string;
  court_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  price_amount: number;
  currency: string;
  confirmation_code: string;
  credit_amount_applied: number;
  processing_fee_amount: number;
  paid_at: string | null;
  payment_provider: 'stripe' | 'paymongo' | 'air_rally_credit';
  /** Set while attaching a freshly created PayMongo Checkout Session;
   * the session's public URL is this id without the "cs_" prefix. */
  paymongo_checkout_session_id: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A bookable interval returned by the get_available_slots() RPC —
 * timestamptz strings, rendered in the venue's own timezone. */
export type AvailableSlot = {
  slot_start: string;
  slot_end: string;
};

/** AIR/Rally Credits wallet — balance in integer centavos. One row per
 * user, created lazily; no row means zero balance, not an error. */
export type UserCreditWallet = {
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
};

/** Owner-facing slice of the venues TABLE (not the marketplace view) —
 * an owner reads their venues at any status via their own RLS. */
export type OwnedVenue = {
  id: string;
  owner_id: string;
  name: string;
  city: string | null;
  status: 'draft' | 'pending' | 'active' | 'inactive' | 'rejected';
  timezone: string;
  created_at: string;
};

/** Refund legs attached to a booking; venue_refund_amount comes only
 * from PayMongo's real split_refund response — null means "not yet
 * known", never zero. */
export type BookingRefund = {
  id: string;
  booking_id: string;
  amount: number;
  status: string;
  venue_refund_amount: number | null;
  created_at: string;
};

// --- Audit-findings additions: reviews, favorites, credits history,
// follows, COURT/Side posts, Clubs, Open Play events. Mirrors the web
// repo's src/lib/supabase/types.ts field-for-field for each of these. ---

/** The three columns safe to show about any user, not just yourself —
 * `profiles` itself is own-row-only RLS, so every cross-user join in this
 * app (review authors, post authors, follow lists) goes through this view
 * instead, exactly like the web app. */
export type PublicProfile = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;

export type Favorite = {
  user_id: string;
  venue_id: string;
  created_at: string;
};

export type Review = {
  id: string;
  venue_id: string;
  user_id: string;
  booking_id: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditTransactionType =
  | 'cancellation_compensation'
  | 'admin_adjustment'
  | 'promotion_bonus'
  | 'booking_payment';

/** AIR/Rally Credits ledger row — immutable, service-role-written only. */
export type CreditTransaction = {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: CreditTransactionType;
  reference_id: string | null;
  actor_id: string | null;
  description: string | null;
  created_at: string;
};

export type Follow = {
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  image_paths: string[];
  like_count: number;
  comment_count: number;
  reshare_count: number;
  created_at: string;
  updated_at: string;
};

export type PostLike = {
  post_id: string;
  user_id: string;
  created_at: string;
};

export type PostReshare = {
  post_id: string;
  user_id: string;
  created_at: string;
};

export type PostComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type PostMention = {
  post_id: string;
  user_id: string;
  created_at: string;
};

export type ClubSkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'mixed';
export type ClubType = 'social' | 'competitive' | 'training' | 'casual';
export type ClubVisibility = 'public' | 'approval_required' | 'private';
export type ClubStatus = 'pending_review' | 'active' | 'suspended';
export type ClubMemberRole = 'owner' | 'admin' | 'member';
export type ClubMemberStatus = 'pending' | 'active';

export type Club = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  location: string | null;
  skill_level: ClubSkillLevel;
  club_type: ClubType;
  visibility: ClubVisibility;
  status: ClubStatus;
  member_count: number;
  mention_handle: string | null;
  created_at: string;
  updated_at: string;
};

export type ClubMember = {
  club_id: string;
  user_id: string;
  role: ClubMemberRole;
  status: ClubMemberStatus;
  created_at: string;
};

export type EventType = 'open_play' | 'club_meetup' | 'training' | 'tournament';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type EventAttendeeStatus = 'joined' | 'waitlisted' | 'cancelled';

/** Phase 7.8a: price_amount is DISPLAY ONLY — collected by the organizer
 * at the venue, never charged online (that's Phase 7.9 on web too). */
export type CommunityEvent = {
  id: string;
  creator_id: string;
  venue_id: string | null;
  club_id: string | null;
  court_id: string | null;
  booking_id: string | null;
  title: string;
  description: string | null;
  event_type: EventType;
  skill_level: ClubSkillLevel | null;
  start_time: string;
  end_time: string | null;
  max_players: number | null;
  price_amount: number;
  currency: string;
  status: EventStatus;
  participant_count: number;
  created_at: string;
  updated_at: string;
};

export type EventAttendee = {
  event_id: string;
  user_id: string;
  status: EventAttendeeStatus;
  created_at: string;
};

type TableDef<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile, never, Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>>;
      notifications: TableDef<Notification, never, Partial<Pick<Notification, 'read_at'>>>;
      device_push_tokens: TableDef<DevicePushToken, never, never>;
      // Read-only from mobile: writes are owner/web flows.
      venue_marketplace: TableDef<VenueMarketplaceRow, never, never>;
      courts: TableDef<Court, never, never>;
      amenities: TableDef<Amenity, never, never>;
      venue_amenities: TableDef<VenueAmenity, never, never>;
      court_images: TableDef<CourtImage, never, never>;
      venue_operating_hours: TableDef<VenueOperatingHours, never, never>;
      bookings: TableDef<Booking, never, never>;
      user_credit_wallets: TableDef<UserCreditWallet, never, never>;
      venues: TableDef<OwnedVenue, never, never>;
      booking_refunds: TableDef<BookingRefund, never, never>;

      favorites: TableDef<Favorite, Pick<Favorite, 'user_id' | 'venue_id'>, never>;
      reviews: TableDef<
        Review,
        { venue_id: string; user_id: string; booking_id: string; rating: number; title: string | null; comment: string | null },
        never
      >;
      // service-role-written only — mobile only ever reads its own rows.
      credit_transactions: TableDef<CreditTransaction, never, never>;

      follows: TableDef<Follow, Pick<Follow, 'follower_id' | 'following_id'>, never>;
      posts: TableDef<
        Post,
        { user_id: string; content: string; image_url: string | null; image_paths: string[] },
        never
      >;
      post_likes: TableDef<PostLike, Pick<PostLike, 'post_id' | 'user_id'>, never>;
      post_reshares: TableDef<PostReshare, Pick<PostReshare, 'post_id' | 'user_id'>, never>;
      post_comments: TableDef<PostComment, { post_id: string; user_id: string; content: string }, never>;
      post_mentions: TableDef<PostMention, Pick<PostMention, 'post_id' | 'user_id'>, never>;

      clubs: TableDef<
        Club,
        {
          owner_id: string;
          name: string;
          description: string | null;
          location: string | null;
          image_url: string | null;
          skill_level: ClubSkillLevel;
          club_type: ClubType;
          visibility: ClubVisibility;
        },
        Partial<{
          name: string;
          description: string | null;
          location: string | null;
          image_url: string | null;
          skill_level: ClubSkillLevel;
          club_type: ClubType;
          visibility: ClubVisibility;
        }>
      >;
      club_members: TableDef<
        ClubMember,
        Pick<ClubMember, 'club_id' | 'user_id'>,
        Partial<Pick<ClubMember, 'role' | 'status'>>
      >;

      events: TableDef<
        CommunityEvent,
        {
          creator_id: string;
          venue_id: string | null;
          club_id: string | null;
          court_id: string | null;
          booking_id: string | null;
          title: string;
          description: string | null;
          event_type: EventType;
          skill_level: ClubSkillLevel | null;
          start_time: string;
          end_time: string | null;
          max_players: number | null;
          price_amount: number;
        },
        Partial<Pick<CommunityEvent, 'status'>>
      >;
      event_attendees: TableDef<
        EventAttendee,
        Pick<EventAttendee, 'event_id' | 'user_id' | 'status'>,
        Partial<Pick<EventAttendee, 'status'>>
      >;

      // A view, not a table — same precedent as venue_marketplace above:
      // declared as a read-only TableDef entry under Tables, because that
      // is what already compiles cleanly against this supabase-js version
      // (a distinct Views block broke type inference project-wide).
      public_profiles: TableDef<PublicProfile, never, never>;
    };
    Views: Record<string, never>;
    Functions: {
      register_push_token: {
        Args: { p_token: string; p_platform: 'ios' | 'android' };
        Returns: undefined;
      };
      unregister_push_token: {
        Args: { p_token: string };
        Returns: undefined;
      };
      record_agreement_acceptance: {
        Args: { p_user_id: string; p_agreement_version: string };
        Returns: undefined;
      };
      get_available_slots: {
        Args: {
          p_court_id: string;
          p_local_date: string;
          p_duration_minutes: number;
          p_increment_minutes: number;
          p_min_lead_minutes: number;
        };
        Returns: AvailableSlot[];
      };
      court_side_feed: {
        Args: { p_limit?: number; p_cursor?: string };
        Returns: (Post & { effective_at: string; resharer_id: string | null })[];
      };
      invite_event_players: {
        Args: { p_event_id: string; p_user_ids: string[] };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
