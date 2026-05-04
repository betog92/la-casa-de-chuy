/**
 * Comprueba si la petición trae el mismo secreto que `CRON_SECRET`.
 *
 * - **Vercel Cron:** con `CRON_SECRET` definido en el proyecto, Vercel envía
 *   `Authorization: Bearer <CRON_SECRET>` en cada invocación programada.
 * - **Local / jobs externos:** puedes usar el header `x-cron-secret` con el
 *   mismo valor (p. ej. `curl -H "x-cron-secret: ..."`).
 *
 * @see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export function isCronSecretAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof secret !== "string") return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const xCron = request.headers.get("x-cron-secret");
  return xCron === secret;
}
