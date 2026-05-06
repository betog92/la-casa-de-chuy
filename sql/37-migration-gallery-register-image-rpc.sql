-- =====================================================
-- MIGRACIÓN 37: RPC atómico para insertar en gallery_images
-- (sort_order único bajo subidas concurrentes)
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION register_gallery_image(
  p_storage_path TEXT,
  p_public_url TEXT
)
RETURNS gallery_images
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sort int;
  v_row gallery_images%ROWTYPE;
BEGIN
  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'storage_path requerido';
  END IF;
  IF p_public_url IS NULL OR btrim(p_public_url) = '' THEN
    RAISE EXCEPTION 'public_url requerido';
  END IF;

  PERFORM pg_advisory_xact_lock(942001);

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_sort FROM gallery_images;

  INSERT INTO gallery_images (storage_path, public_url, sort_order)
  VALUES (p_storage_path, p_public_url, v_sort)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION register_gallery_image(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_gallery_image(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION register_gallery_image(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION register_gallery_image IS
  'Inserta fila de galería con sort_order siguiente; bloqueo transaccional evita duplicados concurrentes.';

COMMIT;
