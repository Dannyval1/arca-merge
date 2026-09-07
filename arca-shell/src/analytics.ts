/**
 * Fachada de Analytics / Crashlytics.
 * Con Firebase instalado + google-services, loguea de verdad.
 * Sin Firebase: no-op seguro (dev / pre-config).
 *
 * Activación: ver instrucciones en la respuesta del agente / README interno.
 * Paquetes: @react-native-firebase/app | analytics | crashlytics
 */

type Params = Record<string, string | number | boolean | null | undefined>;

let analyticsMod: {
  logEvent: (name: string, params?: Params) => Promise<void>;
} | null = null;
let crashlyticsMod: {
  recordError: (e: Error) => void;
  log: (m: string) => void;
  setAttributes: (a: Record<string, string>) => Promise<void>;
} | null = null;

let initTried = false;

async function ensureFirebase(): Promise<void> {
  if (initTried) return;
  initTried = true;
  try {
    // Dynamic require para no romper el bundle si aún no están instalados.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analytics = require("@react-native-firebase/analytics").default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crashlytics = require("@react-native-firebase/crashlytics").default;
    analyticsMod = {
      logEvent: async (name, params) => {
        const clean: Record<string, string | number> = {};
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null) continue;
            clean[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
          }
        }
        await analytics().logEvent(name, clean);
      }
    };
    crashlyticsMod = {
      recordError: (e) => crashlytics().recordError(e),
      log: (m) => crashlytics().log(m),
      setAttributes: (a) => crashlytics().setAttributes(a)
    };
    console.log("[firebase] analytics+crashlytics ready");
  } catch {
    console.log(
      "[firebase] no instalado aún — eventos en no-op (añade google-services + RNFirebase)"
    );
  }
}

export async function initAnalytics(): Promise<void> {
  await ensureFirebase();
}

export async function logAnalyticsEvent(
  name: string,
  params?: Params
): Promise<void> {
  await ensureFirebase();
  try {
    await analyticsMod?.logEvent(name, params);
  } catch (e) {
    console.warn("[analytics]", name, e);
  }
}

export function recordJsError(error: unknown, context?: string): void {
  void ensureFirebase().then(() => {
    try {
      const err =
        error instanceof Error ? error : new Error(String(error));
      if (context) crashlyticsMod?.log(context);
      crashlyticsMod?.recordError(err);
    } catch {
      // silent
    }
  });
}

/** Mapa de eventos de producto → Firebase. */
export const AnalyticsEvents = {
  gameStart: "game_start",
  gameOver: "game_over",
  arkComplete: "ark_complete",
  powerUsed: "power_used",
  rewardedRequested: "rewarded_requested",
  rewardedCompleted: "rewarded_completed",
  purchaseStarted: "purchase_started",
  purchaseCompleted: "purchase_completed",
  dailyRewardClaimed: "daily_reward_claimed"
} as const;
