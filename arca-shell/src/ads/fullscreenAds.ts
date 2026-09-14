import {
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType
} from "react-native-google-mobile-ads";
import { SHELL_CONFIG } from "../config";
import { adUnitId } from "./adUnits";
import {
  canShowInterstitial,
  recordInterstitialShown,
  recordRewardedCompleted,
  rewardedRemaining
} from "./dailyCap";

export type RewardedStatus = "completed" | "dismissed" | "unavailable" | "error";

type RewardedReply = {
  status: RewardedStatus;
  reason?: "daily_cap";
};

let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let interstitialUnsub: (() => void) | null = null;

let rewarded: RewardedAd | null = null;
let rewardedLoaded = false;
let rewardedUnsub: (() => void) | null = null;

function resetInterstitial(): void {
  interstitialUnsub?.();
  interstitialUnsub = null;
  interstitialLoaded = false;
  interstitial = InterstitialAd.createForAdRequest(adUnitId("interstitial"));
  const unsubLoad = interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  const unsubErr = interstitial.addAdEventListener(AdEventType.ERROR, () => {
    interstitialLoaded = false;
  });
  interstitialUnsub = () => {
    unsubLoad();
    unsubErr();
  };
  interstitial.load();
}

function resetRewarded(): void {
  rewardedUnsub?.();
  rewardedUnsub = null;
  rewardedLoaded = false;
  rewarded = RewardedAd.createForAdRequest(adUnitId("rewarded"));
  const unsubLoad = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
  });
  const unsubErr = rewarded.addAdEventListener(AdEventType.ERROR, () => {
    rewardedLoaded = false;
  });
  rewardedUnsub = () => {
    unsubLoad();
    unsubErr();
  };
  rewarded.load();
}

export function preloadFullscreenAds(): void {
  resetInterstitial();
  resetRewarded();
}

/**
 * Intersticial fullscreen. Si no hay inventario / cooldown, no espera.
 * Nunca se cuelga: si show() no abre/cierra, watchdog libera el juego.
 * @returns true si se mostró y cerró.
 */
export async function showInterstitialAd(): Promise<boolean> {
  if (!(await canShowInterstitial())) return false;
  const ad = interstitial;
  if (!ad || !interstitialLoaded) {
    if (ad && !interstitialLoaded) ad.load();
    return false;
  }

  interstitialLoaded = false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let opened = false;

    const finish = (shown: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(openWatch);
      clearTimeout(watchdog);
      unsubClosed();
      unsubErr();
      unsubOpened();
      if (shown) void recordInterstitialShown();
      resetInterstitial();
      resolve(shown);
    };

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () =>
      finish(true)
    );
    const unsubErr = ad.addAdEventListener(AdEventType.ERROR, () =>
      finish(false)
    );
    const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () => {
      opened = true;
    });

    // show() a veces no dispara CLOSED/ERROR → bloqueaba mid-run para siempre.
    const openWatch = setTimeout(() => {
      if (!opened) {
        console.warn("[ads] interstitial never opened");
        finish(false);
      }
    }, 5_000);
    const watchdog = setTimeout(() => {
      console.warn("[ads] interstitial show timeout");
      finish(false);
    }, 45_000);

    ad.show().catch((e) => {
      console.warn("[ads] interstitial show", e);
      finish(false);
    });
  });
}

/** @deprecated alias — game over usa showInterstitialAd. */
export async function showInterstitialOnGameOver(): Promise<void> {
  await showInterstitialAd();
}

let rewardedShowLock = false;

/**
 * Una sola unidad rewarded para los 4 poderes + continue + daily.
 */
export async function showRewardedOrReject(): Promise<RewardedReply> {
  const forced = SHELL_CONFIG.ads.debugForceRewarded;
  if (forced) return { status: forced };

  if (rewardedShowLock) {
    console.warn("[ads] rewarded ignored: already showing");
    return { status: "error" };
  }
  rewardedShowLock = true;
  try {
    return await showRewardedInner();
  } finally {
    rewardedShowLock = false;
  }
}

export function isRewardedBusy(): boolean {
  return rewardedShowLock;
}

async function showRewardedInner(): Promise<RewardedReply> {
  const left = await rewardedRemaining();
  if (left <= 0) return { status: "unavailable", reason: "daily_cap" };

  if (!rewarded) resetRewarded();
  const ad = rewarded;
  if (!ad) return { status: "unavailable" };

  if (!rewardedLoaded) {
    ad.load();
    const ready = await waitForRewardedLoaded(6_000);
    if (!ready || !rewardedLoaded || rewarded !== ad) {
      console.warn("[ads] rewarded not loaded");
      return { status: "unavailable" };
    }
  }

  rewardedLoaded = false;
  console.log("[ads] rewarded show");
  return new Promise<RewardedReply>((resolve) => {
    let earned = false;
    let settled = false;
    let opened = false;
    const settle = (reply: RewardedReply): void => {
      if (settled) return;
      settled = true;
      clearTimeout(openWatch);
      clearTimeout(watchdog);
      unsubEarn();
      unsubClosed();
      unsubErr();
      unsubOpened();
      console.log("[ads] rewarded result", reply.status);
      resetRewarded();
      resolve(reply);
    };

    const unsubEarn = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earned = true;
      }
    );
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (earned) {
        void recordRewardedCompleted();
        settle({ status: "completed" });
      } else {
        settle({ status: "dismissed" });
      }
    });
    const unsubErr = ad.addAdEventListener(AdEventType.ERROR, () => {
      settle({ status: "error" });
    });
    const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () => {
      opened = true;
    });

    // Misma falla que intersticial: show() sin OPENED/CLOSED deja el modal colgado.
    const openWatch = setTimeout(() => {
      if (!opened) {
        console.warn("[ads] rewarded never opened");
        settle({ status: "error" });
      }
    }, 5_000);
    const watchdog = setTimeout(() => {
      console.warn("[ads] rewarded show timeout");
      settle({ status: "error" });
    }, 120_000);

    ad.show().catch((e) => {
      console.warn("[ads] rewarded show", e);
      settle({ status: "error" });
    });
  });
}

function waitForRewardedLoaded(ms: number): Promise<boolean> {
  if (rewardedLoaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    const ad = rewarded;
    if (!ad) {
      resolve(false);
      return;
    }
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      unsubLoad();
      unsubErr();
      resolve(ok);
    };
    const t = setTimeout(() => done(false), ms);
    const unsubLoad = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      done(true);
    });
    const unsubErr = ad.addAdEventListener(AdEventType.ERROR, () => {
      done(false);
    });
    if (rewardedLoaded) done(true);
  });
}
