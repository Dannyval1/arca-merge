import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { SHELL_CONFIG } from "../config";
import { adUnitId } from "./adUnits";
import { isOnlineNow } from "../connectivity";

type Props = {
  visible: boolean;
  onHeight: (px: number) => void;
};

/**
 * Banner adaptativo anclado, FUERA del WebView.
 * En teléfonos la altura real suele ser 50 dp (el slot reserva eso).
 */
export function BannerSlot({ visible, onHeight }: Props) {
  const [failed, setFailed] = useState(false);

  if (!visible || failed || !isOnlineNow()) return null;

  return (
    <View style={[styles.wrap, { minHeight: SHELL_CONFIG.bannerReservePx }]}>
      <BannerAd
        unitId={adUnitId("banner")}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          onHeight(SHELL_CONFIG.bannerReservePx);
        }}
        onAdFailedToLoad={(e) => {
          console.warn("[ads] banner failed", e);
          setFailed(true);
          onHeight(0);
        }}
        onSizeChange={({ height }) => {
          if (typeof height === "number" && height > 0) onHeight(height);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    backgroundColor: SHELL_CONFIG.backgroundColor
  }
});
