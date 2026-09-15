/**
 * Reglas de petición de reseña.
 *
 * Flujo:
 * 1) Tras cerrar Game Over con récord (lo decide GameScene)
 * 2) Gate: ≥3 partidas y cooldown 60 días desde la última VEZ QUE PREGUNTAMOS
 * 3) Modal propio ¿Te gusta? → Sí dispara el prompt nativo (Play / App Store)
 *
 * Importante:
 * - No sabemos si el usuario YA dejó reseña: el SO no lo expone.
 * - Si ya calificó, iOS/Android suelen no mostrar el diálogo nativo (cuota del sistema).
 * - Nuestro cooldown de 60 días limita CUÁNTAS VECES nosotros preguntamos,
 *   no “nunca más en la vida”. Tras 60 días puede volver a salir el pre-prompt;
 *   el nativo igual puede no-op si el usuario ya reseñó o agotó la cuota OS
 *   (en iOS ~3 prompts/año).
 */
import {
  STORAGE_KEYS,
  storageGetNumber,
  storageSetNumber
} from "./storage";
import { sendToShell } from "./bridge";

const REVIEW_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
/** Mínimo de partidas terminadas antes del primer ask. */
export const REVIEW_MIN_GAMES = 3;

export function bumpGamesPlayed(): number {
  const n = storageGetNumber(STORAGE_KEYS.gamesPlayed, 0) + 1;
  storageSetNumber(STORAGE_KEYS.gamesPlayed, n);
  return n;
}

export function gamesPlayedCount(): number {
  return storageGetNumber(STORAGE_KEYS.gamesPlayed, 0);
}

/** true si podemos mostrar el pre-prompt (no el nativo todavía). */
export function canShowReviewPrompt(): boolean {
  try {
    if (gamesPlayedCount() < REVIEW_MIN_GAMES) return false;
    const last = storageGetNumber(STORAGE_KEYS.lastReviewAskAt, 0);
    if (last > 0 && Date.now() - last < REVIEW_COOLDOWN_MS) return false;
    return true;
  } catch {
    return false;
  }
}

/** Marca que ya preguntamos (Sí o No). Arranca el cooldown de 60 días. */
export function markReviewPromptShown(): void {
  try {
    storageSetNumber(STORAGE_KEYS.lastReviewAskAt, Date.now());
  } catch {
    // ignore
  }
}

/** Tras “Sí”: pide al shell el diálogo nativo de la tienda. */
export function requestNativeStoreReview(reason: "new_best" | "ark_complete"): void {
  try {
    sendToShell({ type: "request_store_review", reason });
  } catch {
    // nunca romper el flujo de UI
  }
}

/**
 * @deprecated Usar canShowReviewPrompt + modal + requestNativeStoreReview.
 * Se mantiene por si algún caller viejo queda en el árbol.
 */
export function maybeRequestReviewAfterNewBest(): void {
  if (!canShowReviewPrompt()) return;
  markReviewPromptShown();
  requestNativeStoreReview("new_best");
}
