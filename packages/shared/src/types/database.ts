// Types DB — version manuelle minimale.
// Régénérer avec : pnpm db:types (Supabase CLI requis)

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string | null;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          city: string;
          role: 'user' | 'venue_owner' | 'organizer' | 'staff' | 'admin';
          kyc_status: 'none' | 'pending' | 'verified' | 'rejected';
          kyc_doc_url: string | null;
          pin_hash: string | null;
          referral_code: string | null;
          referred_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
      };
      wallets: {
        Row: {
          user_id: string;
          balance_xof: number;
          locked_xof: number;
          daily_limit_xof: number;
          monthly_limit_xof: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['wallets']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['wallets']['Row']>;
      };
      venues: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          category: 'maquis' | 'restaurant' | 'hotel' | 'club' | 'sport' | 'cafe' | 'event_space';
          description: string | null;
          cover_url: string | null;
          gallery_urls: string[];
          address: string;
          city: string;
          district: string | null;
          phone: string | null;
          email: string | null;
          opening_hours: Json;
          avg_price_xof: number | null;
          amenities: string[];
          status: 'draft' | 'active' | 'suspended' | 'closed';
          rating_avg: number;
          rating_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['venues']['Row']> & {
          owner_id: string; name: string; slug: string; category: Database['public']['Tables']['venues']['Row']['category']; address: string;
        };
        Update: Partial<Database['public']['Tables']['venues']['Row']>;
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          counterparty_id: string | null;
          type: 'topup' | 'withdraw' | 'payment' | 'transfer' | 'refund' | 'split' | 'escrow_hold' | 'escrow_release' | 'fee';
          amount_xof: number;
          fee_xof: number;
          status: 'pending' | 'success' | 'failed' | 'reversed';
          provider: string | null;
          provider_ref: string | null;
          description: string | null;
          metadata: Json;
          reservation_id: string | null;
          ticket_id: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['transactions']['Row']> & {
          user_id: string; type: Database['public']['Tables']['transactions']['Row']['type']; amount_xof: number;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Row']>;
      };
      reservations: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string;
          date_time: string;
          party_size: number;
          deposit_xof: number;
          escrow_tx_id: string | null;
          status: 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled' | 'refunded';
          qr_code: string;
          notes: string | null;
          created_at: string;
          arrived_at: string | null;
          cancelled_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['reservations']['Row']> & {
          user_id: string; venue_id: string; date_time: string; party_size: number;
        };
        Update: Partial<Database['public']['Tables']['reservations']['Row']>;
      };
      events: { Row: any; Insert: any; Update: any };
      tickets: { Row: any; Insert: any; Update: any };
      reviews: { Row: any; Insert: any; Update: any };
      stories: { Row: any; Insert: any; Update: any };
      follows: { Row: any; Insert: any; Update: any };
      chats: { Row: any; Insert: any; Update: any };
      chat_members: { Row: any; Insert: any; Update: any };
      messages: { Row: any; Insert: any; Update: any };
      sos_contacts: { Row: any; Insert: any; Update: any };
      sos_alerts: { Row: any; Insert: any; Update: any };
      sos_pings: { Row: any; Insert: any; Update: any };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'user' | 'venue_owner' | 'organizer' | 'staff' | 'admin';
      venue_category: 'maquis' | 'restaurant' | 'hotel' | 'club' | 'sport' | 'cafe' | 'event_space';
    };
  };
}
