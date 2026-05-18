-- =====================================================
-- MIGRACIÓN 36: RPC atómico para reordenar gallery_images
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION reorder_gallery_images(p_ordered_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  expected int;
  distinct_n int;
BEGIN
  IF p_ordered_ids IS NULL THEN
    RAISE EXCEPTION 'p_ordered_ids requerido';
  END IF;

  n := cardinality(p_ordered_ids);
  SELECT COUNT(*)::int INTO expected FROM gallery_images;

  IF n != expected THEN
    RAISE EXCEPTION 'El número de IDs no coincide con la galería';
  END IF;

  IF n = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT x)::int INTO distinct_n FROM unnest(p_ordered_ids) AS t(x);
  IF distinct_n != n THEN
    RAISE EXCEPTION 'IDs duplicados';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_ordered_ids) AS t(x)
    WHERE NOT EXISTS (SELECT 1 FROM gallery_images g WHERE g.id = x)
  ) THEN
    RAISE EXCEPTION 'ID desconocido';
  END IF;

  UPDATE gallery_images AS g
  SET sort_order = sub.ord_zero
  FROM (
    SELECT id, ordinality - 1 AS ord_zero
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS u(id, ordinality)
  ) AS sub
  WHERE g.id = sub.id;
END;
$$;

REVOKE ALL ON FUNCTION reorder_gallery_images(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reorder_gallery_images(UUID[]) TO service_role;

COMMENT ON FUNCTION reorder_gallery_images IS
  'Reordena gallery_images en una transacción; p_ordered_ids es permutación completa de IDs.';

COMMIT;
