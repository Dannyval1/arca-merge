import * as Haptics from "expo-haptics";
import type { HapticIntensity } from "./bridge";

/**
 * expo-haptics: Impact Light / Medium / Heavy.
 * El caller debe haber comprobado el toggle (settings_prefs.haptic).
 */
export async function playHaptic(intensity: HapticIntensity): Promise<void> {
  const style =
    intensity === "heavy"
      ? Haptics.ImpactFeedbackStyle.Heavy
      : intensity === "medium"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  try {
    await Haptics.impactAsync(style);
  } catch (e) {
    console.warn("[shell] haptic failed", e);
  }
}
