import mobileAds, {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus
} from "react-native-google-mobile-ads";
import { SHELL_CONFIG } from "../config";

export type AdsBootResult = {
  canRequestAds: boolean;
  /** true si UMP exige mostrar el enlace de opciones (GDPR y/o US states). */
  privacyOptionsRequired: boolean;
};

function isPrivacyOptionsRequired(
  status: AdsConsentPrivacyOptionsRequirementStatus | string | undefined
): boolean {
  return (
    status === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED ||
    status === "REQUIRED"
  );
}

/**
 * UMP PRIMERO, luego initialize() de Mobile Ads.
 * `privacyOptionsRequired` controla el botón de Ajustes (GDPR + US).
 */
export async function bootAdsWithConsent(): Promise<AdsBootResult> {
  try {
    await AdsConsent.requestInfoUpdate(
      SHELL_CONFIG.ads.debugConsentEea
        ? { debugGeography: AdsConsentDebugGeography.EEA }
        : undefined
    );
    await AdsConsent.loadAndShowConsentFormIfRequired();
  } catch (e) {
    console.warn("[ads] UMP request/form", e);
  }

  let canRequestAds = false;
  let privacyOptionsRequired = false;
  try {
    const info = await AdsConsent.getConsentInfo();
    canRequestAds = info.canRequestAds === true;
    privacyOptionsRequired = isPrivacyOptionsRequired(
      info.privacyOptionsRequirementStatus
    );
  } catch (e) {
    console.warn("[ads] getConsentInfo", e);
    if (SHELL_CONFIG.ads.useTestIds) canRequestAds = true;
  }

  if (canRequestAds) {
    try {
      await mobileAds().initialize();
    } catch (e) {
      console.warn("[ads] initialize", e);
      canRequestAds = false;
    }
  }

  return { canRequestAds, privacyOptionsRequired };
}

/** Reconsulta el flag (p. ej. tras cambiar región / formulario). */
export async function refreshPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    return isPrivacyOptionsRequired(info.privacyOptionsRequirementStatus);
  } catch {
    return false;
  }
}

/**
 * Formulario de opciones de privacidad (GDPR + mensajes US cuando REQUIRED).
 * Equivalente a presentPrivacyOptionsForm / showPrivacyOptionsForm.
 */
export async function showAdPrivacyOptions(): Promise<void> {
  try {
    const required = await refreshPrivacyOptionsRequired();
    if (!required) {
      console.log("[ads] privacy options not required");
      return;
    }
    await AdsConsent.showPrivacyOptionsForm();
  } catch (e) {
    console.warn("[ads] privacy options", e);
  }
}
