/**
 * Oferta única: tras ≥2 Game Overs, modal “comparte y recibe 10 olivos”.
 * Aparece UNA vez en la vida del jugador (aunque cancele sin compartir).
 */
import { STORAGE_KEYS, getStorage, storageGetNumber } from "./storage";

export const SHARE_REWARD_OLIVES = 10;
/** Partidas terminadas (Game Over) mínimas antes de ofrecer. */
export const SHARE_OFFER_AFTER_GAMES = 2;

export function shouldOfferShareReward(): boolean {
  if (getStorage().getItem(STORAGE_KEYS.shareOfferShown) === "1") return false;
  return storageGetNumber(STORAGE_KEYS.gamesPlayed, 0) >= SHARE_OFFER_AFTER_GAMES;
}

/** Marca el modal como ya mostrado (nunca más). */
export function markShareOfferShown(): void {
  getStorage().setItem(STORAGE_KEYS.shareOfferShown, "1");
}

export function hasClaimedShareReward(): boolean {
  return getStorage().getItem(STORAGE_KEYS.shareRewardClaimed) === "1";
}

/** Idempotente: true la primera vez que se reclama. */
export function tryMarkShareRewardClaimed(): boolean {
  if (hasClaimedShareReward()) return false;
  getStorage().setItem(STORAGE_KEYS.shareRewardClaimed, "1");
  return true;
}
