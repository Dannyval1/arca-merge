import * as StoreReview from "expo-store-review";

/**
 * Prompt nativo de reseña. Respeta cuotas del OS (iOS ~3/año).
 * Nunca lanza: si no se puede mostrar, no-op.
 */
export async function requestNativeStoreReview(
  reason: string
): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) {
      console.log("[review] unavailable", reason);
      return;
    }
    const can = await StoreReview.hasAction();
    if (!can) {
      console.log("[review] no action", reason);
      return;
    }
    await StoreReview.requestReview();
    console.log("[review] requested", reason);
  } catch (e) {
    console.warn("[review] failed silently", e);
  }
}
