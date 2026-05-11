import axios, { AxiosError } from "axios";
import { createPublicKey, createVerify } from "node:crypto";

/**
 * Cliente HTTP server-side para la API de Conekta.
 *
 * Centraliza autenticación, headers, idempotencia y manejo de errores.
 * NUNCA importar este módulo desde código que se ejecute en el navegador:
 * usa la `CONEKTA_PRIVATE_KEY`.
 */

const CONEKTA_API_URL = "https://api.conekta.io";
const CONEKTA_API_VERSION = "application/vnd.conekta-v2.0.0+json";
/**
 * Timeout para llamadas a Conekta. Las requests son síncronas dentro de
 * lambdas/handlers de Next.js, así que un timeout previene que un Conekta
 * lento agote el límite de la función o deje al cliente esperando para
 * siempre. 30s es generoso para APIs de pagos que normalmente responden
 * en <2s pero pueden subir bajo carga.
 */
const CONEKTA_TIMEOUT_MS = 30_000;

function getAuthHeader(): string {
  const key = process.env.CONEKTA_PRIVATE_KEY;
  if (!key) {
    throw new Error("CONEKTA_PRIVATE_KEY no está configurado en el servidor");
  }
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

function buildHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
    "Content-Type": "application/json",
    Accept: CONEKTA_API_VERSION,
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return headers;
}

function buildRequestConfig(idempotencyKey?: string) {
  return {
    headers: buildHeaders(idempotencyKey),
    timeout: CONEKTA_TIMEOUT_MS,
  };
}

// =====================================================
// Tipos públicos (lo mínimo necesario)
// =====================================================

export interface ConektaCharge {
  id: string;
  status: string; // 'paid' | 'pre_authorized' | 'declined' | 'refunded' | 'canceled' | 'fraudulent' | ...
  amount: number; // en centavos
  currency: string;
  failure_message?: string | null;
  failure_code?: string | null;
  payment_method?: { type?: string; brand?: string };
  /** Presente en respuestas de reembolso; `amount` del refund suele ser negativo (centavos). */
  refunds?: { data?: Array<{ id?: string; amount?: number; object?: string }> };
}

export interface ConektaOrder {
  id: string;
  amount: number; // en centavos
  currency: string;
  payment_status: string; // 'paid' | 'pending_payment' | 'declined' | 'expired' | ...
  livemode?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  customer_info?: { name?: string; email?: string; phone?: string };
  charges?: { data?: ConektaCharge[] };
}

export interface CreateOrderInput {
  amountMxn: number;
  description: string;
  customer: { name: string; email: string; phone: string };
  conektaToken: string;
  metadata?: Record<string, string | number | boolean | null>;
  /** Identificador único para reintentos seguros (recomendado). */
  idempotencyKey?: string;
  currency?: string;
}

// =====================================================
// Operaciones
// =====================================================

/**
 * Conekta limita longitudes en varios campos. Si alguno falla, devuelve 422
 * con un mensaje genérico que confunde al usuario. Truncamos / validamos
 * defensivamente para no llegar al 422.
 */
const MAX_LINE_ITEM_NAME = 250;
const MAX_METADATA_KEY = 50;
const MAX_METADATA_VALUE = 500;
const MAX_METADATA_ENTRIES = 100;

