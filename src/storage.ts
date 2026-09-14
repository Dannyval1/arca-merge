/**
 * Capa de persistencia abstracta.
 *
 * En navegador: localStorage.
 * En el shell: tryInstallNativeStorageFromShell() instala un cache síncrono
 * hidratado ANTES del WebView; las escrituras se espejan a AsyncStorage
 * por el puente (storage_set / storage_remove).
 */

export interface GameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEYS = {
  best: "arca-best",
  olives: "arca-olives",
  /** JSON: { "raven": true, ... } — primera vez vista de cada poder (vida del jugador). */
  powerSeen: "arca-power-seen",
  /** "1" si el jugador ya completó el arca al menos una vez en su vida. */
  arkCompleteSeen: "arca-ark-complete-seen",
  /** "1" si compró Quitar anuncios (vida del jugador). */
  adsRemoved: "arca-ads-removed",
  /** Partidas terminadas (para reseña ≥ 3). */
  gamesPlayed: "arca-games-played",
  /** Epoch ms de la última petición de reseña. */
  lastReviewAskAt: "arca-last-review-ask",
  /** "1" si ya se mostró el modal de compartir (1× vida). */
  shareOfferShown: "arca-share-offer-shown",
  /** "1" si ya se otorgaron los olivos por compartir. */
  shareRewardClaimed: "arca-share-reward-claimed"
} as const;

/** Claves que el shell hidrata / migra (más locale y ajustes). */
export const NATIVE_MIRROR_KEYS = [
  STORAGE_KEYS.best,
  STORAGE_KEYS.olives,
  STORAGE_KEYS.powerSeen,
  STORAGE_KEYS.arkCompleteSeen,
  STORAGE_KEYS.adsRemoved,
  STORAGE_KEYS.gamesPlayed,
  STORAGE_KEYS.lastReviewAskAt,
  STORAGE_KEYS.shareOfferShown,
  STORAGE_KEYS.shareRewardClaimed,
  "arca-settings",
  "arca-locale",
  "arca-daily-grant",
  "arca-daily-modal-pending",
  "arca-daily-doubled"
] as const;

const NATIVE_MIGRATED = "arca-storage-migrated";
const CRITICAL_KEYS = [STORAGE_KEYS.best, STORAGE_KEYS.olives] as const;

function hasValue(v: string | null | undefined): v is string {
  return typeof v === "string" && v !== "";
}

/** Si ambos existen y son números, el más alto. Nunca elige vacío. */
function pickNumericFloor(
  native: string | undefined,
  web: string | null
): string | undefined {
  const a = hasValue(native) ? native : undefined;
  const b = hasValue(web) ? web : undefined;
  if (a && b) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return String(Math.max(na, nb));
    }
    return a;
  }
  return a ?? b;
}

class LocalStorageBackend implements GameStorage {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Cuota llena o modo privado: el juego sigue sin persistir.
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

let backend: GameStorage = new LocalStorageBackend();

/** El shell RN llama esto una vez al boot con su adaptador nativo. */
export function setStorageBackend(next: GameStorage): void {
  backend = next;
}

declare global {
  interface Window {
    /** Snapshot síncrono que inyecta el shell ANTES de cargar el juego. */
    __ARCA_NATIVE_STORAGE__?: Record<string, string>;
  }
}

function postStorageToShell(key: string, value: string | null): void {
  if (typeof window === "undefined" || !window.ReactNativeWebView) return;
  window.ReactNativeWebView.postMessage(
    JSON.stringify(
      value == null
        ? { type: "storage_remove", key }
        : { type: "storage_set", key, value }
    )
  );
}

function readWebItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function mirrorCriticalToWeb(key: string, value: string | null): void {
  if (!(CRITICAL_KEYS as readonly string[]).includes(key)) return;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * Si el shell inyectó un snapshot, sustituye localStorage por un cache
 * síncrono. Migración: copia del WebView SOLO huecos; nunca pisa nativo
 * con vacío. Récord/olivos: piso numérico (max) entre nativo y WebView.
 * Llamar en boot(), antes de new Phaser.Game.
 */
export function tryInstallNativeStorageFromShell(): void {
  if (typeof window === "undefined") return;
  const snap = window.__ARCA_NATIVE_STORAGE__;
  if (!snap || typeof snap !== "object") return;

  const cache: Record<string, string> = {};
  for (const [key, value] of Object.entries(snap)) {
    if (hasValue(value)) cache[key] = value;
  }

  const already = cache[NATIVE_MIGRATED] === "1";
  let dirty = false;

  if (!already) {
    for (const key of NATIVE_MIRROR_KEYS) {
      if ((CRITICAL_KEYS as readonly string[]).includes(key)) continue;
      if (hasValue(cache[key])) continue;
      const fromWeb = readWebItem(key);
      if (hasValue(fromWeb)) {
        cache[key] = fromWeb;
        dirty = true;
      }
    }
    cache[NATIVE_MIGRATED] = "1";
    dirty = true;
  }

  // Récord / olivos: cada boot. Nativo vacío + WebView lleno → WebView.
  // WebView vacío o limpiado → nativo intacto. Ambos con número → el mayor.
  for (const key of CRITICAL_KEYS) {
    const picked = pickNumericFloor(cache[key], readWebItem(key));
    if (picked === undefined) continue;
    if (cache[key] !== picked) {
      cache[key] = picked;
      dirty = true;
    }
  }

  if (dirty) {
    for (const [key, value] of Object.entries(cache)) {
      if (!hasValue(value)) continue;
      postStorageToShell(key, value);
    }
  }

  setStorageBackend({
    getItem(key) {
      const v = cache[key];
      return v === undefined ? null : v;
    },
    setItem(key, value) {
      cache[key] = value;
      postStorageToShell(key, value);
      mirrorCriticalToWeb(key, value);
    },
    removeItem(key) {
      delete cache[key];
      postStorageToShell(key, null);
      mirrorCriticalToWeb(key, null);
    }
  });
}

export function getStorage(): GameStorage {
  return backend;
}

export function storageGetNumber(key: string, fallback = 0): number {
  const raw = backend.getItem(key);
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function storageSetNumber(key: string, value: number): void {
  backend.setItem(key, String(Math.max(0, Math.floor(value))));
}

export function storageGetJson<T>(key: string, fallback: T): T {
  const raw = backend.getItem(key);
  if (raw === null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageSetJson(key: string, value: unknown): void {
  try {
    backend.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
