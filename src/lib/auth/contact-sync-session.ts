const KEY_PREFIX = "contact_sync_ok:";

export function isContactSyncCached(userId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(`${KEY_PREFIX}${userId}`) === "1";
}

export function markContactSyncOk(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${KEY_PREFIX}${userId}`, "1");
}

export function clearContactSyncCache(userId?: string): void {
  if (typeof sessionStorage === "undefined") return;
  if (userId) {
    sessionStorage.removeItem(`${KEY_PREFIX}${userId}`);
    return;
  }
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}
