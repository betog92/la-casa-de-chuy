import { Resend } from "resend";
import { REFUND_CANCEL_EMAIL_TIMEFRAME } from "@/constants/refund-copy";
import {
  formatDisplayDate,
  formatTimeRange,
  formatCurrency,
} from "@/utils/formatters";
import { sessionTypeLabel } from "@/utils/session-type";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

const FROM = "La Casa de Chuy el Rico <reservas@lacasadechuyelrico.com>";

export interface SendReservationConfirmationParams {
  to: string;
  name: string;
  date: string;
  startTime: string;
  price: number;
  reservationId: number;
  /** URL para gestionar la reserva (guest: /reservas/[token], user: /reservaciones/[id]) */
  manageUrl: string;
  sessionType?: string | null;
  photographerStudio?: string | null;
}

/**
 * Envía email de confirmación de reserva.
 * No lanza; devuelve { ok, error } para que el llamador decida si fallar o solo loguear.
 */
export async function sendReservationConfirmation(
  params: SendReservationConfirmationParams
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY no configurada" };
  }
  if (!params.to?.trim()) {
    return { ok: false, error: "Destinatario faltante" };
  }

  const to = params.to.trim();
  const {
    name,
    date,
    startTime,
    price,
    reservationId,
    manageUrl,
    sessionType,
    photographerStudio,
  } = params;

  const dateFormatted = formatDisplayDate(date);
  const timeFormatted = formatTimeRange(startTime, undefined, date);
  const safePrice = Number.isFinite(Number(price)) ? Number(price) : 0;
  const priceFormatted = formatCurrency(safePrice);
  const sessionRow =
    sessionType != null && String(sessionType).trim() !== ""
      ? `<tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Tipo de sesión</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(sessionTypeLabel(sessionType))}</td></tr>`
      : "";
  const photographerRow =
    photographerStudio != null && String(photographerStudio).trim() !== ""
      ? `<tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Fotógrafo / estudio</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(String(photographerStudio).trim())}</td></tr>`
      : "";

  const subject = `Reserva confirmada – ${dateFormatted}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f4f4f5; color:#18181b;">
  <div style="max-width:480px; margin:0 auto; padding:24px;">
    <div style="background:#fff; border-radius:12px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <h1 style="margin:0 0 28px; font-size:1.25rem; color:#103948;">¡Tu reserva está confirmada!</h1>

      <p style="margin:0 0 20px; font-size:0.9375rem; line-height:1.5;">Hola ${escapeHtml(name)},</p>
      <p style="margin:0 0 28px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">Gracias por reservar con nosotros. Estos son los detalles de tu sesión:</p>

      <div style="background:#fafafa; border-radius:8px; border-left:4px solid #103948; padding:16px 20px; margin:0 0 28px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Fecha</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(dateFormatted)}</td></tr>
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Horario</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(timeFormatted)}</td></tr>
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Monto pagado</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">$${escapeHtml(priceFormatted)} MXN</td></tr>
          ${sessionRow}
          ${photographerRow}
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">ID de reserva</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(String(reservationId))}</td></tr>
        </table>
      </div>

      <p style="margin:0 0 16px; font-size:0.9375rem; line-height:1.5;">Puedes ver y gestionar tu reserva en el siguiente enlace:</p>
      <p style="margin:0 0 28px;"><a href="${escapeHtml(manageUrl)}" style="display:inline-block; padding:14px 24px; background:#103948; color:#fff; text-decoration:none; border-radius:10px; font-size:0.9375rem; font-weight:500; box-shadow:0 2px 4px rgba(0,0,0,.08);">Ver mi reserva</a></p>

      <p style="margin:0; font-size:0.8125rem; color:#71717a; line-height:1.5;">Si tienes dudas, contáctanos por Facebook Messenger.</p>
    </div>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #e4e4e7; font-size:0.75rem; color:#a1a1aa; text-align:center;">La Casa de Chuy el Rico – Locación fotográfica en renta</p>
  </div>
</body>
</html>
`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
    });

    if (error) {
      return { ok: false, error: error.message || "Error al enviar email" };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado al enviar email";
    return { ok: false, error: msg };
  }
}

export interface SendCancellationConfirmationParams {
  to: string;
  name: string;
  date: string;
  startTime: string;
  refundAmount: number;
  reservationId: number;
  manageUrl: string;
}

/**
 * Envía email de confirmación de cancelación con detalles del reembolso.
 */
