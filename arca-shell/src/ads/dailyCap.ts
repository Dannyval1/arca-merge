import AsyncStorage from "@react-native-async-storage/async-storage";
import { SHELL_CONFIG } from "../config";

const REWARDED_KEY = "arca-ads-rewarded-daily";
const INTERSTITIAL_KEY = "arca-ads-interstitial-at";

function localDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DailyRow = { date: string; count: number };

/**
 * Tope de rewarded: vive en el SHELL (config ads.rewardedDailyCap).
 * El juego no puede mentir (el WebView no escribe esta clave).
 * Se cuenta solo un `completed` real, compartido entre todos los usos.
 */
export async function rewardedRemaining(): Promise<number> {
  const cap = SHELL_CONFIG.ads.rewardedDailyCap;
  try {
    const raw = await AsyncStorage.getItem(REWARDED_KEY);
    if (!raw) return cap;
    const row = JSON.parse(raw) as DailyRow;
    if (row.date !== localDate()) return cap;
    return Math.max(0, cap - (row.count || 0));
  } catch {
    return cap;
  }
}

export async function recordRewardedCompleted(): Promise<void> {
  const today = localDate();
  try {
    const raw = await AsyncStorage.getItem(REWARDED_KEY);
    let count = 1;
    if (raw) {
      const row = JSON.parse(raw) as DailyRow;
      count = row.date === today ? (row.count || 0) + 1 : 1;
    }
    await AsyncStorage.setItem(REWARDED_KEY, JSON.stringify({ date: today, count }));
  } catch (e) {
    console.warn("[ads] recordRewardedCompleted", e);
  }
}

export async function canShowInterstitial(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(INTERSTITIAL_KEY);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at >= SHELL_CONFIG.ads.interstitialMinIntervalMs;
  } catch {
    return true;
  }
}

export async function recordInterstitialShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTERSTITIAL_KEY, String(Date.now()));
  } catch (e) {
    console.warn("[ads] recordInterstitialShown", e);
  }
}