/** Recorta metadata para respetar los límites de Conekta. */
function sanitizeMetadata(
  metadata: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata).slice(0, MAX_METADATA_ENTRIES);
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of entries) {
    const key = k.length > MAX_METADATA_KEY ? k.slice(0, MAX_METADATA_KEY) : k;
    if (typeof v === "string" && v.length > MAX_METADATA_VALUE) {
      out[key] = v.slice(0, MAX_METADATA_VALUE);
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Crea una orden con cargo a tarjeta y devuelve el objeto de Conekta. */
export async function createConektaOrder(
  input: CreateOrderInput,
): Promise<ConektaOrder> {
  // Validación defensiva: evitar llamar a Conekta con payloads obviamente
  // inválidos. Conekta responde 422 con mensajes oscuros si llegan así.
  const amountCents = Math.round(Number(input.amountMxn) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error(
      `createConektaOrder: amountMxn inválido (${input.amountMxn})`,
    );
  }
  const customerName = (input.customer?.name || "").trim();
  const customerEmail = (input.customer?.email || "").trim();
  if (!customerName) {
    throw new Error("createConektaOrder: customer.name vacío");
  }
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw new Error("createConektaOrder: customer.email inválido");
  }
  if (!input.conektaToken) {
    throw new Error("createConektaOrder: conektaToken vacío");
  }

  const cleanPhone = (input.customer.phone || "").replace(/\s|-|\(|\)/g, "");
  const description = String(input.description || "Reserva").slice(
    0,
    MAX_LINE_ITEM_NAME,
  );
  const orderData = {
    currency: input.currency || "MXN",
    customer_info: {
      name: customerName,
      email: customerEmail,
      phone: cleanPhone,
    },
    line_items: [
      {
        name: description,
        unit_price: amountCents,
        quantity: 1,
      },
    ],
    charges: [
      {
        payment_method: {
          type: "card",
          token_id: input.conektaToken,
        },
      },
    ],
    metadata: sanitizeMetadata(input.metadata),
  };

  const res = await axios.post<ConektaOrder>(
    `${CONEKTA_API_URL}/orders`,
    orderData,
    buildRequestConfig(input.idempotencyKey),
  );
  return res.data;
}

/** Consulta una orden por ID. Lanza si Conekta falla. */
export async function getConektaOrder(orderId: string): Promise<ConektaOrder> {
  const res = await axios.get<ConektaOrder>(
    `${CONEKTA_API_URL}/orders/${encodeURIComponent(orderId)}`,
    buildRequestConfig(),
  );
  return res.data;
}

export interface RefundResult {
  /** Id del objeto `refund` en Conekta (`ref_...` o hex sin prefijo, según versión). */
  id: string;
  /** Monto reembolsado en centavos (positivo). */
  amount: number;
  /** `payment_status` de la orden tras el reembolso (p. ej. `partially_refunded`). */
  status: string;
}

/**
 * Último `refund.id` asociado al cargo indicado en la orden devuelta por
 * `POST /orders/{id}/refunds` (Conekta agrega el refund al final de la lista).
 */
function extractRefundIdFromOrderRefundResponse(
  order: ConektaOrder,
  chargeId: string,
): string | null {
  const charges = order.charges?.data ?? [];
  const ch = charges.find((c) => c.id === chargeId);
  const rows = ch?.refunds?.data ?? [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const id = rows[i]?.id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

export type RefundConektaOrderChargeInput = {
  /** Id de la orden Conekta (`ord_...`), igual que `payment_id` en BD. */
  orderId: string;
  /** Id del cargo a reembolsar (requerido para parcial y recomendado siempre). */
  chargeId: string;
  /** Monto en centavos (entero). Debe ser ≤ saldo reembolsable del cargo. */
  amountCents: number;
  idempotencyKey?: string;
};

/**
 * Reembolso parcial o total vía API v2 de Conekta.
 *
 * **Importante:** en v2 el reembolso se hace con
 * `POST /orders/{order_id}/refunds`, no con `/charges/.../refunds` (esa
 * ruta no existe y devuelve 404).
 *
 * Para **reembolso parcial**, la documentación exige `charge_id` y opcional
 * `amount` (centavos). Sin `charge_id`, un `amount` menor al total de la
 * orden puede aplicarse mal o exigir `charge_id` en órdenes con varios cargos.
 *
 * @see https://developers.conekta.com/docs/reembolsar-orden
 */
export async function refundConektaOrderCharge(
  input: RefundConektaOrderChargeInput,
): Promise<RefundResult> {
  const amount = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `refundConektaOrderCharge: amountCents inválido (${input.amountCents})`,
    );
  }
  if (!input.orderId?.trim()) {
    throw new Error("refundConektaOrderCharge: orderId vacío");
  }
  if (!input.chargeId?.trim()) {
    throw new Error("refundConektaOrderCharge: chargeId vacío");
  }

  const res = await axios.post<ConektaOrder>(
    `${CONEKTA_API_URL}/orders/${encodeURIComponent(input.orderId)}/refunds`,
    {
      reason: "requested_by_client",
      charge_id: input.chargeId,
      amount,
    },
    buildRequestConfig(input.idempotencyKey),
  );

  const refundId = extractRefundIdFromOrderRefundResponse(
    res.data,
    input.chargeId,
  );
  if (!refundId) {
    throw new Error(
      "refundConektaOrderCharge: respuesta sin refund_id en el cargo; revisar payload de Conekta.",
    );
  }

  return {
    id: refundId,
    amount,
    status: res.data.payment_status || "unknown",
  };
}

/** Devuelve el primer charge con status `paid`, si existe. */
export function findPaidCharge(order: ConektaOrder): ConektaCharge | null {
  const charges = order.charges?.data ?? [];
  return charges.find((c) => c.status === "paid") ?? null;
}

/**
 * Primer cargo al que aún se le puede solicitar reembolso (pago completo o
 * parcial). Tras un reembolso parcial Conekta puede dejar el cargo en
 * `partially_refunded` en lugar de `paid`.
 */
export function findChargeEligibleForRefund(
  order: ConektaOrder,
): ConektaCharge | null {
  const charges = order.charges?.data ?? [];
  for (const c of charges) {
    const s = (c.status || "").toLowerCase();
    if (s === "paid" || s === "partially_refunded") return c;
  }
  return null;
}

/**
 * Detecta si un error de `refundConektaOrderCharge` proviene de Conekta avisando
 * que el cargo ya estaba reembolsado (race con cron, dashboard manual, o
 * reintento de finalize tras un fallo previo). Devuelve `true` en ese caso
 * para que el caller lo trate como éxito (idempotencia).
 *
 * Conekta responde 400/422 con `details[].message` o `message` que contiene
 * "already refunded" o variantes en español. Hacemos un match laxo (any
 * "already|ya" cerca de "refund|reembols") para sobrevivir cambios menores
 * en la copy del API.
 */
export function isAlreadyRefundedError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  if (status !== 400 && status !== 422) return false;
  const data = err.response?.data as
    | { details?: Array<{ message?: string }>; message?: string }
    | undefined;
  const messages = [
    data?.message ?? "",
    ...(Array.isArray(data?.details)
      ? data.details.map((d) => d?.message ?? "")
      : []),
  ]
    .join(" ")
    .toLowerCase();
  return /(already|ya).*(refund|reembols)/i.test(messages);
}

