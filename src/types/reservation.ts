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
}
