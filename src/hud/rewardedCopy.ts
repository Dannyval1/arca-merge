import { consumeRewardedReason } from "../bridge";
import { isNetworkOnline } from "../networkStatus";
import { t } from "../powers/locale";

export function unavailableRewardedMessage(): string {
  if (!isNetworkOnline()) {
    return t({
      es: "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
      en: "You're offline. Check your connection and try again.",
      pt: "Sem conexão. Verifique a internet e tente de novo."
    });
  }
  if (consumeRewardedReason() === "daily_cap") {
    return t({
      es: "Vuelve mañana por más",
      en: "Come back tomorrow for more",
      pt: "Volte amanhã para mais"
    });
  }
  return t({
    es: "No hay anuncios disponibles, intenta más tarde",
    en: "No ads available, try again later",
    pt: "Não há anúncios disponíveis, tente mais tarde"
  });
}
