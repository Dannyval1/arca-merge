/**
 * Puente juego ↔ shell nativo (React Native WebView).
 *
 * ─────────────────────────────────────────────────────────────
 * CONTRATO DE MENSAJES (lo que el shell RN debe implementar)
 * ─────────────────────────────────────────────────────────────
 *
 * Juego → Shell (vía ReactNativeWebView.postMessage, JSON string):
 *   { type: "game_start" }
 *   { type: "game_ready" } — Home cargó; shell oculta splash nativo
 *   { type: "game_over", score, best, arkCompletes?, isNewBest? }
 *   { type: "ark_complete" }
 *       Reseña #1: clímax de satisfacción. El shell pide reseña nativa aquí.
 *   { type: "request_store_review", reason: "ark_complete" | "new_best" }
 *       Hook documentado. new_best = 2º mejor momento (récord en game over).
 *       El juego puede emitir esto más adelante; el shell NO implementa aún
 *       el prompt (StoreKit / In-App Review). No spamear: tope de OS.
 *   { type: "haptic", intensity: "light" | "medium" | "heavy" }
 *   { type: "request_remove_ads", requestId: string }
 *   { type: "open_shop" }
 *   { type: "open_settings" }  — aviso; la UI de Ajustes vive en el juego
 *   { type: "open_privacy_policy" } — shell abre URL de privacidad (obligatorio tiendas)
 *   { type: "open_ad_consent" } — UMP: el usuario cambia su consentimiento GDPR
 *   { type: "open_url", url: string } — store / enlace externo (otros juegos)
 *   { type: "restore_purchases", requestId } — Apple exige restore; responde remove_ads_result
 *   { type: "request_rewarded_ad", requestId: string, powerId: string }
 *   { type: "purchase_olives", requestId: string, packageId: string }
 *   { type: "request_shop_catalog" }
 *       El shell responde con shop_catalog (precios de RevenueCat).
 *
 * INTERSTICIALES (regla firme — Fase 3 AdMob):
 *   - Nunca sin aviso previo al jugador.
 *   - Nunca cortando una acción que el jugador acaba de tomar
 *     (p. ej. NO después de "Jugar de nuevo").
 *   - Momentos válidos: ANTES del modal de resultado, O entre el modal y la
 *     nueva partida con countdown ("Volvemos en 3…", estilo Fruit Merge).
 *   - Tope: como máximo 1 cada 3 minutos.
 *
 * Shell → Juego (inyectar en el WebView):
 *   window.postMessage(JSON.stringify(payload), "*")
 *   —o, en Android WebView clásico—
 *   document.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }))
 *
 * Respuestas con el mismo requestId de la petición:
 *   { type: "rewarded_ad_result", requestId, status:
 *       "completed" | "dismissed" | "unavailable" | "error", reason?: "daily_cap" }
 *   { type: "game_over_ads_done" } — intersticial cerrado o saltado; ya se puede
 *       mostrar el modal de resultado.
 *   { type: "purchase_olives_result", requestId, status:
 *       "completed" | "cancelled" | "unavailable" | "error" | "pending", olivesGranted?: number }
 *   { type: "remove_ads_result", requestId, status:
 *       "completed" | "cancelled" | "unavailable" | "error" | "pending" }
 *       También tras restore_purchases (mismo requestId).
 *   { type: "shop_catalog", products: [{ packageId, priceLabel }] }
 *       priceLabel es el string de la tienda (nunca lo inventa el juego).
 *
 * Si el shell no responde: IAP/remove-ads → `BRIDGE_REQUEST_TIMEOUT_MS` (error);
 * rewarded → `BRIDGE_REWARDED_TIMEOUT_MS` (unavailable). Nunca se cuelga.
 *
 * En navegador (sin ReactNativeWebView) hay un stub configurable vía
 * `window.arcaBridgeStub` para simular completed / dismissed / unavailable /
 * error / timeout sin montar el shell.
 * ─────────────────────────────────────────────────────────────
 */

import { getSettingsPrefs } from "./settingsPrefs";
import { setHostStore } from "./hud/otherGamesConfig";
import { setNetworkOnline, isNetworkOnline } from "./networkStatus";
import { setPrivacyOptionsRequired } from "./privacyOptions";

