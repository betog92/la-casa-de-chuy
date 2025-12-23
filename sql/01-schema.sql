-- =====================================================
-- ESQUEMA COMPLETO - LA CASA DE CHUY EL RICO
-- =====================================================
-- Ejecuta este SQL en el SQL Editor de Supabase
-- Ve a: SQL Editor > New Query > Pega este código > Run
--
-- Este archivo contiene:
-- 1. Todas las tablas del sistema
-- 2. Índices básicos para performance
-- 3. Triggers para updated_at automático
-- =====================================================

-- =====================================================
-- 1. TABLA DE USUARIOS
-- =====================================================
-- Esta tabla se sincroniza automáticamente con auth.users
-- El id es el mismo que auth.users.id (no se genera aleatoriamente)
-- Se usa para almacenar datos adicionales del usuario (name, phone)
-- y para mantener foreign keys desde otras tablas
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. TABLA DE DISPONIBILIDAD
-- =====================================================
CREATE TABLE IF NOT EXISTS availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  is_holiday BOOLEAN DEFAULT FALSE,
  custom_price DECIMAL(10, 2),  -- Precio personalizado para la fecha
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 3. TABLA DE TIME SLOTS (HORARIOS)
-- =====================================================
CREATE TABLE IF NOT EXISTS time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  available BOOLEAN DEFAULT TRUE,
  is_occupied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, start_time)
);

-- =====================================================
-- 4. TABLA DE RESERVACIONES
-- =====================================================
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  -- Campos específicos de descuentos (agregados en migration 06)
  last_minute_discount DECIMAL(10, 2) DEFAULT 0,
  loyalty_discount DECIMAL(10, 2) DEFAULT 0,
  loyalty_points_used INTEGER DEFAULT 0,
  credits_used DECIMAL(10, 2) DEFAULT 0,
  referral_discount DECIMAL(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  payment_id TEXT,
  refund_amount DECIMAL(10, 2),  -- Monto del reembolso (80% del price)
  refund_status TEXT CHECK (refund_status IN ('pending', 'processed', 'failed')),  -- Estado del reembolso
  refund_id TEXT,  -- ID del reembolso en Conekta
  cancelled_at TIMESTAMP WITH TIME ZONE,  -- Fecha/hora de cancelación
  cancellation_reason TEXT,  -- Razón de cancelación (opcional)
  reschedule_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 5. TABLA DE CRÉDITOS (FASE 2)
-- =====================================================
CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  source TEXT NOT NULL, -- 'referral', 'cancellation', etc.
  expires_at DATE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 6. TABLA DE PUNTOS DE FIDELIZACIÓN (FASE 2)
-- =====================================================
CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  expires_at DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 7. TABLA DE REFERIDOS (FASE 2)
-- =====================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_email TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  link TEXT UNIQUE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  credit_given BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES BÁSICOS PARA MEJORAR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_time_slots_date ON time_slots(date);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user_id ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);

-- =====================================================
-- ÍNDICES COMPUESTOS PARA CONSULTAS AVANZADAS
-- =====================================================

-- Índice para consultar reservas por fecha y estado
CREATE INDEX IF NOT EXISTS idx_reservations_date_status 
ON reservations(date, status) 
WHERE status = 'confirmed';

-- Índice para consultar time_slots por fecha y disponibilidad
CREATE INDEX IF NOT EXISTS idx_time_slots_date_available 
ON time_slots(date, available) 
WHERE available = true;

-- Índice compuesto para consultar reservas por fecha, hora y estado
CREATE INDEX IF NOT EXISTS idx_reservations_date_time_status 
ON reservations(date, start_time, status) 
WHERE status = 'confirmed';

-- Índice compuesto para optimizar consultas de slots disponibles por fecha y hora
-- Útil especialmente cuando se consulta la fecha actual y se filtra por hora
CREATE INDEX IF NOT EXISTS idx_time_slots_date_start_time 
ON time_slots(date, start_time) 
WHERE available = TRUE AND is_occupied = FALSE;

-- =====================================================
-- FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION update_updated_at_column() SET search_path = public;

-- =====================================================
-- TRIGGERS PARA updated_at
-- =====================================================
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reservations_updated_at ON reservations;
CREATE TRIGGER update_reservations_updated_at 
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_availability_updated_at ON availability;
CREATE TRIGGER update_availability_updated_at 
  BEFORE UPDATE ON availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_time_slots_updated_at ON time_slots;
CREATE TRIGGER update_time_slots_updated_at 
  BEFORE UPDATE ON time_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCIÓN PARA ACTUALIZAR IS_OCCUPIED AUTOMÁTICAMENTE
