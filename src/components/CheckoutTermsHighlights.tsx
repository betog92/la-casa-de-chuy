import {
  CHECKOUT_TERMS_HIGHLIGHTS,
  type CheckoutTermsHighlightPart,
} from "@/constants/checkout-terms-highlights";

function renderParts(parts: CheckoutTermsHighlightPart[]) {
  return parts.map((part, i) =>
    part.strong ? (
      <strong key={i}>{part.text}</strong>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

type CheckoutTermsHighlightsProps = {
  /** Clases del contenedor exterior (espaciado entre secciones). */
  className?: string;
  /** Clases de cada `<section>` interna. */
  sectionClassName?: string;
  /** Clases del título de sección (`h3`). */
  headingClassName?: string;
  /** Clases de la lista (`ul`). */
  listClassName?: string;
};

/**
 * Renderiza el resumen corto de términos (compartido por PayTermsConsentModal y /terminos).
 */
export default function CheckoutTermsHighlights({
  className = "space-y-5 text-sm text-zinc-800 sm:text-[0.9375rem]",
  sectionClassName,
  headingClassName = "mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500",
  listClassName = "list-disc space-y-1.5 pl-5",
}: CheckoutTermsHighlightsProps) {
  return (
    <div className={className}>
      {CHECKOUT_TERMS_HIGHLIGHTS.map((section) => (
        <section key={section.id} className={sectionClassName}>
          <h3 className={headingClassName}>{section.title}</h3>
          <ul className={listClassName}>
            {section.bullets.map((parts, bulletIndex) => (
              <li key={bulletIndex}>{renderParts(parts)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
