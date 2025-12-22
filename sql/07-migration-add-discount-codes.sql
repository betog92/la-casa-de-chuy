-- =====================================================
-- MIGRATION: Agregar sistema de códigos de descuento
-- =====================================================
-- Fecha: 2025-01-XX
-- Descripción: Crea tablas para manejar códigos de descuento promocionales
--               y rastrear su uso por usuario
-- =====================================================

-- Tabla de códigos de descuento
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,  -- Ej: "BUENFIN", "NAVIDAD"
  description TEXT,  -- Ej: "Descuento Buen Fin"
  discount_percentage DECIMAL(5, 2) NOT NULL,  -- Ej: 10.00, 15.00
  valid_from DATE NOT NULL,  -- Fecha de inicio
  valid_until DATE NOT NULL,  -- Fecha de expiración
  max_uses INTEGER DEFAULT 100,  -- Límite total de usos
  current_uses INTEGER DEFAULT 0,  -- Usos actuales
  active BOOLEAN DEFAULT TRUE,  -- Si está activo o no
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para rastrear qué usuarios usaron qué códigos
CREATE TABLE IF NOT EXISTS discount_code_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID REFERENCES discount_codes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL si no está logueado
  email TEXT NOT NULL,  -- Email del usuario que usó el código
  reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(discount_code_id, email)  -- Un código solo una vez por email
);

-- Agregar campos en reservations para el código usado
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS discount_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_code_discount DECIMAL(10, 2) DEFAULT 0;

-- Índices para mejor performance
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON discount_codes(active);
CREATE INDEX IF NOT EXISTS idx_discount_code_uses_email ON discount_code_uses(email);
CREATE INDEX IF NOT EXISTS idx_discount_code_uses_code_id ON discount_code_uses(discount_code_id);

-- Comentarios para documentación
COMMENT ON TABLE discount_codes IS 'Códigos de descuento promocionales (Buen Fin, Navidad, etc.)';
COMMENT ON TABLE discount_code_uses IS 'Rastrea qué usuarios han usado qué códigos de descuento';
COMMENT ON COLUMN discount_codes.code IS 'Código único del descuento (ej: BUENFIN)';
COMMENT ON COLUMN discount_codes.discount_percentage IS 'Porcentaje de descuento (ej: 10.00 = 10%)';
COMMENT ON COLUMN discount_codes.max_uses IS 'Límite total de usos del código';
COMMENT ON COLUMN discount_codes.current_uses IS 'Cantidad de veces que se ha usado el código';
COMMENT ON COLUMN reservations.discount_code IS 'Código de descuento aplicado en esta reserva';
COMMENT ON COLUMN reservations.discount_code_discount IS 'Monto del descuento aplicado por el código';



