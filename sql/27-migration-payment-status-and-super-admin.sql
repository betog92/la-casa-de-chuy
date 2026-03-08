-- =====================================================
-- MIGRATION: payment_status en reservations + is_super_admin en users
-- =====================================================
-- payment_status: estado de pago para reservas manuales (cliente);
--   'pending' = aún no paga o ya pagó pero super admin no ha validado
--   'paid' = super admin validó / marcó como cobrado
--   'not_applicable' = no aplica (en línea Conekta, bloqueo Alvero, cita Alvero)
-- is_super_admin: solo Nancy puede validar pagos (marcar como pagado).
-- =====================================================

-- 1. payment_status en reservations
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS payment_status TEXT
  CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'not_applicable'));

COMMENT ON COLUMN reservations.payment_status IS 'Estado de pago: pending (pendiente de validar), paid (validado por super admin), not_applicable (Conekta, bloqueo, cita Alvero). NULL = reservas antiguas, tratar como not_applicable.';

-- 2. is_super_admin en users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.is_super_admin IS 'Super administrador (ej. Nancy): puede validar/marcar como pagado reservas manuales. is_admin sigue siendo necesario para acceder al panel.';

-- Opcional: asignar super admin a un email (ejecutar manualmente con el email de Nancy)
-- UPDATE users SET is_super_admin = TRUE WHERE email = 'nancy@ejemplo.com';