export async function sendCancellationConfirmation(
  params: SendCancellationConfirmationParams
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!params.to?.trim()) return { ok: false, error: "Destinatario faltante" };

  const to = params.to.trim();
  const { name, date, startTime, refundAmount, reservationId, manageUrl } =
    params;
  const dateFormatted = formatDisplayDate(date);
  const timeFormatted = formatTimeRange(startTime, undefined, date);
  const refundFormatted = formatCurrency(refundAmount);
  const idShort = String(reservationId);

  const subject = `Reserva cancelada – ${dateFormatted}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f4f4f5; color:#18181b;">
  <div style="max-width:480px; margin:0 auto; padding:24px;">
    <div style="background:#fff; border-radius:12px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <h1 style="margin:0 0 28px; font-size:1.25rem; color:#103948;">Tu reserva ha sido cancelada.</h1>

      <p style="margin:0 0 20px; font-size:0.9375rem; line-height:1.5;">Hola ${escapeHtml(name)},</p>
      <p style="margin:0 0 28px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">Confirmamos la cancelación de tu sesión programada para el <strong>${escapeHtml(dateFormatted)}</strong> a las <strong>${escapeHtml(timeFormatted)}</strong> (ID ${escapeHtml(idShort)}).</p>

      <div style="background:#fef3f2; border-radius:8px; border-left:4px solid #dc2626; padding:16px 20px; margin:0 0 28px;">
        <p style="margin:0 0 8px; font-size:0.875rem; color:#991b1b; font-weight:600;">Reembolso</p>
        ${refundAmount > 0
          ? `<p style="margin:0; font-size:0.9375rem; color:#27272a;">Recibirás <strong>$${escapeHtml(refundFormatted)} MXN</strong> en la tarjeta con la que pagaste. ${escapeHtml(REFUND_CANCEL_EMAIL_TIMEFRAME)}</p>`
          : `<p style="margin:0; font-size:0.9375rem; color:#27272a;">No aplica reembolso por tarjeta (el pago fue por otro método).</p>`
        }
      </div>

      <p style="margin:0 0 16px; font-size:0.9375rem; line-height:1.5;">Puedes ver el detalle de esta reserva cancelada en:</p>
      <p style="margin:0 0 28px;"><a href="${escapeHtml(manageUrl)}" style="display:inline-block; padding:14px 24px; background:#103948; color:#fff; text-decoration:none; border-radius:10px; font-size:0.9375rem; font-weight:500;">Ver detalle</a></p>

      <p style="margin:0; font-size:0.8125rem; color:#71717a;">Si tienes dudas, contáctanos por Facebook Messenger.</p>
    </div>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #e4e4e7; font-size:0.75rem; color:#a1a1aa; text-align:center;">La Casa de Chuy el Rico – Locación fotográfica en renta</p>
  </div>
</body>
</html>
`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
    });
    if (error) return { ok: false, error: error.message || "Error al enviar email" };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error inesperado al enviar email",
    };
  }
}

export interface SendRescheduleConfirmationParams {
  to: string;
  name: string;
  date: string;
  startTime: string;
  reservationId: number;
  manageUrl: string;
  additionalAmount?: number | null;
}

/**
 * Envía email de confirmación de reagendamiento.
 */
export async function sendRescheduleConfirmation(
  params: SendRescheduleConfirmationParams
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!params.to?.trim()) return { ok: false, error: "Destinatario faltante" };

  const to = params.to.trim();
  const { name, date, startTime, reservationId, manageUrl, additionalAmount } =
    params;
  const dateFormatted = formatDisplayDate(date);
  const timeFormatted = formatTimeRange(startTime, undefined, date);
  const idShort = String(reservationId);
  const hasExtra = Number(additionalAmount) > 0;
  const extraFormatted = formatCurrency(Number(additionalAmount));

  const subject = `Reserva reagendada – ${dateFormatted}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f4f4f5; color:#18181b;">
  <div style="max-width:480px; margin:0 auto; padding:24px;">
    <div style="background:#fff; border-radius:12px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <h1 style="margin:0 0 28px; font-size:1.25rem; color:#103948;">¡Tu reserva ha sido reagendada!</h1>

      <p style="margin:0 0 20px; font-size:0.9375rem; line-height:1.5;">Hola ${escapeHtml(name)},</p>
      <p style="margin:0 0 28px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">Tu sesión ha sido reagendada. Nuevos datos:</p>

      <div style="background:#fafafa; border-radius:8px; border-left:4px solid #103948; padding:16px 20px; margin:0 0 28px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Nueva fecha</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(dateFormatted)}</td></tr>
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Nuevo horario</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(timeFormatted)}</td></tr>
          ${hasExtra ? `<tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Pago adicional</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">$${escapeHtml(extraFormatted)} MXN</td></tr>` : ""}
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">ID de reserva</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(idShort)}</td></tr>
        </table>
      </div>

      <p style="margin:0 0 16px; font-size:0.9375rem; line-height:1.5;">Puedes ver y gestionar tu reserva en:</p>
      <p style="margin:0 0 28px;"><a href="${escapeHtml(manageUrl)}" style="display:inline-block; padding:14px 24px; background:#103948; color:#fff; text-decoration:none; border-radius:10px; font-size:0.9375rem; font-weight:500;">Ver mi reserva</a></p>

      <p style="margin:0; font-size:0.8125rem; color:#71717a;">Si tienes dudas, contáctanos por Facebook Messenger.</p>
    </div>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #e4e4e7; font-size:0.75rem; color:#a1a1aa; text-align:center;">La Casa de Chuy el Rico – Locación fotográfica en renta</p>
  </div>
