import { Resend } from "resend";
import {
  formatDisplayDate,
  formatTimeRange,
  formatCurrency,
} from "@/utils/formatters";

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
  reservationId: string;
  /** URL para gestionar la reserva (guest: /reservas/[token], user: /reservaciones/[id]) */
  manageUrl: string;
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
  const { name, date, startTime, price, reservationId, manageUrl } = params;

  const dateFormatted = formatDisplayDate(date);
  const timeFormatted = formatTimeRange(startTime);
  const safePrice = Number.isFinite(Number(price)) ? Number(price) : 0;
  const priceFormatted = formatCurrency(safePrice);

  const subject = `Reserva confirmada – La Casa de Chuy el Rico – ${dateFormatted}`;

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
      <h1 style="margin:0 0 8px; font-size:1.25rem; color:#103948;">La Casa de Chuy el Rico</h1>
      <p style="margin:0 0 28px; font-size:0.875rem; color:#71717a;">¡Tu reserva está confirmada!</p>

      <p style="margin:0 0 20px; font-size:0.9375rem; line-height:1.5;">Hola ${escapeHtml(name)},</p>
      <p style="margin:0 0 28px; font-size:0.9375rem; color:#3f3f46; line-height:1.5;">Gracias por reservar con nosotros. Estos son los detalles de tu sesión:</p>

      <div style="background:#fafafa; border-radius:8px; border-left:4px solid #103948; padding:16px 20px; margin:0 0 28px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Fecha</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(dateFormatted)}</td></tr>
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Horario</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(timeFormatted)}</td></tr>
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">Monto pagado</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">$${escapeHtml(priceFormatted)} MXN</td></tr>
          <tr><td style="padding:10px 0; font-size:0.875rem; color:#71717a;">ID de reserva</td><td style="padding:10px 0; font-size:0.875rem; text-align:right; font-weight:500; color:#27272a;">${escapeHtml(reservationId.slice(0, 8).toUpperCase())}</td></tr>
        </table>
      </div>

      <p style="margin:0 0 16px; font-size:0.9375rem; line-height:1.5;">Puedes ver y gestionar tu reserva en el siguiente enlace:</p>
      <p style="margin:0 0 28px;"><a href="${escapeHtml(manageUrl)}" style="display:inline-block; padding:14px 24px; background:#103948; color:#fff; text-decoration:none; border-radius:10px; font-size:0.9375rem; font-weight:500; box-shadow:0 2px 4px rgba(0,0,0,.08);">Ver mi reserva</a></p>

      <p style="margin:0; font-size:0.8125rem; color:#71717a; line-height:1.5;">Si tienes dudas, responde a este correo o contáctanos.</p>
    </div>
    <p style="margin:24px 0 0; padding-top:16px; border-top:1px solid #e4e4e7; font-size:0.75rem; color:#a1a1aa; text-align:center;">La Casa de Chuy el Rico – Estudio de locación fotográfica</p>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
