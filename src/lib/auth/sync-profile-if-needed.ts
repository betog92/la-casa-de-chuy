import {
  clearContactSyncCache,
  isContactSyncCached,
  markContactSyncOk,
} from "@/lib/auth/contact-sync-session";

const inflightByUser = new Map<string, Promise<boolean>>();

async function fetchContactComplete(): Promise<boolean> {
  const contactRes = await fetch("/api/users/contact");
  const contactData = await contactRes.json();
  return contactData?.success === true && contactData.contactComplete === true;
}

/**
 * Sincroniza public.users solo si name/phone están vacíos.
 * Usado en SIGNED_IN y como red de seguridad en /account.
 */
async function runSyncProfileIfNeeded(userId: string): Promise<boolean> {
  if (!userId) return false;

  if (isContactSyncCached(userId)) return true;

  try {
    if (await fetchContactComplete()) {
      markContactSyncOk(userId);
      return true;
    }

    const syncRes = await fetch("/api/users/sync", { method: "POST" });
    const syncData = await syncRes.json();
    if (!syncData?.success) {
      console.warn("[syncProfileIfNeeded] sync falló:", syncData?.error);
      return false;
    }

    // No cachear por éxito del API solo: verificar que el contacto quedó en BD
    if (await fetchContactComplete()) {
      markContactSyncOk(userId);
      return true;
    }

    return false;
  } catch (err) {
    console.error("[syncProfileIfNeeded]", err);
    return false;
  }
}

export function syncProfileIfNeeded(userId: string): Promise<boolean> {
  if (!userId) return Promise.resolve(false);
  if (isContactSyncCached(userId)) return Promise.resolve(true);

  const inflight = inflightByUser.get(userId);
  if (inflight) return inflight;

  const promise = runSyncProfileIfNeeded(userId).finally(() => {
    inflightByUser.delete(userId);
  });
  inflightByUser.set(userId, promise);
  return promise;
}

export { clearContactSyncCache };
