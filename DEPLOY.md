# Guía de Despliegue en Vercel

## Pasos para Desplegar el Proyecto

### 1. Crear/Acceder a Cuenta de Vercel

1. Ve a [https://vercel.com](https://vercel.com)
2. Inicia sesión con tu cuenta de GitHub (o crea una cuenta si no tienes)
3. Autoriza a Vercel para acceder a tus repositorios de GitHub

### 2. Importar Proyecto

1. En el dashboard de Vercel, haz clic en **"Add New Project"** o **"Import Project"**
2. Selecciona el repositorio: `betog92/la-casa-de-chuy`
3. Vercel detectará automáticamente que es un proyecto Next.js

### 3. Configurar Variables de Entorno

**IMPORTANTE:** Antes de hacer el deploy, configura todas las variables de entorno en Vercel.

En la sección **"Environment Variables"** del proyecto, agrega las siguientes:

#### Variables de Supabase (usar las mismas de desarrollo):
```
NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_supabase
```

#### Variables de Conekta (modo prueba/sandbox):
```
NEXT_PUBLIC_CONEKTA_PUBLIC_KEY=tu_public_key_conekta_prueba
CONEKTA_PRIVATE_KEY=tu_private_key_conekta_prueba
CONEKTA_WEBHOOK_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----
```

**`CONEKTA_WEBHOOK_PUBLIC_KEY`:** Conekta firma cada notificación con su
llave privada RSA y nosotros verificamos con la pública (header `Digest`,
RSA-SHA256, base64). La generas en el dashboard de Conekta (**Webhooks >
Genera tu llave para descifrar las firmas**) o vía
`POST https://api.conekta.io/webhook_keys`. Pega la PEM completa
(`-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----`) en una sola línea
o con `\n` literales; el código la normaliza. Si la variable no está
configurada, `/api/conekta/webhook` rechaza todas las peticiones (fail-closed).

**URL del webhook:** `https://[tu-dominio]/api/conekta/webhook`. Suscríbelo a
los eventos: `order.paid`, `charge.created`, `charge.paid`, `charge.refunded`,
`charge.chargeback.created`, `charge.chargeback.updated`,
`charge.chargeback.lost`, `order.expired`, `order.canceled`.

#### Variable de alertas a admin:
```
ADMIN_ALERT_EMAIL=email_destino_alertas_de_pago
```

**`ADMIN_ALERT_EMAIL`:** dirección a la que llegan alertas de pagos huérfanos
auto-reembolsados, refunds hechos desde el dashboard de Conekta y
chargebacks. Si no se configura, las alertas se loguean pero no se envían.

#### Variable del cron job:
```
CRON_SECRET=secreto_para_proteger_endpoints_de_cron
```

Vercel envía este valor en `Authorization: Bearer ...` para los crons
configurados en `vercel.json`. El cron externo de huérfanos (cron-job.org;
ver sección 7.bis) usa el mismo header. Sin él, los endpoints `/api/cron/*`
rechazan las llamadas.
Generalo con `openssl rand -base64 32`.

#### Variable de Autenticación:
```
GUEST_TOKEN_SECRET=tu_clave_secreta_guest_token
```

#### Variable de URL de la Aplicación:
```
NEXT_PUBLIC_APP_URL=https://temporal.lacasadechuyelrico.com
```

**Nota:** Si aún no has configurado el dominio personalizado, usa temporalmente la URL de Vercel: `https://[nombre-proyecto].vercel.app`. Actualiza esta variable después de configurar el dominio personalizado.

**Nota:** Si no tienes `GUEST_TOKEN_SECRET`, puedes generarlo con:
```bash
openssl rand -base64 32
```

### 4. Configuración del Proyecto

Vercel debería detectar automáticamente:
- **Framework Preset:** Next.js
- **Root Directory:** `./` (raíz)
- **Build Command:** `npm run build` (automático)
- **Output Directory:** `.next` (automático)
- **Install Command:** `npm install` (automático)

No necesitas cambiar nada, solo verifica que esté correcto.

### 5. Realizar el Deploy

1. Haz clic en **"Deploy"**
2. Espera a que termine el build (2-5 minutos)
3. Si hay errores, revisa los logs en el dashboard de Vercel

### 6. Verificar el Deploy

Una vez completado el deploy:

1. **URL de producción:** `https://[nombre-proyecto].vercel.app`
2. **Verifica que:**
   - La página principal carga correctamente
   - El calendario de reservas funciona
   - La autenticación funciona
   - Los formularios funcionan

### 7. Configuración Post-Deploy

#### Verificar Variables de Entorno:
- Ve a: **Settings > Environment Variables**
- Verifica que todas las variables estén configuradas
- Asegúrate de que estén marcadas para **Production**, **Preview**, y **Development**

#### Configurar Dominio Personalizado:

Para usar el subdominio `temporal.lacasadechuyelrico.com`:

**Paso 1: Configurar DNS en Shopify**

1. Inicia sesión en tu cuenta de Shopify
2. Ve a **Settings > Domains** (o **Configuración > Dominios**)
3. Selecciona tu dominio `lacasadechuyelrico.com`
4. Busca la sección de **DNS Settings** o **Configuración DNS**
5. Haz clic en **"Manage DNS records"** o **"Gestionar registros DNS"**
6. Agrega un nuevo registro DNS:
   - **Tipo:** `CNAME`
   - **Nombre/Host:** `temporal`
   - **Valor/Destino:** `cname.vercel-dns.com.` (incluye el punto al final)
   - **TTL:** Dejar por defecto o `3600`
7. Guarda los cambios

**Nota:** Los cambios DNS pueden tardar entre 5 minutos y 48 horas en propagarse, aunque normalmente es entre 5-30 minutos.

**Paso 2: Agregar Dominio en Vercel**

1. En el dashboard de Vercel, ve a tu proyecto
2. Ve a **Settings > Domains**
3. Haz clic en **"Add Domain"** o **"Agregar Dominio"**
4. Ingresa: `temporal.lacasadechuyelrico.com`
5. Haz clic en **"Add"**
6. Vercel verificará automáticamente el registro DNS
7. Una vez verificado, Vercel configurará automáticamente el certificado SSL (HTTPS)

**Paso 3: Actualizar Variable de Entorno**

Una vez que el dominio esté configurado y funcionando:

1. Ve a **Settings > Environment Variables** en Vercel
2. Busca o agrega la variable: `NEXT_PUBLIC_APP_URL`
3. Establece el valor: `https://temporal.lacasadechuyelrico.com`
4. Asegúrate de que esté marcada para **Production**, **Preview**, y **Development**
5. Guarda los cambios
6. **Importante:** Después de actualizar esta variable, haz un nuevo deployment (o espera al siguiente push automático)

**Verificación:**

- Visita `https://temporal.lacasadechuyelrico.com` para confirmar que funciona
- Verifica que el certificado SSL esté activo (debería mostrar el candado verde)
- Prueba que las funcionalidades de la app funcionen correctamente con el nuevo dominio

### 7.bis Cron de pagos huérfanos (cada 5 min) con cron-job.org

El plan **Hobby de Vercel sólo permite crons diarios**, así que el job
`refund-orphan-payments` (cada ~5 min) se dispara desde **cron-job.org** (o
cualquier servicio similar) con un `POST` a tu dominio de producción.

**Qué hace el endpoint:** detecta reservas en `pending_payment` demasiado
antiguas sin reserva consumida y las reembolsa en Conekta. Debe llamarse con
el mismo `Authorization: Bearer <CRON_SECRET>` que usaría Vercel en un cron
nativo.

**Configuración en cron-job.org (resumen):**

1. Crea una cuenta en [cron-job.org](https://cron-job.org) y un **cron job** nuevo.
2. **URL:** `https://<tu-dominio-prod>/api/cron/refund-orphan-payments`
3. **Método:** POST.
4. **Cabecera:** `Authorization` = `Bearer <CRON_SECRET>` (el mismo valor que
   `CRON_SECRET` en Vercel; sin comillas en el valor del header).
5. **Programación:** cada 5 minutos (o el intervalo que elijas; el código es
   idempotente).
6. Activa las **notificaciones de fallo** del job (email) para enterarte si
   el `POST` devuelve 4xx/5xx o no responde.

**Heartbeat y alerta por correo (opcional pero recomendado):**

- Aplica la migración `sql/45-migration-cron-job-heartbeats.sql` en Supabase
  (en instalaciones nuevas desde cero, la tabla también está en
  `sql/01-schema.sql` y el RLS en `sql/03-security.sql`). Si ya habías
  aplicado la 45 antes de existir el `INSERT` de semilla, ejecuta además
  `sql/46-migration-cron-job-heartbeat-bootstrap.sql` (idempotente).
- Tras cada corrida **exitosa** del cron, la app guarda `last_success_at` en
  `cron_job_heartbeats`.
- Tras un **webhook válido** de Conekta procesado con éxito, la app programa
  (con `after()` de Next.js) una comprobación: si `last_success_at` tiene más
  de **30 minutos** de antigüedad, reclama en BD el envío de alerta (un
  `UPDATE` atómico, máximo **una vez cada 24 h**) y correo al admin con tipo
  `orphan_cron_stale_heartbeat`. Así detectas el scheduler caído sin depender
  solo del proveedor del cron.

**Si algún día migras a Vercel Pro** y prefieres el cron en Vercel, agrega en
`vercel.json`:

```json
{ "path": "/api/cron/refund-orphan-payments", "schedule": "*/5 * * * *" }
```

y desactiva o borra el job en cron-job.org para no duplicar llamadas.

**Nota de frecuencia vs. `ORPHAN_TIMEOUT_MIN`:** si alargas mucho el intervalo
del scheduler (por ejemplo cada 30 min), revisa que `ORPHAN_TIMEOUT_MIN` en
`src/app/api/cron/refund-orphan-payments/route.ts` siga siendo coherente con
cuánto quieres esperar antes de reembolsar automáticamente.

### 8. Testing en Producción

Prueba las siguientes funcionalidades:

1. **Autenticación:**
   - Registro de usuarios
   - Login
   - Recuperación de contraseña

2. **Reservas:**
   - Selección de fecha y hora
   - Cálculo de precios
   - Formulario de reserva
   - Proceso de pago (modo prueba de Conekta)
   - Confirmación de reserva

3. **Gestión:**
   - Ver reservas en cuenta
   - Reagendamiento
   - Cancelación

### 9. Monitoreo

- **Logs:** Ve a **Deployments > [último deploy] > Logs** para ver logs en tiempo real
- **Analytics:** Vercel proporciona analytics básicos en el dashboard
- **Errores:** Los errores aparecen en los logs del deployment

## Troubleshooting

### Error: "Environment variable not found"
- Verifica que todas las variables estén configuradas en Vercel
- Asegúrate de que estén marcadas para el entorno correcto (Production/Preview)

### Error: "Build failed"
- Revisa los logs del build en Vercel
- Verifica que `npm run build` funcione localmente
- Asegúrate de que todas las dependencias estén en `package.json`

### Error: "Supabase connection failed"
- Verifica que las URLs y keys de Supabase sean correctas
- Asegúrate de que el proyecto de Supabase esté activo

### Error: "Conekta error"
- Verifica que las keys de Conekta sean del modo correcto (prueba/producción)
- Revisa que las keys no tengan espacios extra

### Webhook de Conekta devuelve 401 "Invalid signature"
- Verifica que `CONEKTA_WEBHOOK_PUBLIC_KEY` esté configurado en Vercel.
- La PEM debe ser la **public key** que devolvió Conekta al crear la webhook
  key (empieza con `-----BEGIN PUBLIC KEY-----`). No es un secreto compartido
  ni la API key, es la llave pública RSA de la firma.
- Conekta puede mandar la firma como `Digest`, `X-Conekta-Signature` o
  `Conekta-Signature`. El endpoint los acepta todos automáticamente.

### Webhook de Conekta no procesa eventos antiguos
- La tabla `conekta_webhook_events` deduplica por `event_id`. Si un evento
  ya tiene status `processed`, no se reprocesa. Para forzar, actualiza el
  status manualmente desde Supabase y dispara un reintento desde el
  dashboard de Conekta.

### Cron `refund-orphan-payments` no corre
- Por defecto se dispara desde **cron-job.org** (no en Vercel) cada ~5 min
  para no requerir plan Pro de Vercel. Ver sección 7.bis.
- Revisa en cron-job.org el historial de ejecuciones y las notificaciones de
  fallo del job.
- Confirma que la URL sea HTTPS de producción y que el header
  `Authorization: Bearer …` use el mismo `CRON_SECRET` que en Vercel.
- Si el endpoint devuelve 401, es problema de secret. Si devuelve 500,
  revisa los logs de la función en Vercel.
- Si aplicaste las migraciones 45/46 y recibes el correo
  «Cron de huérfanos sin señal de vida», el scheduler o el deploy dejaron de
  actualizar el heartbeat; revisa cron-job.org y los logs del endpoint.
- Para diagnosticar manualmente:
  ```bash
  curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
    "https://<tu-dominio>/api/cron/refund-orphan-payments"
  ```

### El cron y el webhook procesan el mismo pago al mismo tiempo
- Aplicar la migración `sql/43-migration-pending-refund-in-progress.sql`
  en Supabase. Agrega el estado `refund_in_progress` al CHECK constraint
  de `pending_reservations` y permite el "claim atómico" del cron antes
  de reembolsar (evita reservar y reembolsar simultáneamente).
- Si la migración 41 ya está aplicada con el CHECK viejo, la 43 lo
  recrea. Es idempotente.

## URLs Importantes

- **Dashboard de Vercel:** https://vercel.com/dashboard
- **Dashboard de Supabase:** https://app.supabase.com
- **Dashboard de Conekta:** https://admin.conekta.com
- **Aplicación en Producción:** https://temporal.lacasadechuyelrico.com (una vez configurado el dominio)

## Notas

- Los deployments son automáticos con cada push a la rama `master`
- Puedes crear preview deployments para otras ramas
- Los logs están disponibles en tiempo real en el dashboard de Vercel
- El plan **Hobby (gratuito) de Vercel es suficiente** para este proyecto.
  El cron de pagos huérfanos (cada ~5 min) se programa fuera de Vercel
  (p. ej. cron-job.org), así que no se necesita Pro para esa frecuencia.
  Ver sección 7.bis.
