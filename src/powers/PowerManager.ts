import type Phaser from "phaser";
import {
  requestRewardedAd,
  sendToShell,
  STUB_POWER_REWARDED_ADS,
  STUB_REWARDED_ADS,
  type RewardedAdStatus
} from "../bridge";
import { PowerModal, type PowerBlockReason } from "../hud/PowerModal";
import { ShopModal } from "../hud/ShopModal";
import { SettingsModal } from "../hud/SettingsModal";
import { Economy } from "./economy";
import {
  getPowerDef,
  POWER_DEFS,
  type PowerDef,
  type PowerHost,
  type PowerId,
  type PowerManagerState,
  type PowerPieceRef,
  type PowerPieceSnapshot
} from "./powerDefs";
import { PowerHUD, type DebugPowerState } from "./PowerHUD";
import { hasSeenPower, markPowerSeen } from "./locale";
import { TierPicker } from "./TierPicker";
import { GameAudio } from "../audio/GameAudio";

export type { PowerManagerState, DebugPowerState };

/**
 * Máquina de estados de poderes.
 *
 * IDLE → SELECTING → APPLYING → IDLE
 * IDLE → ARMED → IDLE  (instant + armNextDrop: próximo drop modificado)
 *
 * En SELECTING el drop queda bloqueado; la física sigue.
 * En ARMED el jugador mueve y suelta con normalidad; el próximo drop aplica el poder.
 * En APPLYING todo el input de juego queda bloqueado hasta que el handler termine.
 *
 * NOTA (shake): si el screen shake molesta al tocar botones, considerar
 * suprimirlo mientras state === SELECTING. Ver PowerHUD.
 */
export class PowerManager {
  private state: PowerManagerState = "IDLE";
  private selectedId: PowerId | null = null;
  private armedId: PowerId | null = null;
  private hoveredPieceId: number | null = null;
  private hoveredTier: number | null = null;
  private readonly economy = new Economy();
  private hud: PowerHUD | null = null;
  private tierPicker: TierPicker | null = null;
  private host: PowerHost | null = null;
  private scene: Phaser.Scene | null = null;
  private pulsePhase = 0;
  private awaitingBridge = false;
  private ignoreNextPointerUp = false;
  /** ms de escena cuando se armó el swallow (mismo gesto ≠ tap nuevo). */
  private ignoreArmedAt = 0;
  /** Hojas gastadas al armar / seleccionar; se reembolsan al cancelar. */
  private olivesSpentPending = 0;
  private onOlivesChanged: ((n: number) => void) | null = null;
  private onAdsRemoved: (() => void) | null = null;
  private onLocaleChanged: (() => void) | null = null;
  private onPrefsChanged: (() => void) | null = null;
  private onNewGame: (() => void) | null = null;
  private onGoHome: (() => void) | null = null;
  private powerModal: PowerModal | null = null;
  private shopModal: ShopModal | null = null;
  private settingsModal: SettingsModal | null = null;
  private rewardedAvailable = true;
  private physicsHeldByModal = false;
  /** Bloquea drop un instante tras cerrar modal (evita el up residual del gesto). */
  private dropLockUntil = 0;

  bind(
    scene: Phaser.Scene,
    host: PowerHost,
    renderScale: number,
    animalScale: (tier: number) => number,
    onOlivesChanged?: (n: number) => void,
    onAdsRemoved?: () => void,
    onLocaleChanged?: () => void,
    onPrefsChanged?: () => void,
    onNewGame?: () => void,
    onGoHome?: () => void
  ): void {
    this.scene = scene;
    this.host = host;
    this.onOlivesChanged = onOlivesChanged ?? null;
    this.onAdsRemoved = onAdsRemoved ?? null;
    this.onLocaleChanged = onLocaleChanged ?? null;
    this.onPrefsChanged = onPrefsChanged ?? null;
    this.onNewGame = onNewGame ?? null;
    this.onGoHome = onGoHome ?? null;
    this.economy.startRun();
    this.hud = new PowerHUD(scene, this.economy, renderScale);
    this.hud.setHandlers({
      onPowerTap: (id) => void this.onPowerButton(id)
    });
    this.tierPicker = new TierPicker(scene, renderScale, animalScale);
    this.powerModal = new PowerModal(scene, this.economy, renderScale);
    this.shopModal = new ShopModal(scene, this.economy, renderScale);
    this.settingsModal = new SettingsModal(scene, renderScale);
    this.wireModals();
    this.syncRewardedAvailability();
    this.emitOlives();
    this.refreshHud();
  }

