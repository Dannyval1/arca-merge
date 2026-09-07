import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";
import { SHELL_CONFIG } from "../config";

export type AdKind = "banner" | "interstitial" | "rewarded";

export function adUnitId(kind: AdKind): string {
  if (SHELL_CONFIG.ads.useTestIds) {
    if (kind === "banner") return TestIds.BANNER;
    if (kind === "interstitial") return TestIds.INTERSTITIAL;
    return TestIds.REWARDED;
  }
  const pack = Platform.OS === "ios" ? SHELL_CONFIG.ads.ios : SHELL_CONFIG.ads.android;
  return pack[kind];
}
