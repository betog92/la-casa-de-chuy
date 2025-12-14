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
  id: string;
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
}