  startRun(): void {
    this.armedId = null;
    this.host?.setDropArmed(null);
    this.state = "IDLE";
    this.selectedId = null;
    this.hoveredPieceId = null;
    this.hoveredTier = null;
    this.awaitingBridge = false;
    this.olivesSpentPending = 0;
    this.ignoreNextPointerUp = false;
    this.economy.startRun();
    this.host?.clearPieceHighlights();
    this.tierPicker?.hide();
    this.refreshHud();
  }

  getState(): PowerManagerState {
    return this.state;
  }

  getSelectedId(): PowerId | null {
    return this.selectedId;
  }

  getArmedId(): PowerId | null {
    return this.armedId;
  }

  getEconomy(): Economy {
    return this.economy;
  }

  /** True si el próximo drop debe ser la pareja 2×2 (y consume el armado). */
  consumeArmedDrop(): PowerId | null {
    if (!this.armedId) return null;
    const id = this.armedId;
    // Cobrado al armar: al soltar solo se limpia el armado, sin reembolso.
    this.olivesSpentPending = 0;
    this.armedId = null;
    this.host?.setDropArmed(null);
    this.finishToIdle();
    return id;
  }

  isArmed(id?: PowerId): boolean {
    if (!this.armedId) return false;
    return id === undefined || this.armedId === id;
  }

  blocksDrop(): boolean {
    return (
      this.state === "SELECTING" ||
      this.state === "APPLYING" ||
      this.awaitingBridge ||
      this.isModalOpen() ||
      performance.now() < this.dropLockUntil
    );
  }

  blocksAllPlayInput(): boolean {
    return (
      this.state === "APPLYING" ||
      this.awaitingBridge ||
      this.isModalOpen() ||
      performance.now() < this.dropLockUntil
    );
  }

  isModalOpen(): boolean {
    return (
      !!this.powerModal?.isOpen() ||
      !!this.shopModal?.isOpen() ||
      !!this.settingsModal?.isOpen()
    );
  }

  /** Abre la tienda (contador de hojas, No Ads, game over, modal de poder). */
  openShop(): void {
    if (this.host?.isArkCompleteAnimating()) return;
    if (this.state === "APPLYING") return;
    if (this.shopModal?.isOpen()) return;
    if (this.settingsModal?.isOpen()) this.settingsModal.close();
    sendToShell({ type: "open_shop" });
    this.holdPhysics();
    this.shopModal?.open();
  }

  /** Abre Ajustes (en el juego; el shell solo recibe el aviso). */
  openSettings(): void {
    if (this.host?.isGameOver() || this.host?.isArkCompleteAnimating()) return;
    if (this.state === "APPLYING") return;
    if (this.settingsModal?.isOpen()) return;
    if (this.shopModal?.isOpen()) this.shopModal.close();
    if (this.powerModal?.isOpen()) this.powerModal.close();
    sendToShell({ type: "open_settings" });
    this.holdPhysics();
    this.settingsModal?.open();
  }

  hitTestHud(worldX: number, worldY: number): boolean {
    if (this.isModalOpen()) return true;
    if (this.hud?.hitTest(worldX, worldY) !== null) return true;
    if (this.tierPicker?.isVisible() && this.tierPicker.hitTest(worldX, worldY) !== null) {
      return true;
    }
    return false;
  }

  setGameDisabled(disabled: boolean): void {
    this.refreshHud(disabled);
    if (disabled) {
      this.closeAllModals();
      this.cancelSelection();
      this.olivesSpentPending = 0;
      this.armedId = null;
      this.host?.setDropArmed(null);
      this.finishToIdle();
    }
  }

