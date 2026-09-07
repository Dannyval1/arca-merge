import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BootLoader } from "./src/BootLoader";
import { GameWebView } from "./src/GameWebView";
import { bootAdsWithConsent } from "./src/ads/consent";
import { SHELL_CONFIG } from "./src/config";
import { hydrateNativeStorage } from "./src/nativeStorage";
import { armSplashSafetyTimeout, hideNativeSplash } from "./src/splash";

type Boot = {
  snapshot: Record<string, string>;
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
};

/** Tiempo extra tras game_ready para que Home pinte debajo del loader. */
const HOLD_AFTER_READY_MS = 1100;
/** Fade del loader → Home (sin flash azul). */
const FADE_OUT_MS = 420;

/**
 * Flujo de arranque:
 * 1) Splash nativo (logo + #1b2a41)
 * 2) BootLoader (zoom + Cargando…) mientras storage/UMP/WebView cargan
 * 3) Tras game_ready: hold breve + fade → Home
 */
export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [showLoader, setShowLoader] = useState(true);
  const loaderOpacity = useRef(new Animated.Value(1)).current;
  const dismissing = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishHide = useCallback((reason: string) => {
    setShowLoader(false);
    void hideNativeSplash(reason);
  }, []);

  const dismissLoader = useCallback(
    (reason: string, opts?: { immediate?: boolean }) => {
      if (dismissing.current) return;
      dismissing.current = true;

      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }

      if (opts?.immediate) {
        finishHide(reason);
        return;
      }

      // Hold: el WebView/Phaser termina de pintar Home bajo el loader.
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        Animated.timing(loaderOpacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }).start(({ finished }) => {
          if (finished) finishHide(reason);
        });
      }, HOLD_AFTER_READY_MS);
    },
    [finishHide, loaderOpacity]
  );

  useEffect(() => {
    armSplashSafetyTimeout();
    const t = setTimeout(
      () => dismissLoader("timeout-20s", { immediate: true }),
      20_000
    );
    return () => {
      clearTimeout(t);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [dismissLoader]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshot = await hydrateNativeStorage();
      if (cancelled) return;
      const ads = await bootAdsWithConsent();
      if (cancelled) return;
      setBoot({
        snapshot,
        canRequestAds: ads.canRequestAds,
        privacyOptionsRequired: ads.privacyOptionsRequired
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        {boot != null ? (
          <GameWebView
            storageSnapshot={boot.snapshot}
            canRequestAds={boot.canRequestAds}
            privacyOptionsRequired={boot.privacyOptionsRequired}
            onGameReady={() => dismissLoader("game_ready")}
            onBootFailed={() => dismissLoader("boot_failed", { immediate: true })}
          />
        ) : null}
        {showLoader ? <BootLoader opacity={loaderOpacity} /> : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHELL_CONFIG.backgroundColor
  }
});
