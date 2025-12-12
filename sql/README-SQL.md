# Guía de Ejecución de Scripts SQL - La Casa de Chuy el Rico

Este documento explica cómo ejecutar los scripts SQL en el orden correcto para configurar la base de datos.

**Ubicación:** Todos los archivos SQL están en la carpeta `/sql` del proyecto.

## 📋 Archivos SQL

### Archivos Principales (ejecutar en este orden):

1. **`01-schema.sql`** - Esquema completo de la base de datos

   - Crea todas las tablas
   - Crea índices básicos y compuestos
   - Crea triggers para `updated_at` automático
   - Crea trigger para actualizar `reservations_count`

2. **`02-functions.sql`** - Todas las funciones del sistema

   - Funciones para generar time slots
   - Funciones RPC para consultas
   - Funciones de mantenimiento automático
   - Configuración de `search_path` para seguridad

3. **`03-security.sql`** - Seguridad y permisos

   - Habilita Row Level Security (RLS)
   - Crea políticas de acceso para cada tabla

4. **`04-cron-jobs.sql`** - Cron jobs para mantenimiento automático
   - Configura cron job diario para ejecutar `maintain_time_slots()`
   - Se ejecuta a medianoche en zona horaria de Monterrey
   - Requiere habilitar extensión `pg_cron` en Supabase

### Archivos Auxiliares:

5. **`populate-initial-data.sql`** - Datos iniciales

   - Genera slots para los próximos 6 meses
   - Ejecutar DESPUÉS de los archivos principales
   - **Nota**: Si usas el cron job (`04-cron-jobs.sql`), este archivo es opcional

6. **`drop-all.sql`** - Limpieza completa
   - ⚠️ **ADVERTENCIA**: Elimina TODAS las tablas y funciones
   - Solo usar en desarrollo o cuando quieras empezar desde cero

## 🚀 Instrucciones de Ejecución

### Primera vez (Setup completo desde cero):

1. Ve a tu proyecto en Supabase
2. Abre el **SQL Editor**
3. Ejecuta los archivos en este orden:

```sql
-- Paso 0: Limpieza (SOLO si quieres empezar desde cero)
-- Copia y pega el contenido de sql/drop-all.sql
-- Ejecuta
-- ⚠️ ADVERTENCIA: Esto elimina TODAS las tablas y datos

-- Paso 1: Esquema
-- Copia y pega el contenido de sql/01-schema.sql
-- Ejecuta

-- Paso 2: Funciones
-- Copia y pega el contenido de sql/02-functions.sql
-- Ejecuta

-- Paso 3: Seguridad
-- Copia y pega el contenido de sql/03-security.sql
-- Ejecuta

-- Paso 4: Cron Jobs (recomendado para producción)
-- Copia y pega el contenido de sql/04-cron-jobs.sql
-- Ejecuta
-- IMPORTANTE: Primero debes habilitar la extensión pg_cron en Supabase:
-- Ve a: Database > Extensions > Busca "pg_cron" > Enable

-- Paso 5: Datos iniciales (opcional - solo si NO usas cron job)
-- Copia y pega el contenido de sql/populate-initial-data.sql
-- Ejecuta
-- Nota: Si configuraste el cron job, los slots se generarán automáticamente
```

### Actualización de funciones:

Si solo necesitas actualizar las funciones (por ejemplo, después de hacer cambios):

```sql
-- Solo ejecuta 02-functions.sql
-- Esto actualizará todas las funciones sin afectar los datos
```

### Actualización de seguridad:

Si solo necesitas actualizar las políticas RLS:

```sql
-- Solo ejecuta 03-security.sql
-- Esto actualizará las políticas sin afectar los datos
```

## ⚠️ Notas Importantes

### Sobre el mantenimiento automático:

- **Sistema con Cron Job (recomendado para producción):**

  - El cron job (`04-cron-jobs.sql`) ejecuta `maintain_time_slots()` diariamente a medianoche (Monterrey)
  - Mantiene automáticamente 6 meses de slots disponibles
  - Limpia slots de fechas pasadas automáticamente
  - Extiende el rango de slots cada día
  - **No necesitas ejecutar scripts periódicamente** - el sistema se mantiene solo

