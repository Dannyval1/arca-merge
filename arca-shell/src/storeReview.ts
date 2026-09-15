import { Linking, Platform } from "react-native";
import * as StoreReview from "expo-store-review";
import { SHELL_CONFIG } from "./config";

function storeListingUrl(): string | null {
  const url =
    Platform.OS === "ios"
      ? SHELL_CONFIG.storeUrls.ios
      : SHELL_CONFIG.storeUrls.android;
  // Placeholder iOS hasta tener el id real de App Store Connect.
  if (!url || url.includes("id0000000000")) return null;
  return url;
}

/**
 * Prompt nativo de reseña (Play In-App Review / SKStoreReviewController).
 * - iOS: el SO limita ~3 prompts/año; si ya reseñó, suele no mostrar nada.
 * - Android: cuota de Play; en sideload / sin Play puede fallar.
 * - Tras “Sí” en nuestro pre-prompt: si el nativo no está disponible,
 *   abrimos la ficha de la tienda (cuando la URL es válida).
 */
export async function requestNativeStoreReview(
  reason: string
): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (available) {
      const can = await StoreReview.hasAction();
      if (can) {
        await StoreReview.requestReview();
        console.log("[review] requested", reason);
        return;
      }
      console.log("[review] no action", reason);
    } else {
      console.log("[review] unavailable", reason);
    }

    const listing = storeListingUrl();
    if (listing) {
      console.log("[review] fallback open listing", reason);
      await Linking.openURL(listing);
    }
  } catch (e) {
    console.warn("[review] failed silently", e);
  }
}