</body>
</html>
`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
    });
    if (error) return { ok: false, error: error.message || "Error al enviar email" };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error inesperado al enviar email",
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =====================================================
// EMAILS DE TRANSFERENCIA DE MONEDAS CHUY → FOTÓGRAFO
// =====================================================

export interface SendTransferReceivedParams {
  /** Email del fotógrafo destinatario */
  to: string;
  /** Nombre del fotógrafo (si lo tenemos) */
  recipientName: string | null;
  /** Nombre del cliente que regaló (si lo tenemos) */
  fromName: string | null;
  /** Cantidad de Monedas Chuy acreditadas */
  points: number;
}

/**
 * Email enviado cuando un fotógrafo con cuenta existente recibe Monedas
 * Chuy automáticamente (status=auto_credited) tras pasar la fecha de la sesión.
 */
export async function sendTransferReceived(
  params: SendTransferReceivedParams,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!params.to?.trim()) return { ok: false, error: "Destinatario faltante" };

  const to = params.to.trim();
  const { recipientName, fromName, points } = params;
  const greetingName = (recipientName || "").trim();
  const greeting = greetingName ? `Hola ${greetingName}` : "Hola";
  const fromLabel = (fromName || "Un cliente").trim() || "Un cliente";
  const pointsLabel = `${points} ${points === 1 ? "Moneda Chuy" : "Monedas Chuy"}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lacasadechuyelrico.com";
  const accountUrl = `${baseUrl}/account`;

  const subject = `Recibiste ${pointsLabel}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f4f4f5; color:#18181b;">
  <div style="max-width:480px; margin:0 auto; padding:24px;">
    <div style="background:#fff; border-radius:12px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <h1 style="margin:0 0 24px; font-size:1.25rem; color:#103948;">¡Recibiste ${escapeHtml(pointsLabel)}!</h1>

      <p style="margin:0 0 16px; font-size:0.9375rem; line-height:1.5;">${escapeHtml(greeting)},</p>
      <p style="margin:0 0 24px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">
        ${escapeHtml(fromLabel)} te regaló <strong>${escapeHtml(pointsLabel)}</strong> tras su sesión en La Casa de Chuy el Rico.
        Las Monedas ya están en tu cuenta y puedes usarlas en futuras reservas (1 Moneda = $1 MXN).
        No caducan.
      </p>

      <p style="margin:0 0 28px;"><a href="${escapeHtml(accountUrl)}" style="display:inline-block; padding:14px 24px; background:#103948; color:#fff; text-decoration:none; border-radius:10px; font-size:0.9375rem; font-weight:500;">Ver mi cuenta</a></p>

      <p style="margin:0; font-size:0.8125rem; color:#71717a;">Si tienes dudas, contáctanos por Facebook Messenger.</p>
    </div>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #e4e4e7; font-size:0.75rem; color:#a1a1aa; text-align:center;">La Casa de Chuy el Rico – Locación fotográfica en renta</p>
  </div>
</body>
</html>
`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
    });
    if (error)
      return { ok: false, error: error.message || "Error al enviar email" };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error inesperado al enviar email",
    };
  }
}

export interface SendTransferClaimParams {
  /** Email del fotógrafo destinatario */
  to: string;
  /** Nombre del cliente que regaló (si lo tenemos) */
  fromName: string | null;
  /** Cantidad de Monedas Chuy a reclamar */
  points: number;
  /** URL completa del magic link de reclamo */
  claimUrl: string;
}

/**
 * Email enviado cuando un fotógrafo SIN cuenta recibe el magic link
 * para reclamar las Monedas Chuy (status=pending_claim).
 */
