import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
  type AppStateStatus
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { AndroidWebViewProps, IOSWebViewProps } from "react-native-webview/lib/WebViewTypes";
import * as ScreenOrientation from "expo-screen-orientation";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { IS_PRODUCTION, SHELL_CONFIG } from "./config";
import {
  injectBridgeIn,
  lifecycleInjectScript,
  parseBridgeOut,
  type BridgeOutEvent
} from "./bridge";
import { ensureGameFilesReady } from "./gameAssets";
import {
  ensureServerRunning,
  startGameServer,
  stopGameServer
} from "./gameServer";
import { playHaptic } from "./haptics";
import {
  checkNoAdsEntitlement,
  fetchShopCatalog,
  initPurchases,
  purchaseOlivesProduct,
  purchaseRemoveAds,
  restorePurchases as restoreIapPurchases
} from "./iap/purchases";
import {
  flushPendingNativeStorage,
  nativeStorageInjectScript,
  persistNativeKey,
  removeNativeKey
} from "./nativeStorage";
import { BannerSlot } from "./ads/BannerSlot";
import { showAdPrivacyOptions } from "./ads/consent";
import {
  isRewardedBusy,
  preloadFullscreenAds,
  showInterstitialAd,
  showInterstitialOnGameOver,
  showRewardedOrReject
} from "./ads/fullscreenAds";
import {
  AnalyticsEvents,
  initAnalytics,
  logAnalyticsEvent
} from "./analytics";
import { isOnlineNow, subscribeConnectivity } from "./connectivity";
import { requestNativeStoreReview } from "./storeReview";
import { SHELL_COPY, st } from "./shellLocale";
import { requestAttAfterGameReady } from "./att";
import { shareGameInvite } from "./shareGame";

const DISABLE_UI_JS = `
(function(){
  var s=document.createElement('style');
  s.innerHTML='html,body,#game{margin:0;background:#1b2a41;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none;touch-action:none;}html,body,#game{width:100%;height:100%;}#game canvas{display:block!important;width:100%!important;height:100%!important;}';
  document.documentElement.appendChild(s);
  document.addEventListener('gesturestart',function(e){e.preventDefault();},{passive:false});
})();
true;
`;

/** Solo Android. Enums: mixedContentMode, overScrollMode, androidLayerType. */
const androidWebViewProps: AndroidWebViewProps = {
  allowFileAccess: true,
  domStorageEnabled: true,
  scalesPageToFit: false,
  setSupportMultipleWindows: false,
  overScrollMode: "never",
  mixedContentMode: "always",
  setBuiltInZoomControls: false,
  setDisplayZoomControls: false
};

/**
 * Solo iOS. Sin dataDetectorTypes: el codegen espera ReadonlyArray y un
 * string suelto aborta el proceso bajo Fabric (también en Android si se cuela).
 * Enums: contentInsetAdjustmentBehavior.
 */
const iosWebViewProps: IOSWebViewProps = {
  bounces: false,
  contentInsetAdjustmentBehavior: "never",
  automaticallyAdjustContentInsets: false,
  allowsLinkPreview: false,
  allowsBackForwardNavigationGestures: false,
  allowsInlineMediaPlayback: true,
  pullToRefreshEnabled: false
};

/** Espera AppState active (o timeout) antes de inyectar al WebView tras un ad. */
function waitForAppActive(timeoutMs = 1500): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") finish();
    });
  });
}

type Props = {
  onBridgeEvent?: (event: BridgeOutEvent) => void;
  /** Snapshot AsyncStorage hidratado ANTES de montar el WebView. */
  storageSnapshot: Record<string, string>;
  /** UMP + Mobile Ads ya corrieron. Si false, no se piden anuncios. */
  canRequestAds: boolean;
  /** UMP: mostrar opciones de privacidad (GDPR / US) en Ajustes. */
  privacyOptionsRequired?: boolean;
  /** Home del juego ya pintó: App puede quitar el BootLoader. */
  onGameReady?: () => void;
  /** Falló el boot del WebView: quitar loader para mostrar el error. */
  onBootFailed?: () => void;
};

