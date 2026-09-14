/**
 * Un solo interruptor para release. Mantener en false mientras desarrollas.
 * Al publicar: IS_PRODUCTION = true (y el mismo valor en src/buildFlags.ts del juego).
 */
export const IS_PRODUCTION = true;

/** true = WebView carga Vite en LAN (solo si el Mac tiene `npm run dev`). */
const DEV_VITE = false;
const DEV_TEST_IDS = true;
const DEV_BANNER = false;

/**
 * Configuración única del shell Arca Merge.
 * IDs, flags y versiones fijadas aquí — no hardcodear en otros archivos.
 *
 * Ads: con IS_PRODUCTION, useTestIds queda en false automáticamente.
 */
export const SHELL_CONFIG = {
  /** Color de fondo del juego (#1b2a41) — evita flash blanco al cargar. */
  backgroundColor: "#1b2a41",

  /**
   * DEV: si true, el WebView carga Vite en LAN en vez del dist empaquetado.
   * Forzado a false si IS_PRODUCTION.
   */
  useViteDevServer: IS_PRODUCTION ? false : DEV_VITE,

  /**
   * URL del `npm run dev` del juego (misma Wi‑Fi que el teléfono).
   * Tiene que ser la IP LAN actual del Mac, NO localhost.
   */
  viteDevUrl: "http://192.168.1.20:5173",

  gameBuildId: "2026-09-14.2311",

  staticServerPort: 0 as number,
  stopServerInBackground: false,
  bannerReservePx: 50,

  privacyPolicyUrl: "https://dannyval1.github.io/privacy-policies/arca-merge/",

  /** Links de tienda para “Comparte y gana olivos”. */
  storeUrls: {
    android: "https://play.google.com/store/apps/details?id=com.arcamerge.app",
    /** Actualizar cuando exista ficha iOS. */
    ios: "https://apps.apple.com/app/id0000000000"
  },

  /**
   * RevenueCat — claves PÚBLICAS (sdk_… / goog_… / appl_…).
   * Dashboard → Project → API Keys. Vacías → modo stub (DEV) sin romper la UI.
   * Nunca pongas la secret key aquí.
   */
  revenueCat: {
    iosApiKey: "",
    androidApiKey: "goog_gdhkgEnLrxyBljpiUtWHbLrcakp",
    /** true = stubs aunque haya keys (útil sin productos en Play/App Store). */
    forceStub: false
  },

  ads: {
    /**
     * true = TestIds de Google (seguro para desarrollo).
     * En producción: siempre ligado a !IS_PRODUCTION.
     */
    useTestIds: !IS_PRODUCTION,

    /** En prod suele ir true; en DEV se puede dejar apagado. */
    bannerEnabled: IS_PRODUCTION ? true : DEV_BANNER,

    /** Solo DEV: fuerza geografía EEA para probar UMP. Ignorado en prod. */
    debugConsentEea: IS_PRODUCTION ? false : false,

    /** Solo DEV: fingir rewarded. Siempre null en prod. */
    debugForceRewarded: (IS_PRODUCTION
      ? null
      : null) as
      | null
      | "completed"
      | "dismissed"
      | "unavailable"
      | "error",

    rewardedDailyCap: 8,
    interstitialMinIntervalMs: 60 * 1000,

    android: {
      appId: "ca-app-pub-4782245353460263~4297683630",
      banner: "ca-app-pub-4782245353460263/4849076921",
      interstitial: "ca-app-pub-4782245353460263/2623358513",
      rewarded: "ca-app-pub-4782245353460263/5124409095"
    },
    ios: {
      appId: "ca-app-pub-4782245353460263~9993592395",
      banner: "ca-app-pub-4782245353460263/7712033663",
      interstitial: "ca-app-pub-4782245353460263/3411977372",
      rewarded: "ca-app-pub-4782245353460263/7635022366"
    }
  },

  versions: {
    expoSdk: "54",
    expo: "~54.0.36",
    reactNative: "0.81.5",
    react: "19.1.0",
    reactNativeWebview: "13.15.0",
    googleMobileAds: "16.3.4",
    revenueCatPurchases: "10.9.0",
    staticServer: "0.27.1",
    expoHaptics: "~15.0.8",
    asyncStorage: "2.2.0"
  }
} as const;

export type ShellConfig = typeof SHELL_CONFIG;
