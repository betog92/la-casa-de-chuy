import { z } from "zod";

/** Normaliza teléfono: solo dígitos (para guardar y comparar). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const contactNameSchema = z
  .string()
  .trim()
  .min(2, "El nombre debe tener al menos 2 caracteres");

export const contactPhoneSchema = z
  .string()
  .trim()
  .min(10, "El teléfono debe tener al menos 10 dígitos")
  .refine(
    (value) => normalizePhone(value).length >= 10,
    "El teléfono debe tener al menos 10 dígitos",
  );
