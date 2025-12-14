"use client";

import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import type {
  ConektaTokenResponse,
  ConektaErrorResponse,
} from "@/types/conekta";

/**
 * Componente de formulario de pago con Conekta
 *
 * NOTA: La función conekta_antifraud_config_jsonp se define en layout.tsx
 * antes de cargar el script de Conekta para evitar warnings en consola.
 */

interface ConektaPaymentFormProps {
  onError?: (error: string) => void;
  disabled?: boolean;
}

export interface ConektaPaymentFormRef {
  createToken: () => Promise<string | null>;
}

const ConektaPaymentForm = forwardRef<
  ConektaPaymentFormRef,
  ConektaPaymentFormProps
>(({ onError, disabled = false }, ref) => {
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const scriptLoaded = useRef(false);

  // Cargar script de Conekta
  useEffect(() => {
    if (scriptLoaded.current || typeof window === "undefined") return;

    const publicKey = process.env.NEXT_PUBLIC_CONEKTA_PUBLIC_KEY;
    if (!publicKey) {
      const errorMsg =
        "Conekta Public Key no configurada. Revisa tus variables de entorno.";
      if (onError) onError(errorMsg);
      return;
    }

    // El script de Conekta se carga en layout.tsx con strategy="beforeInteractive"
    // Solo necesitamos verificar si está disponible y configurar la public key
    if (window.Conekta) {
      scriptLoaded.current = true;
      window.Conekta.setPublicKey(publicKey);
      return;
    }

    // Si el script no está cargado aún, esperar a que se cargue
    // (el script se carga en layout.tsx con strategy="beforeInteractive")
    const checkConektaLoaded = setInterval(() => {
      if (window.Conekta) {
        clearInterval(checkConektaLoaded);
        scriptLoaded.current = true;
        window.Conekta.setPublicKey(publicKey);
      }
    }, 50);

    // Timeout después de 5 segundos si no se carga
    const timeoutId = setTimeout(() => {
      clearInterval(checkConektaLoaded);
      if (!window.Conekta) {
        if (onError) {
          onError(
            "Error: No se pudo cargar el script de Conekta. Por favor recarga la página."
          );
        }
      }
    }, 5000);

    return () => {
      clearInterval(checkConektaLoaded);
      clearTimeout(timeoutId);
    };
  }, [onError]);

  // Validar formato de tarjeta
  const validateCardNumber = (value: string): boolean => {
    const cleaned = value.replace(/\s/g, "");
    return /^\d{13,19}$/.test(cleaned);
  };

  // Validar formato de fecha (MM/YY)
  const validateExpiry = (value: string): boolean => {
    const match = value.match(/^(\d{2})\/(\d{2})$/);
    if (!match) return false;
    const month = parseInt(match[1], 10); // 1-12 (formato humano)
    const year = parseInt("20" + match[2], 10);
    const now = new Date();
    // new Date(year, month, 0) obtiene el último día del mes anterior al mes especificado
    // Si month = 12 (diciembre), new Date(2025, 12, 0) = último día de diciembre 2025
    const expiryDate = new Date(year, month, 0);
    return month >= 1 && month <= 12 && expiryDate >= now;
  };

  // Validar CVV
  const validateCvc = (value: string): boolean => {
    return /^\d{3,4}$/.test(value);
  };

  // Formatear número de tarjeta con espacios
  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\s/g, "");
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(" ") : cleaned;
  };

  // Formatear fecha de expiración (MM/YY)
  const formatExpiry = (value: string): string => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + "/" + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  // Crear token de tarjeta
  const createToken = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!window.Conekta) {
        reject(
          new Error("Conekta no está disponible. Por favor recarga la página.")
        );
        return;
      }

      const cardNumberClean = cardNumber.replace(/\s/g, "");
      const expiryParts = cardExpiry.split("/");

      if (expiryParts.length !== 2 || !expiryParts[0] || !expiryParts[1]) {
        reject(
          new Error(
            "La fecha de expiración no es válida. Usa el formato MM/YY."
          )
        );
        return;
      }

      const expMonth = expiryParts[0].padStart(2, "0");
      const expYear = expiryParts[1].padStart(2, "0");

      // Validar que el mes esté entre 01 y 12
      const monthNum = parseInt(expMonth, 10);
      if (monthNum < 1 || monthNum > 12) {
        reject(new Error("El mes de expiración debe estar entre 01 y 12."));
        return;
      }

      window.Conekta.Token.create(
        {
          card: {
            number: cardNumberClean,
            name: cardName,
            exp_month: expMonth,
            exp_year: expYear, // Conekta espera año de 2 dígitos (ej: "25" para 2025)
            cvc: cardCvc,
          },
        },
        (response: ConektaTokenResponse) => {
          if (response.id) {
            resolve(response.id);
          } else {
            const errorMsg =
              "Error al crear token de tarjeta. Verifica los datos e intenta nuevamente.";
            reject(new Error(errorMsg));
          }
        },
        (error: ConektaErrorResponse) => {
          // Traducir errores comunes de Conekta al español
          let errorMessage =
            error.message_to_purchaser ||
            error.message ||
            "Error al procesar la tarjeta";

          // Traducir mensajes comunes
          if (errorMessage.includes("Your code could not be processed")) {
            errorMessage =
              "No se pudo procesar el código. Por favor verifica los datos de tu tarjeta e intenta nuevamente.";
          } else if (errorMessage.includes("The card was declined")) {
            errorMessage =
              "La tarjeta fue rechazada. Por favor verifica los datos o usa otra tarjeta.";
          } else if (errorMessage.includes("insufficient funds")) {
            errorMessage = "Fondos insuficientes en la tarjeta.";
          } else if (errorMessage.includes("expired")) {
            errorMessage =
              "La tarjeta ha expirado. Por favor usa otra tarjeta.";
          } else if (errorMessage.includes("invalid")) {
            errorMessage =
              "Los datos de la tarjeta no son válidos. Por favor verifica e intenta nuevamente.";
          }

          reject(new Error(errorMessage));
        }
      );
    });
  }, [cardNumber, cardName, cardExpiry, cardCvc]);

  // Manejar cambio en número de tarjeta
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const formatted = formatCardNumber(value.slice(0, 19));
    setCardNumber(formatted);
    if (errors.cardNumber) {
      setErrors((prev) => ({ ...prev, cardNumber: "" }));
    }
  };

  // Manejar cambio en fecha de expiración
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const formatted = formatExpiry(value.slice(0, 5));
    setCardExpiry(formatted);
    if (errors.cardExpiry) {
      setErrors((prev) => ({ ...prev, cardExpiry: "" }));
    }
  };

  // Manejar cambio en CVV
  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCardCvc(value);
    if (errors.cardCvc) {
      setErrors((prev) => ({ ...prev, cardCvc: "" }));
    }
  };

  // Función pública para crear token (llamada desde el componente padre)
  const handleCreateToken = useCallback(async (): Promise<string | null> => {
    // Validar formulario
    const newErrors: Record<string, string> = {};
    if (!cardName.trim()) {
      newErrors.cardName = "El nombre en la tarjeta es requerido";
    }
    if (!validateCardNumber(cardNumber)) {
      newErrors.cardNumber = "Número de tarjeta inválido";
    }
    if (!validateExpiry(cardExpiry)) {
      newErrors.cardExpiry = "Fecha de expiración inválida";
    }
    if (!validateCvc(cardCvc)) {
      newErrors.cardCvc = "CVV inválido";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const errorMsg = "Por favor corrige los errores en el formulario de pago";
      if (onError) {
        onError(errorMsg);
      } else {
        setErrors((prev) => ({ ...prev, general: errorMsg }));
      }
      return null;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const token = await createToken();
      return token;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Error al procesar la tarjeta";
      if (onError) {
        onError(errorMessage);
      } else {
        setErrors({ general: errorMessage });
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [cardNumber, cardName, cardExpiry, cardCvc, onError, createToken]);

  // Exponer función a través de ref
  useImperativeHandle(
    ref,
    () => ({
      createToken: handleCreateToken,
    }),
    [handleCreateToken]
  );

  return (
    <div className="space-y-4">
      {/* Nombre en la tarjeta */}
      <div>
        <label
          htmlFor="cardName"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          Nombre en la tarjeta *
        </label>
        <input
          id="cardName"
          type="text"
          value={cardName}
          onChange={(e) => {
            setCardName(e.target.value);
            if (errors.cardName) {
              setErrors((prev) => ({ ...prev, cardName: "" }));
            }
          }}
          disabled={disabled || isLoading}
          placeholder="Juan Pérez"
          className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:cursor-not-allowed"
        />
        {errors.cardName && (
          <p className="mt-1 text-sm text-red-600">{errors.cardName}</p>
        )}
      </div>

      {/* Número de tarjeta */}
      <div>
        <label
          htmlFor="cardNumber"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          Número de tarjeta *
        </label>
        <input
          id="cardNumber"
          type="text"
          value={cardNumber}
          onChange={handleCardNumberChange}
          disabled={disabled || isLoading}
          placeholder="4242 4242 4242 4242"
          maxLength={19}
          className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:cursor-not-allowed"
        />
        {errors.cardNumber && (
          <p className="mt-1 text-sm text-red-600">{errors.cardNumber}</p>
        )}
      </div>

      {/* Fecha de expiración y CVV */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="cardExpiry"
            className="mb-2 block text-sm font-medium text-zinc-700"
          >
            Fecha de expiración (MM/YY) *
          </label>
          <input
            id="cardExpiry"
            type="text"
            value={cardExpiry}
            onChange={handleExpiryChange}
            disabled={disabled || isLoading}
            placeholder="12/25"
            maxLength={5}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:cursor-not-allowed"
          />
          {errors.cardExpiry && (
            <p className="mt-1 text-sm text-red-600">{errors.cardExpiry}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="cardCvc"
            className="mb-2 block text-sm font-medium text-zinc-700"
          >
            CVV *
          </label>
          <input
            id="cardCvc"
            type="text"
            value={cardCvc}
            onChange={handleCvcChange}
            disabled={disabled || isLoading}
            placeholder="123"
            maxLength={4}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:cursor-not-allowed"
          />
          {errors.cardCvc && (
            <p className="mt-1 text-sm text-red-600">{errors.cardCvc}</p>
          )}
        </div>
      </div>

      {/* Error general - Solo mostrar si NO hay callback onError (para evitar duplicación) */}
      {errors.general && !onError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errors.general}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center text-sm text-zinc-600">
          Procesando tarjeta...
        </div>
      )}
    </div>
  );
});

ConektaPaymentForm.displayName = "ConektaPaymentForm";

export default ConektaPaymentForm;
