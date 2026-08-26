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

export type AgreementAcceptance = {
  id: string;
  user_id: string;
  agreement_version: string;
  accepted_at: string;
  created_at: string;
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
  /** PayMongo marketplace split only — the platform's requested leg.
   * Null unless actually snapshotted at checkout time. */
  platform_fee_amount: number | null;
  /** PayMongo marketplace split only — the venue's requested leg. Purely
   * informational: never a claim that PayMongo has settled/paid out this
   * amount. */
  venue_amount: number | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RescheduleStatus = 'pending_payment' | 'pending_refund' | 'completed' | 'failed' | 'provider_unavailable';

/** Connects exactly two bookings — the original (cancelled on completion)
 * and the replacement (confirmed on completion). */
export type BookingReschedule = {
  id: string;
  original_booking_id: string;
  new_booking_id: string;
  price_difference: number;
  status: RescheduleStatus;
  refund_id: string | null;
  initiated_by: string;
  reason: string | null;
  failure_reason: string | null;
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

/** What a venue is owed for one booking, independent of how the customer
 * paid — mirrors the web repo's src/lib/supabase/types.ts. Every row is
 * written by database triggers/the admin-only attest_payout_settled() RPC;
 * no client role has INSERT/UPDATE/DELETE, so this is read-only here. */
export type SettlementStatus = 'pending' | 'payable' | 'settled' | 'reversed' | 'on_hold';

export type BookingSettlement = {
  id: string;
  booking_id: string;
  venue_id: string;
  currency: string;
  venue_amount: number;
  settlement_status: SettlementStatus;
  created_at: string;
};

/** A player's "bring a court here" ask — migration
 * 20260810000099_venue_requests.sql. Only the columns the client actually
 * writes/reads; admin-only columns (status transitions, venue_id linking,
 * merged_into_id) are intentionally omitted since no client role can select
 * or write them — mirrors the pattern BookingSettlement already sets for
 * admin-managed tables. RLS is own-row-select-only, so `user_id` on a row
 * this client can ever read is always the caller's own id — not worth
 * carrying in the read type. */
export type VenueRequest = {
  id: string;
  place_name: string;
  place_city: string | null;
  note: string | null;
  created_at: string;
};

/** The insert shape. `user_id` IS sent explicitly here, sourced from the
 * caller's own session inside createVenueRequest() — never a parameter one
 * layer up — matching the RLS insert policy's own `user_id = auth.uid()`
 * check; failing at the same point in application code first is cheaper to
 * read than only at the database. */
export type VenueRequestInsert = {
  user_id: string;
  place_name: string;
  place_city?: string | null;
  note?: string | null;
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

/** court_side_feed()'s p_scope — required, no default (see the web repo's
 * 20260810000077_court_side_feed_scope.sql). `for_you` is unfiltered;
 * `following` is posts/reshares by people you follow, plus your own. */
export type CourtSideFeedScope = 'for_you' | 'following';

/**
 * Trust & safety. Kept in lockstep with the CHECK constraints in the web
 * repo's supabase/migrations/20260810000049_reports_support_rate_limits.sql
 * — the database is the boundary; these exist so the sheet can say what
 * is wrong without a round trip, not instead of the constraint.
 * 'ranked_match' added by 20260810000086 — a team name/club choice is
 * user-generated content the same as a post or a club, reported by the
 * match's own id like every other target_type already is.
 */
export type ReportTargetType = 'post' | 'comment' | 'club' | 'event' | 'user' | 'ranked_match';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'sexual_content'
  | 'violence'
  | 'misinformation'
  | 'impersonation'
  | 'other';

export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

/**
 * Support requests. Same migration as reports above
 * (20260810000049_reports_support_rate_limits.sql), plus resolution_note
 * from 20260810000088. Category is NOT NULL with a CHECK, so a client
 * cannot omit it — the web's form asks for it and so must this one.
 */
export type SupportCategory = 'booking' | 'payment' | 'account' | 'venue' | 'safety' | 'bug' | 'other';

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type SupportRequest = {
  id: string;
  user_id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  /** The single admin reply. Required once status reaches resolved or
   * closed (support_resolution_complete), cleared again on reopen — so
   * "has a reply" and "is closed" always agree. */
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Report = {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Blocking. Kept in lockstep with the web repo's
 * supabase/migrations/20260810000084_user_blocks.sql — the database is
 * the boundary. Rosters (event_attendees) and public_profiles are
 * deliberately NOT filtered by a block: a block must never hide who a
 * player will physically meet at a court, and search stays honest about
 * who exists. Feed content (posts/likes/comments/reshares/mentions) IS
 * filtered at the RLS layer itself, so it's invisible on a direct
 * profile visit too, not just in the algorithmic feed. A block SEVERS
 * any existing follow between the two people, both directions, rather
 * than merely hiding it.
 */
export type UserBlock = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

/** list_my_blocks()'s row shape — the unblock screen's only sanctioned
 * way to read your own block list with display data joined in. */
export type BlockedUser = {
  blocked_id: string;
  display_name: string | null;
  avatar_url: string | null;
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
  /** Set to embed a joinable match card — "share this game" into COURT/Side. */
  event_id: string | null;
  /** Set to scope this post to one club's own feed — see club_role_of() RLS. */
  club_id: string | null;
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
export type EventAttendeeStatus = 'pending_approval' | 'joined' | 'waitlisted' | 'cancelled';

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

/**
 * AIR/Rally Ranked — ported from the web repo's src/lib/supabase/types.ts
 * (main, supabase/migrations/20260810000067_air_rally_ranked.sql and
 * .../20260810000068_dupr_rating_engine.sql). Every Ranked table is
 * read-only to every client role — the only write path is the RPCs in
 * lib/ranked.ts, each a SECURITY DEFINER function. Kept byte-identical to
 * the web's shapes, same convention as AvailableSlot/BookingReschedule.
 */

/** 1–7, low to high. Names/material/geometry live in lib/ranked.ts's RANK_THRESHOLDS, not the database. */
export type RankedTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 1–5, the star within a tier — 1-indexed, never 0. */
export type RankedPips = 1 | 2 | 3 | 4 | 5;
export type RankedMatchType = 'singles' | 'doubles';
export type RankedMatchWeightType = 'self_reported_rec' | 'club' | 'league' | 'tournament' | 'air_rally_ranked';
export type RankedTeam = 'a' | 'b';
export type RankedMatchStatus =
  | 'lobby'
  | 'officiating'
  | 'live'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'disputed'
  | 'cancelled';
/** A non-playing fifth person, or one of the players keeping score. */
export type RankedOfficiatingMode = 'referee' | 'player_scorekeeper';
export type RankedResultResponse = 'pending' | 'accepted' | 'disputed';

export type RankedSeason = {
  id: number;
  name: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

export type PlayerRank = {
  season_id: number;
  user_id: string;
  /** DUPR-inspired AAR. Meaningful from day one, but hidden from the player until is_calibrated. Starts at 1000. */
  rating: number;
  /** Stateless — derived from `rating` every time it changes, never independently incremented. */
  tier: RankedTier;
  pips: RankedPips;
  /** 0-100 confidence in `rating`, NOT a measure of skill. */
  reliability: number;
  /** 0-100, admin-review signal only — never an automatic penalty. */
  sandbag_risk_score: number;
  last_match_at: string | null;
  /** Retired rating mechanic — always false/0 on any row the current engine writes. */
  in_promotion_series: boolean;
  star_protection: number;
  calibration_matches: number;
  is_calibrated: boolean;
  wins: number;
  losses: number;
  /** Positive on a win streak, negative on a losing one. */
  current_streak: number;
  best_streak: number;
  best_tier: RankedTier | null;
  best_pips: RankedPips | null;
  created_at: string;
  updated_at: string;
};

export type RankedMatch = {
  id: string;
  season_id: number;
  /** The Open Play session this was struck inside, when there was one. */
  event_id: string | null;
  court_id: string | null;
  venue_id: string | null;
  match_type: RankedMatchType;
  /** Every match created through create_ranked_match() today is air_rally_ranked. */
  match_weight_type: RankedMatchWeightType;
  /** False for a casual result: recorded and confirmed like any match, but
   * apply_ranked_result() skips every player_ranks mutation for everyone in
   * it. Set once at creation, never updated afterward — see
   * migration 20260810000087. Distinct from a calibrated player being
   * individually FROZEN in a `rated: true` match with no booking behind it
   * (20260810000100) — that shows up per-player as a null rating_delta on
   * an otherwise-rated match, not as `rated: false` on the match itself. */
  rated: boolean;
  status: RankedMatchStatus;
  officiating_mode: RankedOfficiatingMode | null;
  /** Whoever holds the scoreboard, under either mode. */
  scorekeeper_id: string | null;
  target_score: number;
  win_by: number;
  score_a: number;
  score_b: number;
  serving_team: RankedTeam;
  winning_team: RankedTeam | null;
  /** Free-text team name for a doubles team, or null. Mutually exclusive
   * with team_a_club_id — set_ranked_team_identity() enforces this at
   * the RPC layer, but the DB's own CHECK constraint is what actually
   * guarantees it. Lobby-only to set (migration 20260810000086); no
   * client write path exists here — this table has none. */
  team_a_name: string | null;
  /** Club team A chose to represent, or null. Resolve the live club name
   * by JOIN when displaying — a club rename should read on every match
   * that selected it, not freeze at selection time. */
  team_a_club_id: string | null;
  team_b_name: string | null;
  team_b_club_id: string | null;
  /** True once ratings have moved. The database's own double-apply guard. */
  rank_applied: boolean;
  dispute_reason: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  confirmed_at: string | null;
  updated_at: string;
};

export type RankedMatchPlayer = {
  match_id: string;
  user_id: string;
  team: RankedTeam;
  is_host: boolean;
  /** Denormalized from the match's own match_type at creation time. A
   * team-size record, same as the match's — every player shares one
   * rating now, so this no longer selects between two of them. */
  mode: RankedMatchType | null;
  ready: boolean;
  ready_at: string | null;
  /** Null means "hasn't answered", not the same as voting no. */
  officiating_vote: boolean | null;
  result_response: RankedResultResponse;
  dispute_reason: string | null;
  /** All null until the match is confirmed; frozen at that moment thereafter. */
  rating_before: number | null;
  rating_after: number | null;
  rating_delta: number | null;
  /** Null for a match played during calibration — there was no visible ladder position before it. */
  tier_before: RankedTier | null;
  pips_before: RankedPips | null;
  tier_after: RankedTier | null;
  pips_after: RankedPips | null;
  pip_delta: number | null;
  /** Retired — never true on a row this engine writes. */
  star_protected: boolean;
  expected_score: number | null;
  /** The point SHARE this player's team actually won (e.g. 9/20 = 0.45), not the raw score. */
  actual_score: number | null;
  performance_gap: number | null;
  match_weight: number | null;
  recency_multiplier: number | null;
  reliability_modifier: number | null;
  created_at: string;
};

export type RankedMatchPoint = {
  match_id: string;
  seq: number;
  team: RankedTeam;
  recorded_by: string;
  recorded_at: string;
};

/**
 * Every CONFIRMED match a player has been in, rated or not — the
 * broader number behind "total wins including normal games". Distinct
 * from PlayerRank.wins/losses, which stay ranked-only because they
 * feed the rating: a casual result moves this and not that. Disputed
 * matches never reach 'confirmed', so they're excluded automatically.
 */
export type PlayerMatchTotals = {
  user_id: string;
  total_matches: number;
  wins: number;
  losses: number;
};

/** Calibrated players only. One leaderboard per season; position is ranked within season_id. */
export type RankedLeaderboardRow = {
  season_id: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number;
  tier: RankedTier;
  pips: RankedPips;
  wins: number;
  losses: number;
  reliability: number;
  position: number;
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
      agreement_acceptances: TableDef<AgreementAcceptance, never, never>;
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
      booking_reschedules: TableDef<BookingReschedule, never, never>;
      user_credit_wallets: TableDef<UserCreditWallet, never, never>;
      venues: TableDef<OwnedVenue, never, never>;
      booking_refunds: TableDef<BookingRefund, never, never>;
      // No client role has write access — see BookingSettlement's own comment.
      booking_settlements: TableDef<BookingSettlement, never, never>;
      venue_requests: TableDef<VenueRequest, VenueRequestInsert, never>;

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
        {
          user_id: string;
          content: string;
          image_url: string | null;
          image_paths: string[];
          event_id?: string | null;
          club_id?: string | null;
        },
        never
      >;
      post_likes: TableDef<PostLike, Pick<PostLike, 'post_id' | 'user_id'>, never>;
      post_reshares: TableDef<PostReshare, Pick<PostReshare, 'post_id' | 'user_id'>, never>;
      post_comments: TableDef<PostComment, { post_id: string; user_id: string; content: string }, never>;
      post_mentions: TableDef<PostMention, Pick<PostMention, 'post_id' | 'user_id'>, never>;

      /* Insert-only from a client. Resolution columns are the moderation
         queue's, and RLS gives no client an update path to them. */
      reports: TableDef<
        Report,
        {
          reporter_id: string;
          target_type: ReportTargetType;
          target_id: string;
          reason: ReportReason;
          details?: string | null;
        },
        never
      >;

      /* Insert-only from a client, same posture as reports: status and
         the resolution columns belong to the admin queue, and RLS gives
         no client an update path to them. */
      support_requests: TableDef<
        SupportRequest,
        {
          user_id: string;
          category: SupportCategory;
          subject: string;
          message: string;
        },
        never
      >;

      /* Insert-only / delete-only from a client — RLS on user_blocks
         scopes both to blocker_id = auth.uid(). No client update path;
         a block is either in force or removed, never edited. */
      user_blocks: TableDef<UserBlock, { blocker_id: string; blocked_id: string }, never>;

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

      // Ranked: read-only to every client role. There is no client
      // insert/update policy on any of these — the RPCs below are the
      // only write path. ranked_leaderboard is a view, declared as a
      // TableDef entry for the same reason public_profiles/
      // venue_marketplace are above.
      ranked_seasons: TableDef<RankedSeason, never, never>;
      player_ranks: TableDef<PlayerRank, never, never>;
      ranked_matches: TableDef<RankedMatch, never, never>;
      ranked_match_players: TableDef<RankedMatchPlayer, never, never>;
      ranked_match_points: TableDef<RankedMatchPoint, never, never>;
      ranked_leaderboard: TableDef<RankedLeaderboardRow, never, never>;
      player_match_totals: TableDef<PlayerMatchTotals, never, never>;
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
      /** p_scope is required with no default (see CourtSideFeedScope's own
       * comment). p_cursor and p_cursor_id are a matched pair — the
       * composite keyset cursor (effective_at, id) — and the function
       * raises 22023 if exactly one is supplied without the other. */
      court_side_feed: {
        Args: {
          p_scope: CourtSideFeedScope;
          p_limit?: number;
          p_cursor?: string;
          p_cursor_id?: string;
        };
        Returns: (Post & { effective_at: string; resharer_id: string | null })[];
      };
      /** SECURITY DEFINER — sees across user_blocks' own RLS (which
       * only ever shows a caller their OWN outgoing blocks) to answer
       * bidirectionally. Refuses to answer for a pair neither of whose
       * members is the caller (returns false), so it can't be used to
       * map a stranger's block graph. */
      is_blocked_pair: {
        Args: { p_user_a: string; p_user_b: string };
        Returns: boolean;
      };
      /** The block-management screen's data source. */
      list_my_blocks: {
        Args: Record<string, never>;
        Returns: BlockedUser[];
      };
      invite_event_players: {
        Args: { p_event_id: string; p_user_ids: string[] };
        Returns: number;
      };

      /* --- Venue requests (migrations 099, 106) ------------------------
       * "Bring a court here" — capture surface only; admin/link RPCs
       * (admin_venue_demand, admin_link_venue_requests,
       * admin_set_venue_request_cluster_status,
       * admin_unlinked_venue_requests, public_venue_request_summary) are
       * deliberately not typed here — this app never calls them. The
       * public summary is for the shared web page, not the mobile client.
       * ------------------------------------------------------------- */

      /** Free-text-only, never surfaces a draft/pending_review venue's
       * name (see the migration). Empty/blank query returns nothing. */
      venue_request_place_suggestions: {
        Args: { p_query: string };
        Returns: { place_name: string; place_city: string }[];
      };
      /** The requester's own feedback, for a request the caller owns —
       * refuses (no_data_found) for anyone else's. `requesters` is always
       * the real count; `show_count` is false below the threshold of 5 —
       * the UI must key off show_count and show the promise, not read
       * requesters directly, since the raw number below threshold is not
       * meant to be displayed. */
      venue_request_demand_for_me: {
        Args: { p_request_id: string };
        Returns: { requesters: number; show_count: boolean }[];
      };

      /* --- Ranked -----------------------------------------------------
       * Called directly over PostgREST with the player's own JWT — same
       * posture the web repo's comment describes: no other write path,
       * the tables themselves have no client insert/update policy.
       * ------------------------------------------------------------- */

      /** The open season's id, or null between seasons. */
      current_ranked_season: {
        Args: Record<string, never>;
        Returns: number | null;
      };
      /** Idempotent. Creates the caller's standing for the open season, if they have none yet. */
      ensure_my_player_rank: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      /** Widest AAR gap among the calibrated players in a proposed party. Ranked parties must stay within 250 AAR of each other. */
      ranked_party_spread: {
        Args: { p_user_ids: string[] };
        Returns: number;
      };
      /** Returns the new match's id. The caller must be one of the players. */
      create_ranked_match: {
        Args: {
          p_match_type: RankedMatchType;
          p_team_a: string[];
          p_team_b: string[];
          p_event_id?: string | null;
          p_court_id?: string | null;
          p_rated?: boolean;
        };
        Returns: string;
      };
      set_ranked_ready: {
        Args: { p_match_id: string; p_ready: boolean };
        Returns: undefined;
      };
      /** Proposing resets every vote, including the proposer's. */
      propose_ranked_officiating: {
        Args: { p_match_id: string; p_mode: RankedOfficiatingMode; p_scorekeeper_id: string };
        Returns: undefined;
      };
      /** Unanimity starts the match; one abstention or objection holds it. */
      vote_ranked_officiating: {
        Args: { p_match_id: string; p_approve: boolean };
        Returns: undefined;
      };
      /** Scorekeeper only. */
      record_ranked_point: {
        Args: { p_match_id: string; p_team: RankedTeam };
        Returns: undefined;
      };
      /** Scorekeeper only. A no-op at 0-0 rather than an error. */
      undo_ranked_point: {
        Args: { p_match_id: string };
        Returns: undefined;
      };
      /** Scorekeeper only. Rejects a score that isn't a finished game. */
      submit_ranked_result: {
        Args: { p_match_id: string };
        Returns: undefined;
      };
      /** A dispute is absorbing: nothing is applied, and no later acceptance reverses it. */
      respond_ranked_result: {
        Args: { p_match_id: string; p_accept: boolean; p_reason?: string | null };
        Returns: undefined;
      };
      cancel_ranked_match: {
        Args: { p_match_id: string };
        Returns: undefined;
      };
      /** Stable/read-only, granted to anon+authenticated (unlike every
       * mutating RPC here) — confirmed live before use, since the
       * migration that added it had no explicit grant statement. */
      ranked_match_is_booked: {
        Args: { p_match_id: string };
        Returns: boolean;
      };
      set_ranked_team_identity: {
        Args: { p_match_id: string; p_team: RankedTeam; p_name?: string | null; p_club_id?: string | null };
        Returns: undefined;
      };
      // resolve_ranked_dispute is admin-only — not called from mobile.
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
