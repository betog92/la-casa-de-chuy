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
  is_admin BOOLEAN DEFAULT FALSE,
  is_super_admin BOOLEAN DEFAULT FALSE,
  -- Roles de fotógrafo/estudio (migración 30): habilita la vista
  -- "Fotógrafos" en /admin/clientes y la lógica de transferencia
  -- de Monedas Chuy.
  is_photographer BOOLEAN NOT NULL DEFAULT FALSE,
  studio_name TEXT,
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
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- Admin que creó la reserva (solo manuales)
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
  payment_method TEXT,  -- 'conekta' (en línea), 'efectivo', 'transferencia' (reservas manuales)
  refund_amount DECIMAL(10, 2),  -- Monto del reembolso (80% del price)
  refund_status TEXT CHECK (refund_status IN ('pending', 'processed', 'failed')),  -- Estado del reembolso
  refund_id TEXT,  -- ID del reembolso en Conekta
  cancelled_at TIMESTAMP WITH TIME ZONE,  -- Fecha/hora de cancelación
  cancellation_reason TEXT,  -- Razón de cancelación (opcional)
  reschedule_count INTEGER DEFAULT 0,
  -- Campos de información original para reservas reagendadas (agregados en migration 10)
  original_date DATE,  -- Fecha original de la reserva antes del reagendamiento
  original_start_time TIME,  -- Horario original de la reserva antes del reagendamiento
  original_payment_id TEXT,  -- ID del pago original de la reserva antes del reagendamiento
  additional_payment_id TEXT,  -- ID del pago adicional realizado para el reagendamiento (si aplica)
  additional_payment_amount DECIMAL(10, 2),  -- Monto del pago adicional realizado para el reagendamiento (si aplica)
  additional_payment_method TEXT,  -- conekta | efectivo | transferencia | pendiente (reportes)
  rescheduled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- Admin que reagendó (si aplica)
  cancelled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- Admin que canceló (si aplica)
  -- Campos de importación y reservas manuales admin
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'google_import', 'admin')),
  -- Estado de pago en reservas manuales (La casa de chuy): pending | paid | not_applicable
  payment_status TEXT CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'not_applicable')),
  payment_validated_at TIMESTAMP WITH TIME ZONE,
  payment_validated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  google_event_id TEXT,  -- Número de orden Appointly (#6521) o ID de Google Calendar; garantiza idempotencia
  import_type TEXT,      -- 'appointly' | 'manual_client' | 'manual_available' (solo cuando source='google_import')
  order_number TEXT,     -- número de orden/folio (ej. 3972) en citas Alberto
  import_notes TEXT,     -- notas tras el teléfono (vestido, sesión, ampliaciones, etc.)
  import_notes_edited_at TIMESTAMP WITH TIME ZONE,
  import_notes_edited_by_user_id UUID REFERENCES users(id),
  session_type TEXT CHECK (session_type IS NULL OR session_type IN ('xv_anos', 'boda', 'casual')),
  photographer_studio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 4b. HISTORIAL DE REAGENDAMIENTOS (migration 15)
-- =====================================================
CREATE TABLE IF NOT EXISTS reservation_reschedule_history (
  id SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  rescheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rescheduled_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_date DATE NOT NULL,
  previous_start_time TIME NOT NULL,
  new_date DATE NOT NULL,
  new_start_time TIME NOT NULL,
  additional_payment_amount DECIMAL(10, 2),
  additional_payment_method TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservation_reschedule_history_reservation_id
  ON reservation_reschedule_history(reservation_id);

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
  -- Asociación a reserva y revocación (migración 08): permite revocar
  -- créditos al cancelar la reserva que los originó.
  reservation_id INTEGER REFERENCES reservations(id),
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 6. TABLA DE PUNTOS DE FIDELIZACIÓN ("Monedas Chuy" en la UI)
-- =====================================================
-- En base de datos sigue llamándose loyalty_points / points.
-- En la UI se llama "Monedas Chuy" (1 Moneda = $1 MXN).
-- expires_at NULL = "no caduca nunca" (política vigente desde abril 2026,
-- migración 33). Antes caducaban a 1 año.
CREATE TABLE IF NOT EXISTS loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  expires_at DATE,
  -- Asociación a reserva y revocación (migración 08)
  reservation_id INTEGER REFERENCES reservations(id),
  used BOOLEAN DEFAULT FALSE,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
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
-- 8. TABLA DE TRANSFERENCIAS DE BENEFICIOS (Monedas Chuy → fotógrafo)
-- =====================================================
-- Migraciones 31–34 (resumen). Solo Monedas Chuy son transferibles
-- (los créditos quedan SIEMPRE con el cliente). Al crear pending se
-- revocan las filas de loyalty_points y se guardan sus IDs en
-- revoked_loyalty_point_ids; la transferencia se materializa después
-- de que pasa la fecha de la sesión (cron) para evitar conflictos.
--
-- Estados:
--   pending        – creada por el cliente, fecha de sesión aún no pasa
--   cancelled      – el cliente la canceló antes de materializar
--   auto_credited  – materializada y acreditada (el fotógrafo ya tenía cuenta)
--   pending_claim  – materializada con magic link enviado (sin cuenta)
--   claimed        – el fotógrafo reclamó el magic link
--   reverted       – la reserva se canceló o las Monedas caducaron sin reclamo
CREATE TABLE IF NOT EXISTS benefit_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,

  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_email TEXT NOT NULL,

  to_email TEXT NOT NULL,                                       -- normalizado a lowercase por la app
  to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- se llena al materializar
  to_studio_name TEXT,                                          -- opcional, lo escribe el cliente

  -- Magic link de reclamo (solo si el fotógrafo no tenía cuenta al materializar)
  claim_token UUID UNIQUE,
  claim_token_sent_at TIMESTAMP WITH TIME ZONE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'cancelled',
      'auto_credited',
      'pending_claim',
      'claimed',
      'reverted'
    )),

  -- Snapshot de puntos al crear pending (earmark); se conserva al materializar
  transferred_points INTEGER DEFAULT 0,

  -- IDs de loyalty_points revocadas al crear el pending (restaurar en DELETE transfer)
  revoked_loyalty_point_ids UUID[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  materialized_at TIMESTAMP WITH TIME ZONE,
  claimed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  reverted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_benefit_transfers_reservation_id
  ON benefit_transfers(reservation_id);
CREATE INDEX IF NOT EXISTS idx_benefit_transfers_from_user_id
  ON benefit_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_benefit_transfers_to_user_id
  ON benefit_transfers(to_user_id) WHERE to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_benefit_transfers_to_email
  ON benefit_transfers(to_email);
CREATE INDEX IF NOT EXISTS idx_benefit_transfers_status
  ON benefit_transfers(status);

-- Garantiza una sola transferencia 'pending' por reserva
-- (evita duplicados si el cliente la envía dos veces).
CREATE UNIQUE INDEX IF NOT EXISTS idx_benefit_transfers_unique_pending
  ON benefit_transfers(reservation_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_benefit_transfers_claim_token
  ON benefit_transfers(claim_token) WHERE claim_token IS NOT NULL;

COMMENT ON TABLE benefit_transfers IS
  'Transferencias de Monedas Chuy (loyalty_points) del cliente al fotógrafo. Solo puntos: los créditos se quedan con el cliente. Se materializa al pasar la fecha de la sesión.';
COMMENT ON COLUMN benefit_transfers.status IS
  'pending | cancelled | auto_credited | pending_claim | claimed | reverted';
COMMENT ON COLUMN benefit_transfers.claim_token IS
  'UUID público usado en el magic link /fotografos/reclamar/[token]. NULL si se acreditó automáticamente.';
COMMENT ON COLUMN benefit_transfers.revoked_loyalty_point_ids IS
  'IDs de loyalty_points revocadas al crear el pending. Se restauran al cancelar la transferencia (DELETE).';

-- =====================================================
-- CALENDARIO DE RENTA DE VESTIDOS (copia desde Google)
-- =====================================================
CREATE TABLE IF NOT EXISTS vestido_calendar_events (
  google_event_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  original_start TEXT NOT NULL,
  original_end TEXT NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE vestido_calendar_events IS 'Copia de eventos del calendario de renta de vestidos (Google). Sincronizada por scripts/sync-vestidos-calendar.mjs.';

-- =====================================================
-- NOTAS DEL CALENDARIO DE RENTA DE VESTIDOS (títulos editados en la app)
-- =====================================================
CREATE TABLE IF NOT EXISTS vestido_calendar_notes (
  google_event_id TEXT PRIMARY KEY REFERENCES vestido_calendar_events (google_event_id) ON DELETE CASCADE,
  title_override TEXT,
  description_override TEXT,
  last_edited_at TIMESTAMP WITH TIME ZONE,
  last_edited_by_user_id UUID REFERENCES users(id)
);
COMMENT ON TABLE vestido_calendar_notes IS 'Título y descripción editados por evento del calendario de vestidos. Solo en esta app; no modifica Google Calendar.';

-- =====================================================
-- ÍNDICES BÁSICOS PARA MEJORAR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_is_photographer ON users(is_photographer) WHERE is_photographer = TRUE;
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_time_slots_date ON time_slots(date);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credits_reservation_id ON credits(reservation_id, revoked, used);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user_id ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_reservation_id ON loyalty_points(reservation_id, revoked, used);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_vestido_calendar_events_date ON vestido_calendar_events(date);

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

-- Índice único parcial para google_event_id (evita importar el mismo evento dos veces)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_google_event_id
  ON reservations (google_event_id)
  WHERE google_event_id IS NOT NULL;

-- Índice para filtrar rápidamente por source (importadas vs reales)
CREATE INDEX IF NOT EXISTS idx_reservations_source
  ON reservations (source)
  WHERE source = 'google_import';

-- Índice para filtro "Pago pendiente" en listado admin
CREATE INDEX IF NOT EXISTS idx_reservations_payment_status_pending
  ON reservations (payment_status)
  WHERE payment_status = 'pending';

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
-- Nota: benefit_transfers no usa trigger de updated_at; tiene timestamps
-- específicos por estado (materialized_at, claimed_at, cancelled_at, etc.).

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
-- SECUENCIA PARA IDs DE CITAS IMPORTADAS
-- =====================================================
-- Las citas importadas de la web anterior usan IDs desde 10001,
-- separándolas de las reservas reales (1-9999).
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS reservations_google_import_id_seq
  START WITH 10001
  INCREMENT BY 1
  MINVALUE 10001
  NO MAXVALUE;

-- Función RPC para obtener el siguiente ID de importación
CREATE OR REPLACE FUNCTION next_google_import_id() RETURNS INTEGER AS $$
  SELECT nextval('reservations_google_import_id_seq')::INTEGER;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Función RPC para resetear la secuencia (usada al reimportar desde cero)
CREATE OR REPLACE FUNCTION reset_google_import_seq() RETURNS VOID AS $$
BEGIN
  ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMENTARIOS EN TABLAS
-- =====================================================
COMMENT ON TABLE users IS 'Usuarios del sistema (con cuenta o invitados)';
COMMENT ON TABLE reservations IS 'Reservaciones realizadas';
COMMENT ON TABLE availability IS 'Configuración de disponibilidad por fecha';
COMMENT ON TABLE time_slots IS 'Horarios disponibles por fecha';
COMMENT ON TABLE credits IS 'Créditos disponibles para usuarios (Fase 2). NO son transferibles a fotógrafos.';
COMMENT ON TABLE loyalty_points IS 'Puntos de fidelización ("Monedas Chuy" en la UI). 1 punto = $1 MXN. No caducan (expires_at NULL).';
COMMENT ON TABLE referrals IS 'Sistema de referidos (Fase 2)';

