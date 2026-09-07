import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesStoreProduct
} from "react-native-purchases";
import { IS_PRODUCTION, SHELL_CONFIG } from "../config";
import { isOnlineNow } from "../connectivity";

export type IapStatus =
  | "completed"
  | "cancelled"
  | "unavailable"
  | "error"
  | "pending";

export type CatalogProduct = { packageId: string; priceLabel: string };

const PRODUCT_IDS = {
  olives_50: "olives_50",
  olives_150: "olives_150",
  olives_400: "olives_400",
  remove_ads: "remove_ads"
} as const;

export type OliveProductId =
  | typeof PRODUCT_IDS.olives_50
  | typeof PRODUCT_IDS.olives_150
  | typeof PRODUCT_IDS.olives_400;

const OLIVE_AMOUNTS: Record<OliveProductId, number> = {
  olives_50: 50,
  olives_150: 150,
  olives_400: 400
};

const ENTITLEMENT_NO_ADS = "no_ads";

let configured = false;
let usingStub = false;

function apiKeyForPlatform(): string {
  if (Platform.OS === "ios") return SHELL_CONFIG.revenueCat.iosApiKey;
  return SHELL_CONFIG.revenueCat.androidApiKey;
}

function keysReady(): boolean {
  const key = apiKeyForPlatform().trim();
  return key.length > 0 && !key.startsWith("rc_REPLACE");
}

/**
 * Configura RevenueCat. Sin API key (o stub forzado) → modo stub DEV.
 */
export async function initPurchases(): Promise<void> {
  if (configured) return;
  configured = true;

  const forceStub =
    SHELL_CONFIG.revenueCat.forceStub ||
    (!IS_PRODUCTION && !keysReady());

  if (forceStub) {
    usingStub = true;
    console.log("[iap] stub mode (sin API keys / forceStub)");
    return;
  }

  try {
    Purchases.setLogLevel(IS_PRODUCTION ? LOG_LEVEL.WARN : LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: apiKeyForPlatform() });
    usingStub = false;
    console.log("[iap] RevenueCat configured", Platform.OS);
  } catch (e) {
    console.warn("[iap] configure failed → stub", e);
    usingStub = true;
  }
}

export function isIapStub(): boolean {
  return usingStub;
}

export function olivesForProduct(packageId: string): number {
  if (packageId in OLIVE_AMOUNTS) {
    return OLIVE_AMOUNTS[packageId as OliveProductId];
  }
  const m = packageId.match(/^olives[_-](\d+)$/);
  return m ? Number(m[1]) : 0;
}

function stubCatalog(): CatalogProduct[] {
  // Solo para iterar UI. Nunca se usa en prod (IS_PRODUCTION + keys).
  return [
    { packageId: PRODUCT_IDS.olives_50, priceLabel: "$0.99" },
    { packageId: PRODUCT_IDS.olives_150, priceLabel: "$2.99" },
    { packageId: PRODUCT_IDS.olives_400, priceLabel: "$4.99" },
    { packageId: PRODUCT_IDS.remove_ads, priceLabel: "$3.99" }
  ];
}

function priceLabelOf(product: PurchasesStoreProduct): string {
  return (product.priceString || "").trim();
}

/**
 * Precios reales de la tienda. Vacío si offline / error (el juego muestra Sin conexión / …).
 * En DEV, si aún no hay productos en Play/App Store → stub catalog.
 */
export async function fetchShopCatalog(): Promise<CatalogProduct[]> {
  if (!isOnlineNow()) return [];
  if (usingStub) return stubCatalog();

  try {
    const products = await Purchases.getProducts([
      PRODUCT_IDS.olives_50,
      PRODUCT_IDS.olives_150,
      PRODUCT_IDS.olives_400,
      PRODUCT_IDS.remove_ads
    ]);
    const out: CatalogProduct[] = [];
    for (const p of products) {
      const label = priceLabelOf(p);
      if (!label) continue;
      out.push({ packageId: p.identifier, priceLabel: label });
    }
    if (out.length === 0 && !IS_PRODUCTION) {
      console.log("[iap] getProducts vacío → stub catalog (DEV)");
      return stubCatalog();
    }
    return out;
  } catch (e) {
    console.warn("[iap] getProducts", e);
    if (!IS_PRODUCTION) return stubCatalog();
    return [];
  }
}