export type ShopCatalogProduct = {
  packageId: string;
  priceLabel: string;
};

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void };
    /**
     * Solo navegador. Controla cómo responde el stub:
     *   rewarded: "completed" (default) | "dismissed" | "unavailable" | "error" | "timeout"
     *   purchase: "completed" (default) | "cancelled" | "unavailable" | "error" | "timeout"
     *   removeAds: "completed" (default) | "cancelled" | "unavailable" | "error" | "timeout"
     *   olivesGranted: número de hojas si purchase=completed (default: del paquete)
     *   shopCatalog: precios de prueba. Si falta, el juego muestra "…" (no inventa $).
     */
    arcaBridgeStub?: {
      rewarded?: "completed" | "dismissed" | "unavailable" | "error" | "timeout";
      purchase?: "completed" | "cancelled" | "unavailable" | "error" | "pending" | "timeout";
      removeAds?: "completed" | "cancelled" | "unavailable" | "error" | "pending" | "timeout";
      olivesGranted?: number;
      shopCatalog?: ShopCatalogProduct[];
    };
  }
}

export const BRIDGE_REQUEST_TIMEOUT_MS = 45_000;
/** Rewarded real suele durar 15–60s; 12s cortaba el grant y reanudaba la música a mitad del anuncio. */
export const BRIDGE_REWARDED_TIMEOUT_MS = 120_000;
/** Mid-run: si el ad no abre, no dejar el tablero congelado 2 minutos. */
export const BRIDGE_INTERSTITIAL_TIMEOUT_MS = 20_000;
/** true = 3-2-1 en el juego, sin AdMob. Poner en false al cablear el rewarded real. */
export const STUB_REWARDED_ADS = false;
/** true = el botón AD del modal de poder usa el 3-2-1 (sin AdMob). Diario / Continuar siguen reales. */
export const STUB_POWER_REWARDED_ADS = false;

export type BridgeOutEvent =
  | {
      type: "game_over";
      score: number;
      best: number;
      arkCompletes?: number;
      isNewBest?: boolean;
      olivesEarned?: number;
      durationSec?: number;
      /**
       * false = TERMINAR en el modal de continue (ya rechazó rewarded).
       * true / omitido = 2ª muerte → intersticial antes del modal GO.
       */
      showInterstitial?: boolean;
    }
  | { type: "game_start" }
  /** Home ya pintó; el shell puede ocultar el splash nativo. */
  | { type: "game_ready" }
  | { type: "ark_complete" }
  /** Pedir reseña nativa. reason documenta el momento; shell aún no implementa. */
  | { type: "request_store_review"; reason: "ark_complete" | "new_best" }
  | { type: "haptic"; intensity: "light" | "medium" | "heavy" }
  /** Espejo del toggle de Ajustes. El shell no vibra si haptic es false. */
  | { type: "settings_prefs"; haptic: boolean; sound: boolean; music: boolean }
  | { type: "storage_set"; key: string; value: string }
  | { type: "storage_remove"; key: string }
  | { type: "request_remove_ads"; requestId: string }
  | { type: "open_shop" }
  | { type: "open_settings" }
  | { type: "open_privacy_policy" }
  | { type: "open_ad_consent" }
  | { type: "open_url"; url: string }
  | { type: "restore_purchases"; requestId: string }
  | { type: "request_rewarded_ad"; requestId: string; powerId: string }
  /** Intersticial a mitad de partida (u otro placement). */
  | { type: "request_interstitial"; requestId: string; placement: string }
  /** Abrir hoja nativa de compartir (recomendación + link tienda). */
  | { type: "request_share"; requestId: string; message: string }
  | { type: "purchase_olives"; requestId: string; packageId: string }
  | { type: "request_shop_catalog" }
  | { type: "power_used"; powerId: string }
  | { type: "daily_reward_claimed"; olives: number; doubled: boolean };

export type RewardedAdStatus =
  | "completed"
  | "dismissed"
  | "unavailable"
  | "error";

export type PurchaseStatus =
  | "completed"
  | "cancelled"
  | "unavailable"
  | "error"
  | "pending";

export type BridgeInEvent =
  | {
      type: "rewarded_ad_result";
      requestId: string;
      status: RewardedAdStatus;
      reason?: "daily_cap";
    }
  | {
      type: "purchase_olives_result";
      requestId: string;
      status: PurchaseStatus;
      olivesGranted?: number;
    }
  | {
      type: "remove_ads_result";
      requestId: string;
      status: PurchaseStatus;
    }
  | { type: "shop_catalog"; products: ShopCatalogProduct[] }
  | { type: "app_background" }
  | { type: "app_foreground" }
  | { type: "shell_info"; platform: "ios" | "android" | "web"; privacyOptionsRequired?: boolean }
  | { type: "game_over_ads_done" }
  | {
      type: "interstitial_ad_result";
      requestId: string;
      status: "shown" | "skipped" | "error";
    }
  | {
      type: "share_result";
      requestId: string;
      status: "shared" | "dismissed" | "unavailable" | "error";
    }
  | { type: "connectivity"; online: boolean };

