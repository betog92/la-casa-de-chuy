import axios, { AxiosError } from "axios";

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
  id: string;
  amount: number;
  status: string;
}

/**
 * Solicita un reembolso parcial o total sobre un cargo específico.
 * `amountCents` debe coincidir con la moneda original (centavos).
 */
export async function refundConektaCharge(
  chargeId: string,
  amountCents: number,
  idempotencyKey?: string,
): Promise<RefundResult> {
  // Defensa: Conekta exige un entero en centavos. Cualquier float sería 422.
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `refundConektaCharge: amountCents inválido (${amountCents})`,
    );
  }
  if (!chargeId) {
    throw new Error("refundConektaCharge: chargeId vacío");
  }
  const res = await axios.post<RefundResult>(
    `${CONEKTA_API_URL}/charges/${encodeURIComponent(chargeId)}/refunds`,
    { amount, reason: "requested_by_client" },
    buildRequestConfig(idempotencyKey),
  );
  return res.data;
}

/** Devuelve el primer charge con status `paid`, si existe. */
export function findPaidCharge(order: ConektaOrder): ConektaCharge | null {
  const charges = order.charges?.data ?? [];
  return charges.find((c) => c.status === "paid") ?? null;
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