  /**
   * Si el pointerup del botón que activó el poder se perdió (el dim del
   * Rayo aparece bajo el dedo), el primer tap real no debe tragarse.
   */
  handlePointerDown(): void {
    if (!this.ignoreNextPointerUp) return;
    if (performance.now() - this.ignoreArmedAt < 80) return;
    this.ignoreNextPointerUp = false;
  }

  handlePointerMove(worldX: number, worldY: number): boolean {
    if (this.state !== "SELECTING" || !this.host || !this.selectedId) {
      return false;
    }
    const def = getPowerDef(this.selectedId);
    if (!def) return true;

    if (def.targeting === "pick-piece") {
      const piece = this.host.findPieceAt(worldX, worldY);
      const nextId = piece?.id ?? null;
      if (nextId === this.hoveredPieceId) return true;
      this.hoveredPieceId = nextId;
      this.applyPickHighlights();
      return true;
    }

    if (def.targeting === "pick-tier") {
      const tier = this.tierPicker?.hitTest(worldX, worldY) ?? null;
      if (tier === this.hoveredTier) return true;
      this.hoveredTier = tier;
      this.tierPicker?.setHovered(tier);
      return true;
    }

    return true;
  }

  handlePointerUp(worldX: number, worldY: number): boolean {
    if (this.ignoreNextPointerUp) {
      this.ignoreNextPointerUp = false;
      return true;
    }

    if (this.state !== "SELECTING" || !this.host || !this.selectedId) {
      return false;
    }

    const def = getPowerDef(this.selectedId);
    if (!def) {
      this.cancelSelection();
      return true;
    }

    if (this.hud?.hitTest(worldX, worldY) === this.selectedId) {
      this.cancelSelection();
      return true;
    }

    if (def.targeting === "pick-piece") {
      const piece = this.host.findPieceAt(worldX, worldY);
      if (!piece) {
        this.cancelSelection();
        return true;
      }
      void this.applyPower(def, { piece });
      return true;
    }

    if (def.targeting === "pick-tier") {
      const tier = this.tierPicker?.hitTest(worldX, worldY);
      if (tier == null) {
        this.cancelSelection();
        return true;
      }
      if (!this.host.isTierSelectable(tier)) {
        // Nivel atenuado: no cancela; el jugador sigue eligiendo.
        return true;
      }
      void this.applyPower(def, { tier });
      return true;
    }

    this.cancelSelection();
    return true;
  }

  /** Llamar tras spawn/destroy para actualizar botones (tablero vacío, etc.). */
  notifyBoardChanged(): void {
    if (this.state === "SELECTING" && this.host && this.selectedId) {
      const def = getPowerDef(this.selectedId);
      if (def?.targeting === "pick-piece" && !this.host.hasSelectablePieces()) {
        this.cancelSelection();
        return;
      }
      if (def?.targeting === "pick-tier" && !this.host.hasMergeableTiers()) {
        this.cancelSelection();
        return;
      }
      if (def?.targeting === "pick-tier") {
        this.syncTierPicker();
      }
    }
    this.refreshHud();
  }

  tick(delta: number): void {
    this.hud?.tick(delta);
    if (this.state !== "SELECTING" || !this.host) return;
    const def = this.selectedId ? getPowerDef(this.selectedId) : null;
    if (!def || def.targeting !== "pick-piece") return;

    this.pulsePhase += delta / 500;
    this.applyPickHighlights();
  }

  destroy(): void {
    this.releasePhysics();
    this.armedId = null;
    this.host?.setDropArmed(null);
    this.host?.clearPieceHighlights();
    this.powerModal?.destroy();
    this.powerModal = null;
    this.shopModal?.destroy();
    this.shopModal = null;
    this.settingsModal?.destroy();
    this.settingsModal = null;
    this.tierPicker?.destroy();
    this.tierPicker = null;
    this.hud?.destroy();
    this.hud = null;
    this.host = null;
    this.scene = null;
  }

