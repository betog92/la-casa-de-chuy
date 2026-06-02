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
          is_super_admin: boolean;
          is_photographer: boolean;
          studio_name: string | null;
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
          is_super_admin?: boolean;
          is_photographer?: boolean;
          studio_name?: string | null;
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
          is_super_admin?: boolean;
          is_photographer?: boolean;
          studio_name?: string | null;
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
          payment_status: "pending" | "paid" | "not_applicable" | null;
          payment_validated_at: string | null;
          payment_validated_by_user_id: string | null;
          session_type: "xv_anos" | "boda" | "casual" | null;
          photographer_studio: string | null;
          /** web | admin | google_import — ver sql/01-schema y migraciones */
          source: string;
          google_event_id: string | null;
          import_type: string | null;
          order_number: string | null;
          import_notes: string | null;
          import_notes_edited_at: string | null;
          import_notes_edited_by_user_id: string | null;
          municipio: string | null;
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
          payment_status?: "pending" | "paid" | "not_applicable" | null;
          payment_validated_at?: string | null;
          payment_validated_by_user_id?: string | null;
          session_type?: "xv_anos" | "boda" | "casual" | null;
          photographer_studio?: string | null;
          source?: string;
          google_event_id?: string | null;
          import_type?: string | null;
          order_number?: string | null;
          import_notes?: string | null;
          import_notes_edited_at?: string | null;
          import_notes_edited_by_user_id?: string | null;
          municipio?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          created_by_user_id?: string | null;
          rescheduled_by_user_id?: string | null;
          cancelled_by_user_id?: string | null;
          payment_status?: "pending" | "paid" | "not_applicable" | null;
          payment_validated_at?: string | null;
          payment_validated_by_user_id?: string | null;
          session_type?: "xv_anos" | "boda" | "casual" | null;
          photographer_studio?: string | null;
          source?: string;
          google_event_id?: string | null;
          import_type?: string | null;
          order_number?: string | null;
          import_notes?: string | null;
          import_notes_edited_at?: string | null;
          import_notes_edited_by_user_id?: string | null;
          municipio?: string | null;
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
      reservation_refunds: {
        Row: {
          id: string;
          reservation_id: number;
          payment_id: string;
          charge_id: string | null;
          charge_kind: "initial" | "additional";
          amount_mxn: number;
          status: "pending" | "processed" | "failed" | "cancelled";
          refund_id: string | null;
          attempts: number;
          last_error_message: string | null;
          last_error_at: string | null;
          next_retry_at: string;
          processed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reservation_id: number;
          payment_id: string;
          charge_id?: string | null;
          charge_kind: "initial" | "additional";
          amount_mxn: number;
          status?: "pending" | "processed" | "failed" | "cancelled";
          refund_id?: string | null;
          attempts?: number;
          last_error_message?: string | null;
          last_error_at?: string | null;
          next_retry_at?: string;
          processed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reservation_id?: number;
          payment_id?: string;
          charge_id?: string | null;
          charge_kind?: "initial" | "additional";
          amount_mxn?: number;
          status?: "pending" | "processed" | "failed" | "cancelled";
          refund_id?: string | null;
          attempts?: number;
          last_error_message?: string | null;
          last_error_at?: string | null;
          next_retry_at?: string;
          processed_at?: string | null;
          notes?: string | null;
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
          // expires_at NULL = "no caduca" (migración 50: créditos de referido son perpetuos)
          expires_at: string | null;
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
          expires_at?: string | null;
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
          expires_at?: string | null;
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
          // expires_at NULL = "no caduca" (Monedas Chuy son perpetuas desde abril 2026)
          expires_at: string | null;
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
          expires_at?: string | null;
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
          expires_at?: string | null;
          created_at?: string;
          reservation_id?: number | null;
          used?: boolean;
          revoked?: boolean;
          revoked_at?: string | null;
        };
      };
      // ============================================================
      // Referidos V2 (migración 50): código permanente por usuario.
      // La tabla `referrals` v1 fue dropeada en la misma migración.
      // ============================================================
      referral_codes: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      referral_redemptions: {
        Row: {
          id: string;
          referral_code_id: string;
          referrer_user_id: string;
          redeemed_email: string;
          redeemed_user_id: string | null;
          reservation_id: number;
          invitee_discount_amount: number;
          referrer_credit_id: string | null;
          referrer_credit_amount: number;
          status: "awarded" | "revoked";
          created_at: string;
          updated_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          referral_code_id: string;
          referrer_user_id: string;
          redeemed_email: string;
          redeemed_user_id?: string | null;
          reservation_id: number;
          invitee_discount_amount?: number;
          referrer_credit_id?: string | null;
          referrer_credit_amount?: number;
          status?: "awarded" | "revoked";
          created_at?: string;
          updated_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          referral_code_id?: string;
          referrer_user_id?: string;
          redeemed_email?: string;
          redeemed_user_id?: string | null;
          reservation_id?: number;
          invitee_discount_amount?: number;
          referrer_credit_id?: string | null;
          referrer_credit_amount?: number;
          status?: "awarded" | "revoked";
          created_at?: string;
          updated_at?: string;
          revoked_at?: string | null;
        };
      };
      vestido_calendar_events: {
        Row: {
          google_event_id: string;
          title: string;
          description: string | null;
          date: string;
          original_start: string;
          original_end: string;
          is_all_day: boolean;
          synced_at: string | null;
        };
        Insert: {
          google_event_id: string;
          title: string;
          description?: string | null;
          date: string;
          original_start: string;
          original_end: string;
          is_all_day?: boolean;
          synced_at?: string | null;
        };
        Update: {
          google_event_id?: string;
          title?: string;
          description?: string | null;
          date?: string;
          original_start?: string;
          original_end?: string;
          is_all_day?: boolean;
          synced_at?: string | null;
        };
      };
      vestido_calendar_notes: {
        Row: {
          google_event_id: string;
          title_override: string | null;
          description_override: string | null;
          last_edited_at: string | null;
          last_edited_by_user_id: string | null;
        };
        Insert: {
          google_event_id: string;
          title_override?: string | null;
          description_override?: string | null;
          last_edited_at?: string | null;
          last_edited_by_user_id?: string | null;
        };
        Update: {
          google_event_id?: string;
          title_override?: string | null;
          description_override?: string | null;
          last_edited_at?: string | null;
          last_edited_by_user_id?: string | null;
        };
      };
      gallery_images: {
        Row: {
          id: string;
          storage_path: string;
          public_url: string;
          sort_order: number;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          storage_path: string;
          public_url: string;
          sort_order?: number;
          caption?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          storage_path?: string;
          public_url?: string;
          sort_order?: number;
          caption?: string | null;
          created_at?: string;
        };
      };
      site_content: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Json;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
        };
      };
      benefit_transfers: {
        Row: {
          id: string;
          reservation_id: number;
          from_user_id: string | null;
          from_email: string;
          to_email: string;
          to_user_id: string | null;
          claim_token: string | null;
          claim_token_sent_at: string | null;
          status:
            | "pending"
            | "cancelled"
            | "auto_credited"
            | "pending_claim"
            | "claimed"
            | "reverted";
          transferred_points: number;
          revoked_loyalty_point_ids: string[];
          created_at: string;
          materialized_at: string | null;
          claimed_at: string | null;
          cancelled_at: string | null;
          reverted_at: string | null;
        };
        Insert: {
          id?: string;
          reservation_id: number;
          from_user_id?: string | null;
          from_email: string;
          to_email: string;
          to_user_id?: string | null;
          claim_token?: string | null;
          claim_token_sent_at?: string | null;
          status?:
            | "pending"
            | "cancelled"
            | "auto_credited"
            | "pending_claim"
            | "claimed"
            | "reverted";
          transferred_points?: number;
          revoked_loyalty_point_ids?: string[];
          created_at?: string;
          materialized_at?: string | null;
          claimed_at?: string | null;
          cancelled_at?: string | null;
          reverted_at?: string | null;
        };
        Update: {
          id?: string;
          reservation_id?: number;
          from_user_id?: string | null;
          from_email?: string;
          to_email?: string;
          to_user_id?: string | null;
          claim_token?: string | null;
          claim_token_sent_at?: string | null;
          status?:
            | "pending"
            | "cancelled"
            | "auto_credited"
            | "pending_claim"
            | "claimed"
            | "reverted";
          transferred_points?: number;
          revoked_loyalty_point_ids?: string[];
          created_at?: string;
          materialized_at?: string | null;
          claimed_at?: string | null;
          cancelled_at?: string | null;
          reverted_at?: string | null;
        };
      };
      pending_reservations: {
        Row: {
          id: string;
          attempt_id: string;
          payment_id: string | null;
          intent: "reservation" | "reschedule";
          status:
            | "pending_payment"
            | "refund_in_progress"
            | "consumed"
            | "refunded"
            | "failed";
          payload: Json;
          amount_cents: number;
          email: string;
          user_id: string | null;
          consumed_reservation_id: number | null;
          refunded_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          payment_id?: string | null;
          intent: "reservation" | "reschedule";
          status?:
            | "pending_payment"
            | "refund_in_progress"
            | "consumed"
            | "refunded"
            | "failed";
          payload: Json;
          amount_cents: number;
          email: string;
          user_id?: string | null;
          consumed_reservation_id?: number | null;
          refunded_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attempt_id?: string;
          payment_id?: string | null;
          intent?: "reservation" | "reschedule";
          status?:
            | "pending_payment"
            | "refund_in_progress"
            | "consumed"
            | "refunded"
            | "failed";
          payload?: Json;
          amount_cents?: number;
          email?: string;
          user_id?: string | null;
          consumed_reservation_id?: number | null;
          refunded_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cron_job_heartbeats: {
        Row: {
          job_name: string;
          last_success_at: string | null;
          last_stale_alert_sent_at: string | null;
        };
        Insert: {
          job_name: string;
          last_success_at?: string | null;
          last_stale_alert_sent_at?: string | null;
        };
        Update: {
          job_name?: string;
          last_success_at?: string | null;
          last_stale_alert_sent_at?: string | null;
        };
      };
      conekta_webhook_events: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          payment_id: string | null;
          charge_id: string | null;
          raw_payload: Json;
          signature: string | null;
          status: "received" | "processed" | "ignored" | "failed";
          error_message: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          payment_id?: string | null;
          charge_id?: string | null;
          raw_payload: Json;
          signature?: string | null;
          status?: "received" | "processed" | "ignored" | "failed";
          error_message?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          payment_id?: string | null;
          charge_id?: string | null;
          raw_payload?: Json;
          signature?: string | null;
          status?: "received" | "processed" | "ignored" | "failed";
          error_message?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
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
      ensure_user_referral_code: {
        Args: {
          p_user_id: string;
        };
        Returns: string;
      };
      generate_unique_referral_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_slot_available: {
        Args: {
          p_date: string;
          p_start_time: string;
        };
        Returns: boolean;
      };
      reorder_gallery_images: {
        Args: {
          p_ordered_ids: string[];
        };
        Returns: void;
      };
      register_gallery_image: {
        Args: {
          p_storage_path: string;
          p_public_url: string;
        };
        Returns: {
          id: string;
          storage_path: string;
          public_url: string;
          sort_order: number;
          caption: string | null;
          created_at: string;
        };
      };
      reservation_refund_record_failure: {
        Args: {
          p_row_id: string;
          p_message: string;
          p_now: string;
          p_next_retry: string;
          p_max_attempts: number;
        };
        Returns: Json;
      };
    };
  };
}
