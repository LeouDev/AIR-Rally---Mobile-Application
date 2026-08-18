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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
