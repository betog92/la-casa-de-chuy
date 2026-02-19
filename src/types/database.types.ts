export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          phone: string | null;
          password_hash: string | null;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          phone?: string | null;
          password_hash?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          phone?: string | null;
          password_hash?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      reservations: {
        Row: {
          id: number;
          user_id: string | null;
          email: string;
          name: string;
          phone: string;
          date: string;
          start_time: string;
          end_time: string;
          price: number;
          original_price: number;
          discount_amount: number | null;
          discount_type: string | null;
          last_minute_discount: number | null;
          loyalty_discount: number | null;
          loyalty_points_used: number | null;
          credits_used: number | null;
          referral_discount: number | null;
          discount_code: string | null;
          discount_code_discount: number | null;
          status: "confirmed" | "cancelled" | "completed";
          payment_id: string | null;
          payment_method: string | null;
          refund_amount: number | null;
          refund_status: "pending" | "processed" | "failed" | null;
          refund_id: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          reschedule_count: number;
          original_date: string | null;
          original_start_time: string | null;
          original_payment_id: string | null;
          additional_payment_id: string | null;
          additional_payment_amount: number | null;
          additional_payment_method: string | null;
          created_at: string;
          updated_at: string;
          created_by_user_id: string | null;
          rescheduled_by_user_id: string | null;
          cancelled_by_user_id: string | null;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          email: string;
          name: string;
          phone: string;
          date: string;
          start_time: string;
          end_time: string;
          price: number;
          original_price: number;
          discount_amount?: number | null;
          discount_type?: string | null;
          last_minute_discount?: number | null;
          loyalty_discount?: number | null;
          loyalty_points_used?: number | null;
          credits_used?: number | null;
          referral_discount?: number | null;
          discount_code?: string | null;
          discount_code_discount?: number | null;
          status?: "confirmed" | "cancelled" | "completed";
          payment_id?: string | null;
          payment_method?: string | null;
          refund_amount?: number | null;
          refund_status?: "pending" | "processed" | "failed" | null;
          refund_id?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          reschedule_count?: number;
          original_date?: string | null;
          original_start_time?: string | null;
          original_payment_id?: string | null;
          additional_payment_id?: string | null;
          additional_payment_amount?: number | null;
          additional_payment_method?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by_user_id?: string | null;
          rescheduled_by_user_id?: string | null;
          cancelled_by_user_id?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          created_by_user_id?: string | null;
          rescheduled_by_user_id?: string | null;
          cancelled_by_user_id?: string | null;
          email?: string;
          name?: string;
          phone?: string;
          date?: string;
          start_time?: string;
          end_time?: string;
          price?: number;
          original_price?: number;
          discount_amount?: number | null;
          discount_type?: string | null;
          last_minute_discount?: number | null;
          loyalty_discount?: number | null;
          loyalty_points_used?: number | null;
          credits_used?: number | null;
          referral_discount?: number | null;
          discount_code?: string | null;
          discount_code_discount?: number | null;
          status?: "confirmed" | "cancelled" | "completed";
          payment_id?: string | null;
          payment_method?: string | null;
          refund_amount?: number | null;
          refund_status?: "pending" | "processed" | "failed" | null;
          refund_id?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          reschedule_count?: number;
          original_date?: string | null;
          original_start_time?: string | null;
          original_payment_id?: string | null;
          additional_payment_id?: string | null;
          additional_payment_amount?: number | null;
          additional_payment_method?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reservation_reschedule_history: {
        Row: {
          id: number;
          reservation_id: number;
          rescheduled_at: string;
          rescheduled_by_user_id: string | null;
          previous_date: string;
          previous_start_time: string;
          new_date: string;
          new_start_time: string;
          additional_payment_amount: number | null;
          additional_payment_method: string | null;
        };
        Insert: {
          id?: number;
          reservation_id: number;
          rescheduled_at?: string;
          rescheduled_by_user_id?: string | null;
          previous_date: string;
          previous_start_time: string;
          new_date: string;
          new_start_time: string;
          additional_payment_amount?: number | null;
          additional_payment_method?: string | null;
        };
        Update: {
          id?: number;
          reservation_id?: number;
          rescheduled_at?: string;
          rescheduled_by_user_id?: string | null;
          previous_date?: string;
          previous_start_time?: string;
          new_date?: string;
          new_start_time?: string;
          additional_payment_amount?: number | null;
          additional_payment_method?: string | null;
        };
      };
      availability: {
        Row: {
          id: string;
          date: string;
          is_closed: boolean;
          is_holiday: boolean;
          custom_price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          is_closed?: boolean;
          is_holiday?: boolean;
          custom_price?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          is_closed?: boolean;
          is_holiday?: boolean;
          custom_price?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      time_slots: {
        Row: {
          id: string;
          date: string;
          start_time: string;
          end_time: string;
          available: boolean;
          is_occupied: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          start_time: string;
          end_time: string;
          available?: boolean;
          is_occupied?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          start_time?: string;
          end_time?: string;
          available?: boolean;
          is_occupied?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      discount_codes: {
        Row: {
          id: string;
          code: string;
          description: string | null;
          discount_percentage: number;
          valid_from: string;
          valid_until: string;
          max_uses: number;
          current_uses: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          description?: string | null;
          discount_percentage: number;
          valid_from: string;
          valid_until: string;
          max_uses?: number;
          current_uses?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          description?: string | null;
          discount_percentage?: number;
          valid_from?: string;
          valid_until?: string;
          max_uses?: number;
          current_uses?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      discount_code_uses: {
        Row: {
          id: string;
          discount_code_id: string;
          user_id: string | null;
          email: string;
          reservation_id: number | null;
          used_at: string;
        };
        Insert: {
          id?: string;
          discount_code_id: string;
          user_id?: string | null;
          email: string;
          reservation_id?: number | null;
          used_at?: string;
        };
        Update: {
          id?: string;
          discount_code_id?: string;
          user_id?: string | null;
          email?: string;
          reservation_id?: number | null;
          used_at?: string;
        };
      };
      credits: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          source: string;
          expires_at: string;
          used: boolean;
          created_at: string;
          reservation_id?: number | null;
          revoked?: boolean;
          revoked_at?: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          source: string;
          expires_at: string;
          used?: boolean;
          created_at?: string;
          reservation_id?: number | null;
          revoked?: boolean;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          source?: string;
          expires_at?: string;
          used?: boolean;
          created_at?: string;
          reservation_id?: number | null;
          revoked?: boolean;
          revoked_at?: string | null;
        };
      };
      loyalty_points: {
        Row: {
          id: string;
          user_id: string;
          points: number;
          expires_at: string;
          created_at: string;
          reservation_id?: number | null;
          used?: boolean;
          revoked?: boolean;
          revoked_at?: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          points: number;
          expires_at: string;
          created_at?: string;
          reservation_id?: number | null;
          used?: boolean;
          revoked?: boolean;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          points?: number;
          expires_at?: string;
          created_at?: string;
          reservation_id?: number | null;
          used?: boolean;
          revoked?: boolean;
          revoked_at?: string | null;
        };
      };
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referred_email: string;
          code: string;
          link: string;
          completed: boolean;
          credit_given: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referred_email: string;
          code: string;
          link: string;
          completed?: boolean;
          credit_given?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          referrer_id?: string;
          referred_email?: string;
          code?: string;
          link?: string;
          completed?: boolean;
          credit_given?: boolean;
          created_at?: string;
        };
      };
    };
    Functions: {
      get_available_slots: {
        Args: {
          p_date: string;
        };
        Returns: Array<{
          id: string;
          start_time: string;
          end_time: string;
        }>;
      };
      is_slot_available: {
        Args: {
          p_date: string;
          p_start_time: string;
        };
        Returns: boolean;
      };
    };
  };
}
