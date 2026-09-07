/**
 * Contrato shell ↔ juego (espejo de arca-merge/src/bridge.ts).
 * Fuente de verdad del juego: ../src/bridge.ts
 *
 * Shell → juego se inyecta con:
 *   window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }))
 *
 * Reseña (pendiente de implementar en shell):
 *   - ark_complete → mejor momento
 *   - request_store_review { reason: "new_best" } → 2º (récord en game over)
 *
 * Intersticiales (Fase 3): nunca sin aviso; nunca tras "Jugar de nuevo";
 * antes del modal de resultado o entre modal y restart con countdown;
 * tope 1 / 3 min.
 */
export type HapticIntensity = "light" | "medium" | "heavy";

/** Juego → Shell */
export type BridgeOutEvent =
  | {
      type: "game_over";
      score: number;
      best: number;
      arkCompletes?: number;
      isNewBest?: boolean;
      olivesEarned?: number;
      durationSec?: number;
    }
  | { type: "game_start" }
  /** Home ya pintó; ocultar splash nativo. */
  | { type: "game_ready" }
  | { type: "ark_complete" }
  | { type: "request_store_review"; reason: "ark_complete" | "new_best" }
  | { type: "haptic"; intensity: HapticIntensity }
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
  | { type: "purchase_olives"; requestId: string; packageId: string }
  | { type: "request_shop_catalog" }
  | { type: "power_used"; powerId: string }
  | { type: "daily_reward_claimed"; olives: number; doubled: boolean }
  | {
      type: "debug_viewport";
      phase?: string;
      inner?: number[];
      game?: number[];
      box?: { cssW: number; cssH: number };
      buffer?: { width: number; height: number };
      renderer?: number;
      msg?: string;
    };

/** Shell → Juego */
export type BridgeInEvent =
  | {
      type: "rewarded_ad_result";
      requestId: string;
      status: "completed" | "dismissed" | "unavailable" | "error";
      reason?: "daily_cap";
    }
  | {
      type: "purchase_olives_result";
      requestId: string;
      status: "completed" | "cancelled" | "unavailable" | "error" | "pending";
      olivesGranted?: number;
    }
  | {
      /** Misma forma que purchase_olives_result (IAP no consumible / restore). */
      type: "remove_ads_result";
      requestId: string;
      status: "completed" | "cancelled" | "unavailable" | "error" | "pending";
    }
  | {
      type: "shop_catalog";
      products: { packageId: string; priceLabel: string }[];
    }
  | { type: "app_background" }
  | { type: "app_foreground" }
  | { type: "shell_info"; platform: "ios" | "android" | "web"; privacyOptionsRequired?: boolean }
  | { type: "game_over_ads_done" }
  | { type: "connectivity"; online: boolean };

export function parseBridgeOut(raw: string): BridgeOutEvent | null {
  try {
    const data = JSON.parse(raw) as BridgeOutEvent;
    if (!data || typeof data !== "object" || !("type" in data)) return null;
    return data;
  } catch {
    return null;
  }
}

/** JS inyectado en el WebView para pausar/reanudar el juego. */
export function lifecycleInjectScript(type: "app_background" | "app_foreground"): string {
  return injectBridgeIn({ type });
}

/** Shell → juego con el mismo canal que el listener del bridge. */
export function injectBridgeIn(payload: BridgeInEvent): string {
  const data = JSON.stringify(payload);
  return `(function(){try{var d=${JSON.stringify(data)};if(typeof window.__arcaBridgeIn==='function'){window.__arcaBridgeIn(d);}window.dispatchEvent(new MessageEvent('message',{data:d}));document.dispatchEvent(new MessageEvent('message',{data:d}));}catch(e){}})();true;`;
}
