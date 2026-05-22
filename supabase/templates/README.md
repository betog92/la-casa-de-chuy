# Plantillas de correo — Supabase Auth

Estas plantillas se configuran en el **Dashboard de Supabase**, no en el código de Next.js.

**Ruta:** [Authentication → Email Templates](https://supabase.com/dashboard/project/_/auth/templates) → **Confirm signup**

## Confirm signup (`confirm-signup.html`)

### Asunto recomendado

```
Confirma tu cuenta – La Casa de Chuy el Rico
```

### Preview en Supabase vs correo real

En la pestaña **Preview** del dashboard es normal ver el código de plantilla sin procesar, por ejemplo:

- `{{ if .Data.name }}Hola {{ .Data.name }},{{ else }}Hola,{{ end }}`
- `{{ .Email }}`
- `{{ .ConfirmationURL }}`

Supabase **no simula** un usuario de prueba ahí; solo muestra el HTML. Al **enviar** el correo (registro real o reenvío de verificación), esas variables se sustituyen por el nombre, el correo y el enlace reales.

Para validar UX: haz un registro de prueba y revisa el correo en Gmail/Outlook.

### Cómo aplicar

1. Abre el template **Confirm signup** en Supabase.
2. Pega el contenido de `confirm-signup.html` en el campo **Body (HTML)**.
3. Pulsa **Save changes** (sin esto no se aplica nada).
4. Genera un correo **nuevo** (ver abajo). Revisar un mail viejo de la bandeja no sirve.

### Guardé en Supabase pero sigue el correo viejo («¡Bienvenido!»)

Supabase **no usa tu HTML** si la plantilla tiene un error de sintaxis: envía la plantilla **por defecto** (la que ves como “pasada”).

**Causa frecuente en esta plantilla:** poner `{{` y `}}` dentro de comentarios HTML (`<!-- ... {{ }} ... -->`). El motor de plantillas los interpreta y falla.

**Qué hacer:**

1. **Authentication → Logs** (o Auth Logs): busca al reenviar/registrar un evento como `templatemailer_template_body_parse_error`. Si aparece, la plantilla guardada tiene error.
2. Vuelve a pegar el contenido actual de `confirm-signup.html` (ya sin comentarios con llaves).
3. Guarda en la pestaña **Source** (no solo Preview) → **Save changes**.
4. Confirma que el proyecto del dashboard coincide con `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` (mismo `xxxxx` en `https://xxxxx.supabase.co`).
5. Registro con email **nuevo** o borrar usuario en Auth → Users y repetir.

Si el asunto nuevo es «Confirma tu cuenta – La Casa de Chuy el Rico» pero el cuerpo sigue con «¡Bienvenido!», es casi seguro **fallback por error de plantilla**, no caché de Gmail.

### Probé en local y no se actualizó

`npm run dev` **no lee** `supabase/templates/confirm-signup.html`. El correo lo envía **Supabase** con la plantilla guardada en el **Dashboard** del proyecto al que apunta tu `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
```

Checklist:

| Paso | Qué verificar |
|------|----------------|
| 1 | En Supabase Dashboard, el proyecto es el **mismo** que el `ref` de esa URL (`xxxxx`). |
| 2 | Tras pegar el HTML, hiciste clic en **Save changes** (verde). |
| 3 | Disparaste un correo **nuevo**: registro con **otro email** o borrar usuario en Auth → Users y volver a registrar. |
| 4 | No reutilizas el hilo viejo en Gmail; abre el **último** «Confirma tu cuenta». |
| 5 | Si usas **Resend** u otro SMTP en Supabase → Settings → Auth, la plantilla sigue siendo la de Email Templates; confirma que guardaste ahí. |

**Reenviar verificación** desde `/auth/verify-email` también usa la plantilla actual, pero solo después de guardar en el dashboard.

Este repo **no** incluye `supabase/config.toml` (Supabase local con Inbucket). Si en el futuro usas `supabase start`, haría falta otra configuración; hoy el flujo es proyecto **hosted** + plantilla en la web de Supabase.

### Mejoras de UX respecto a la plantilla anterior

| Aspecto | Cambio |
|--------|--------|
| Centrado en Gmail | Layout con tablas `align="center"` (evita la tarjeta desplazada a la derecha) |
| Jerarquía | Título orientado a acción: «Confirma tu correo» + subtítulo breve |
| Personalización | Saludo con `{{ .Data.name }}` (metadata del registro en la app) |
| Claridad | Muestra el correo que se confirma (`{{ .Email }}`) |
| CTA | Botón más grande, ancho cómodo en móvil |
| Confianza | Bloque «Después de confirmar podrás…» (beneficios concretos) |
| Resiliencia | Enlace de respaldo si el botón falla |
| Bandeja | Preheader oculto para vista previa útil |
| Marca | Misma paleta `#103948` que los correos de reserva (`src/lib/email.ts`) |

### Variables de Supabase usadas

- `{{ .ConfirmationURL }}` — enlace de confirmación
- `{{ .Email }}` — correo del usuario
- `{{ .SiteURL }}` — URL del sitio (configuración Auth)
- `{{ .Data.name }}` — nombre enviado en `signUp` → `options.data.name`

Si el saludo no muestra el nombre, revisa que el registro siga enviando `name` en metadata (`buildSignUpMetadata` en `src/lib/auth/sign-up-contact.ts`).

### Remitente

Los correos de **Auth** usan la configuración SMTP / plantillas de Supabase. Los de **reservas** salen por Resend (`reservas@lacasadechuyelrico.com`). Para que el remitente de confirmación coincida, configura **Custom SMTP** en Supabase con el mismo dominio verificado en Resend, o el proveedor que uses.
