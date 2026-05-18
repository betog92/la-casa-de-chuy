-- =====================================================
-- MIGRACIÓN 50: Sistema de referidos V2
-- =====================================================
-- Cambio de modelo: pasamos de "1 fila referrals = 1 invitación a un email"
-- a "1 código permanente por referidor, N usos por amigos diferentes".
--
-- Reglas de negocio:
--   - Cada usuario tiene UN código permanente (`referral_codes`).
--   - El código se genera AUTOMÁTICAMENTE al crear la cuenta (trigger sobre
--     `public.users`, que ya está sincronizada con `auth.users`).
--   - Cualquier persona puede usar el código, pero solo en su PRIMERA reserva.
--   - El invitado obtiene -$100 de descuento en el checkout (lo aplica
--     `pricing-server.ts`).
--   - El referidor obtiene +$200 en `credits` al confirmarse el pago de la
--     reserva del invitado (lo aplica `finalize-reservation.ts`).
--   - Idempotencia: 1 redención máxima por (código, email_invitado) y por
--     (código, reservation_id).
--
-- La tabla `referrals` LEGACY se dropea (sistema arranca desde cero,
-- sin datos heredados que mantener).
-- =====================================================

BEGIN;

-- =====================================================
-- 0. LIMPIEZA: tabla `referrals` legacy (Fase 2 V1)
-- =====================================================
-- Decisión: empezamos el programa de referidos desde cero. La tabla vieja
-- no se lee/escribe desde ningún lado del código nuevo; la dropeamos con
-- CASCADE para llevarnos índices y políticas RLS asociadas.
DROP TABLE IF EXISTS public.referrals CASCADE;

-- =====================================================
-- 1. TABLA: referral_codes (1 por referidor)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE
    REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Formato canónico: CHUY-XXXXXX en uppercase, alfabeto base32 sin
  -- caracteres confundibles. Bloquea inserts manuales mal formados.
  CONSTRAINT chk_referral_code_format
    CHECK (code ~ '^CHUY-[A-HJKLMNPQRSTUVWXYZ23456789]{6}$')
);

COMMENT ON TABLE public.referral_codes IS
  'Código permanente de referido por usuario. Generado automáticamente al crear cuenta.';
COMMENT ON COLUMN public.referral_codes.code IS
  'Código único compartible (uppercase, ej. CHUY-AB12CD). El cliente lo comparte como quiera.';
COMMENT ON COLUMN public.referral_codes.active IS
  'Si false, el código deja de funcionar para nuevos invitados. Soft-disable.';

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id
  ON public.referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code_active
  ON public.referral_codes(code) WHERE active = TRUE;

