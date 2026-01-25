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
```

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

## URLs Importantes

- **Dashboard de Vercel:** https://vercel.com/dashboard
- **Dashboard de Supabase:** https://app.supabase.com
- **Dashboard de Conekta:** https://admin.conekta.com
- **Aplicación en Producción:** https://temporal.lacasadechuyelrico.com (una vez configurado el dominio)

## Notas

- Los deployments son automáticos con cada push a la rama `master`
- Puedes crear preview deployments para otras ramas
- Los logs están disponibles en tiempo real en el dashboard de Vercel
- El plan gratuito de Vercel es suficiente para el volumen esperado del proyecto
