import { STORAGE_KEYS, getStorage, storageGetNumber, storageSetNumber } from "./storage";

/** Fecha local del último grant diario (YYYY-MM-DD). */
export const DAILY_GRANT_KEY = "arca-daily-grant";
const DAILY_PENDING_KEY = "arca-daily-modal-pending";
const DAILY_DOUBLED_KEY = "arca-daily-doubled";

export const DAILY_OLIVES = 5;

function localDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Login diario de olivos (economía del juego).
 * Primera vez con saldo 0: +5. Cada día local nuevo: +5.
 * El duplicar por rewarded lo decide el modal (mismo tope del shell).
 */
export function applyDailyOliveGrant(): number {
  const store = getStorage();
  const today = localDate();
  const last = store.getItem(DAILY_GRANT_KEY);
  if (last === today) {
    // Builds viejos otorgaban el día sin marcar el modal. Ofrecer duplicar 1 vez.
    if (
      store.getItem(DAILY_DOUBLED_KEY) !== today &&
      store.getItem(DAILY_PENDING_KEY) == null
    ) {
      store.setItem(DAILY_PENDING_KEY, "1");
    }
    return 0;
  }

  const olives = storageGetNumber(STORAGE_KEYS.olives, 0);
  if (last == null) {
    store.setItem(DAILY_GRANT_KEY, today);
    if (olives === 0) {
      storageSetNumber(STORAGE_KEYS.olives, DAILY_OLIVES);
      store.setItem(DAILY_PENDING_KEY, "1");
      return DAILY_OLIVES;
    }
    return 0;
  }

  storageSetNumber(STORAGE_KEYS.olives, olives + DAILY_OLIVES);
  store.setItem(DAILY_GRANT_KEY, today);
  store.setItem(DAILY_PENDING_KEY, "1");
  return DAILY_OLIVES;
}

export function shouldShowDailyModal(): boolean {
  const store = getStorage();
  if (store.getItem(DAILY_DOUBLED_KEY) === localDate()) return false;
  return store.getItem(DAILY_PENDING_KEY) === "1";
}

export function dismissDailyModal(): void {
  getStorage().setItem(DAILY_PENDING_KEY, "0");
}

export function markDailyDoubled(): void {
  const store = getStorage();
  store.setItem(DAILY_DOUBLED_KEY, localDate());
  store.setItem(DAILY_PENDING_KEY, "0");
}
