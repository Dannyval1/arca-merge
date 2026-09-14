import { Platform, Share } from "react-native";
import { SHELL_CONFIG } from "./config";

/**
 * Hoja nativa de compartir.
 * iOS: dismissedAction = canceló.
 * Android: a menudo no distingue cancelar vs enviar; si el sheet se cierra
 * sin error devolvemos shared (limitación de la API). El modal explica si
 * el bridge responde dismissed/error.
 */
export async function shareGameInvite(
  message: string
): Promise<"shared" | "dismissed" | "unavailable" | "error"> {
  const url =
    Platform.OS === "ios"
      ? SHELL_CONFIG.storeUrls.ios
      : SHELL_CONFIG.storeUrls.android;
  const text = `${message.trim()} ${url}`.trim();
  try {
    const result = await Share.share(
      Platform.OS === "ios"
        ? { message: text, url }
        : { message: text, title: "Arca Merge" }
    );
    if (result.action === Share.dismissedAction) return "dismissed";
    return "shared";
  } catch (e) {
    console.warn("[share]", e);
    return "error";
  }
}
