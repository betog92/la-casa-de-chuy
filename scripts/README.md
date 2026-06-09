# Scripts operativos

Scripts que **sí** se pueden volver a usar en producción o desarrollo.

| Script | Uso |
|--------|-----|
| [`sync-vestidos-calendar.mjs`](sync-vestidos-calendar.mjs) | Sincronizar calendario de vestidos desde Google (ver comentarios en el archivo). |
| [`preview-vestidos-calendar.mjs`](preview-vestidos-calendar.mjs) | Inspeccionar eventos de vestidos en Google sin tocar la BD. |
| [`import-historical-alvero-google.mjs`](import-historical-alvero-google.mjs) | Importar historial Alvero (con `#` de orden) desde Google → Supabase `manual_client`. Preview o `--commit`. |
| [`merge-duplicate-alvero-slots.mjs`](merge-duplicate-alvero-slots.mjs) | Fusionar en BD dos bloques 45+45 del mismo `#orden` y día (preview o `--commit`). |
| [`cleanup-import-history-before-2026-05-31.mjs`](cleanup-import-history-before-2026-05-31.mjs) | **Ya ejecutado (2026-06-03).** Borró importadas históricas que no son Alvero con cliente. Solo re-ejecutar si sabes lo que haces. |
| [`repair-incomplete-profiles.ts`](repair-incomplete-profiles.ts) | Repara `public.users` sin name/phone (preview o `--commit`). Cron diario en cron-job.org: `/api/cron/repair-incomplete-profiles` (ver DEPLOY.md 7.cinco). |

Historial de importaciones antiguas, respaldos CSV/JSON y utilidades one-off: [`_archivo-historial-importaciones/`](_archivo-historial-importaciones/).
