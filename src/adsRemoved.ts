import { STORAGE_KEYS, getStorage } from "./storage";

/** Compra no consumible “Quitar anuncios” (vida del jugador, no por partida). */
export function hasAdsRemoved(): boolean {
  return getStorage().getItem(STORAGE_KEYS.adsRemoved) === "1";
}

export function markAdsRemoved(): void {
  getStorage().setItem(STORAGE_KEYS.adsRemoved, "1");
}

/** Debug: vuelve a mostrar la compra. */
export function clearAdsRemoved(): void {
  getStorage().removeItem(STORAGE_KEYS.adsRemoved);
}