/**
 * Convierte cualquier error (axios u otro) en un mensaje amigable en español.
 * Devuelve también el status HTTP cuando aplica.
 */
export function formatConektaError(err: unknown): {
  message: string;
  status?: number;
} {
  const axiosErr = err as AxiosError<{
    details?: Array<{ message?: string; debug_message?: string }>;
    message_to_purchaser?: string;
    message?: string;
  }>;

  // Errores de red/timeout (sin response de Conekta).
  if (axiosErr?.code === "ECONNABORTED" || axiosErr?.code === "ETIMEDOUT") {
    return {
      message:
        "El procesador de pagos no respondió a tiempo. Si fuiste cobrado, contacta a soporte; si no, intenta nuevamente.",
    };
  }
  if (
    axiosErr?.code === "ECONNREFUSED" ||
    axiosErr?.code === "ENOTFOUND" ||
    axiosErr?.code === "ENETUNREACH" ||
    axiosErr?.code === "EAI_AGAIN"
  ) {
    return {
      message:
        "No fue posible conectar con el procesador de pagos. Intenta nuevamente en unos momentos.",
    };
  }

  const data = axiosErr?.response?.data;
  const fromDetails = Array.isArray(data?.details)
    ? data!
        .details!.map((d) => d?.message || d?.debug_message)
        .filter(Boolean)
        .join(", ")
    : "";

  let message =
    fromDetails ||
    data?.message_to_purchaser ||
    data?.message ||
    axiosErr?.message ||
    "Error al procesar el pago con Conekta";

  if (/Your code could not be processed|code could not be processed/i.test(message)) {
    message =
      "No se pudo procesar tu tarjeta. Por favor verifica los datos e intenta nuevamente.";
  } else if (/declined/i.test(message)) {
    message =
      "La tarjeta fue rechazada. Por favor verifica los datos o usa otra tarjeta.";
  } else if (/insufficient funds/i.test(message)) {
    message = "Fondos insuficientes en la tarjeta.";
  } else if (/(card|tarjeta).*(expired|vencida)|expired (card|tarjeta)/i.test(message)) {
    // No confundir con "order expired": sólo cuando habla de la tarjeta.
    message = "La tarjeta ha expirado. Por favor usa otra tarjeta.";
  } else if (/invalid/i.test(message)) {
    message =
      "Los datos de la tarjeta no son válidos. Por favor verifica e intenta nuevamente.";
  }

  return { message, status: axiosErr?.response?.status };
}