export function GameWebView({
  onBridgeEvent,
  storageSnapshot,
  canRequestAds,
  privacyOptionsRequired = false,
  onGameReady,
  onBootFailed
}: Props) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const fileDirRef = useRef<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hapticEnabled = useRef(true);
  const [adsRemoved, setAdsRemoved] = useState(
    storageSnapshot["arca-ads-removed"] === "1"
  );
  const injectOnceRef = useRef(
    DISABLE_UI_JS + nativeStorageInjectScript(storageSnapshot)
  );
  const adsRemovedRef = useRef(adsRemoved);
  const canRequestAdsRef = useRef(canRequestAds);
  const onBootFailedRef = useRef(onBootFailed);
  const onGameReadyRef = useRef(onGameReady);
  canRequestAdsRef.current = canRequestAds;
  adsRemovedRef.current = adsRemoved;
  onBootFailedRef.current = onBootFailed;
  onGameReadyRef.current = onGameReady;

  useEffect(() => {
    void (async () => {
      await initPurchases();
      const entitled = await checkNoAdsEntitlement();
      if (entitled && !adsRemovedRef.current) {
        persistNativeKey("arca-ads-removed", "1");
        adsRemovedRef.current = true;
        setAdsRemoved(true);
      }
    })();
  }, []);

  // Boot UNA sola vez al montar. No poner callbacks en deps: si cambian de
  // identidad (re-render de App), stop+start del server cambia el puerto,
  // setUri recarga el WebView y el jugador vuelve a Home a mitad de partida.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
        await activateKeepAwakeAsync("arca-game");

        if (SHELL_CONFIG.useViteDevServer) {
          const raw = SHELL_CONFIG.viteDevUrl;
          const url = raw.endsWith("/") ? raw : `${raw}/`;
          if (!cancelled) setUri(url);
          return;
        }

        const fileDir = await ensureGameFilesReady();
        fileDirRef.current = fileDir;
        if (cancelled) return;

        const origin = await startGameServer(fileDir);
        if (!cancelled) setUri(`${origin}/`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[arca-shell] boot", e);
        if (!cancelled) {
          setError(msg);
          onBootFailedRef.current?.();
        }
      }
    })();

    return () => {
      cancelled = true;
      void stopGameServer();
      void deactivateKeepAwake("arca-game");
    };
  }, []);

  // Ciclo de vida → mensajes al juego. Servidor NO se apaga.
  // inactive (bloqueo de pantalla iOS / transición) también pausa audio.
  // Flush de storage ANTES de que el SO mate el proceso.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        webRef.current?.injectJavaScript(lifecycleInjectScript("app_foreground"));
      } else if (state === "background" || state === "inactive") {
        webRef.current?.injectJavaScript(lifecycleInjectScript("app_background"));
        void flushPendingNativeStorage();
      }

      if (state === "active" && fileDirRef.current && !SHELL_CONFIG.useViteDevServer) {
        void (async () => {
          try {
            const origin = await ensureServerRunning(fileDirRef.current!);
            console.log("[arca-shell] server ensure", origin);
          } catch (e) {
            console.warn("[arca-shell] server restart failed", e);
          }
        })();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  // Atrás Android: no cierra la app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (canRequestAds) preloadFullscreenAds();
  }, [canRequestAds]);

  useEffect(() => {
    void initAnalytics();
  }, []);

  useEffect(() => {
    const push = (online: boolean): void => {
      webRef.current?.injectJavaScript(
        injectBridgeIn({ type: "connectivity", online })
      );
    };
    return subscribeConnectivity(push);
  }, []);

  const onBridgeEventRef = useRef(onBridgeEvent);
  onBridgeEventRef.current = onBridgeEvent;

  const onMessage = useCallback((ev: WebViewMessageEvent) => {
    const event = parseBridgeOut(ev.nativeEvent.data);
    if (!event) return;
    if (event.type === "debug_viewport") {
      if (!IS_PRODUCTION) {
        console.log("[bridge←game] debug_viewport", JSON.stringify(event));
      }
      if (event.phase === "ready+500ms") {
        onGameReadyRef.current?.();
        void requestAttAfterGameReady();
      }
    } else if (!IS_PRODUCTION) {
      console.log("[bridge←game]", event.type);
    }
    onBridgeEventRef.current?.(event);

    if (event.type === "game_ready") {
      onGameReadyRef.current?.();
      void requestAttAfterGameReady();
    }

      if (event.type === "settings_prefs") {
        hapticEnabled.current = event.haptic;
      }

      if (event.type === "storage_set") {
        persistNativeKey(event.key, event.value);
        if (event.key === "arca-ads-removed") {
          const off = event.value === "1";
          adsRemovedRef.current = off;
          setAdsRemoved(off);
        }
      }

      if (event.type === "storage_remove") {
        removeNativeKey(event.key);
        if (event.key === "arca-ads-removed") {
          adsRemovedRef.current = false;
          setAdsRemoved(false);
        }
      }

      if (event.type === "haptic") {
        if (!hapticEnabled.current) return;
        void playHaptic(event.intensity);
      }

      if (event.type === "request_rewarded_ad") {
        void (async () => {
          const context = event.powerId;
          console.log("[ads] request_rewarded_ad", context);
          void logAnalyticsEvent(AnalyticsEvents.rewardedRequested, {
            context
          });
          let reply: { status: "completed" | "dismissed" | "unavailable" | "error"; reason?: "daily_cap" };
          if (!isOnlineNow()) {
            reply = { status: "unavailable" };
          } else if (!canRequestAdsRef.current) {
            reply = { status: "unavailable" };
          } else {
            reply = await showRewardedOrReject();
          }
          console.log("[ads] reply", reply);
          if (reply.status === "completed") {
            void logAnalyticsEvent(AnalyticsEvents.rewardedCompleted, {
              context
            });
          }
          await waitForAppActive(1500);
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "rewarded_ad_result",
              requestId: event.requestId,
              status: reply.status,
              reason: "reason" in reply ? reply.reason : undefined
            })
          );
        })();
      }

      if (event.type === "request_interstitial") {
        void (async () => {
          let status: "shown" | "skipped" | "error" = "skipped";
          try {
            if (
              !adsRemovedRef.current &&
              canRequestAdsRef.current &&
              !isRewardedBusy()
            ) {
              const shown = await showInterstitialAd();
              status = shown ? "shown" : "skipped";
            }
          } catch (e) {
            console.warn("[ads] interstitial", event.placement, e);
            status = "error";
          }
          // Tras el fullscreen el WebView a veces aún está en background:
          // inject se pierde y el juego queda sin drops/música.
          await waitForAppActive(1500);
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "interstitial_ad_result",
              requestId: event.requestId,
              status
            })
          );
        })();
      }

      if (event.type === "request_share") {
        void (async () => {
          const status = await shareGameInvite(event.message);
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "share_result",
              requestId: event.requestId,
              status
            })
          );
        })();
      }

      if (event.type === "game_over") {
        void (async () => {
          await logAnalyticsEvent(AnalyticsEvents.gameOver, {
            score: event.score,
            arcas_completadas: event.arkCompletes ?? 0,
            olivos_ganados: event.olivesEarned ?? 0,
            duracion: event.durationSec ?? 0,
            is_new_best: event.isNewBest ? 1 : 0
          });
          // Intersticial solo en 2ª muerte (showInterstitial !== false).
          // TERMINAR tras continue → false (ya rechazó el rewarded).
          const showInterstitial = event.showInterstitial !== false;
          if (
            showInterstitial &&
            !adsRemovedRef.current &&
            canRequestAdsRef.current &&
            !isRewardedBusy()
          ) {
            await showInterstitialOnGameOver();
            await waitForAppActive(1500);
            webRef.current?.injectJavaScript(
              injectBridgeIn({ type: "game_over_ads_done" })
            );
          }
        })();
      }

      if (event.type === "game_start") {
        void logAnalyticsEvent(AnalyticsEvents.gameStart);
        if (canRequestAdsRef.current && !isRewardedBusy()) preloadFullscreenAds();
      }

      if (event.type === "ark_complete") {
        void logAnalyticsEvent(AnalyticsEvents.arkComplete);
      }

      if (event.type === "power_used") {
        void logAnalyticsEvent(AnalyticsEvents.powerUsed, {
          power_id: event.powerId
        });
      }

      if (event.type === "daily_reward_claimed") {
        void logAnalyticsEvent(AnalyticsEvents.dailyRewardClaimed, {
          olives: event.olives,
          doubled: event.doubled ? 1 : 0
        });
      }

      if (event.type === "purchase_olives") {
        void logAnalyticsEvent(AnalyticsEvents.purchaseStarted, {
          product_id: event.packageId
        });
      }

      if (event.type === "request_remove_ads") {
        void logAnalyticsEvent(AnalyticsEvents.purchaseStarted, {
          product_id: "remove_ads"
        });
      }

      if (event.type === "request_store_review") {
        void requestNativeStoreReview(event.reason);
      }

      if (event.type === "open_ad_consent") {
        void showAdPrivacyOptions();
      }

      if (event.type === "open_privacy_policy") {
        const url = SHELL_CONFIG.privacyPolicyUrl;
        if (url) {
          Linking.openURL(url).catch((e) => {
            console.warn("[shell] privacy url", e);
          });
        } else {
          console.warn("[shell] privacyPolicyUrl vacío en config.ts");
        }
      }

      if (event.type === "open_url") {
        Linking.openURL(event.url).catch((e) => {
          console.warn("[shell] open_url failed", event.url, e);
        });
      }

      if (event.type === "restore_purchases") {
        void (async () => {
          const status = await restoreIapPurchases();
          if (status === "completed") {
            persistNativeKey("arca-ads-removed", "1");
            adsRemovedRef.current = true;
            setAdsRemoved(true);
          }
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "remove_ads_result",
              requestId: event.requestId,
              status
            })
          );
        })();
      }

      if (event.type === "request_shop_catalog") {
        void (async () => {
          const products = await fetchShopCatalog();
          webRef.current?.injectJavaScript(
            injectBridgeIn({ type: "shop_catalog", products })
          );
        })();
      }

      if (event.type === "purchase_olives") {
        void (async () => {
          const { status, olivesGranted } = await purchaseOlivesProduct(
            event.packageId
          );
          if (status === "completed") {
            void logAnalyticsEvent(AnalyticsEvents.purchaseCompleted, {
              product_id: event.packageId
            });
          }
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "purchase_olives_result",
              requestId: event.requestId,
              status,
              olivesGranted: status === "completed" ? olivesGranted : undefined
            })
          );
        })();
      }

      if (event.type === "request_remove_ads") {
        void (async () => {
          const status = await purchaseRemoveAds();
          if (status === "completed") {
            persistNativeKey("arca-ads-removed", "1");
            adsRemovedRef.current = true;
            setAdsRemoved(true);
            void logAnalyticsEvent(AnalyticsEvents.purchaseCompleted, {
              product_id: "remove_ads"
            });
          }
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "remove_ads_result",
              requestId: event.requestId,
              status
            })
          );
        })();
      }
  }, []);

  const showBanner =
    canRequestAds && !adsRemoved && SHELL_CONFIG.ads.bannerEnabled;
  const bottomPad = insets.bottom;

  if (error) {
    return (
      <View style={[styles.fill, styles.center, { paddingBottom: bottomPad }]}>
        <Text style={styles.errorTitle}>{st(SHELL_COPY.loadErrorTitle)}</Text>
        <Text style={styles.errorBody}>{error}</Text>
        {SHELL_CONFIG.useViteDevServer ? (
          <Text style={styles.hint}>{st(SHELL_COPY.loadErrorVite)}</Text>
        ) : (
          <Text style={styles.hint}>{st(SHELL_COPY.loadErrorSync)}</Text>
        )}
      </View>
    );
  }

  if (!uri) {
    // El BootLoader de App cubre esta fase (sin textos).
    return <View style={styles.fill} />;
  }

  return (
    <View
      style={[
        styles.fill,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: insets.bottom
        }
      ]}
    >
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        injectedJavaScriptBeforeContentLoaded={injectOnceRef.current}
        onMessage={onMessage}
        onConsoleMessage={(e) => {
          console.log("[wv]", e.nativeEvent.message);
        }}
        onError={(e) => {
          setError(e.nativeEvent.description || "WebView error");
        }}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 400) {
            setError(`HTTP ${e.nativeEvent.statusCode}`);
          }
        }}
        onLoadEnd={() => {
          console.log("[shell] webview load", uri);
          const platform =
            Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
          webRef.current?.injectJavaScript(
            injectBridgeIn({
              type: "shell_info",
              platform,
              privacyOptionsRequired
            })
          );
          webRef.current?.injectJavaScript(
            injectBridgeIn({ type: "connectivity", online: isOnlineNow() })
          );
        }}
        {...(Platform.OS === "android" ? androidWebViewProps : iosWebViewProps)}
      />
      {showBanner ? (
        <BannerSlot
          visible
          onHeight={(h) => {
            console.log("[ads] banner height px", h);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: SHELL_CONFIG.backgroundColor
  },
  webview: {
    flex: 1,
    backgroundColor: SHELL_CONFIG.backgroundColor
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24
  },
  errorTitle: {
    color: "#f2c14e",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center"
  },
  errorBody: {
    color: "#f5f0e6",
    fontSize: 14,
    textAlign: "center"
  },
  hint: {
    marginTop: 12,
    color: "#9fb3c8",
    fontSize: 13,
    textAlign: "center"
  }
});
