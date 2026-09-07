import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Persistencia nativa para el juego.
 *
 * Phaser lee de forma síncrona: hidratamos un snapshot ANTES del WebView.
 * Las escrituras llegan por el puente y se guardan en `latest` (último valor
 * gana). Récord y olivos se flushean a AsyncStorage de inmediato; el resto
 * espera el flush de `app_background` (el SO avisa antes de matar el proceso).
 *
 * Varias setItem en vuelo del mismo key pueden completarse fuera de orden
 * (128 olivos en pantalla, 100 en disco). Por eso nunca lanzamos setItem
 * sueltos: un único `multiSet` serializado con el mapa `latest`.
 */
export const CRITICAL_NATIVE_KEYS = ["arca-best", "arca-olives"] as const;

const criticalSet = new Set<string>(CRITICAL_NATIVE_KEYS);

/** Último valor por clave. `null` = remove. */
const latest = new Map<string, string | null>();

/** Espejo para reinyectar si el WebView recarga. */
let snapshot: Record<string, string> = {};

let flushChain: Promise<void> = Promise.resolve();

function isCritical(key: string): boolean {
  return criticalSet.has(key);
}

function remember(key: string, value: string | null): void {
  latest.set(key, value);
  if (value == null) delete snapshot[key];
  else snapshot[key] = value;
}

async function flushNow(): Promise<void> {
  const entries = [...latest.entries()];
  if (entries.length === 0) return;

  const sets: [string, string][] = [];
  const removes: string[] = [];
  for (const [key, value] of entries) {
    if (value == null) removes.push(key);
    else sets.push([key, value]);
  }

  try {
    if (sets.length > 0) await AsyncStorage.multiSet(sets);
    if (removes.length > 0) await AsyncStorage.multiRemove(removes);
  } catch (e) {
    console.warn("[shell] native storage flush failed", e);
  }
}

/**
 * Escribe todo lo pendiente. Encadenado: un flush no pisa al siguiente
 * con valores viejos.
 */
export function flushPendingNativeStorage(): Promise<void> {
  const run = () => flushNow();
  flushChain = flushChain.then(run, run);
  return flushChain;
}

export async function hydrateNativeStorage(): Promise<Record<string, string>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const arca = keys.filter((k) => k.startsWith("arca-"));
    if (arca.length === 0) {
      snapshot = {};
      return {};
    }
    const pairs = await AsyncStorage.multiGet(arca);
    const out: Record<string, string> = {};
    for (const [key, value] of pairs) {
      if (key && value != null && value !== "") out[key] = value;
    }
    snapshot = { ...out };
    for (const [key, value] of Object.entries(out)) {
      latest.set(key, value);
    }
    return out;
  } catch (e) {
    console.warn("[shell] hydrateNativeStorage", e);
    snapshot = {};
    return {};
  }
}

export function getNativeSnapshot(): Record<string, string> {
  return { ...snapshot };
}

export function persistNativeKey(key: string, value: string): void {
  remember(key, value);
  if (isCritical(key)) void flushPendingNativeStorage();
}

export function removeNativeKey(key: string): void {
  remember(key, null);
  if (isCritical(key)) void flushPendingNativeStorage();
}

/** JS inyectado antes del juego: snapshot síncrono en window. */
export function nativeStorageInjectScript(
  data: Record<string, string> = snapshot
): string {
  return `window.__ARCA_NATIVE_STORAGE__=${JSON.stringify(data)};true;`;
}