- **Sin Cron Job:**
  - Si no configuras el cron job, puedes ejecutar `populate-initial-data.sql` para generar slots iniciales
  - O ejecutar manualmente `SELECT maintain_time_slots();` cuando sea necesario

### Sobre los slots:

- **Con cron job:** Los slots se generan automáticamente cada día a medianoche
- **Sin cron job:** Puedes ejecutar `populate-initial-data.sql` o `maintain_time_slots()` manualmente
- El sistema mantiene siempre 6 meses de slots disponibles
- Los slots de fechas pasadas se eliminan automáticamente
- Todas las funciones usan zona horaria de Monterrey (`America/Monterrey`)

### Sobre la seguridad:

- Las políticas RLS actuales permiten:
  - Cualquiera puede ver disponibilidad y slots (necesario para el calendario)
  - Cualquiera puede crear reservas (reservas como invitado)
  - Los usuarios autenticados pueden ver/editar sus propias reservas
- Cuando implementes el panel de admin, deberás agregar políticas específicas para admins

## 🔍 Verificación

Después de ejecutar los scripts, verifica que todo esté correcto:

```sql
-- Verificar que las funciones existan
SELECT proname
FROM pg_proc
WHERE proname IN (
  'generate_time_slots',
  'ensure_time_slots_for_date',
  'maintain_time_slots',
  'maintain_time_slots_at_midnight_monterrey',
  'get_available_slots',
  'get_current_date_monterrey',
  'get_current_time_monterrey',
  'is_slot_available',
  'get_daily_occupancy',
  'get_reservations_stats'
)
ORDER BY proname;

-- Verificar que el cron job esté configurado (si usas 04-cron-jobs.sql)
SELECT * FROM cron.job WHERE jobname = 'maintain-time-slots-daily';

-- Verificar que las tablas existan
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verificar que RLS esté habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

## 🐛 Solución de Problemas

### Error: "function does not exist"

- Asegúrate de haber ejecutado `02-functions.sql` primero

### Error: "relation does not exist"

- Asegúrate de haber ejecutado `01-schema.sql` primero

### Error: "permission denied"

- Asegúrate de haber ejecutado `03-security.sql` para configurar RLS

### Los slots no aparecen disponibles

- **Si usas cron job:** Verifica que esté configurado correctamente con `SELECT * FROM cron.job WHERE jobname = 'maintain-time-slots-daily';`
- **Sin cron job:** Verifica que hayas ejecutado `populate-initial-data.sql` o ejecuta manualmente `SELECT maintain_time_slots();`
- Verifica que los slots no tengan `reservations_count > 0` o `available = FALSE`
- Verifica que la fecha no esté marcada como cerrada en la tabla `availability`

### El cron job no se ejecuta

- Verifica que la extensión `pg_cron` esté habilitada en Supabase (Database > Extensions)
- Verifica que el cron job esté programado: `SELECT * FROM cron.job WHERE jobname = 'maintain-time-slots-daily';`
- Verifica el historial de ejecuciones: `SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'maintain-time-slots-daily') ORDER BY start_time DESC LIMIT 10;`

## 📝 Cambios desde la versión anterior

### Consolidación:

- Todos los archivos SQL fueron consolidados en 3 archivos principales
- Eliminadas duplicaciones de funciones
- Orden de ejecución claro y documentado

### Mejoras:

- **Cron job diario:** Sistema de mantenimiento automático mediante cron job (ejecuta a medianoche Monterrey)
- **Funciones simplificadas:** `get_available_slots()` es ahora puramente consultiva (sin validaciones ni mantenimiento)
- **Zona horaria:** Todas las funciones usan zona horaria de Monterrey (`America/Monterrey`)
- Validación de rango de 6 meses mantenida en funciones de escritura
- Limpieza automática de slots pasados
- Mejor documentación y comentarios
