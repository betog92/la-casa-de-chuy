/**
 * Datos temporales de reserva usados en el flujo de reserva
 */
export interface ReservationData {
  date: string;
  time: string;
  price: number;
}

/**
 * Reserva completa desde la base de datos
 */
export interface Reservation {
  id: number;
  email: string;
  name: string;
  phone: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  original_price: number;
  payment_id: string | null;
  payment_method?: string | null;
  status: "confirmed" | "cancelled" | "completed";
  created_at: string;
  // Campos de descuentos
  last_minute_discount?: number;
  loyalty_discount?: number;
  loyalty_points_used?: number;
  credits_used?: number;
  referral_discount?: number;
  discount_code?: string | null;
  discount_code_discount?: number;
  // Campos de cancelación y reembolso
  refund_amount?: number | null;
  refund_status?: string | null;
  refund_id?: string | null;
  cancelled_at?: string | null;
  // Campos de reagendamiento
  reschedule_count?: number;
  original_date?: string | null;
  original_start_time?: string | null;
  original_payment_id?: string | null;
  additional_payment_id?: string | null;
  additional_payment_amount?: number | null;
  additional_payment_method?: string | null;
  created_by_user_id?: string | null;
  /** Resuelto por la API cuando hay created_by_user_id (solo para vista admin) */
  created_by?: { id: string; name: string | null; email: string } | null;
  rescheduled_by_user_id?: string | null;
  /** Resuelto por la API cuando hay rescheduled_by_user_id (último reagendador admin) */
  rescheduled_by?: { id: string; name: string | null; email: string } | null;
  cancelled_by_user_id?: string | null;
  source?: string | null;
  google_event_id?: string | null;
  import_type?: string | null;
  order_number?: string | null;
  import_notes?: string | null;
  /** Resuelto por la API cuando hay cancelled_by_user_id (admin que canceló) */
  cancelled_by?: { id: string; name: string | null; email: string } | null;
  /** Historial de todos los reagendamientos (orden cronológico) */
  reschedule_history?: RescheduleHistoryEntry[];
}

export interface RescheduleHistoryEntry {
  rescheduled_at: string;
  rescheduled_by: { id: string; name: string | null; email: string } | null;
  previous_date: string;
  previous_start_time: string;
  new_date: string;
  new_start_time: string;
  additional_payment_amount: number | null;
  additional_payment_method: string | null;
}
