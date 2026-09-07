import { Platform } from "react-native";
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync
} from "expo-tracking-transparency";

let asked = false;

/**
 * ATT (iOS 14.5+). Pedir DESPUÉS de UMP y cuando el juego ya cargó (game_ready).
 * Si el usuario rechaza, AdMob sigue con anuncios no personalizados.
 */
export async function requestAttAfterGameReady(): Promise<void> {
  if (Platform.OS !== "ios" || asked) return;
  asked = true;
  try {
    const current = await getTrackingPermissionsAsync();
    if (
      current.status === PermissionStatus.GRANTED ||
      current.status === PermissionStatus.DENIED
    ) {
      console.log("[att] already decided", current.status);
      return;
    }
    const next = await requestTrackingPermissionsAsync();
    console.log("[att] result", next.status);
  } catch (e) {
    console.warn("[att] request failed", e);
  }
}