function mapPurchaseError(e: unknown): IapStatus {
  const code =
    e && typeof e === "object" && "code" in e
      ? String((e as { code: unknown }).code)
      : "";
  if (
    code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    code === "1" ||
    /cancel/i.test(String(e))
  ) {
    return "cancelled";
  }
  if (
    code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR ||
    /pending/i.test(String(e))
  ) {
    return "pending";
  }
  if (
    code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR ||
    code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR ||
    !isOnlineNow()
  ) {
    return "unavailable";
  }
  return "error";
}

function hasNoAdsEntitlement(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[ENTITLEMENT_NO_ADS]);
}

async function findStoreProduct(
  productId: string
): Promise<PurchasesStoreProduct | null> {
  const products = await Purchases.getProducts([productId]);
  return products.find((p) => p.identifier === productId) ?? products[0] ?? null;
}

/**
 * Compra consumible de olivos. Tras éxito, consume vía syncPurchases implícito
 * (RevenueCat + Play Billing consumibles).
 */
export async function purchaseOlivesProduct(
  packageId: string
): Promise<{ status: IapStatus; olivesGranted: number }> {
  if (!isOnlineNow()) return { status: "unavailable", olivesGranted: 0 };
  const olives = olivesForProduct(packageId);
  if (olives <= 0) return { status: "error", olivesGranted: 0 };

  if (usingStub) {
    console.log("[iap stub] purchase olives", packageId);
    return { status: "completed", olivesGranted: olives };
  }

  try {
    const product = await findStoreProduct(packageId);
    if (!product) {
      if (!IS_PRODUCTION) {
        console.log("[iap] olives product missing → stub complete (DEV)");
        return { status: "completed", olivesGranted: olives };
      }
      return { status: "unavailable", olivesGranted: 0 };
    }
    await Purchases.purchaseStoreProduct(product);
    return { status: "completed", olivesGranted: olives };
  } catch (e) {
    console.warn("[iap] purchase olives", e);
    return { status: mapPurchaseError(e), olivesGranted: 0 };
  }
}

export async function purchaseRemoveAds(): Promise<IapStatus> {
  if (!isOnlineNow()) return "unavailable";

  if (usingStub) {
    console.log("[iap stub] purchase remove_ads");
    return "completed";
  }

  try {
    const product = await findStoreProduct(PRODUCT_IDS.remove_ads);
    if (!product) {
      if (!IS_PRODUCTION) {
        console.log("[iap] remove_ads missing → stub complete (DEV)");
        return "completed";
      }
      return "unavailable";
    }
    const { customerInfo } = await Purchases.purchaseStoreProduct(product);
    return hasNoAdsEntitlement(customerInfo) ? "completed" : "error";
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
      const ok = await checkNoAdsEntitlement();
      return ok ? "completed" : "error";
    }
    console.warn("[iap] purchase remove_ads", e);
    return mapPurchaseError(e);
  }
}

/**
 * Restaura compras. Si el entitlement no_ads está activo → completed.
 * Si no hay nada que restaurar → unavailable (UI: mensaje claro, no error).
 */
export async function restorePurchases(): Promise<IapStatus> {
  if (!isOnlineNow()) return "unavailable";

  if (usingStub) {
    console.log("[iap stub] restore → completed (dev)");
    return "completed";
  }

  try {
    const info = await Purchases.restorePurchases();
    return hasNoAdsEntitlement(info) ? "completed" : "unavailable";
  } catch (e) {
    console.warn("[iap] restore", e);
    return mapPurchaseError(e);
  }
}

/** Chequeo silencioso al arrancar (sin prompt). */
export async function checkNoAdsEntitlement(): Promise<boolean> {
  if (usingStub) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return hasNoAdsEntitlement(info);
  } catch {
    return false;
  }
}

/** @deprecated offerings path — prefer getProducts by ID. */
export async function findPackageByProductId(
  productId: string
): Promise<PurchasesPackage | null> {
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    for (const pkg of current.availablePackages) {
      if (pkg.product.identifier === productId) return pkg;
    }
  } catch {
    // ignore
  }
  return null;
}

export { PRODUCT_IDS, ENTITLEMENT_NO_ADS };
