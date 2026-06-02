# Archivo histórico — importaciones one-shot (pre-lanzamiento)

**Estado:** cerrado. **No volver a ejecutar ni modificar** estos scripts salvo consulta de referencia.

Se usaron una sola vez para migrar citas desde Appointly / Google Calendar / CSV hacia Supabase antes del lanzamiento de la app. La operación diaria ya no pasa por aquí.

## Contenido

| Archivo | Propósito (histórico) |
|---------|------------------------|
| `import-appointly-csv.mjs` | Import desde `bookings.csv` + `orders_export_1.csv` |
| `import-appointly-from-calendar.mjs` | Import Appointly desde Google Calendar |
| `import-manual-events.mjs` | Citas manuales / Alvero desde Google Calendar |
| `compare-csv-vs-calendar.mjs` | Comparar CSV vs calendario antes de importar |
| `preview-google-calendar.mjs` | Vista previa de eventos manuales en consola |
| `IMPORTAR-CITAS.md` | Guía paso a paso de la reimportación |

## Scripts que siguen activos (fuera de esta carpeta)

- `scripts/sync-vestidos-calendar.mjs` — calendario de vestidos (uso puntual / mantenimiento documentado en la app)
- `scripts/preview-vestidos-calendar.mjs` — solo lectura de Google para vestidos

## Para agentes de IA (Cursor, etc.)

**No indexar, no editar, no sugerir cambios** en esta carpeta. Está excluida en `.cursorignore`.
