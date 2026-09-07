import {
  STORAGE_KEYS,
  storageGetNumber,
  storageSetNumber
} from "../storage";
import { POWER_DEFS, type PowerId } from "./powerDefs";

/**
 * Economía de una sola moneda: Hojas de Olivo (olives).
 *
 * - Saldo de hojas: persiste entre sesiones (vía storage abstracta).
 * - Inventario de usos por poder: SOLO por partida; se resetea en startRun().
 * - En partida: vaca/león/elefante (2/3/5, 1× cada uno) y completar el Arca (+5).
 *   Una Arca ≈ 1 poder barato. La tienda (IAP) y el ad rewarded cubren el resto.
 */
export class Economy {
  private olives: number;
  private readonly uses = new Map<PowerId, number>();

  constructor() {
    this.olives = storageGetNumber(STORAGE_KEYS.olives, 0);
  }

  /** Al empezar cada run: 1 uso gratis de cada poder registrado. */
  startRun(): void {
    this.uses.clear();
    for (const def of POWER_DEFS) {
      this.uses.set(def.id, 1);
    }
  }

  getOlives(): number {
    return this.olives;
  }

  getUses(id: PowerId): number {
    return this.uses.get(id) ?? 0;
  }

  /** Snapshot del inventario para debug / HUD. */
  getInventory(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const def of POWER_DEFS) {
      out[def.id] = this.getUses(def.id);
    }
    return out;
  }

  grantOlives(amount: number): void {
    if (amount <= 0) return;
    this.olives += Math.floor(amount);
    this.persistOlives();
  }

  /** @returns false si no hay saldo suficiente. */
  spendOlives(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.olives < amount) return false;
    this.olives -= amount;
    this.persistOlives();
    return true;
  }

  grantPowerUse(id: PowerId, amount = 1): void {
    if (amount <= 0) return;
    this.uses.set(id, this.getUses(id) + Math.floor(amount));
  }

  /** Consume un uso gratis si hay. @returns false si no quedaban. */
  consumeUse(id: PowerId): boolean {
    const n = this.getUses(id);
    if (n <= 0) return false;
    this.uses.set(id, n - 1);
    return true;
  }

  /**
   * Cómo se pagaría el próximo uso de este poder, sin consumir todavía.
   * - free: hay usos de partida
   * - olives: no hay usos pero sí saldo
   * - rewarded: elegible para ad y sin saldo
   * - locked: no hay forma de pagar
   */
  paymentMode(
    id: PowerId
  ): "free" | "olives" | "rewarded" | "locked" {
    const def = POWER_DEFS.find((d) => d.id === id);
    if (!def) return "locked";
    if (this.getUses(id) > 0) return "free";
    if (this.olives >= def.oliveCost) return "olives";
    if (def.rewardedEligible) return "rewarded";
    return "locked";
  }

  /** Borra hojas persistidas e inventario en memoria (debug). */
  resetAll(): void {
    this.olives = 0;
    this.persistOlives();
    this.startRun();
  }

  private persistOlives(): void {
    storageSetNumber(STORAGE_KEYS.olives, this.olives);
  }
}
