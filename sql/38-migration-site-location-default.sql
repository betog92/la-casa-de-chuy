-- =====================================================
-- MIGRACIÓN 38: contenido de ubicación (site_content.key = location)
-- =====================================================
-- Dirección: José María Arteaga #1111 Oriente, CP 64000, Monterrey, N.L.
-- Reejecutar sobrescribe el JSON completo de `location`.
-- =====================================================

BEGIN;

INSERT INTO site_content (key, value, updated_at)
VALUES (
  'location',
  jsonb_build_object(
    'address',
    'José María Arteaga #1111 Oriente, 64000 Monterrey, Nuevo León, México',
    'mapsEmbedUrl',
    'https://www.google.com/maps?q=Jos%C3%A9%20Mar%C3%ADa%20Arteaga%20%231111%20Oriente%2C%2064000%20Monterrey%2C%20Nuevo%20Le%C3%B3n%2C%20M%C3%A9xico&hl=es&output=embed',
    'directions',
    '',
    'parkingNote',
    ''
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;

COMMIT;
