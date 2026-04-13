# Guía: Reimportar Citas Antes del Lanzamiento

Sigue estos pasos **en orden** cada vez que necesites reimportar todas las citas de la web anterior.

---

## Setup desde cero (primera vez)

Si estás levantando la base de datos desde cero, ejecuta los SQLs en este orden:

```
sql/01-schema.sql       ← incluye tabla reservations con todos los campos + secuencia + funciones
sql/02-functions.sql
sql/03-security.sql
sql/04-cron-jobs.sql
sql/populate-initial-data.sql
```

Los migrations del 05 al 19 **no son necesarios** si ejecutas `01-schema.sql` desde cero, ya están integrados. Si ya tienes la BD y quieres usar el calendario de renta de vestidos en la app, ejecuta además `sql/25-migration-vestido-calendar-events.sql` para crear las tablas (vestido_calendar_notes y vestido_calendar_events) y luego `node scripts/sync-vestidos-calendar.mjs --commit`. Si las tablas ya existían antes de añadir la columna de descripción, ejecuta también `sql/26-migration-vestido-description.sql`. Para FK de notas → eventos, borrado en cascada y consulta embebida del API, ejecuta `sql/27-migration-vestido-notes-fk-cascade.sql` (limpia notas huérfanas antes de crear la FK).

**Calendario de vestidos (solo consola, sin escribir BD):** `node scripts/preview-vestidos-calendar.mjs` muestra título, fechas y también `description` / `location` desde Google. Para ver el payload crudo evento por evento: `node scripts/sync-vestidos-calendar.mjs --debug` (sin `--commit` si no quieres tocar Supabase). El import a BD es `sync-vestidos-calendar.mjs --commit`.

**Después del lanzamiento (sin Google Calendar para vestidos):** la idea es hacer **una sola** pasada con `--commit` para traer el histórico inicial; a partir de ahí los eventos viven solo en la app (admin: reservaciones / calendario). **No ejecutes `--commit` otra vez** mientras tengas eventos creados en la app (`app-...`), porque el script borra toda la tabla y solo reinserta lo que siga existiendo en Google (y esos eventos de app no están en Google).

---

## Requisitos previos

- Tener los archivos CSV actualizados en la raíz del proyecto:
  - `bookings.csv` → exportado desde Appointly
  - `orders_export_1.csv` → exportado desde Shopify (pedidos)
- Tener acceso al **SQL Editor de Supabase**
- Tener el servidor local corriendo o las variables de entorno disponibles

---

## Paso 1 — Limpiar la base de datos y resetear la secuencia

**Importante:** Este paso **debe hacerse siempre en el SQL Editor de Supabase** antes de reimportar. El script de importación intenta resetear la secuencia pero en Supabase suele fallar por permisos; si no se resetea, la secuencia sigue subiendo (10001, 10002, … 10745, 10746…) y por eso ves IDs altos.

Abre el **SQL Editor de Supabase** y ejecuta:

```sql
-- Borrar todas las citas importadas
DELETE FROM reservations WHERE source = 'google_import';

-- Resetear la secuencia de IDs (el próximo ID será 10001)
ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;
```

> ⚠️ Esto borra **todas** las citas importadas (Appointly + manuales). Las reservas reales de la nueva web NO se tocan.

Si también quieres limpiar los datos del **calendario de renta de vestidos** (eventos copiados de Google + títulos editados en la app), ejecuta además:

```sql
TRUNCATE vestido_calendar_events;
TRUNCATE vestido_calendar_notes;
```

Después de reimportar citas, vuelve a llenar los eventos de vestidos con:

```bash
node scripts/sync-vestidos-calendar.mjs --commit
```

**Ver valor actual de la secuencia** (opcional, para comprobar antes de reimportar):

```sql
SELECT last_value FROM reservations_google_import_id_seq;
```

Si ves por ejemplo `10745`, el próximo ID sería 10746. Después de ejecutar el `ALTER SEQUENCE ... RESTART WITH 10001` de arriba, el próximo ID será 10001.

---

## Paso 2 — Exportar los CSVs actualizados

