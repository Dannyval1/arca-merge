import type { LocaleStrings } from "../powers/locale";

/**
 * Gritos de combo (x3+). Glyphs = Baloo bitmap (sin ã/ê/ô).
 * x2 sigue siendo el “x2” chico junto al merge.
 */
export const COMBO_SHOUTS: Record<number, LocaleStrings> = {
  3: { es: "¡BRUTAL!", en: "BRUTAL!", pt: "BRUTAL!" },
  4: { es: "¡CRACK!", en: "CRACK!", pt: "CRACK!" },
  5: { es: "¡ASOMBROSO!", en: "AMAZING!", pt: "ÉPICO!" },
  6: { es: "¡INSANO!", en: "INSANE!", pt: "INSANO!" },
  7: { es: "¡IMPARABLE!", en: "UNSTOPPABLE!", pt: "IMPARÁVEL!" },
  8: { es: "¡LEGENDARIO!", en: "LEGENDARY!", pt: "LENDÁRIO!" }
};

export function comboShoutFor(count: number): LocaleStrings {
  if (count <= 3) return COMBO_SHOUTS[3];
  if (count >= 8) return COMBO_SHOUTS[8];
  return COMBO_SHOUTS[count] ?? COMBO_SHOUTS[8];
}

/** Tintes vivos sobre el arca (el crema 0xfff2c8 se perdía). */
export const COMBO_SHOUT_TINTS: Record<number, number> = {
  3: 0xffe066,
  4: 0xff9f43,
  5: 0xff6b6b,
  6: 0x7dffb3,
  7: 0x6ec8ff,
  8: 0xfff36a
};

export function comboShoutTint(count: number): number {
  if (count <= 3) return COMBO_SHOUT_TINTS[3];
  if (count >= 8) return COMBO_SHOUT_TINTS[8];
  return COMBO_SHOUT_TINTS[count] ?? COMBO_SHOUT_TINTS[8];
}

/** CSS hex colors for Canvas renderer (no setTint). */
export const COMBO_SHOUT_COLORS: Record<number, string> = {
  3: "#ffe066",
  4: "#ff9f43",
  5: "#ff6b6b",
  6: "#7dffb3",
  7: "#6ec8ff",
  8: "#fff36a"
};

export function comboShoutColor(count: number): string {
  if (count <= 3) return COMBO_SHOUT_COLORS[3];
  if (count >= 8) return COMBO_SHOUT_COLORS[8];
  return COMBO_SHOUT_COLORS[count] ?? COMBO_SHOUT_COLORS[8];
}
