# Guía de Ejecución de Scripts SQL - La Casa de Chuy el Rico

Este documento explica cómo ejecutar los scripts SQL en el orden correcto para configurar la base de datos.

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

### Archivos Auxiliares:

4. **`populate-initial-data.sql`** - Datos iniciales

   - Genera slots para los próximos 6 meses
   - Ejecutar DESPUÉS de los archivos principales

5. **`drop-all.sql`** - Limpieza completa
   - ⚠️ **ADVERTENCIA**: Elimina TODAS las tablas y funciones
   - Solo usar en desarrollo o cuando quieras empezar desde cero

## 🚀 Instrucciones de Ejecución

### Primera vez (Setup completo):

1. Ve a tu proyecto en Supabase
2. Abre el **SQL Editor**
3. Ejecuta los archivos en este orden:

```sql
-- Paso 1: Esquema
-- Copia y pega el contenido de 01-schema.sql
-- Ejecuta

-- Paso 2: Funciones
-- Copia y pega el contenido de 02-functions.sql
-- Ejecuta

-- Paso 3: Seguridad
-- Copia y pega el contenido de 03-security.sql
-- Ejecuta

-- Paso 4: Datos iniciales (opcional pero recomendado)
-- Copia y pega el contenido de populate-initial-data.sql
-- Ejecuta
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

- La función `get_available_slots()` ahora incluye mantenimiento automático
- Cada vez que alguien consulta una fecha, el sistema:
  - Verifica que haya slots hasta 6 meses en el futuro
  - Crea slots automáticamente si faltan
  - Limpia slots de fechas pasadas
- **No necesitas ejecutar scripts periódicamente** - el sistema se mantiene solo

### Sobre los slots:

- Los slots se crean automáticamente cuando se consultan
- El sistema mantiene siempre 6 meses de slots disponibles
- Los slots de fechas pasadas se eliminan automáticamente

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
  'get_available_slots',
  'is_slot_available',
  'get_daily_occupancy',
  'get_reservations_stats'
)
ORDER BY proname;

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

- Verifica que hayas ejecutado `populate-initial-data.sql` o que la función `get_available_slots` esté funcionando
- Verifica que los slots no tengan `reservations_count > 0` o `available = FALSE`
- Verifica que la fecha no esté marcada como cerrada en la tabla `availability`

## 📝 Cambios desde la versión anterior

### Consolidación:

- Todos los archivos SQL fueron consolidados en 3 archivos principales
- Eliminadas duplicaciones de funciones
- Orden de ejecución claro y documentado

### Mejoras:

- `get_available_slots()` ahora incluye mantenimiento automático
- Validación de rango de 6 meses en todas las funciones
- Limpieza automática de slots pasados
- Mejor documentación y comentarios
