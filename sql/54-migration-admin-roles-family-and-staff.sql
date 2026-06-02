-- =====================================================
-- ROLES DE PANEL ADMIN
-- =====================================================
-- is_super_admin = TRUE  → Familia (Nancy, Beto, Julio)
-- is_admin = TRUE        → Acceso al panel (empleadas o familia)
--
-- FAMILIA (is_admin + is_super_admin):
--   Dashboard, ingresos, reembolsos, clientes, códigos, galería,
--   validar pagos manuales, listado /admin/reembolsos.
--
-- EMPLEADAS (is_admin, sin super):
--   Calendario (vestidos: crear/editar/borrar/notas),
--   reservaciones (todas variantes + vestidos, con precio),
--   disponibilidad (cerrar días, horarios, precios),
--   cancelar/reagendar cualquier cita (reembolso auto Conekta),
--   reintentar reembolso en detalle de reserva cancelada;
--   ver montos e IDs de pago; NO validar cobros manuales.
--
-- Requisito: cuenta en la app (auth.users + public.users).
-- =====================================================

-- Familia:
-- UPDATE users SET is_admin = TRUE, is_super_admin = TRUE
-- WHERE email IN ('nancy@...', 'betog92@...', 'julio@...');

-- Empleadas:
-- UPDATE users SET is_admin = TRUE, is_super_admin = FALSE
-- WHERE email IN ('yaretzi@...', 'alejandra@...');

COMMENT ON COLUMN users.is_super_admin IS
  'Familia: panel completo, finanzas, validar pagos. Requiere is_admin.';

COMMENT ON COLUMN users.is_admin IS
  'Panel operativo. Sin super: empleadas (calendario, reservas, disponibilidad).';