  debugSnapshot(): {
    state: PowerManagerState;
    selected: PowerId | null;
    armed: PowerId | null;
    olives: number;
    inventory: Record<string, number>;
    awaitingBridge: boolean;
  } {
    return {
      state: this.state,
      selected: this.selectedId,
      armed: this.armedId,
      olives: this.economy.getOlives(),
      inventory: this.economy.getInventory(),
      awaitingBridge: this.awaitingBridge
    };
  }

  grantOlives(n: number): void {
    this.economy.grantOlives(n);
    this.emitOlives();
    this.refreshHud();
  }

  grantPowerUse(id: PowerId, n: number): void {
    this.economy.grantPowerUse(id, n);
    this.refreshHud();
  }

  resetEconomy(): void {
    this.economy.resetAll();
    this.emitOlives();
    this.refreshHud();
  }

  /** Debug: fuerza el estado visual de un botón. null = limpiar. */
  setPowerState(id: PowerId, state: DebugPowerState | null): void {
    this.hud?.setDebugState(id, state);
  }

  clearPowerDebugStates(): void {
    this.hud?.clearDebugStates();
    this.refreshHud();
  }

  private emitOlives(): void {
    this.onOlivesChanged?.(this.economy.getOlives());
  }

  // ---- interno ----

  private wireModals(): void {
    this.powerModal?.setHandlers({
      onClose: () => this.closePowerModal(),
      onUse: (id) => this.onFirstUseConfirm(id),
      onBuyOlives: (id) => this.onModalBuyOlives(id),
      onWatchAd: (id) => this.onModalWatchAd(id),
      onOpenShop: () => this.openShop()
    });
    this.shopModal?.setHandlers({
      onClose: () => this.closeShopModal(),
      onOlivesChanged: () => {
        this.emitOlives();
        this.powerModal?.refreshOlives(this.economy.getOlives());
        this.refreshHud();
      },
      onOlivesPurchased: (amount, fromX, fromY) => {
        this.host?.playOliveFly(fromX, fromY, amount);
      },
      onAdsRemoved: () => this.onAdsRemoved?.()
    });
    this.settingsModal?.setHandlers({
      onClose: () => this.closeSettingsModal(),
      onLocaleChanged: () => this.onLocaleChanged?.(),
      onPrefsChanged: () => this.onPrefsChanged?.(),
      onOpenShop: () => {
        this.closeSettingsModal();
        this.openShop();
      },
      onNewGame: () => this.onNewGame?.(),
      onGoHome: () => this.onGoHome?.()
    });
  }

  private syncRewardedAvailability(): void {
    if (STUB_REWARDED_ADS || STUB_POWER_REWARDED_ADS) {
      this.rewardedAvailable = true;
      return;
    }
    if (typeof window === "undefined") {
      this.rewardedAvailable = true;
      return;
    }
    this.rewardedAvailable = window.arcaBridgeStub?.rewarded !== "unavailable";
  }

  private holdPhysics(): void {
    if (this.physicsHeldByModal) return;
    this.host?.pausePhysics();
    this.physicsHeldByModal = true;
  }

  private releasePhysics(): void {
    if (!this.physicsHeldByModal) return;
    this.host?.resumePhysics();
    this.physicsHeldByModal = false;
  }

  private closePowerModal(swallowGesture = false): void {
    this.powerModal?.close();
    if (!this.shopModal?.isOpen() && !this.settingsModal?.isOpen()) {
      this.releasePhysics();
      this.finishToIdle();
    }
    this.armDropLock(swallowGesture);
    this.refreshHud();
  }

  private closeShopModal(swallowGesture = false): void {
    this.shopModal?.close();
    this.powerModal?.refreshOlives(this.economy.getOlives());
    if (!this.powerModal?.isOpen() && !this.settingsModal?.isOpen()) {
      this.releasePhysics();
      this.finishToIdle();
    }
    this.armDropLock(swallowGesture);
    this.refreshHud();
  }

