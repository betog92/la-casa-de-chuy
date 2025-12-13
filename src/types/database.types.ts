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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          phone?: string | null;
          password_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          phone?: string | null;
          password_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reservations: {
        Row: {
          id: string;
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
          status: "confirmed" | "cancelled" | "completed";
          payment_id: string | null;
          refund_amount: number | null;
          refund_status: "pending" | "processed" | "failed" | null;
          refund_id: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          reschedule_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
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
          status?: "confirmed" | "cancelled" | "completed";
          payment_id?: string | null;
          refund_amount?: number | null;
          refund_status?: "pending" | "processed" | "failed" | null;
          refund_id?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          reschedule_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
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
          status?: "confirmed" | "cancelled" | "completed";
          payment_id?: string | null;
          refund_amount?: number | null;
          refund_status?: "pending" | "processed" | "failed" | null;
          refund_id?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          reschedule_count?: number;
          created_at?: string;
          updated_at?: string;
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
