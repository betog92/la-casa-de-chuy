import { NextRequest } from "next/server";
import axios from "axios";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";

// Private Key de Conekta - NUNCA exponer en el frontend
const CONEKTA_PRIVATE_KEY = process.env.CONEKTA_PRIVATE_KEY;

export async function POST(request: NextRequest) {
  try {
    // Validar que la Private Key esté configurada
    if (!CONEKTA_PRIVATE_KEY) {
      return errorResponse(
        "Error de configuración: Conekta Private Key no encontrada",
        500
      );
    }

    // Obtener datos del body
    const body = await request.json();
    const { token, amount, currency, customerInfo, description } = body;

    // Validar campos requeridos
    if (!token || !amount || !customerInfo) {
      return validationErrorResponse(
        "Faltan campos requeridos: token, amount, customerInfo"
      );
    }

    // Validar propiedades de customerInfo
    if (
      !customerInfo.name ||
      typeof customerInfo.name !== "string" ||
      customerInfo.name.trim() === "" ||
      !customerInfo.email ||
      typeof customerInfo.email !== "string" ||
      customerInfo.email.trim() === "" ||
      !customerInfo.phone ||
      typeof customerInfo.phone !== "string" ||
      customerInfo.phone.trim() === ""
    ) {
      return validationErrorResponse(
        "Faltan campos requeridos en customerInfo: name, email, phone"
      );
    }

    // Crear orden en Conekta
    try {
      // Limpiar formato del teléfono (quitar espacios, guiones, etc.)
      const cleanPhone = customerInfo.phone.replace(/\s|-|\(|\)/g, "");

      const orderData = {
        currency: currency || "MXN",
        customer_info: {
          name: customerInfo.name,
          email: customerInfo.email,
          phone: cleanPhone,
        },
        line_items: [
          {
            name: description || "Reserva de sesión",
            unit_price: Math.round(amount * 100), // Conekta usa centavos
            quantity: 1,
          },
        ],
        charges: [
          {
            payment_method: {
              type: "card",
              token_id: token,
            },
          },
        ],
      };

      // Log solo en desarrollo (no en producción)
      if (process.env.NODE_ENV === "development") {
        console.log("Creando orden en Conekta con:", {
          amount: Math.round(amount * 100),
          currency,
          customerInfo: {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: cleanPhone,
          },
          token: token.substring(0, 20) + "...",
          description,
          orderData: JSON.stringify(orderData, null, 2),
        });
      }

      const orderResponse = await axios.post(
        "https://api.conekta.io/orders",
        orderData,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              CONEKTA_PRIVATE_KEY + ":"
            ).toString("base64")}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.conekta-v2.0.0+json",
          },
        }
      );

      // Verificar que el pago fue exitoso
      const order = orderResponse.data;
      const charge = order.charges?.data?.[0];

      if (!charge || charge.status !== "paid") {
        return errorResponse(
          charge?.failure_message ||
            charge?.failure_code ||
            "El pago no fue procesado correctamente",
          400
        );
      }

      // Retornar éxito con el ID de la orden
      return successResponse({
        orderId: order.id,
        paymentStatus: charge.status,
      });
    } catch (conektaError: unknown) {
      // Log completo del error para debugging
      const axiosError = conektaError as {
        response?: {
          status?: number;
          statusText?: string;
          data?: {
            details?: Array<{ message?: string; debug_message?: string }>;
            message_to_purchaser?: string;
            message?: string;
          };
        };
        message?: string;
        stack?: string;
      };

      console.error("Error completo de Conekta:", {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: JSON.stringify(axiosError.response?.data, null, 2),
        message: axiosError.message,
        stack: axiosError.stack,
      });

      // Extraer mensaje de error de Conekta (múltiples niveles de fallback)
      const errorData = axiosError.response?.data;
      let errorMessage =
        errorData?.details?.[0]?.message ||
        errorData?.details?.[0]?.debug_message ||
        errorData?.message_to_purchaser ||
        errorData?.message ||
        axiosError.message ||
        "Error al procesar el pago con Conekta";

      // Si hay múltiples detalles, incluirlos todos
      if (
        errorData?.details &&
        Array.isArray(errorData.details) &&
        errorData.details.length > 0
      ) {
        const allMessages = errorData.details
          .map(
            (d: { message?: string; debug_message?: string }) =>
              d.message || d.debug_message
          )
          .filter(Boolean)
          .join(", ");
        if (allMessages) {
          errorMessage = allMessages;
        }
      }

      // Traducir errores comunes al español
      if (
        errorMessage.includes("Your code could not be processed") ||
        errorMessage.includes("code could not be processed")
      ) {
        errorMessage =
          "No se pudo procesar tu tarjeta. Por favor verifica los datos e intenta nuevamente.";
      } else if (
        errorMessage.includes("card was declined") ||
        errorMessage.includes("declined")
      ) {
        errorMessage =
          "La tarjeta fue rechazada. Por favor verifica los datos o usa otra tarjeta.";
      } else if (errorMessage.includes("insufficient funds")) {
        errorMessage = "Fondos insuficientes en la tarjeta.";
      } else if (errorMessage.includes("expired")) {
        errorMessage = "La tarjeta ha expirado. Por favor usa otra tarjeta.";
      } else if (
        errorMessage.includes("invalid") ||
        errorMessage.includes("Invalid")
      ) {
        errorMessage =
          "Los datos de la tarjeta no son válidos. Por favor verifica e intenta nuevamente.";
      }

      return errorResponse(errorMessage, 400);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error interno del servidor";
    console.error("Error en API route:", error);
    return errorResponse(errorMessage, 500);
  }
}