export type AppLifecycleType = "app_background" | "app_foreground";

type LifecycleHandler = (type: AppLifecycleType) => void;

const lifecycleHandlers = new Set<LifecycleHandler>();

/** Suscripción a pausa/reanudación enviada por el shell. */
export function onAppLifecycle(handler: LifecycleHandler): () => void {
  lifecycleHandlers.add(handler);
  return () => lifecycleHandlers.delete(handler);
}

let adAudioPause: (() => void) | null = null;
let adAudioResume: (() => void) | null = null;

/** GameAudio registra aquí para silenciar BGM mientras corre un fullscreen ad. */
export function setAdAudioGuards(pause: () => void, resume: () => void): void {
  adAudioPause = pause;
  adAudioResume = resume;
}

function pauseAdAudio(): void {
  adAudioPause?.();
}

function resumeAdAudio(): void {
  adAudioResume?.();
}

/** @deprecated Usa BridgeOutEvent. Alias para no romper imports viejos. */
export type BridgeEvent = BridgeOutEvent;

type Pending = {
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();
let listening = false;
let requestSeq = 0;
let lastRewardedReason: "daily_cap" | undefined;
let gameOverAdsWaiter: (() => void) | null = null;

/** Tras un rewarded unavailable: "daily_cap" si el tope diario del shell se agotó. */
export function consumeRewardedReason(): "daily_cap" | undefined {
  const r = lastRewardedReason;
  lastRewardedReason = undefined;
  return r;
}

const GAME_OVER_ADS_TIMEOUT_MS = 25_000;

/** El juego espera esto ANTES de pintar el modal de resultado. */
export function waitForGameOverAdsDone(): Promise<void> {
  if (!isInWebView()) return Promise.resolve();
  pauseAdAudio();
  return new Promise<void>((resolve) => {
    let settled = false;
    let sawBackground = false;
    let unsubLifecycle = (): void => undefined;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubLifecycle();
      gameOverAdsWaiter = null;
      resolve();
    };

    // Si había un waiter previo (GO raro doble), liberarlo.
    if (gameOverAdsWaiter) gameOverAdsWaiter();

    const timer = setTimeout(() => {
      console.warn("[bridge] game_over_ads_done timeout");
      finish();
    }, GAME_OVER_ADS_TIMEOUT_MS);

    // Si el inject se pierde tras el intersticial, el foreground
    // (ad cerrado) desbloquea el modal sin esperar el timeout.
    unsubLifecycle = onAppLifecycle((type) => {
      if (type === "app_background") {
        sawBackground = true;
        return;
      }
      if (type === "app_foreground" && sawBackground) {
        setTimeout(finish, 350);
      }
    });

    gameOverAdsWaiter = finish;
  }).finally(() => resumeAdAudio());
}

function finishGameOverAdsWait(): void {
  gameOverAdsWaiter?.();
}

function nextRequestId(prefix: string): string {
  requestSeq += 1;
  return `${prefix}-${Date.now()}-${requestSeq}`;
}

function isInWebView(): boolean {
  return typeof window !== "undefined" && !!window.ReactNativeWebView;
}

export function sendToShell(event: BridgeOutEvent): void {
  // Háptica: el shell vibra el teléfono; respeta el toggle de Ajustes.
  if (event.type === "haptic" && !getSettingsPrefs().haptic) return;
  const msg = JSON.stringify(event);
  if (isInWebView()) {
    window.ReactNativeWebView!.postMessage(msg);
  } else {
    console.log("[bridge→]", msg);
  }
}

/** Store / web. En el teléfono lo abre el shell; en navegador, una pestaña. */
export function openExternalUrl(url: string): void {
  if (isInWebView()) {
    sendToShell({ type: "open_url", url });
    return;
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    console.log("[bridge→open_url]", url);
  }
}

