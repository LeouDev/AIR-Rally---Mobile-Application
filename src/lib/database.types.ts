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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
