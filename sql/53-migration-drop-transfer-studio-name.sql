-- =====================================================
-- MIGRACIÓN 53: quitar to_studio_name de benefit_transfers
-- =====================================================
-- El nombre del estudio ya no se captura al regalar Monedas Chuy;
-- el destinatario se identifica solo por correo (y cuenta al reclamar).

BEGIN;

ALTER TABLE benefit_transfers
  DROP COLUMN IF EXISTS to_studio_name;

COMMIT;