  private closeSettingsModal(swallowGesture = false): void {
    this.settingsModal?.close();
    if (!this.powerModal?.isOpen() && !this.shopModal?.isOpen()) {
      this.releasePhysics();
      this.finishToIdle();
    }
    this.armDropLock(swallowGesture);
    this.refreshHud();
  }

  private closeAllModals(): void {
    this.powerModal?.close();
    this.shopModal?.close();
    this.settingsModal?.close();
    this.releasePhysics();
    this.armDropLock(true);
  }

  /**
   * Tras cerrar el modal, Phaser aún puede entregar el pointerup/down del mismo
   * gesto al tablero. Bloqueo corto + ignoreNextPointerUp.
   */
  private armDropLock(forceSwallow: boolean): void {
    this.dropLockUntil = performance.now() + 350;
    if (forceSwallow || this.scene?.input?.activePointer?.isDown) {
      this.ignoreNextPointerUp = true;
    }
  }

  /** True si el próximo pointerup del juego no debe hacer drop. */
  isSuppressingPointerUp(): boolean {
    return this.ignoreNextPointerUp;
  }

  private openPowerModal(
    def: PowerDef,
    mode: "reload" | "first-use" | "info" | "confirm-olives" | "confirm-ad",
    blockReason?: PowerBlockReason
  ): void {
    if (this.state !== "IDLE") return;
    if (this.powerModal?.isOpen()) return;
    this.syncRewardedAvailability();
    this.holdPhysics();
    this.powerModal?.open({
      def,
      mode,
      blockReason,
      olives: this.economy.getOlives(),
      rewardedAvailable: this.rewardedAvailable && def.rewardedEligible
    });
  }

  private getBlockReason(def: PowerDef): PowerBlockReason | null {
    const host = this.host;
    if (!host) return null;
    if (def.targeting === "pick-piece" && !host.hasSelectablePieces()) {
      return "empty-board";
    }
    if (def.targeting === "pick-tier" && !host.hasMergeableTiers()) {
      return "no-pairs";
    }
    if (def.blockedInDanger) {
      if (host.isWatersActive()) return "waters-active";
      if (host.isInDangerZone()) return "in-danger";
    }
    if (
      def.minBoardPieces != null &&
      host.listPieces().length < def.minBoardPieces
    ) {
      return "too-few-pieces";
    }
    return null;
  }

  private async onPowerButton(id: PowerId): Promise<void> {
    const host = this.host;
    if (!host) return;
    if (host.isGameOver() || host.isArkCompleteAnimating()) return;
    if (this.state === "APPLYING" || this.awaitingBridge) return;
    if (this.isModalOpen()) return;

    // Desarmar el mismo poder.
    if (this.armedId === id) {
      this.disarm(true);
      return;
    }

    if (this.state === "SELECTING" && this.selectedId === id) {
      this.cancelSelection();
      return;
    }

    if (this.state === "SELECTING") {
      this.cancelSelection();
    }

    if (this.armedId) {
      this.disarm(true);
    }

    // Tras cancelar/desarmar debemos estar en IDLE para abrir modal o activar.
    if (this.state !== "IDLE") return;

    const def = getPowerDef(id);
    if (!def) return;

    const blockReason = this.getBlockReason(def);
    if (blockReason) {
      this.openPowerModal(def, "info", blockReason);
      return;
    }

    const uses = this.economy.getUses(id);
    if (uses <= 0) {
      this.openPowerModal(def, "reload");
      return;
    }

    if (!hasSeenPower(id)) {
      this.openPowerModal(def, "first-use");
      return;
    }

    await this.activatePower(def);
  }

  private onFirstUseConfirm(id: PowerId): void {
    const def = getPowerDef(id);
    if (!def) return;
    markPowerSeen(id);
    this.closePowerModal(true);
    void this.activatePower(def);
  }

  private onModalBuyOlives(id: PowerId): void {
    const def = getPowerDef(id);
    if (!def) return;
    if (!this.economy.spendOlives(def.oliveCost)) return;
    this.economy.grantPowerUse(id, 1);
    markPowerSeen(id);
    this.emitOlives();
    this.closePowerModal(true);
    void this.activatePower(def);
  }

