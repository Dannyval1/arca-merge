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
 * Intersticial en game_over, ANTES del modal. Si no hay anuncio listo,
 * no espera: el juego puede mostrar el resultado al instante.
 * Quitar anuncios: el caller no debe llamar esto.
 */
export async function showInterstitialOnGameOver(): Promise<void> {
  if (!(await canShowInterstitial())) return;
  const ad = interstitial;
  if (!ad || !interstitialLoaded) {
    if (ad && !interstitialLoaded) ad.load();
    return;
  }

  interstitialLoaded = false;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      unsubClosed();
      unsubErr();
      void recordInterstitialShown();
      resetInterstitial();
      resolve();
    };
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
    const unsubErr = ad.addAdEventListener(AdEventType.ERROR, finish);
    ad.show().catch((e) => {
      console.warn("[ads] interstitial show", e);
      finish();
    });
  });
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
    const settle = (reply: RewardedReply): void => {
      if (settled) return;
      settled = true;
      unsubEarn();
      unsubClosed();
      unsubErr();
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
