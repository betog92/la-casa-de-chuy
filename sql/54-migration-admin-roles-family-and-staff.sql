-- =====================================================
-- ROLES DE PANEL ADMIN
-- =====================================================
-- is_super_admin = TRUE  → Familia (Nancy, Beto, Julio, Carolina)
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
-- Ejecutar DESPUÉS de que cada persona haya iniciado sesión al menos una vez.
-- =====================================================

COMMENT ON COLUMN users.is_super_admin IS
  'Familia: panel completo, finanzas, validar pagos. Requiere is_admin.';

COMMENT ON COLUMN users.is_admin IS
  'Panel operativo. Sin super: empleadas (calendario, reservas, disponibilidad).';

-- Familia (panel completo: requiere AMBOS flags en TRUE)
UPDATE users
SET is_admin = TRUE, is_super_admin = TRUE
WHERE email IN (
  'nancy.caja89@gmail.com',
  'alberto.ivan92@gmail.com',
  'julioxs1995@gmail.com',
  'carolinag8910@gmail.com'
);

-- Empleadas (operación; sin validar cobros ni finanzas)
UPDATE users
SET is_admin = TRUE, is_super_admin = FALSE
WHERE email IN (
  'yaretzidealvero@gmail.com',
  'aledealvero@gmail.com'
);

-- Verificación (debe mostrar 4 familia + 2 empleadas)
-- SELECT email, name, is_admin, is_super_admin
-- FROM users
-- WHERE is_admin = TRUE
-- ORDER BY is_super_admin DESC, email;