  private async onModalWatchAd(id: PowerId): Promise<RewardedAdStatus> {
    // No awaitingBridge: el modal ya bloquea el tablero y el botón AD
    // (adLoading). Si el jugador cierra mientras carga, no debe quedar
    // 12s sin poder jugar.
    const def = getPowerDef(id);

    if (STUB_REWARDED_ADS || STUB_POWER_REWARDED_ADS) {
      if (def) {
        this.economy.grantPowerUse(id, 1);
        markPowerSeen(id);
        GameAudio.current?.onReward();
        this.closePowerModal(false);
        void this.activatePower(def);
      }
      return "completed";
    }

    const status = await requestRewardedAd(id);

    if (status === "unavailable") {
      this.rewardedAvailable = false;
      this.powerModal?.setRewardedAvailable(false);
    }

    if (status === "completed" && def) {
      this.economy.grantPowerUse(id, 1);
      markPowerSeen(id);
      GameAudio.current?.onReward();
      // Tras el ad el gesto ya terminó; no tragar el próximo tap.
      this.closePowerModal(false);
      void this.activatePower(def);
      return status;
    }

    this.refreshHud();
    return status;
  }

  /** Activa un poder que ya tiene usos. No cobra ni abre modal. */
  private async activatePower(def: PowerDef): Promise<void> {
    if (!this.host || this.state !== "IDLE") return;
    this.olivesSpentPending = 0;

    if (def.targeting === "instant" && def.armNextDrop) {
      this.armPower(def);
      return;
    }

    if (def.targeting === "instant") {
      await this.applyPower(def, {});
      return;
    }

    this.state = "SELECTING";
    this.selectedId = def.id;
    this.hoveredPieceId = null;
    this.hoveredTier = null;
    const ptr = this.scene?.input?.activePointer;
    this.ignoreNextPointerUp = !!ptr?.isDown;
    this.ignoreArmedAt = this.ignoreNextPointerUp ? performance.now() : 0;

    if (def.targeting === "pick-piece") {
      this.applyPickHighlights();
    } else if (def.targeting === "pick-tier") {
      this.syncTierPicker(true);
    }

    this.refreshHud();
  }

  /** Arma el próximo drop. Consume el uso YA. */
  private armPower(def: PowerDef): void {
    if (!this.economy.consumeUse(def.id)) {
      if (this.olivesSpentPending > 0) {
        this.economy.grantOlives(this.olivesSpentPending);
        this.olivesSpentPending = 0;
      }
      this.refreshHud();
      return;
    }

    this.armedId = def.id;
    this.state = "ARMED";
    this.selectedId = def.id;
    this.host?.setDropArmed(def.id);
    sendToShell({ type: "haptic", intensity: "medium" });
    GameAudio.current?.onPower(def.id);
    this.refreshHud();
  }

  /** Desarma. Si refund=true, devuelve uso u hojas. */
  private disarm(refund: boolean): void {
    if (!this.armedId) return;
    const id = this.armedId;

    if (refund) {
      if (this.olivesSpentPending > 0) {
        this.economy.grantOlives(this.olivesSpentPending);
      } else {
        this.economy.grantPowerUse(id, 1);
      }
    }
    this.olivesSpentPending = 0;
    this.armedId = null;
    this.host?.setDropArmed(null);
    this.finishToIdle();
  }

