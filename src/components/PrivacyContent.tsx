/**
 * Política de privacidad (compartida en /privacidad).
 * Describe el tratamiento de datos según el sitio actual (Next.js + Supabase + Conekta + Resend).
 */
export default function PrivacyContent() {
  return (
    <div className="space-y-6">
      <p className="text-zinc-700 leading-relaxed">
        En La Casa de Chuy el Rico nos comprometemos a proteger tu información
        personal. Esta política explica qué datos recopilamos al usar nuestro
        sitio de reservas, para qué los usamos y con quién los compartimos cuando
        es necesario para operar el servicio.
      </p>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          1. Responsable del tratamiento
        </h3>
        <p className="text-zinc-700 leading-relaxed">
          El responsable del tratamiento de tus datos personales es{" "}
          <strong>La Casa de Chuy el Rico</strong>, operador del estudio de
          locación fotográfica y del sistema de reservas en línea disponible en{" "}
          <strong>lacasadechuyelrico.com</strong> (y sus subdominios asociados).
        </p>
        <p className="mt-2 text-zinc-700 leading-relaxed">
          Para ejercer tus derechos de privacidad o hacer preguntas sobre esta
          política, puedes escribir a{" "}
          <a
            href="mailto:reservas@lacasadechuyelrico.com"
            className="font-medium text-[#103948] hover:underline"
          >
            reservas@lacasadechuyelrico.com
          </a>
          .
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          2. Navegación sin registro
        </h3>
        <p className="text-zinc-700 leading-relaxed">
          Puedes consultar gran parte del sitio (inicio, galería, ubicación,
          términos) sin proporcionar datos personales. Los datos se solicitan
          cuando realizas una reserva, creas una cuenta o nos contactas en
          relación con una transacción.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          3. Datos que recopilamos
        </h3>
        <p className="mb-2 text-zinc-700">
          Según el servicio que uses, podemos tratar:
        </p>
        <ul className="ml-4 list-disc space-y-2 text-zinc-700">
          <li>
            <strong>Identificación y contacto:</strong> nombre, correo
            electrónico y teléfono.
          </li>
          <li>
            <strong>Reserva:</strong> fecha, horario, tipo de sesión, notas que
            indiques y precio aplicado (incluidos descuentos, códigos o
            referidos).
          </li>
          <li>
            <strong>Cuenta (opcional):</strong> si te registras o inicias
            sesión, datos de autenticación gestionados por nuestro proveedor de
            base de datos.
          </li>
          <li>
            <strong>Pagos:</strong> identificadores de orden y estado del pago
            en Conekta. <strong>No almacenamos</strong> el número completo de tu
            tarjeta ni el CVV; esos datos los captura directamente Conekta en su
            formulario seguro.
          </li>
          <li>
            <strong>Comunicaciones:</strong> confirmaciones, recordatorios o
            avisos relacionados con tu reserva enviados al correo que
            proporciones.
          </li>
          <li>
            <strong>Técnicos:</strong> dirección IP, tipo de navegador y logs
            básicos del servidor necesarios para seguridad y operación del sitio.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          4. Finalidades del tratamiento
        </h3>
        <ul className="ml-4 list-disc space-y-2 text-zinc-700">
          <li>Procesar y administrar tus reservas.</li>
          <li>Cobrar el servicio mediante nuestro procesador de pagos.</li>
          <li>
            Enviarte correos transaccionales (confirmación, cambios,
            cancelaciones o reagendamientos).
          </li>
          <li>
            Permitirte gestionar tu reserva (enlace de invitado o sección de tu
            cuenta).
          </li>
          <li>
            Aplicar programas de lealtad, créditos o códigos promocionales
            cuando correspondan.
          </li>
          <li>Prevenir fraude y abusos en el sistema de pago.</li>
          <li>Cumplir obligaciones legales y resolver disputas.</li>
        </ul>
        <p className="mt-3 text-zinc-700 leading-relaxed">
          No vendemos tu información personal ni la usamos para enviarte
          publicidad no solicitada de terceros.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          5. Proveedores que nos ayudan a operar el sitio
        </h3>
        <p className="mb-2 text-zinc-700 leading-relaxed">
          Compartimos datos solo con proveedores que prestan servicios
          necesarios para el funcionamiento de las reservas y pagos, bajo
          contratos que exigen protección de la información:
        </p>
        <ul className="ml-4 list-disc space-y-2 text-zinc-700">
          <li>
            <strong>Supabase:</strong> alojamiento de base de datos, autenticación
            de cuentas y almacenamiento seguro de la información de reservas.
          </li>
          <li>
            <strong>Conekta:</strong> procesamiento de pagos con tarjeta y
            herramientas antifraude. Conekta y las entidades que respaldan el
            cobro son responsables de la seguridad de los datos bancarios en su
            entorno. La Casa de Chuy el Rico no ve ni guarda los datos completos
            de tu tarjeta.
          </li>
          <li>
            <strong>Resend:</strong> envío de correos electrónicos
            transaccionales desde{" "}
            <span className="whitespace-nowrap">
              reservas@lacasadechuyelrico.com
            </span>
            .
          </li>
        </ul>
        <p className="mt-3 text-zinc-700 leading-relaxed">
          No compartimos tus datos con organizaciones ajenas a la operación del
          servicio, salvo obligación legal o autorización expresa tuya.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          6. Cookies y tecnologías similares
        </h3>
        <p className="mb-2 text-zinc-700 leading-relaxed">
          En la versión actual de este sitio{" "}
          <strong>no utilizamos píxeles de Meta (Facebook)</strong> ni{" "}
          <strong>Google Analytics / Google Ads</strong> para publicidad o
          seguimiento de comportamiento de navegación. Si en el futuro
          incorporamos herramientas de medición o marketing, actualizaremos esta
          política y, cuando la ley lo exija, solicitaremos tu consentimiento.
        </p>
        <p className="mb-2 text-zinc-700 leading-relaxed">
          Sí pueden utilizarse tecnologías estrictamente necesarias para el
          servicio, por ejemplo:
        </p>
        <ul className="ml-4 list-disc space-y-2 text-zinc-700">
          <li>
            Cookies o almacenamiento de sesión de <strong>Supabase</strong> si
            inicias sesión en tu cuenta.
          </li>
          <li>
            Scripts y cookies de <strong>Conekta</strong> (incluido su módulo
            antifraude) al pagar, cargados desde sus servidores para validar la
            transacción de forma segura.
          </li>
        </ul>
        <p className="mt-3 text-zinc-700 leading-relaxed">
          Puedes configurar tu navegador para bloquear cookies; ten en cuenta
          que algunas funciones (inicio de sesión o pago con tarjeta) podrían dejar
          de funcionar correctamente.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          7. Seguridad de los pagos
        </h3>
        <p className="text-zinc-700 leading-relaxed">
          Los pagos en línea se procesan a través de Conekta. La información
          financiera sensible se introduce en los campos seguros de Conekta; nosotros
          recibimos únicamente confirmaciones, montos e identificadores de la
          operación necesarios para registrar tu reserva. Aplicamos medidas
          razonables de seguridad en nuestros sistemas; ningún método de
          transmisión por Internet es 100&nbsp;% infalible.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          8. Conservación de los datos
        </h3>
        <p className="text-zinc-700 leading-relaxed">
          Conservamos tus datos mientras exista una relación activa contigo
          (reservas pendientes o futuras, cuenta abierta) y el tiempo adicional
          que exijan obligaciones fiscales, contables o legales. Después,
          podemos anonimizar o eliminar información que ya no sea necesaria.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          9. Tus derechos
        </h3>
        <p className="mb-2 text-zinc-700 leading-relaxed">
          De acuerdo con la legislación mexicana aplicable en materia de
          protección de datos personales, puedes solicitar acceso, rectificación,
          cancelación u oposición al tratamiento de tus datos, así como revocar
          el consentimiento cuando proceda.
        </p>
        <p className="text-zinc-700 leading-relaxed">
          Envía tu solicitud a{" "}
          <a
            href="mailto:reservas@lacasadechuyelrico.com"
            className="font-medium text-[#103948] hover:underline"
          >
            reservas@lacasadechuyelrico.com
          </a>{" "}
          indicando tu nombre y el correo con el que reservaste. Responderemos en
          los plazos que marque la ley.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-zinc-900">
          10. Cambios a esta política
        </h3>
        <p className="text-zinc-700 leading-relaxed">
          Podemos actualizar esta política para reflejar cambios en el sitio, en
          la ley o en nuestros proveedores. Publicaremos la versión vigente en
          esta página con la fecha de última actualización. El uso continuado del
          sitio después de un cambio implica que has tomado conocimiento de la
          nueva versión, salvo que la ley exija un consentimiento adicional.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Última actualización: mayo de 2026.
        </p>
      </section>
    </div>
  );
}
