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

Los migrations del 05 al 19 **no son necesarios** si ejecutas `01-schema.sql` desde cero, ya están integrados.

---

## Requisitos previos

- Tener los archivos CSV actualizados en la raíz del proyecto:
  - `bookings.csv` → exportado desde Appointly
  - `orders_export_1.csv` → exportado desde Shopify (pedidos)
- Tener acceso al **SQL Editor de Supabase**
- Tener el servidor local corriendo o las variables de entorno disponibles

---

## Paso 1 — Limpiar la base de datos y resetear la secuencia

Abre el **SQL Editor de Supabase** y ejecuta:

```sql
-- Borrar todas las citas importadas
DELETE FROM reservations WHERE source = 'google_import';

-- Resetear la secuencia de IDs (empieza desde 10001)
ALTER SEQUENCE reservations_google_import_id_seq MINVALUE 10001 RESTART WITH 10001;
```

> ⚠️ Esto borra **todas** las citas importadas (Appointly + manuales). Las reservas reales de la nueva web NO se tocan.

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

1. Entra al **Calendario Admin** y confirma que se ven los 3 colores:
   - 🔵 **Cian** → Citas de Appointly (clientes reales web anterior)
   - 🟣 **Morado** → Sesiones de Alberto con cliente confirmado
   - 🟠 **Naranja** → Espacios disponibles para Alberto (slots de Nancy)
   - 🟦 **Azul oscuro** → Reservas reales de la nueva web

2. Busca una cita en la lista de reservaciones admin por número de orden (ej. `6521` o `#6521`) para confirmar que aparece.

3. Entra al detalle de una cita importada y confirma:
   - Muestra el badge **"Cita importada de Google Calendar (web anterior)"**
   - Muestra el número de **Orden (web anterior)**
   - Las sesiones de 90 min muestran el horario correcto (ej. `1:15 pm - 2:45 pm`)

---

## Notas importantes

- **La secuencia de IDs** de citas importadas va de `10001` en adelante. Las reservas reales de la nueva web tienen IDs bajos (1, 2, 3...) y no se mezclan.
- **No se envían emails** al importar — los clientes no son notificados.
- **Los time slots quedan bloqueados** automáticamente vía trigger de Postgres, igual que las reservas reales.
- **Después de 6 meses del lanzamiento**, las citas importadas se pueden eliminar con:
  ```sql
  DELETE FROM reservations WHERE source = 'google_import';
  ```
  En ese punto ya no quedará ninguna cita pendiente de la web anterior.