### Appointly (`bookings.csv`)
1. Entra a tu cuenta de Appointly
2. Ve a **Bookings → Export**
3. Exporta el CSV y reemplaza `bookings.csv` en la raíz del proyecto

### Shopify (`orders_export_1.csv`)
1. Entra a tu tienda en Shopify Admin
2. Ve a **Pedidos → Exportar**
3. Selecciona **Todos los pedidos** en formato CSV
4. Reemplaza `orders_export_1.csv` en la raíz del proyecto

---

## Paso 3 — Importar citas de Appointly (Fase 1)

```bash
node scripts/import-appointly-csv.mjs
```

Revisa el preview. Si todo se ve bien:

```bash
node scripts/import-appointly-csv.mjs --commit
```

**Resultado esperado:**
```
Insertadas: ~230
Errores:    0
```

---

## Paso 4 — Importar citas manuales del Google Calendar (Fase 2)

El script solo borra y reinserta las citas **manuales** (Nancy, Alberto, otras). No toca las de Appointly insertadas en el Paso 3.

Requisitos: en `.env.local` deben estar `GOOGLE_CALENDAR_ID` y `GOOGLE_CALENDAR_CREDENTIALS` (JSON de la cuenta de servicio con acceso de solo lectura al calendario).

```bash
node scripts/import-manual-events.mjs
```

Revisa el preview (nombres, fechas, fusiones de 90 min). Si todo se ve bien:

```bash
node scripts/import-manual-events.mjs --commit
```

**Resultado esperado:**
```
Insertadas: ~255
Duplicadas (omitidas): 0
Errores:    0
```

> Los slots de Nancy aparecen fusionados en pares de 90 min (disponibles para Alberto).
> Las sesiones con cliente real (Alberto + nombre) también aparecen como 90 min.

---

## Paso 5 — Verificar

1. Entra al **Calendario Admin** y confirma que se ven los 4 colores de importadas:
   - 🔵 **Cian** → Citas de Appointly (clientes reales web anterior)
   - 🟣 **Morado** → Sesiones de Alberto con cliente confirmado (muestra #orden + nombre)
   - 🟠 **Naranja** → Espacios reservados para Alvero (slots de Nancy); en el calendario se muestra "Hora - Reservado para Alvero"
   - 🔴 **Rojo** → Otras citas manuales (45 min, no Appointly ni Alberto)
   - 🟦 **Azul oscuro** → Reservas reales de la nueva web

2. Busca una cita en la lista de reservaciones admin por número de orden (ej. `6521` o `#6521`) para confirmar que aparece.

3. Entra al detalle de una cita importada y confirma:
   - Muestra el badge **"Cita importada de Google Calendar (web anterior)"**
   - Muestra el número de **Orden (web anterior)** (en citas de Alberto)
   - Las sesiones de 90 min muestran el horario correcto (ej. `1:15 pm - 2:45 pm`)
   - En citas de Alberto, un admin puede editar **Detalles de la cita** y guardar.

---

## Notas importantes

- **La secuencia de IDs** de citas importadas va de `10001` en adelante. Las reservas reales de la nueva web tienen IDs bajos (1, 2, 3...) y no se mezclan.
- **Si ves reservaciones con ID 10745 o más:** es porque en alguna re-importación no se ejecutó el Paso 1 en el SQL Editor (o el reset falló). La secuencia no se reinició y siguió creciendo. Para la próxima re-importación, ejecuta el Paso 1 completo (DELETE + ALTER SEQUENCE) y los nuevos IDs volverán a empezar en 10001. Los IDs ya existentes (10745, etc.) no se cambian; solo afecta a las **siguientes** inserciones.
- **No se envían emails** al importar — los clientes no son notificados.
- **Los time slots quedan bloqueados** automáticamente vía trigger de Postgres, igual que las reservas reales.
- **Después de 6 meses del lanzamiento**, las citas importadas se pueden eliminar con:
  ```sql
  DELETE FROM reservations WHERE source = 'google_import';
  ```
  En ese punto ya no quedará ninguna cita pendiente de la web anterior.
