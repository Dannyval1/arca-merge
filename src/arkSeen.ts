import { STORAGE_KEYS, getStorage } from "./storage";

/** Primera vez en la vida del jugador (no por partida). */
export function hasSeenArkComplete(): boolean {
  return getStorage().getItem(STORAGE_KEYS.arkCompleteSeen) === "1";
}

export function markArkCompleteSeen(): void {
  getStorage().setItem(STORAGE_KEYS.arkCompleteSeen, "1");
}

/** Debug: vuelve a disparar la versión extendida del clímax. */
export function clearArkCompleteSeen(): void {
  getStorage().removeItem(STORAGE_KEYS.arkCompleteSeen);
}
