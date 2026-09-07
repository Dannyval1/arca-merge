import * as SplashScreen from "expo-splash-screen";

/** Si el juego nunca avisa, no dejar la app bloqueada en el splash. */
const SAFETY_MS = 20_000;

let hidden = false;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Mantener el splash nativo hasta que el juego pinte (game_ready)
 * o hasta el timeout de seguridad.
 */
export async function prepareSplash(): Promise<void> {
  try {
    await SplashScreen.preventAutoHideAsync();
  } catch (e) {
    console.warn("[splash] preventAutoHideAsync", e);
  }
}

export function armSplashSafetyTimeout(): void {
  if (safetyTimer != null || hidden) return;
  safetyTimer = setTimeout(() => {
    void hideNativeSplash("timeout-8s");
  }, SAFETY_MS);
}

export async function hideNativeSplash(reason: string): Promise<void> {
  if (hidden) return;
  hidden = true;
  if (safetyTimer != null) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  try {
    await SplashScreen.hideAsync();
    console.log("[splash] hidden:", reason);
  } catch (e) {
    console.warn("[splash] hideAsync", e);
  }
}