function settleRequest(requestId: string, value: unknown): void {
  const entry = pending.get(requestId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(requestId);
  entry.resolve(value);
}

function parseIncoming(raw: unknown): BridgeInEvent | null {
  try {
    const data =
      typeof raw === "string"
        ? JSON.parse(raw)
        : typeof (raw as MessageEvent)?.data === "string"
          ? JSON.parse((raw as MessageEvent).data)
          : raw;
    if (!data || typeof data !== "object") return null;
    const type = (data as { type?: string }).type;
    if (
      type === "rewarded_ad_result" ||
      type === "purchase_olives_result" ||
      type === "remove_ads_result" ||
      type === "shop_catalog" ||
      type === "app_background" ||
      type === "app_foreground" ||
      type === "shell_info" ||
      type === "connectivity"
    ) {
      return data as BridgeInEvent;
    }
    return null;
  } catch {
    return null;
  }
}

function handleIncoming(raw: unknown): void {
  const event = parseIncoming(raw);
  if (!event) return;

  if (event.type === "app_background" || event.type === "app_foreground") {
    for (const h of lifecycleHandlers) h(event.type);
    return;
  }

  if (event.type === "shell_info") {
    if (event.platform === "ios" || event.platform === "android") {
      setHostStore(event.platform);
    }
    if (typeof event.privacyOptionsRequired === "boolean") {
      setPrivacyOptionsRequired(event.privacyOptionsRequired);
    }
    return;
  }

  if (event.type === "connectivity") {
    setNetworkOnline(event.online);
    return;
  }

  if (event.type === "shop_catalog") {
    applyShopCatalog(event.products);
    return;
  }

  if (event.type === "rewarded_ad_result") {
    lastRewardedReason = event.reason;
    settleRequest(event.requestId, event.status);
    return;
  }
  if (event.type === "game_over_ads_done") {
    finishGameOverAdsWait();
    return;
  }
  if (event.type === "interstitial_ad_result") {
    settleRequest(event.requestId, event.status);
    return;
  }
  if (event.type === "share_result") {
    settleRequest(event.requestId, event.status);
    return;
  }
  if (event.type === "purchase_olives_result") {
    settleRequest(event.requestId, {
      status: event.status,
      olivesGranted: event.olivesGranted ?? 0
    });
    return;
  }
  if (event.type === "remove_ads_result") {
    settleRequest(event.requestId, event.status);
  }
}

/** Idempotente: se puede llamar desde create() sin duplicar listeners. */
export function startBridgeListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  const onMessage = (ev: Event): void => {
    const me = ev as MessageEvent;
    handleIncoming(me.data ?? ev);
  };

  // iOS WKWebView / browsers
  window.addEventListener("message", onMessage);
  // Android ReactNative WebView legacy
  document.addEventListener("message", onMessage);
  (window as Window & { __arcaBridgeIn?: (raw: unknown) => void }).__arcaBridgeIn =
    handleIncoming;
}

function enqueueRequest<T>(
  requestId: string,
  send: () => void,
  stub: () => T | "timeout",
  onTimeout: T,
  timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS
): Promise<T> {
  startBridgeListener();

  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      console.warn(`[bridge] timeout requestId=${requestId}`);
      resolve(onTimeout);
    }, timeoutMs);

    pending.set(requestId, {
      resolve: resolve as (value: unknown) => void,
      timer
    });

    if (isInWebView()) {
      send();
      return;
    }

    const result = stub();
    if (result === "timeout") {
      console.log(`[bridge stub] simulando timeout para ${requestId}`);
      return;
    }
    queueMicrotask(() => settleRequest(requestId, result));
  });
}

/**
 * Pide un rewarded ad al shell. En navegador el stub resuelve según
 * `window.arcaBridgeStub.rewarded` (default: completed).
 */
export function requestRewardedAd(powerId: string): Promise<RewardedAdStatus> {
  if (!isNetworkOnline()) {
    return Promise.resolve("unavailable");
  }
  const requestId = nextRequestId("ad");
  pauseAdAudio();
  return enqueueRequest<RewardedAdStatus>(
    requestId,
    () => sendToShell({ type: "request_rewarded_ad", requestId, powerId }),
    () => {
      const mode = window.arcaBridgeStub?.rewarded ?? "completed";
      console.log(`[bridge stub] rewarded_ad powerId=${powerId} → ${mode}`);
      if (mode === "timeout") return "timeout";
      return mode;
    },
    "unavailable",
    BRIDGE_REWARDED_TIMEOUT_MS
  ).finally(() => resumeAdAudio());
}

export type InterstitialAdStatus = "shown" | "skipped" | "error";

/**
 * Intersticial a mitad de partida (u otro placement). Stub de navegador = skipped.
 */
export function requestInterstitialAd(
  placement: string,
  timeoutMs = BRIDGE_INTERSTITIAL_TIMEOUT_MS
): Promise<InterstitialAdStatus> {
  if (!isNetworkOnline()) {
    return Promise.resolve("skipped");
  }
  const requestId = nextRequestId("int");
  pauseAdAudio();
  return enqueueRequest<InterstitialAdStatus>(
    requestId,
    () => sendToShell({ type: "request_interstitial", requestId, placement }),
    () => {
      console.log(`[bridge stub] interstitial placement=${placement} → skipped`);
      return "skipped";
    },
    "skipped",
    timeoutMs
  ).finally(() => resumeAdAudio());
}