-- =====================================================
-- 2. TABLA: referral_redemptions (1 fila por amigo invitado que paga)
-- =====================================================
-- El patrón "crear redención ANTES del cobro de Conekta" no aplica aquí:
-- la insertamos DESPUÉS del INSERT exitoso de la reserva pagada, en el
-- mismo flujo de finalize-reservation. Esto evita acreditar al referidor
-- si la reserva nunca llega a confirmarse.
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL
    REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  -- Denormalizado para queries rápidas sin JOIN
  referrer_user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Email del invitado, siempre lowercase. Es la dimensión de unicidad.
  redeemed_email TEXT NOT NULL,
  -- Si el invitado tenía cuenta, lo guardamos (puede ser NULL para guests).
  redeemed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Reserva que disparó la redención (la primera del invitado).
  reservation_id INTEGER NOT NULL
    REFERENCES public.reservations(id) ON DELETE RESTRICT,
  -- Monto descontado al invitado en el checkout.
  invitee_discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 100,
  -- Crédito acreditado al referidor (FK a credits cuando se otorga).
  referrer_credit_id UUID REFERENCES public.credits(id) ON DELETE SET NULL,
  referrer_credit_amount NUMERIC(10, 2) NOT NULL DEFAULT 200,
  status TEXT NOT NULL DEFAULT 'awarded'
    CHECK (status IN ('awarded', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  -- Idempotencia: nunca dos redenciones para el mismo email con el mismo código,
  -- ni dos redenciones para la misma reserva (evita doble acreditación si el
  -- webhook y /reservations/create corren en paralelo).
  CONSTRAINT uq_redemption_code_email
    UNIQUE (referral_code_id, redeemed_email),
  CONSTRAINT uq_redemption_reservation
    UNIQUE (reservation_id)
);

COMMENT ON TABLE public.referral_redemptions IS
  'Un registro por cada amigo que usó el código y pagó. Trigger de acreditación al referidor.';
COMMENT ON COLUMN public.referral_redemptions.redeemed_email IS
  'Email del invitado (lowercase). Una redención máxima por (code, email).';
COMMENT ON COLUMN public.referral_redemptions.status IS
  'awarded = cumplido y crédito otorgado. revoked = se invalidó (caso edge: refund manual completo).';

CREATE INDEX IF NOT EXISTS idx_redemptions_referrer_user_id
  ON public.referral_redemptions(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_redeemed_email
  ON public.referral_redemptions(redeemed_email);
CREATE INDEX IF NOT EXISTS idx_redemptions_reservation_id
  ON public.referral_redemptions(reservation_id);

-- =====================================================
-- 3. FUNCIÓN: generar un código único corto
-- =====================================================
-- Formato: CHUY-{6 chars base32 sin caracteres confundibles}
-- Reintenta hasta 10 veces si hay colisión (≈1 en 10^9 con 6 chars).
CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin 0/O/1/I para legibilidad
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempt INTEGER := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'CHUY-';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(
        v_alphabet,
        1 + floor(random() * length(v_alphabet))::int,
        1
      );
    END LOOP;

    SELECT EXISTS (
      SELECT 1 FROM public.referral_codes WHERE code = v_code
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'No se pudo generar un código de referido único después de 10 intentos';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$fn$;

COMMENT ON FUNCTION public.generate_unique_referral_code IS
  'Devuelve un código de referido único (CHUY-XXXXXX) garantizado contra colisiones.';

-- =====================================================
-- 3b. FUNCIÓN: ensure_user_referral_code(user_id) → TEXT
-- =====================================================
-- Atómica: si el usuario ya tiene código, lo devuelve; si no, genera uno
-- y lo inserta en la misma RPC. Maneja colisiones internamente
-- (unique_violation en `code` o `user_id`) reintentando hasta 10 veces.
--
-- Reemplaza el patrón anterior del endpoint /api/referrals/me que hacía
-- SELECT → RPC generate → INSERT, vulnerable a race entre el SELECT
-- interno de la función generadora y el INSERT del caller.
CREATE OR REPLACE FUNCTION public.ensure_user_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code TEXT;
  v_existing TEXT;
  v_attempt INTEGER := 0;
BEGIN
  -- Fast-path: ya existe.
  SELECT code INTO v_existing
  FROM public.referral_codes
  WHERE user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Slow-path: generar e insertar atómico, con reintentos por race.
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.generate_unique_referral_code();

    BEGIN
      INSERT INTO public.referral_codes (user_id, code)
      VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION
      WHEN unique_violation THEN
        -- Otro proceso creó el código del usuario (collide en user_id) o
        -- alguien tomó nuestro `code` entre el generate y el insert.
        -- Releemos: si ya está, devolvemos. Si no, reintentamos.
        SELECT code INTO v_existing
        FROM public.referral_codes
        WHERE user_id = p_user_id;

        IF v_existing IS NOT NULL THEN
          RETURN v_existing;
        END IF;

        IF v_attempt >= 10 THEN
          RAISE EXCEPTION 'No se pudo asignar código de referido después de 10 intentos';
        END IF;
    END;
  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.ensure_user_referral_code IS
  'Devuelve el código de referido del usuario; lo crea atómicamente si no existe (idempotente, safe contra race).';

-- =====================================================
-- 4. FUNCIÓN + TRIGGER: auto-asignar código al crear usuario
-- =====================================================
-- Se dispara después de INSERT en `public.users` (no en auth.users) porque
-- la app inserta ahí explícitamente al completar el signup, y nos garantiza
-- que `user_id` ya cumple el FK a auth.users.
CREATE OR REPLACE FUNCTION public.assign_referral_code_to_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Delegamos en ensure_user_referral_code (idempotente + atómica). Si el
  -- INSERT en public.users falla más adelante en la transacción, el código
  -- generado se revierte con el rollback (todo corre en la misma tx).
  PERFORM public.ensure_user_referral_code(NEW.id);
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.assign_referral_code_to_new_user IS
  'Trigger AFTER INSERT en public.users: genera referral_code permanente.';

DROP TRIGGER IF EXISTS trg_users_assign_referral_code ON public.users;
CREATE TRIGGER trg_users_assign_referral_code
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_referral_code_to_new_user();

-- =====================================================
-- 5. BACKFILL: códigos para usuarios existentes
-- =====================================================
-- Genera código para todo `public.users` que aún no tenga uno. Idempotente
-- vía ensure_user_referral_code (devuelve el existente o crea nuevo).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT u.id
    FROM public.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.referral_codes rc WHERE rc.user_id = u.id
    )
  LOOP
    PERFORM public.ensure_user_referral_code(r.id);
  END LOOP;
END;
$$;

-- =====================================================
-- 6. trigger updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_referral_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER trg_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_updated_at();

DROP TRIGGER IF EXISTS trg_referral_redemptions_updated_at
  ON public.referral_redemptions;
CREATE TRIGGER trg_referral_redemptions_updated_at
  BEFORE UPDATE ON public.referral_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_updated_at();

-- =====================================================
-- 7. credits.expires_at deja de ser NOT NULL (alineado con loyalty_points
--    migración 33). NULL = "no caduca". Los créditos por referido se
--    insertarán con expires_at = NULL.
-- =====================================================
ALTER TABLE public.credits
  ALTER COLUMN expires_at DROP NOT NULL;

COMMENT ON COLUMN public.credits.expires_at IS
  'Fecha de caducidad del crédito. NULL = nunca caduca (política para créditos por referido y futuras fuentes que no deban caducar).';

-- =====================================================
-- 8. RLS — por defecto OFF (igual que `referrals`, `credits`).
-- =====================================================
-- El acceso desde la app es solo vía service-role (server actions / API
-- routes). Si en el futuro se quiere exponer en cliente, hay que añadir
-- políticas (por ahora bloqueamos cualquier acceso anónimo).
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

-- Sin políticas = nadie tiene acceso desde el cliente; service_role bypasea RLS.

-- Privilegios RPC (patron migraciones 51-52)
REVOKE ALL ON FUNCTION public.assign_referral_code_to_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_user_referral_code(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_unique_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_referral_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_referral_code() TO service_role;

COMMIT;