export async function sendTransferClaim(
  params: SendTransferClaimParams,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };
  if (!params.to?.trim()) return { ok: false, error: "Destinatario faltante" };

  const to = params.to.trim();
  const { fromName, points, claimUrl } = params;
  const greeting = "Hola";
  const fromLabel = (fromName || "Un cliente").trim() || "Un cliente";
  const pointsLabel = `${points} ${points === 1 ? "Moneda Chuy" : "Monedas Chuy"}`;

  const subject = `Reclama ${pointsLabel}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f4f4f5; color:#18181b;">
  <div style="max-width:480px; margin:0 auto; padding:24px;">
    <div style="background:#fff; border-radius:12px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <h1 style="margin:0 0 24px; font-size:1.25rem; color:#103948;">¡Te regalaron ${escapeHtml(pointsLabel)}!</h1>

      <p style="margin:0 0 16px; font-size:0.9375rem; line-height:1.5;">${escapeHtml(greeting)},</p>
      <p style="margin:0 0 16px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">
        ${escapeHtml(fromLabel)} te regaló <strong>${escapeHtml(pointsLabel)}</strong> tras su sesión en La Casa de Chuy el Rico.
      </p>
      <p style="margin:0 0 24px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">
        Para recibirlas, crea una cuenta o inicia sesión con este correo. Las Monedas (1 Moneda = $1 MXN) no caducan y podrás usarlas en futuras reservas.
      </p>

      <p style="margin:0 0 24px;"><a href="${escapeHtml(claimUrl)}" style="display:inline-block; padding:14px 24px; background:#103948; color:#fff; text-decoration:none; border-radius:10px; font-size:0.9375rem; font-weight:500;">Reclamar ${escapeHtml(pointsLabel)}</a></p>

      <p style="margin:0 0 16px; font-size:0.8125rem; color:#71717a; line-height:1.5; word-break:break-all;">
        Si el botón no funciona, copia este enlace en tu navegador:<br>
        <span style="color:#3f3f46;">${escapeHtml(claimUrl)}</span>
      </p>

      <p style="margin:0; font-size:0.8125rem; color:#71717a;">Si tienes dudas, contáctanos por Facebook Messenger.</p>
    </div>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #e4e4e7; font-size:0.75rem; color:#a1a1aa; text-align:center;">La Casa de Chuy el Rico – Locación fotográfica en renta</p>
  </div>
</body>
</html>
`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject,
      html,
    });
    if (error)
      return { ok: false, error: error.message || "Error al enviar email" };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error inesperado al enviar email",
    };
  }
}

// =====================================================
// Alertas de pago a admin (huérfanos, refunds dashboard, chargebacks)
// =====================================================

export type AdminPaymentAlertType =
  | "orphan_payment_refunded"
  | "orphan_payment_recovered"
  | "orphan_payment_refund_failed"
  | "orphan_payment_no_snapshot"
  | "orphan_cron_stale_heartbeat"
  | "dashboard_refund_received"
  | "chargeback_received"
  | "cancellation_refund_failed"
  | "retry_refunds_cron_stale_heartbeat";

export interface AdminPaymentAlertParams {
  type: AdminPaymentAlertType;
  paymentId: string;
  chargeId?: string | null;
  customerEmail?: string | null;
  amountMxn?: number | null;
  reservationId?: number | null;
  notes?: string | null;
}

const ALERT_TITLE_BY_TYPE: Record<AdminPaymentAlertType, string> = {
  orphan_payment_refunded: "Pago huérfano reembolsado automáticamente",
  orphan_payment_recovered: "Pago huérfano recuperado (reserva creada vía webhook)",
  orphan_payment_refund_failed:
    "Pago huérfano: REEMBOLSO AUTOMÁTICO FALLÓ — acción manual requerida",
  orphan_payment_no_snapshot:
    "Pago sin reserva ni snapshot — revisar en Conekta (no es fallo de reembolso)",
  orphan_cron_stale_heartbeat:
    "Cron de huérfanos sin señal de vida — revisa cron-job.org / Vercel",
  dashboard_refund_received: "Reembolso registrado desde dashboard de Conekta",
  chargeback_received: "Chargeback recibido — acción urgente requerida",
  cancellation_refund_failed:
    "Cancelación: reembolso Conekta agotó reintentos — acción manual requerida",
  retry_refunds_cron_stale_heartbeat:
    "Cron de reintentos de reembolsos (cancelaciones) sin señal de vida",
};

/**
 * Notifica al admin de eventos de pago que requieren su atención (chargebacks,
 * refunds desde dashboard, pagos huérfanos auto-reembolsados, etc.).
 *
 * Si `ADMIN_ALERT_EMAIL` no está configurado, no se envía y se loguea.
 */
