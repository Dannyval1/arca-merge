/**
 * Familias tipográficas self-hosted.
 * - Baloo 2 ExtraBold → BitmapText (números / HUD dinámico)
 * - Nunito Sans SemiBold → Text estático (modales)
 */
export const BALOO_BITMAP_KEY = "baloo2";
export const NUNITO_FAMILY = '"Nunito Sans", system-ui, sans-serif';

/** Espera a que la webfont Nunito esté lista antes de crear Texts. */
export async function waitForUiFonts(timeoutMs = 2500): Promise<number> {
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (typeof document === "undefined" || !document.fonts) {
    return 0;
  }
  try {
    // Fuerza descarga aunque aún no haya nodos con la familia.
    void document.fonts.load(`600 16px "Nunito Sans"`);
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  } catch {
    // Sin fonts API: Phaser arranca igual (fallback system-ui).
  }
  const t1 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return Math.round(t1 - t0);
}
