"use client";

import { useEffect } from "react";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsModal({ isOpen, onClose }: TermsModalProps) {
  // Cerrar modal con ESC y prevenir scroll del body
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevenir scroll del body cuando el modal está abierto
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
          aria-label="Cerrar"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Contenido del modal */}
        <div className="pr-8">
          <h2 className="mb-6 text-3xl font-bold text-zinc-900">
            Términos y Condiciones
          </h2>

          <div className="space-y-6 text-zinc-700">
            {/* 1. Horario y Puntualidad */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                1. Horario y Puntualidad
              </h3>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  Si utilizarás el vestidor, te recomendamos llegar 25 minutos
                  antes de tu cita.
                </li>
                <li>El tiempo perdido por retraso no puede recuperarse.</li>
                <li>
                  Puedes reagendar sin costo con mínimo 5 días hábiles de
                  anticipación.
                </li>
                <li>
                  Si no te presentas a tu cita, el pago realizado no es
                  reembolsable.
                </li>
              </ul>
            </section>

            {/* 2. Acceso al Vestidor */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                2. Acceso al Vestidor (Sesiones de XV Años)
              </h3>
              <p className="mb-2">
                Para mantener un espacio cómodo y funcional:
              </p>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  Puede ingresar la quinceañera y dos mujeres adultas de su
                  elección.
                </li>
                <li>
                  Por seguridad, no se permite el acceso de niños al vestidor.
                </li>
                <li>
                  Evita usar sprays, planchas, secadoras o maquillaje dentro del
                  vestidor. (Puedes utilizarlos solo en las áreas designadas.)
                </li>
              </ul>
            </section>

            {/* 3. Personas Permitidas */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                3. Personas Permitidas por Sesión
              </h3>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  Tu sesión incluye el acceso para hasta 5 personas (incluyendo
                  a la quinceañera).
                </li>
                <li>
                  Puedes agregar hasta 4 personas adicionales con un costo de
                  $200 MXN por persona.
                </li>
                <li>Este pago se realiza en efectivo el día de la sesión.</li>
              </ul>
            </section>

            {/* 4. Tipos de Sesiones */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                4. Tipos de Sesiones Permitidas
              </h3>
              <div className="ml-4 space-y-2">
                <div>
                  <strong className="text-zinc-900">✔ Permitidas</strong>
                  <ul className="ml-4 mt-1 space-y-1 list-disc">
                    <li>XV años</li>
                    <li>Bodas</li>
                    <li>Sesiones casuales</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-zinc-900">✘ No permitidas</strong>
                  <ul className="ml-4 mt-1 space-y-1 list-disc">
                    <li>Boudoir o lencería</li>
                    <li>Sesiones familiares</li>
                    <li>Sesiones grupales</li>
                    <li>Cualquier otra no autorizada previamente</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 5. Normas dentro de la Locación */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                5. Normas dentro de la Locación
              </h3>
              <p className="mb-2">
                Para conservar la locación en óptimo estado:
              </p>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  Te pedimos no mover, arrastrar o reubicar muebles, flores,
                  escaleras o elementos decorativos.
                </li>
                <li>Solo puedes ingresar botellas de agua.</li>
                <li>
                  Por limpieza y seguridad, no se permite el consumo de
                  alimentos ni otras bebidas.
                </li>
              </ul>
            </section>

            {/* 6. Objetos Personales */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                6. Objetos Personales
              </h3>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  No nos hacemos responsables por objetos perdidos, olvidados o
                  dañados en cualquier área de la locación.
                </li>
                <li>
                  Te recomendamos mantener tus pertenencias siempre contigo.
                </li>
              </ul>
            </section>

            {/* 7. Decoración */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                7. Decoración y Ambientación
              </h3>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  La decoración de la locación —incluyendo muebles, flores,
                  escaleras y accesorios— puede cambiar sin previo aviso.
                </li>
                <li>
                  Si el día de tu sesión la ambientación es distinta a lo que
                  viste anteriormente, se utilizará tal como esté montada ese
                  día, sin modificaciones o adaptaciones.
                </li>
              </ul>
            </section>

            {/* 8. Cancelaciones */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                8. Cancelaciones y Reembolsos
              </h3>
              <ul className="ml-4 space-y-2 list-disc">
                <li>
                  Puedes cancelar tu sesión con mínimo 5 días hábiles de
                  anticipación y recibir un reembolso del 80%.
                </li>
                <li>
                  Cancelaciones fuera de ese periodo, o la inasistencia, no
                  generan reembolso.
                </li>
              </ul>
            </section>

            {/* 9. Días Festivos */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                SECCIÓN ESPECIAL · Días Festivos
              </h3>
              <h4 className="mb-2 text-lg font-semibold text-zinc-900">
                9. Días Festivos
              </h4>
              <p className="mb-2">
                En días festivos se aplica un cargo adicional de $500 MXN, el
                cual se cubre en efectivo antes de iniciar la sesión.
              </p>
              <p className="mb-2">
                Se consideran días festivos tanto las fechas oficiales como días
                de alta demanda.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <strong className="text-zinc-900">
                    Días Festivos Oficiales – 2026
                  </strong>
                  <ul className="ml-4 mt-1 space-y-1 list-disc">
                    <li>1 de enero – Año Nuevo</li>
                    <li>Lunes 2 de febrero – Constitución</li>
                    <li>Lunes 16 de marzo – Natalicio de Benito Juárez</li>
                    <li>1 de mayo – Día del Trabajo</li>
                    <li>16 de septiembre – Independencia</li>
                    <li>Lunes 16 de noviembre – Revolución Mexicana</li>
                    <li>25 de diciembre – Navidad</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-zinc-900">
                    Días Especiales de Alta Demanda – 2026
                  </strong>
                  <ul className="ml-4 mt-1 space-y-1 list-disc">
                    <li>2 y 3 de abril – Jueves y Viernes Santo</li>
                    <li>10 de mayo – Día de las Madres</li>
                    <li>12 de diciembre – Día de la Virgen de Guadalupe</li>
                    <li>24 de diciembre – Nochebuena</li>
                    <li>31 de diciembre – Fin de Año</li>
                  </ul>
                </div>

                <p className="mt-3 italic text-zinc-600">
                  <strong>Aclaración sobre días recorridos:</strong> Cuando un
                  día festivo oficial se recorre al lunes, el cargo aplica en la
                  fecha recorrida, es decir, el día de descanso oficial.
                </p>
              </div>
            </section>

            {/* 10. Consideraciones Finales */}
            <section>
              <h3 className="mb-3 text-xl font-semibold text-zinc-900">
                10. Consideraciones Finales
              </h3>
              <p className="mb-2">
                En ocasiones pueden presentarse situaciones externas que están
                fuera de nuestro control, como interrupciones temporales de
                servicios públicos o condiciones climáticas que afecten el flujo
                normal del día.
              </p>
              <p className="mb-2">
                En caso de que ocurra algo así, nuestro equipo tomará decisiones
                en el momento con el objetivo de:
              </p>
              <ul className="ml-4 mb-2 space-y-1 list-disc">
                <li>Cuidar tu seguridad y comodidad</li>
                <li>Proteger la locación y el equipo de trabajo</li>
                <li>
                  Mantener, dentro de lo posible, la continuidad del servicio
                </li>
              </ul>
              <p className="mb-2">Según la situación, podremos:</p>
              <ul className="ml-4 space-y-1 list-disc">
                <li>Reubicar la sesión en áreas interiores</li>
                <li>Reprogramar únicamente si es estrictamente necesario</li>
              </ul>
              <p className="mt-3">
                Estos casos son poco comunes, pero agradecemos la comprensión y
                flexibilidad en caso de que llegaran a presentarse. Si necesitas
                apoyo o tienes alguna duda, estamos aquí para ayudarte.
              </p>
            </section>
          </div>

          {/* Botón cerrar abajo */}
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-zinc-900 px-6 py-2 text-white transition-colors hover:bg-zinc-800"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
