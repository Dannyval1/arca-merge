/**
 * Reglas de petición de reseña (el prompt nativo lo dispara el shell).
 * - Solo tras récord nuevo (lo decide el caller)
 * - A partir de la 3ª partida (nunca partidas 1–2)
 * - Máximo 1 vez cada 60 días
 */
import {
  STORAGE_KEYS,
  storageGetNumber,
  storageSetNumber
} from "./storage";
import { sendToShell } from "./bridge";

const REVIEW_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;

export function bumpGamesPlayed(): number {
  const n = storageGetNumber(STORAGE_KEYS.gamesPlayed, 0) + 1;
  storageSetNumber(STORAGE_KEYS.gamesPlayed, n);
  return n;
}

export function gamesPlayedCount(): number {
  return storageGetNumber(STORAGE_KEYS.gamesPlayed, 0);
}

/**
 * Tras cerrar Game Over con récord. Emite request_store_review o no-op.
 * Falla en silencio si no aplica.
 */
export function maybeRequestReviewAfterNewBest(): void {
  try {
    if (gamesPlayedCount() < 3) return;
    const last = storageGetNumber(STORAGE_KEYS.lastReviewAskAt, 0);
    if (last > 0 && Date.now() - last < REVIEW_COOLDOWN_MS) return;
    storageSetNumber(STORAGE_KEYS.lastReviewAskAt, Date.now());
    sendToShell({ type: "request_store_review", reason: "new_best" });
  } catch {
    // nunca romper el flujo de UI
  }
}