export async function sendAdminPaymentAlert(
  params: AdminPaymentAlertParams,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY no configurada" };
  }

  const adminEmail =
    process.env.ADMIN_ALERT_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim();
  if (!adminEmail) {
    console.warn(
      "[email] ADMIN_ALERT_EMAIL no configurado: no se envía alerta",
      params.type,
      params.paymentId,
    );
    return { ok: false, error: "ADMIN_ALERT_EMAIL no configurado" };
  }

  const title = ALERT_TITLE_BY_TYPE[params.type];
  const isUrgent =
    params.type === "chargeback_received" ||
    params.type === "orphan_payment_refund_failed" ||
    params.type === "orphan_cron_stale_heartbeat" ||
    params.type === "cancellation_refund_failed" ||
    params.type === "retry_refunds_cron_stale_heartbeat";
  const subject = `${isUrgent ? "[URGENTE] " : "[Conekta] "}${title}`;

  const rows: Array<[string, string]> = [
    ["Tipo de evento", params.type],
  ];
  if (params.type === "orphan_cron_stale_heartbeat") {
    rows.push(["Job", params.paymentId]);
  } else if (params.type === "retry_refunds_cron_stale_heartbeat") {
    rows.push(["Job", params.paymentId]);
  } else {
    rows.push(["Order ID (Conekta)", params.paymentId]);
  }
  if (params.chargeId) rows.push(["Charge ID", params.chargeId]);
  if (params.customerEmail) rows.push(["Cliente (email)", params.customerEmail]);
  if (typeof params.amountMxn === "number") {
    rows.push(["Monto", formatCurrency(params.amountMxn)]);
  }
  if (typeof params.reservationId === "number") {
    rows.push(["Reserva ID", String(params.reservationId)]);
  }
  if (params.notes) rows.push(["Notas", params.notes]);

  const tableHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px; color:#52525b; border-bottom:1px solid #e4e4e7;">${escapeHtml(
          k,
        )}</td><td style="padding:6px 12px; color:#18181b; border-bottom:1px solid #e4e4e7;">${escapeHtml(
          v,
        )}</td></tr>`,
    )
    .join("");

  const subtitle =
    params.type === "orphan_cron_stale_heartbeat"
      ? "Monitor automático del cron de reembolso de pagos huérfanos."
      : params.type === "retry_refunds_cron_stale_heartbeat"
        ? "Monitor automático del cron de reintentos de reembolsos por cancelación."
        : params.type === "orphan_payment_no_snapshot"
        ? "Conekta notificó order.paid pero no hay fila en pending_reservations ni reserva con ese order_id."
        : params.type === "cancellation_refund_failed"
          ? "Una fila de reservation_refunds no pudo reembolsarse tras varios reintentos automáticos."
          : "Evento detectado en el sistema de pagos de Conekta.";

  const footerHint =
    params.type === "orphan_cron_stale_heartbeat"
      ? "Revisa cron-job.org, Vercel (logs de /api/cron/refund-orphan-payments) y la tabla cron_job_heartbeats en Supabase."
      : params.type === "retry_refunds_cron_stale_heartbeat"
        ? "Revisa cron-job.org, Vercel (logs de /api/cron/retry-failed-refunds) y la tabla cron_job_heartbeats en Supabase."
        : params.type === "orphan_payment_no_snapshot"
        ? "Puede ser orden de prueba, API externa, o snapshot perdido. No implica que un reembolso automático haya fallado."
        : params.type === "cancellation_refund_failed"
          ? "Revisa Conekta, la tabla reservation_refunds y /api/cron/retry-failed-refunds. Puedes usar POST /api/admin/reservations/[id]/refund/retry (o el botón en /reservaciones/[id]) para reabrir filas en failed o forzar el procesamiento de pending sin esperar al cron."
          : "Revisa el panel de Conekta y la base de datos para confirmar el estado.";

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:24px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f4f4f5; color:#18181b;">
  <div style="max-width:640px; margin:0 auto; background:#fff; border-radius:12px; padding:24px;">
    <h2 style="margin:0 0 8px; color:${isUrgent ? "#b91c1c" : "#103948"};">${escapeHtml(title)}</h2>
    <p style="margin:0 0 16px; color:#52525b;">${escapeHtml(subtitle)}</p>
    <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
      <tbody>${tableHtml}</tbody>
    </table>
    <p style="margin:16px 0 0; font-size:0.8125rem; color:#71717a;">
      ${escapeHtml(footerHint)}
    </p>
  </div>
</body>
</html>
`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [adminEmail],
      subject,
      html,
    });
    if (error)
      return { ok: false, error: error.message || "Error al enviar email" };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error inesperado al enviar email",
    };
  }
}
