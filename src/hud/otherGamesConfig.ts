import type { LocaleStrings } from "../powers/locale";

export type OtherGame = {
  id: string;
  name: LocaleStrings;
  blurb: LocaleStrings;
  androidUrl: string;
  iosUrl: string;
};

/** Juegos del estudio. Añadir filas aquí cuando salga el siguiente. */
export const OTHER_GAMES: OtherGame[] = [
  {
    id: "impostor-biblico",
    name: {
      es: "Impostor Bíblico",
      en: "Biblical Impostor",
      pt: "Impostor Bíblico"
    },
    blurb: {
      es: "Descubre quién miente en la fiesta\nbíblica",
      en: "Find who is lying in the Bible\nparty",
      pt: "Descubra quem mente na festa\nbíblica"
    },
    androidUrl:
      "https://play.google.com/store/apps/details?id=com.dannyv12.impostorbiblico",
    iosUrl: "https://apps.apple.com/app/id6758225650"
  }
];

let hostStore: "ios" | "android" | null = null;

/** Lo inyecta el shell nativo (más fiable que el user-agent del WebView). */
export function setHostStore(platform: "ios" | "android"): void {
  hostStore = platform;
}

export function storeUrlFor(game: OtherGame): string {
  if (hostStore === "ios") return game.iosUrl;
  if (hostStore === "android") return game.androidUrl;
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const touch =
    typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  if (/Android/i.test(ua)) return game.androidUrl;
  if (/iPhone|iPad|iPod/i.test(ua)) return game.iosUrl;
  // iPadOS 13+ a veces se reporta como Macintosh.
  if (/Macintosh/i.test(ua) && touch > 1) return game.iosUrl;
  return game.androidUrl;
}
