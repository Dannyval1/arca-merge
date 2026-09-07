import { storageGetJson, storageSetJson } from "./storage";

function postPrefsToShell(prefs: SettingsPrefs): void {
  if (typeof window === "undefined" || !window.ReactNativeWebView) return;
  window.ReactNativeWebView.postMessage(
    JSON.stringify({
      type: "settings_prefs",
      haptic: prefs.haptic,
      sound: prefs.sound,
      music: prefs.music
    })
  );
}

/**
 * Preferencias de Ajustes (persistidas).
 * Audio/háptica: el juego respeta estos flags; el shell puede espejarlos.
 */
export type SettingsPrefs = {
  sound: boolean;
  music: boolean;
  haptic: boolean;
};

const KEY = "arca-settings";

const DEFAULTS: SettingsPrefs = {
  sound: true,
  music: true,
  haptic: true
};

export function getSettingsPrefs(): SettingsPrefs {
  const raw = storageGetJson<Partial<SettingsPrefs>>(KEY, {});
  return {
    sound: raw.sound ?? DEFAULTS.sound,
    music: raw.music ?? DEFAULTS.music,
    haptic: raw.haptic ?? DEFAULTS.haptic
  };
}

export function setSettingsPrefs(patch: Partial<SettingsPrefs>): SettingsPrefs {
  const next = { ...getSettingsPrefs(), ...patch };
  storageSetJson(KEY, next);
  postPrefsToShell(next);
  return next;
}

/** Al arrancar Home/Game: el shell sincroniza el toggle de vibración. */
export function syncSettingsPrefsToShell(): void {
  postPrefsToShell(getSettingsPrefs());
}