  private async applyPower(
    def: PowerDef,
    target: { piece?: PowerPieceRef; tier?: number }
  ): Promise<void> {
    if (!this.host) return;

    this.state = "APPLYING";
    this.host.clearPieceHighlights();
    this.tierPicker?.hide();
    this.refreshHud(true);

    // Caso 2 raven: claim atómico ANTES de consumir.
    let removalSnapshot: PowerPieceSnapshot | undefined;
    if (def.targeting === "pick-piece" && def.removesTarget) {
      if (!target.piece) {
        this.refundPendingWithoutConsume(def.id);
        this.finishToIdle();
        return;
      }
      const claimed = this.host.claimPieceForRemoval(target.piece.id);
      if (!claimed) {
        this.refundPendingWithoutConsume(def.id);
        this.finishToIdle();
        return;
      }
      removalSnapshot = claimed;
    }

    // pick-tier: revalidar que el nivel siga siendo fusionable.
    if (def.targeting === "pick-tier") {
      if (target.tier == null || !this.host.isTierSelectable(target.tier)) {
        this.refundPendingWithoutConsume(def.id);
        this.finishToIdle();
        return;
      }
    }

    if (!this.economy.consumeUse(def.id)) {
      if (this.olivesSpentPending > 0) {
        this.economy.grantOlives(this.olivesSpentPending);
      }
      this.olivesSpentPending = 0;
      this.finishToIdle();
      return;
    }
    this.olivesSpentPending = 0;
    sendToShell({ type: "power_used", powerId: def.id });

    if (def.id !== "waters") {
      GameAudio.current?.onPower(def.id);
    }

    try {
      await def.handler({
        host: this.host,
        piece: target.piece,
        tier: target.tier,
        removalSnapshot
      });
    } catch (err) {
      console.error(`[powers] handler ${def.id} falló`, err);
    }

    this.finishToIdle();
  }

  /**
   * Tras ensurePaid falló el claim: reembolsa hojas (y quita el uso temporal
   * que grantPowerUse había metido). En rewarded deja el uso ganado con el ad.
   */
  private refundPendingWithoutConsume(id: PowerId): void {
    if (this.olivesSpentPending > 0) {
      this.economy.grantOlives(this.olivesSpentPending);
      this.economy.consumeUse(id);
    }
    this.olivesSpentPending = 0;
  }

  private cancelSelection(): void {
    if (this.state !== "SELECTING") return;

    if (this.olivesSpentPending > 0) {
      this.economy.grantOlives(this.olivesSpentPending);
      if (this.selectedId) {
        this.economy.consumeUse(this.selectedId);
      }
      this.olivesSpentPending = 0;
    }

    this.host?.clearPieceHighlights();
    this.tierPicker?.hide();
    this.finishToIdle();
  }

  private finishToIdle(): void {
    this.state = this.armedId ? "ARMED" : "IDLE";
    if (!this.armedId) this.selectedId = null;
    this.hoveredPieceId = null;
    this.hoveredTier = null;
    this.ignoreNextPointerUp = false;
    this.tierPicker?.hide();
    this.refreshHud();
  }

  private applyPickHighlights(): void {
    const host = this.host;
    if (!host) return;

    const pieces = host.listPieces();
    const basePulse = 1.02 + Math.sin(this.pulsePhase) * 0.02;

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      let h = basePulse;
      if (p.id === this.hoveredPieceId) h = 1.08;
      host.setPieceHighlight(p.id, h);
    }
    host.setPickReticles(pieces, this.hoveredPieceId);
  }

  private syncTierPicker(forceShow = false): void {
    const host = this.host;
    const picker = this.tierPicker;
    if (!host || !picker) return;
    const slots = host.listTierSlots();
    if (forceShow || picker.isVisible()) {
      if (!picker.isVisible()) picker.show(slots);
      else picker.refresh(slots);
      picker.setHovered(this.hoveredTier);
    }
  }

  private refreshHud(disabled = false): void {
    this.emitOlives();
    const host = this.host;
    const hardDisable =
      disabled ||
      !!host?.isGameOver() ||
      !!host?.isArkCompleteAnimating();
    const boardEmpty = !host?.hasSelectablePieces();
    const noMergeableTiers = !host?.hasMergeableTiers();
    const inDangerZone = !!host?.isInDangerZone();
    const watersActive = !!host?.isWatersActive();
    const boardPieceCount = host?.listPieces().length ?? 0;
    this.hud?.refresh(
      this.state,
      this.selectedId,
      this.armedId,
      hardDisable,
      boardEmpty,
      noMergeableTiers,
      inDangerZone,
      watersActive,
      boardPieceCount
    );
  }
}

export { POWER_DEFS };
