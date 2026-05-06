-- =====================================================
-- MIGRACIÓN 35: galería (Supabase Storage + metadata) y contenido del sitio
-- =====================================================
-- Bucket `gallery`: imágenes públicas; subida solo vía API admin (service role).
-- Tabla gallery_images: orden, URL pública, caption opcional.
-- Tabla site_content: clave/valor JSON (p. ej. key=location para /ubicacion).
-- =====================================================

BEGIN;

-- ------------------------------------------------------------
-- Contenido editable (ubicación, textos futuros)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE site_content IS
  'Contenido editable del sitio (JSON por clave). Ej.: location = dirección, iframe Maps, notas.';

-- ------------------------------------------------------------
-- Galería: metadata de fotos en Storage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_sort
  ON gallery_images(sort_order ASC, created_at ASC);

COMMENT ON TABLE gallery_images IS
  'Fotos de la galería pública; archivos en Storage bucket gallery.';

-- ------------------------------------------------------------
-- RLS: lectura pública de metadatos; escrituras solo service role
-- ------------------------------------------------------------
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read site_content" ON site_content;
CREATE POLICY "Public read site_content"
  ON site_content FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public read gallery_images" ON gallery_images;
CREATE POLICY "Public read gallery_images"
  ON gallery_images FOR SELECT
  USING (true);

-- ------------------------------------------------------------
-- Storage: bucket público para lectura de objetos
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery',
  'gallery',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "gallery_public_read_objects" ON storage.objects;
CREATE POLICY "gallery_public_read_objects"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'gallery');

COMMIT;
