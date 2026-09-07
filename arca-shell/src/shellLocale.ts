/**
 * i18n mínimo del shell RN (BootLoader / errores).
 * Usa el idioma del dispositivo; no depende del storage del juego.
 */
export type ShellLocale = "es" | "en" | "pt";

type Map = { es: string; en: string; pt: string };

function detect(): ShellLocale {
  try {
    const nav = (globalThis as { navigator?: { language?: string } }).navigator;
    const lang =
      (typeof Intl !== "undefined" &&
        Intl.DateTimeFormat().resolvedOptions().locale) ||
      nav?.language ||
      "es";
    const l = String(lang).toLowerCase();
    if (l.startsWith("pt")) return "pt";
    if (l.startsWith("en")) return "en";
  } catch {
    // fall through
  }
  return "es";
}

let cached: ShellLocale | null = null;

export function getShellLocale(): ShellLocale {
  if (!cached) cached = detect();
  return cached;
}

export function st(map: Map): string {
  return map[getShellLocale()];
}

export const SHELL_COPY = {
  loading: {
    es: "Cargando…",
    en: "Loading…",
    pt: "Carregando…"
  },
  loadErrorTitle: {
    es: "Error al cargar el juego",
    en: "Couldn't load the game",
    pt: "Erro ao carregar o jogo"
  },
  loadErrorVite: {
    es: "Revisa viteDevUrl en src/config.ts y que el Mac esté en la misma Wi‑Fi.",
    en: "Check viteDevUrl in src/config.ts and that the Mac is on the same Wi‑Fi.",
    pt: "Verifique viteDevUrl em src/config.ts e se o Mac está na mesma Wi‑Fi."
  },
  loadErrorSync: {
    es: "Ejecuta `npm run sync-game` y vuelve a compilar.",
    en: "Run `npm run sync-game` and rebuild.",
    pt: "Execute `npm run sync-game` e compile de novo."
  }
} as const;