-- =====================================================
-- Eliminar trigger y función antiguos si existen (para migraciones desde versiones anteriores)
-- IMPORTANTE: Eliminar primero el trigger que depende de la función
DROP TRIGGER IF EXISTS update_time_slot_count_on_reservation ON reservations;
DROP FUNCTION IF EXISTS update_time_slot_reservations_count();

CREATE OR REPLACE FUNCTION update_time_slot_occupied()
RETURNS TRIGGER AS $$
DECLARE
  old_date DATE;
  old_start_time TIME;
  old_status TEXT;
  new_date DATE;
  new_start_time TIME;
  new_status TEXT;
BEGIN
  -- Determinar valores según la operación
  IF TG_OP = 'INSERT' THEN
    -- NUEVA RESERVA: Si es confirmada, marcar el slot como ocupado
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_status := NEW.status;
    
    IF new_status = 'confirmed' THEN
      -- Actualizar solo el slot exacto de la reserva
      UPDATE time_slots
      SET is_occupied = TRUE,
          updated_at = NOW()
      WHERE date = new_date
        AND start_time = new_start_time;
    END IF;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- ACTUALIZACIÓN: Manejar cambios de fecha, hora o status
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_status := OLD.status;
    
    new_date := NEW.date;
    new_start_time := NEW.start_time;
    new_status := NEW.status;
    
    -- Si cambió la fecha o la hora (re-agendamiento)
    IF old_date != new_date OR old_start_time != new_start_time THEN
      -- Desocupar el slot en la fecha/hora antigua (si estaba confirmada)
      IF old_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = FALSE,
            updated_at = NOW()
        WHERE date = old_date
          AND start_time = old_start_time;
      END IF;
      
      -- Ocupar el slot en la fecha/hora nueva (si está confirmada)
      IF new_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = TRUE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
    END IF;
    
    -- Si solo cambió el status (misma fecha y hora)
    IF old_date = new_date AND old_start_time = new_start_time THEN
      -- Si cambió de NO confirmada a confirmada: ocupar
      -- Esto cubre: 'pending'→'confirmed', 'cancelled'→'confirmed', 'completed'→'confirmed', etc.
      IF old_status != 'confirmed' AND new_status = 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = TRUE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
      
      -- Si cambió de confirmada a NO confirmada: desocupar
      -- Esto cubre: 'confirmed'→'cancelled', 'confirmed'→'completed', 'confirmed'→'pending', etc.
      IF old_status = 'confirmed' AND new_status != 'confirmed' THEN
        UPDATE time_slots
        SET is_occupied = FALSE,
            updated_at = NOW()
        WHERE date = new_date
          AND start_time = new_start_time;
      END IF;
    END IF;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- ELIMINACIÓN: Si se elimina una reserva confirmada, desocupar el slot
    old_date := OLD.date;
    old_start_time := OLD.start_time;
    old_status := OLD.status;
    
    IF old_status = 'confirmed' THEN
      UPDATE time_slots
      SET is_occupied = FALSE,
          updated_at = NOW()
      WHERE date = old_date
        AND start_time = old_start_time;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Configurar search_path para seguridad
ALTER FUNCTION update_time_slot_occupied() SET search_path = public;

-- =====================================================
-- TRIGGER PARA ACTUALIZAR IS_OCCUPIED AUTOMÁTICAMENTE
-- =====================================================
-- Eliminar trigger nuevo si existe (para migraciones desde versiones anteriores)
-- Nota: El trigger antiguo ya fue eliminado en la sección de funciones arriba
DROP TRIGGER IF EXISTS update_time_slot_occupied_on_reservation ON reservations;

CREATE TRIGGER update_time_slot_occupied_on_reservation
AFTER INSERT OR UPDATE OR DELETE ON reservations
FOR EACH ROW EXECUTE FUNCTION update_time_slot_occupied();

-- =====================================================
-- COMENTARIOS EN TABLAS
-- =====================================================
COMMENT ON TABLE users IS 'Usuarios del sistema (con cuenta o invitados)';
COMMENT ON TABLE reservations IS 'Reservaciones realizadas';
COMMENT ON TABLE availability IS 'Configuración de disponibilidad por fecha';
COMMENT ON TABLE time_slots IS 'Horarios disponibles por fecha';
COMMENT ON TABLE credits IS 'Créditos disponibles para usuarios (Fase 2)';
COMMENT ON TABLE loyalty_points IS 'Puntos de fidelización (Fase 2)';
COMMENT ON TABLE referrals IS 'Sistema de referidos (Fase 2)';