/** Convierte un monto en MXN (con decimales) a centavos enteros. */
export function toCents(amountMxn: number): number {
  return Math.round(Number(amountMxn) * 100);
}

// =====================================================
// Webhooks
// =====================================================

/**
 * Tipos de evento de webhook que nos interesan procesar.
 * Conekta manda muchos más; los que no aparecen aquí los marcamos `ignored`.
 */
export type ConektaWebhookEventType =
  | "order.paid"
  | "order.expired"
  | "order.canceled"
  | "charge.created"
  | "charge.paid"
  | "charge.refunded"
  | "charge.chargeback.created"
  | "charge.chargeback.updated"
  | "charge.chargeback.lost";

export interface ConektaWebhookEvent {
  id: string;
  type: string;
  data?: {
    object?: {
      id?: string;
      object?: string;
      payment_status?: string;
      status?: string;
      amount?: number;
      order_id?: string;
      metadata?: Record<string, string | number | boolean | null>;
      charges?: { data?: ConektaCharge[] };
      [key: string]: unknown;
    };
  };
  livemode?: boolean;
  created_at?: number;
}

/**
 * Verifica la firma RSA-SHA256 del webhook de Conekta.
 *
 * Modelo de firma de Conekta (v2.1+):
 * - Conekta tiene un par RSA. Te da la clave PÚBLICA (PEM) cuando creas
 *   tu webhook key vía POST /webhook_keys o desde el dashboard.
 * - En cada notificación firma el body raw con su clave PRIVADA y manda la
 *   firma en el header `Digest` codificada en base64.
 * - Nosotros verificamos `verify(SHA256, body, signature, publicKey)` con la
 *   pública.
 *
 * IMPORTANTE: el body que se verifica es el cuerpo BYTE A BYTE como llegó.
 * No re-serialices el JSON: hazlo SIEMPRE con el body raw.
 *
 * Si `CONEKTA_WEBHOOK_PUBLIC_KEY` no está configurado o el header no viene,
 * devuelve `false` (fail-closed). Nunca aceptes webhooks sin verificar firma
 * en producción.
 *
 * Notas operativas:
 * - La env var puede contener la PEM con saltos `\n` literales (Vercel/UI no
 *   acepta multilínea fácilmente) o ya formateada con saltos reales. La
 *   función normaliza ambos casos.
 * - Aceptamos prefijos `sha256=` o `SHA256=` por defensa, aunque Conekta
 *   manda la firma en el header `Digest` sin prefijo.
 */