export type ShareStatus = "shared" | "dismissed" | "unavailable" | "error";

/**
 * Hoja nativa de compartir. En navegador: stub shared.
 */
export function requestShare(message: string): Promise<ShareStatus> {
  const requestId = nextRequestId("share");
  return enqueueRequest<ShareStatus>(
    requestId,
    () => sendToShell({ type: "request_share", requestId, message }),
    () => {
      console.log("[bridge stub] share → shared");
      return "shared";
    },
    "unavailable",
    BRIDGE_REQUEST_TIMEOUT_MS
  );
}

export type PurchaseResult = {
  status: PurchaseStatus | "error";
  olivesGranted: number;
};

/**
 * Pide una compra de hojas al shell. Stub de navegador según
 * `window.arcaBridgeStub.purchase` (default: completed, 50 hojas).
 */
export function purchaseOlives(packageId: string): Promise<PurchaseResult> {
  const requestId = nextRequestId("iap");
  return enqueueRequest<PurchaseResult>(
    requestId,
    () => sendToShell({ type: "purchase_olives", requestId, packageId }),
    () => {
      const mode = window.arcaBridgeStub?.purchase ?? "completed";
      // Si el stub no fija olivesGranted, usa la cantidad del paquete de shopConfig.
      let olivesGranted = window.arcaBridgeStub?.olivesGranted;
      if (olivesGranted == null) {
        const match = packageId.match(/^olives[_-](\d+)$/);
        olivesGranted = match ? Number(match[1]) : 50;
      }
      console.log(
        `[bridge stub] purchase_olives packageId=${packageId} → ${mode}`
      );
      if (mode === "timeout") return "timeout";
      if (mode === "completed") {
        return { status: "completed", olivesGranted };
      }
      return { status: mode, olivesGranted: 0 };
    },
    { status: "error", olivesGranted: 0 }
  );
}

/**
 * Pide Quitar anuncios al shell. Stub de navegador según
 * `window.arcaBridgeStub.removeAds` (default: completed).
 */
export function requestRemoveAds(): Promise<PurchaseStatus> {
  const requestId = nextRequestId("ads");
  return enqueueRequest<PurchaseStatus>(
    requestId,
    () => sendToShell({ type: "request_remove_ads", requestId }),
    () => {
      const mode = window.arcaBridgeStub?.removeAds ?? "completed";
      console.log(`[bridge stub] request_remove_ads → ${mode}`);
      if (mode === "timeout") return "timeout";
      return mode;
    },
    "error"
  );
}

/**
 * Restaura compras (obligatorio Apple). Misma respuesta que remove_ads:
 * `remove_ads_result` con el requestId.
 */
export function restorePurchases(): Promise<PurchaseStatus> {
  const requestId = nextRequestId("restore");
  return enqueueRequest<PurchaseStatus>(
    requestId,
    () => sendToShell({ type: "restore_purchases", requestId }),
    () => {
      const mode = window.arcaBridgeStub?.removeAds ?? "completed";
      console.log(`[bridge stub] restore_purchases → ${mode}`);
      if (mode === "timeout") return "timeout";
      return mode;
    },
    "error"
  );
}

const shopPrices = new Map<string, string>();
const shopCatalogListeners = new Set<() => void>();

function applyShopCatalog(products: ShopCatalogProduct[]): void {
  shopPrices.clear();
  for (const p of products) {
    const label = (p.priceLabel ?? "").trim();
    if (p.packageId && label) shopPrices.set(p.packageId, label);
  }
  for (const h of shopCatalogListeners) h();
}

/** Precio de tienda o null si RevenueCat aún no lo mandó. Nunca un fallback inventado. */
export function getShopPrice(packageId: string): string | null {
  return shopPrices.get(packageId) ?? null;
}

export function onShopCatalog(handler: () => void): () => void {
  shopCatalogListeners.add(handler);
  return () => shopCatalogListeners.delete(handler);
}

/** Pide el catálogo al shell. En navegador aplica `arcaBridgeStub.shopCatalog` si existe. */
export function requestShopCatalog(): void {
  startBridgeListener();
  if (isInWebView()) {
    sendToShell({ type: "request_shop_catalog" });
    return;
  }
  const stub = typeof window !== "undefined" ? window.arcaBridgeStub?.shopCatalog : undefined;
  applyShopCatalog(stub ?? []);
  console.log(
    `[bridge stub] shop_catalog products=${stub?.length ?? 0}`
  );
}
