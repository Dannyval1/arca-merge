import { getStorage, STORAGE_KEYS, storageGetJson, storageSetJson } from "../storage";
import type { PowerId } from "./powerDefs";

/**
 * Locales de lanzamiento: español, inglés, portugués de Brasil.
 * Persistido en `arca-locale`. Si no hay preferencia, se infiere del dispositivo.
 */
export type GameLocale = "es" | "en" | "pt";

export type LocaleStrings = { es: string; en: string; pt?: string };

const LOCALE_KEY = "arca-locale";

let cachedLocale: GameLocale | null = null;

function detectDeviceLocale(): GameLocale {
  if (typeof navigator === "undefined") return "es";
  const lang = (navigator.language || "es").toLowerCase();
  if (lang.startsWith("pt")) return "pt";
  if (lang.startsWith("en")) return "en";
  return "es";
}

function parseLocale(raw: string | null): GameLocale | null {
  if (raw === "es" || raw === "en" || raw === "pt") return raw;
  return null;
}

export function getGameLocale(): GameLocale {
  if (cachedLocale) return cachedLocale;
  const stored = parseLocale(getStorage().getItem(LOCALE_KEY));
  if (stored) {
    cachedLocale = stored;
    return stored;
  }
  cachedLocale = detectDeviceLocale();
  return cachedLocale;
}

export function setGameLocale(locale: GameLocale): void {
  cachedLocale = locale;
  getStorage().setItem(LOCALE_KEY, locale);
}

/** Texto localizado. `pt` cae a `es` si falta (migración gradual de copy). */
export function t(map: LocaleStrings): string {
  const loc = getGameLocale();
  if (loc === "pt") return map.pt ?? map.es;
  return map[loc];
}

type SeenMap = Partial<Record<PowerId, boolean>>;

export function hasSeenPower(id: PowerId): boolean {
  const map = storageGetJson<SeenMap>(STORAGE_KEYS.powerSeen, {});
  return map[id] === true;
}

export function markPowerSeen(id: PowerId): void {
  const map = storageGetJson<SeenMap>(STORAGE_KEYS.powerSeen, {});
  if (map[id]) return;
  map[id] = true;
  storageSetJson(STORAGE_KEYS.powerSeen, map);
}

export function clearPowerSeenFlags(): void {
  storageSetJson(STORAGE_KEYS.powerSeen, {});
}
