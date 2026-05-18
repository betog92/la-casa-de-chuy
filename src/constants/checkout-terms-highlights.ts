/**
 * Resumen de términos mostrado en checkout (modal de pago) y en /terminos.
 * Fuente única para evitar divergencia con el documento completo (TermsContent).
 */

export type CheckoutTermsHighlightPart = {
  text: string;
  strong?: boolean;
};

export type CheckoutTermsHighlightSection = {
  id: string;
  title: string;
  bullets: CheckoutTermsHighlightPart[][];
};

export const CHECKOUT_TERMS_HIGHLIGHTS: CheckoutTermsHighlightSection[] = [
  {
    id: "cancel-reschedule",
    title: "Cancelaciones y reagendamiento",
    bullets: [
      [
        { text: "Puedes " },
        { text: "cancelar", strong: true },
        { text: " desde la sección de tu reserva con al menos " },
        { text: "5 días hábiles", strong: true },
        { text: " de anticipación y recibes el " },
        { text: "80%", strong: true },
        {
          text: " de reembolso. Después de ese plazo o si no te presentas, no aplica reembolso.",
        },
      ],
      [
        { text: "Puedes " },
        { text: "reagendar sin costo", strong: true },
        { text: " desde la misma sección, con al menos " },
        { text: "5 días hábiles", strong: true },
        { text: " de anticipación." },
      ],
    ],
  },
  {
    id: "session-day",
    title: "Día de la sesión",
    bullets: [
      [
        {
          text: "Sesiones permitidas: XV años, bodas y casuales. Boudoir/lencería, familiares y grupales no se permiten.",
        },
      ],
      [
        { text: "Tu sesión incluye " },
        { text: "5 personas", strong: true },
        { text: ". Cada persona extra son " },
        { text: "$200 MXN en efectivo", strong: true },
        { text: " el día de la sesión (máximo 4 adicionales)." },
      ],
      [{ text: "El tiempo perdido por retraso no se recupera." }],
    ],
  },
];
