import type { LocaleStrings } from "../powers/locale";

/**
 * Paquetes de la tienda. Las cantidades son fijas (el precio NO: llega
 * de RevenueCat vía `shop_catalog`).
 *
 * Ritmo: poderes 15–30, cadena 2/3/5, Arca +5 (≈15 por partida perfecta).
 * 50 / 150 / 400 = ~3 / 10 / 26 Arcas de grind. El pack chico es el
 * “estoy atascado ahora”; no bajar las cantidades o el IAP se siente tacaño.
 */
export type ShopRibbonKind = "popular" | "value";

export interface ShopOlivePackage {
  id: string;
  olives: number;
  art: "olivo1" | "olivo2" | "olivo3";
  ribbon?: ShopRibbonKind;
}

export const SHOP_OLIVE_PACKAGES: readonly ShopOlivePackage[] = [
  { id: "olives_50", olives: 50, art: "olivo1" },
  { id: "olives_150", olives: 150, art: "olivo2", ribbon: "popular" },
  { id: "olives_400", olives: 400, art: "olivo3", ribbon: "value" }
];

export const SHOP_REMOVE_ADS = {
  id: "remove_ads"
} as const;

export const SHOP_RIBBON_TEXTURE: Record<ShopRibbonKind, string> = {
  popular: "shop_ribbon_green",
  value: "shop_ribbon_blue"
};

export const SHOP_RIBBON_LABEL: Record<ShopRibbonKind, LocaleStrings> = {
  popular: {
    es: "MÁS POPULAR",
    en: "MOST POPULAR",
    pt: "MAIS POPULAR"
  },
  value: {
    es: "MEJOR VALOR",
    en: "BEST VALUE",
    pt: "MELHOR VALOR"
  }
};