export function verifyConektaWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
): boolean {
  const rawKey = process.env.CONEKTA_WEBHOOK_PUBLIC_KEY?.trim();
  if (!rawKey) {
    console.error(
      "[conekta-webhook] CONEKTA_WEBHOOK_PUBLIC_KEY no está configurado: rechazando webhook",
    );
    return false;
  }
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }

  // Defensivo: copiar/pegar desde el dashboard de Conekta suele arrastrar
  // espacios o saltos. Quitamos prefijos opcionales y trim.
  const cleaned = signatureHeader
    .replace(/^sha256=/i, "")
    .replace(/^SHA-?256=/i, "")
    .trim();
  if (!cleaned) return false;

  let signatureBuffer: Buffer;
  try {
    signatureBuffer = Buffer.from(cleaned, "base64");
  } catch {
    return false;
  }
  if (signatureBuffer.length === 0) return false;

  const bodyBuffer =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;

  const pem = normalizePemPublicKey(rawKey);

  try {
    const publicKey = createPublicKey({ key: pem, format: "pem" });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(bodyBuffer);
    verifier.end();
    return verifier.verify(publicKey, signatureBuffer);
  } catch (err) {
    console.error("[conekta-webhook] Error verificando firma RSA:", err);
    return false;
  }
}

/**
 * Normaliza una PEM de clave pública. Acepta:
 *  - PEM "real" con saltos de línea reales.
 *  - PEM con `\n` literales (caso típico al guardar en env vars).
 *  - PEM en una sola línea (sin saltos), reformateando body en bloques de 64.
 */
function normalizePemPublicKey(input: string): string {
  let pem = input.replace(/\\n/g, "\n").trim();

  const beginRe = /-----BEGIN [A-Z ]*PUBLIC KEY-----/;
  const endRe = /-----END [A-Z ]*PUBLIC KEY-----/;
  const beginMatch = pem.match(beginRe);
  const endMatch = pem.match(endRe);
  if (!beginMatch || !endMatch) return pem;

  const begin = beginMatch[0];
  const end = endMatch[0];

  // Si ya tiene saltos correctos, regresar tal cual.
  if (pem.includes("\n")) return pem;

  // PEM en una sola línea: extraer body y reformatear.
  const beginIdx = pem.indexOf(begin);
  const endIdx = pem.indexOf(end);
  const body = pem
    .slice(beginIdx + begin.length, endIdx)
    .replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${begin}\n${wrapped}\n${end}\n`;
}

/**
 * Extrae los identificadores más útiles del payload de un evento Conekta
 * para indexar en `conekta_webhook_events` (payment_id = orderId, charge_id).
 */
export function extractWebhookIds(event: ConektaWebhookEvent): {
  paymentId: string | null;
  chargeId: string | null;
} {
  const obj = event?.data?.object ?? {};
  const objectType = String(obj.object ?? "").toLowerCase();

  let paymentId: string | null = null;
  let chargeId: string | null = null;

  if (objectType === "order") {
    paymentId = typeof obj.id === "string" ? obj.id : null;
    const firstCharge = obj.charges?.data?.[0];
    chargeId = firstCharge?.id ?? null;
  } else if (objectType === "charge") {
    chargeId = typeof obj.id === "string" ? obj.id : null;
    paymentId = typeof obj.order_id === "string" ? obj.order_id : null;
  }

  return { paymentId, chargeId };
}

/**
 * En `charge.refunded`, `data.object` es el **cargo**: `id` es `chg_...`.
 * El recurso de reembolso en la API tiene otro id (`ref_...`) y suele
 * listarse en `refunds.data` (el último suele corresponder al reembolso
 * que disparó el evento). Preferimos `ref_` para alinear con lo que
 * devuelve `refundConektaOrderCharge` y con `reservation_refunds.refund_id`.
 * Si el payload no trae `refunds`, se usa el id del cargo como antes.
 */
export function extractRefundIdFromChargeRefundedPayload(
  obj: Record<string, unknown> | undefined,
): string | null {
  if (!obj || typeof obj !== "object") return null;
  const refunds = obj.refunds as { data?: unknown[] } | undefined;
  const rows = Array.isArray(refunds?.data) ? refunds.data : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row && typeof row === "object") {
      const id = (row as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  }
  const chargeId = obj.id;
  return typeof chargeId === "string" && chargeId.length > 0 ? chargeId : null;
}
