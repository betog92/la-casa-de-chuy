export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          phone: string | null
          password_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name?: string | null
          phone?: string | null
          password_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          phone?: string | null
          password_hash?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          user_id: string | null
          email: string
          name: string
          phone: string
          date: string
          start_time: string
          end_time: string
          blocks: number
          price: number
          original_price: number
          discount_amount: number | null
          discount_type: string | null
          status: 'confirmed' | 'cancelled' | 'completed'
          payment_id: string | null
          reschedule_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          email: string
          name: string
          phone: string
          date: string
          start_time: string
          end_time: string
          blocks: number
          price: number
          original_price: number
          discount_amount?: number | null
          discount_type?: string | null
          status?: 'confirmed' | 'cancelled' | 'completed'
          payment_id?: string | null
          reschedule_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          email?: string
          name?: string
          phone?: string
          date?: string
          start_time?: string
          end_time?: string
          blocks?: number
          price?: number
          original_price?: number
          discount_amount?: number | null
          discount_type?: string | null
          status?: 'confirmed' | 'cancelled' | 'completed'
          payment_id?: string | null
          reschedule_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      availability: {
        Row: {
          id: string
          date: string
          is_closed: boolean
          is_holiday: boolean
          custom_price_1_block: number | null
          custom_price_2_blocks: number | null
          max_capacity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          is_closed?: boolean
          is_holiday?: boolean
          custom_price_1_block?: number | null
          custom_price_2_blocks?: number | null
          max_capacity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          is_closed?: boolean
          is_holiday?: boolean
          custom_price_1_block?: number | null
          custom_price_2_blocks?: number | null
          max_capacity?: number
          created_at?: string
          updated_at?: string
        }
      }
      time_slots: {
        Row: {
          id: string
          date: string
          start_time: string
          end_time: string
          available: boolean
          reservations_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          start_time: string
          end_time: string
          available?: boolean
          reservations_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          start_time?: string
          end_time?: string
          available?: boolean
          reservations_count?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

