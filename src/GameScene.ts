import Phaser from "phaser";
import {
  getAnimal,
  pickDropLevel,
  MERGE_SCORE_MULT,
  ARK_BONUS,
  ARK_OLIVE_REWARD,
  CHAIN
} from "./chain";
import {
  sendToShell,
  startBridgeListener,
  waitForGameOverAdsDone,
  requestInterstitialAd,
  onAppLifecycle
} from "./bridge";
import { bumpGamesPlayed, canShowReviewPrompt, markReviewPromptShown, requestNativeStoreReview } from "./reviewGate";
import { ENABLE_GAME_DEBUG } from "./buildFlags";
import {
  JuiceManager,
  type JuicePieceVisual
} from "./juice/JuiceManager";
import { GameAudio } from "./audio/GameAudio";
import { LOGICAL_WIDTH as W, LOGICAL_HEIGHT as H, PLAYABLE_INSET, getRenderScale, getContainZoom } from "./layout";
import { juiceConfig } from "./juice/juiceConfig";
import { queueGameAssets } from "./preload";
import {
  PowerManager,
  twoByTwoStackGap,
  type PowerHost,
  type PowerId,
  type PowerPieceRef,
  type TierSlotInfo,
  type DebugPowerState
} from "./powers";
import { TopHud, ChainBar, BANNER_RESERVE_PX } from "./hud";
import { AdCountdown } from "./hud/AdCountdown";
import { GameOverModal } from "./hud/GameOverModal";
import { ContinueModal } from "./hud/ContinueModal";
import { t } from "./powers/locale";
import { ShareRewardModal } from "./hud/ShareRewardModal";
import { ReviewPromptModal } from "./hud/ReviewPromptModal";
import {
  markShareOfferShown,
  shouldOfferShareReward,
  SHARE_REWARD_OLIVES,
  tryMarkShareRewardClaimed
} from "./shareOffer";
import { ScreenLoader } from "./hud/ScreenLoader";
import { STORAGE_KEYS, storageGetNumber, storageSetNumber } from "./storage";
import { syncSettingsPrefsToShell } from "./settingsPrefs";
import { clearPowerSeenFlags } from "./powers/locale";
import {
  clearArkCompleteSeen,
  hasSeenArkComplete,
  markArkCompleteSeen
} from "./arkSeen";
import { clearAdsRemoved, hasAdsRemoved } from "./adsRemoved";

// ---- Layout (canvas lógico 390x844, proporción teléfono moderno) ----
// Hueco jugable x=20..370 → ancho interno 350 px
const WALL = 20;
const FLOOR_Y = 770;
/**
 * ~24% del span DROP→FLOOR desde arriba del tablero (antes 270 ≈ 14%).
 * Baja la línea → menos alto útil → partidas más cortas.
 * Las Aguas usa FLOOR_Y - DANGER_Y como boardSpan; ceilingDampPx sigue
 * relativo a esta constante.
 */
const DANGER_Y = 330;
const DROP_Y = 190;
/**
 * true = abre el Game Over al arrancar (para acomodar el modal).
 * Poner en false cuando termines de ajustar.
 */
const DEBUG_SHOW_GAME_OVER = false;
/**
 * true = abre el modal “¿Salvar el arca?” al arrancar (para acomodar layout).
 * Poner en false cuando termines de ajustar.
 */
const DEBUG_SHOW_CONTINUE = false;
/** Casco más ancho que 390 para cubrir márgenes laterales del arte. */
const ARK_WIDTH_SCALE = 1.12;

// ---- Física (ajusta la "sensación" aquí) ----
const RESTITUTION = 0.12;
const FRICTION = 0.35;
/** Espera tras soltar antes de mostrar el siguiente preview. */
const DROP_COOLDOWN_MS = 550;
/** Tras ~1.5 min de partida, un solo intersticial (si no compró sin anuncios). */
const MID_RUN_AD_AFTER_MS = 90_000;
const DANGER_TIME_MS = 1800;
/** Pieza joven / en caída: no cuenta para el aviso de la línea. */
const DANGER_SETTLE_MS = 700;
/** Empieza el aviso cuando el tope asentado está a este px bajo la línea. */
const DANGER_WARN_PX = 70;
const DANGER_WARN_BURST_MS = 1200;
/** Matter.speed por debajo de esto = ya no está cayendo. */
const DANGER_SETTLED_SPEED = 2.8;

interface ArcaDebugSnapshot {
  matterBodies: number;
  animals: number;
  juiceVisuals: number;
  activeParticles: number;
  combo: number;
  maxCombo: number;
  totalCombos: number;
  comboTextsShown: number;
  breathingPieces: number;
  firstBreathPhase: number;
  lastLandTier: number;
  lastLandIntensity: number;
  shakesTriggered: number;
  dustBursts: number;
  powers: ReturnType<PowerManager["debugSnapshot"]>;
}

interface ArcaDebug {
  (): ArcaDebugSnapshot;
  /** Dibuja u oculta los colliders de Matter en caliente. */
  physics: (enabled: boolean) => boolean;
  forceCombo: JuiceManager["forceCombo"];
  /** Dispara el clímax de arca completa sin fusionar dos elefantes. */
  forceArkComplete: (x?: number, y?: number) => { x: number; y: number };
  mergeGaps: JuiceManager["mergeGapReport"];
  comboTextures: JuiceManager["comboTextureReport"];
  logMerges: (enabled: boolean) => boolean;
  grantOlives: (n: number) => void;
  grantPowerUse: (id: PowerId, n?: number) => void;
  resetEconomy: () => void;
  /** Fuerza estado visual de un botón de poder. null limpia. */
  setPowerState: (id: PowerId, state: DebugPowerState | null) => void;
  clearPowerDebugStates: () => void;
  /** Borra flags de “primera vez” por poder (localStorage arca-power-seen). */
  clearPowerSeenFlags: () => void;
  /** Borra el flag de primera arca completa (vuelve a versión extendida). */
  clearArkCompleteSeen: () => void;
  /** Borra la compra persistida de Quitar anuncios. */
  clearAdsRemoved: () => void;
  /** Abre el Game Over de prueba (datos de muestra, con récord nuevo). */
  showGameOver: () => void;
  /** Abre el modal de continuar (layout). */
  showContinue: () => void;
  /** Documentación: px que el shell debe reservar bajo el WebView. */
  bannerReservePx: number;
}

declare global {
  interface Window {
    arcaDebug?: ArcaDebug;
  }
}

interface AnimalPiece {
  body: Phaser.Physics.Matter.Image;
  visual: Phaser.GameObjects.Image;
  visualState: JuicePieceVisual;
  preImpactSpeed: number;
  lastLandFrame: number;
  /** Id estable para powers / highlight (no reutiliza índices del array). */
  id: number;
}

export class GameScene extends Phaser.Scene {
  private score = 0;
  private best = 0;

  private currentLevel = 1;
  private nextLevel = 1;
  private preview!: Phaser.GameObjects.Image;
  private dropGuide!: Phaser.GameObjects.Graphics;
  private dangerLine!: Phaser.GameObjects.Container;
  private dangerShakePhase = 0;
  /** Fin del aviso corto (ms de escena). 0 = quieta. */
  private dangerBurstUntil = 0;
  /** Ya avisamos en esta “entrada” a la zona; se resetea al salir. */
  private dangerWarnLatched = false;
  private dangerCrossLatched = false;
  private sceneBg!: Phaser.GameObjects.Image;
  private sceneArk!: Phaser.GameObjects.Image;
  private juice!: JuiceManager;
  private audio!: GameAudio;
  private loader!: ScreenLoader;
  private powers!: PowerManager;
  private topHud!: TopHud;
  private chainBar!: ChainBar;
  private gameOverModal!: GameOverModal;
  private continueModal!: ContinueModal;
  private shareRewardModal!: ShareRewardModal;
  private reviewPromptModal!: ReviewPromptModal;

  private canDrop = true;
  private isOver = false;
  /** Ya usó el continue de esta partida. */
  private continueUsedThisRun = false;
  /** Modal de continue a la vista: el tablero está congelado. */
  private awaitingContinue = false;
  /** true mientras corre la animación de ark_complete (deshabilita poderes). */
  private arkCompleteAnimating = false;
  /** Arcas completadas en esta partida (reset en create / restart). */
  private arksThisRun = 0;
  /** Hojas ganadas jugando en esta partida (no IAP). */
  private olivesThisRun = 0;
  private runStartedAt = 0;
  /** Un intersticial mid-run por partida (máximo). */
  private midRunAdDone = false;
  private midRunAdBusy = false;
  /** True mientras esperamos interstitial_ad_result del shell. */
  private midRunAdAwaitingResult = false;
  private midRunSafetyTimer: Phaser.Time.TimerEvent | null = null;
  private unsubLifecycle: (() => void) | null = null;
  private pendingReviewAfterGo = false;
  /**
   * Las Aguas: física/VFX pueden seguir tras APPLYING si
   * releaseInputOnDrain. dangerMs NO se toca aquí.
   */
  private watersActive = false;
  /**
   * El Rayo fusiona por id. Matter debe seguir vivo (pausar y reanudar con el
   * spawn encima del montón explota solapes y lanza piezas fuera del casco).
   * Mientras corre, tryMerge no debe robar un tercer animal.
   */
  private suppressNaturalMerges = false;
  private waterSurfaceY = FLOOR_Y;
  private readonly waterLevelProxy = { y: FLOOR_Y };
  private readonly buoyancyForce = new Phaser.Math.Vector2(0, 0);
  private lastHudDanger = false;
  /**
   * Si el pointerdown empezó sobre el HUD de poderes (o fue marcado por un
   * botón), ese gesto NO puede terminar en un drop.
   */
  private gestureConsumed = false;
  /** Buffer del canvas / canvas lógico. 1 en desktop, hasta 2 en móvil HiDPI. */
  private renderScale = 1;
  private readonly worldPoint = new Phaser.Math.Vector2();
  private dropGuideX = W / 2;
  private dropGuideRadius = 0;
  private nextPieceId = 1;

  private animals: AnimalPiece[] = [];

  constructor() {
    super("game");
  }

  preload(): void {
    queueGameAssets(this);
  }

  create(): void {
    this.score = 0;
    this.isOver = false;
    this.watersActive = false;
    this.suppressNaturalMerges = false;
    this.continueUsedThisRun = false;
    this.awaitingContinue = false;
    this.waterSurfaceY = FLOOR_Y;
    this.lastHudDanger = false;
    this.canDrop = true;
    this.arkCompleteAnimating = false;
    this.arksThisRun = 0;
    this.olivesThisRun = 0;
    this.runStartedAt = Date.now();
    this.midRunAdDone = false;
    this.midRunAdBusy = false;
    this.midRunAdAwaitingResult = false;
    this.pendingReviewAfterGo = false;
    this.gestureConsumed = false;
    this.animals = [];
    this.nextPieceId = 1;
    this.best = storageGetNumber(STORAGE_KEYS.best, 0);

    startBridgeListener();
    syncSettingsPrefsToShell();
    this.unsubLifecycle?.();
    this.unsubLifecycle = onAppLifecycle((type) => {
      if (type === "app_foreground") this.onMidRunForeground();
    });
    this.game.events.on(
      Phaser.Core.Events.VISIBLE,
      this.onMidRunForeground,
      this
    );

    this.renderScale = getRenderScale();
    this.sceneBg = this.add.image(W / 2, H / 2, "bg").setDepth(0);
    this.sceneArk = this.add.image(W / 2, H / 2, "ark").setDepth(1);
    this.layoutView();
    this.scale.on("resize", this.layoutView, this);

    this.drawDangerLine();
    this.dropGuide = this.add.graphics().setDepth(5);
    this.juice = new JuiceManager(this);
    this.audio = new GameAudio(this);
    this.loader = new ScreenLoader(this);
    this.powers = new PowerManager();

    // Paredes, piso y techo (cuerpos estáticos, sin sprite).
    // Sin techo, un solape (Rayo / Aguas) expulsa piezas por arriba y
    // “desaparecen”: el visual sigue vivo fuera de cámara.
    this.matter.add.rectangle(WALL / 2, H / 2, WALL, H, { isStatic: true });
    this.matter.add.rectangle(W - WALL / 2, H / 2, WALL, H, { isStatic: true });
    this.matter.add.rectangle(W / 2, FLOOR_Y + 20, W, 40, { isStatic: true });
    this.matter.add.rectangle(W / 2, 10, W, 20, { isStatic: true });
    this.matter.world.resume();

    // Preview del animal a soltar
    this.currentLevel = pickDropLevel();
    this.nextLevel = pickDropLevel();
    this.buildHud();
    this.warmMatterAnimalBodies();
    this.powers.bind(
      this,
      this.createPowerHost(),
      this.renderScale,
      (tier) => this.animalScale(tier),
      (n) => this.topHud.setOlives(n),
      () => this.topHud.setAdsRemoved(true),
      () => {
        this.topHud.setBest(this.best);
        this.topHud.setOlives(this.powers.debugSnapshot().olives);
        if (this.gameOverModal?.isOpen()) this.gameOverModal.relabel();
        if (this.continueModal?.isOpen()) this.continueModal.relabel();
      },
      () => this.audio.applyPrefs(),
      () => this.scene.restart(),
      () => this.scene.start("home")
    );
    this.preview = this.add
      .image(W / 2, DROP_Y, `animal-${this.currentLevel}`)
      .setScale(this.animalScale(this.currentLevel))
      .setDepth(20);
    this.juice.attachPreview(
      this.preview,
      this.animalScale(this.currentLevel),
      DROP_Y
    );
    this.refreshPreview();

    // Input: mover preview y soltar.
    // Los botones del PowerHUD son interactive y marcan gestureConsumed en su
    // pointerdown (Phaser procesa GOs antes que el listener global). Como red
    // de seguridad, el handler global también hace hit-test del HUD.
    this.input.on("pointermove", (p: Phaser.Input.Pointer) =>
      this.onPointerMove(p)
    );
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) =>
      this.onPointerDown(p)
    );
    this.input.on("pointerup", (p: Phaser.Input.Pointer) =>
      this.onPointerUp(p)
    );

    // iOS WebView: música solo tras unlock. Si el contexto ya está libre
    // (p. ej. tras scene.restart), arrancar sin esperar otro toque.
    if (this.sound.locked === false) {
      this.audio.onUnlocked();
    } else {
      this.input.once("pointerdown", this.unlockAudio, this);
    }
    this.installDebugApi();
    this.matter.world.on("beforeupdate", this.onBeforePhysics, this);
    this.matter.world.on("afterupdate", this.syncPieceVisuals, this);
    this.matter.world.on("collisionstart", this.handleCollisionStart, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    sendToShell({ type: "game_start" });
    if (DEBUG_SHOW_CONTINUE) this.previewContinueLayout();
    else if (DEBUG_SHOW_GAME_OVER) this.previewGameOverLayout();
  }

  // ---------- Setup visual ----------

  /** Escala para que el diámetro visual sea radius*2 respecto al PNG fuente. */
  private animalScale(level: number, radius = getAnimal(level).radius): number {
    const src = this.textures.get(`animal-${level}`).getSourceImage() as {
      width: number;
    };
    return (radius * 2) / src.width;
  }

  private drawDangerLine(): void {
    this.dangerLine = this.add.container(0, 0).setDepth(2);
    const g = this.add.graphics();
    g.lineStyle(2, 0xe86a5e, 0.72);
    for (let x = WALL + 4; x < W - WALL; x += 16) {
      g.lineBetween(x, DANGER_Y, x + 8, DANGER_Y);
    }
    this.dangerLine.add(g);
  }

  /**
   * Aviso corto cuando el montón asentado se acerca a perder.
   * Ignora caídas / preview. No vibra en bucle: un burst al entrar
   * y otro si cruzan la línea; se rearma al alejarse.
   */
  private pulseDangerLine(proximity: number, overLine: boolean, delta: number): void {
    if (!this.dangerLine) return;

    const inZone = proximity >= 0.2;
    if (!inZone) {
      this.dangerWarnLatched = false;
      this.dangerCrossLatched = false;
    } else if (!this.dangerWarnLatched) {
      this.dangerWarnLatched = true;
      this.dangerBurstUntil = this.time.now + DANGER_WARN_BURST_MS;
    }

    if (overLine && !this.dangerCrossLatched) {
      this.dangerCrossLatched = true;
      this.dangerBurstUntil = this.time.now + DANGER_WARN_BURST_MS;
    }

    const remaining = this.dangerBurstUntil - this.time.now;
    if (remaining <= 0) {
      this.dangerLine.x = 0;
      this.dangerLine.setAlpha(1);
      return;
    }

    const envelope = remaining / DANGER_WARN_BURST_MS;
    const amp = (2.2 + proximity * 3.2) * envelope * envelope;
    this.dangerShakePhase += delta * 0.042;
    this.dangerLine.x = Math.sin(this.dangerShakePhase) * amp;
    this.dangerLine.setAlpha(0.82 + 0.18 * envelope);
  }

  private buildHud(): void {
    this.topHud = new TopHud(
      this,
      this.renderScale,
      (tier) => this.animalScale(tier),
      this.nextLevel,
      this.best,
      this.score,
      () => this.powers.openShop(),
      hasAdsRemoved(),
      () => this.powers.openSettings()
    );
    this.chainBar = new ChainBar(
      this,
      this.renderScale,
      (tier) => this.animalScale(tier)
    );
    this.gameOverModal = new GameOverModal(this, this.renderScale);
    this.gameOverModal.setHandlers({
      onPlayAgain: () => this.leaveGameOver("restart"),
      onShop: () => this.powers.openShop(),
      onHome: () => this.leaveGameOver("home")
    });
    this.continueModal = new ContinueModal(this, this.renderScale);
    this.continueModal.setHandlers({
      onContinue: () => this.applyContinue(),
      // Ya rechazó el rewarded de continue: no meter intersticial al terminar.
      onEndRun: () => this.finalizeGameOver({ showInterstitial: false })
    });
    this.shareRewardModal = new ShareRewardModal(this, this.renderScale);
    this.reviewPromptModal = new ReviewPromptModal(this, this.renderScale);
  }

  /** Fuera del pointerup del botón: si restart() corre en el mismo tap, Phaser se queda colgado. */
  private leaveGameOver(next: "restart" | "home"): void {
    void this.leaveGameOverAsync(next);
  }

  private async leaveGameOverAsync(next: "restart" | "home"): Promise<void> {
    // Reseña DESPUÉS de cerrar el modal GO (pre-prompt → nativo Play/App Store).
    if (this.pendingReviewAfterGo) {
      this.pendingReviewAfterGo = false;
      if (canShowReviewPrompt()) {
        markReviewPromptShown();
        const liked = await this.reviewPromptModal.showAndWait();
        if (liked === "yes") requestNativeStoreReview("new_best");
      }
    }
    if (!this.sys.isActive()) return;
    if (next === "restart") this.restartRun();
    else this.goHome();
  }

  private restartRun(): void {
    this.matter.world.resume();
    this.continueModal?.close();
    this.time.delayedCall(0, () => this.scene.restart());
  }

  private goHome(): void {
    this.matter.world.resume();
    this.continueModal?.close();
    this.time.delayedCall(0, () => this.scene.start("home"));
  }

  // ---------- Loop de juego ----------

  private pointerWorldX(pointer: Phaser.Input.Pointer): number {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y, this.worldPoint)
      .x;
  }

  private pointerWorldY(pointer: Phaser.Input.Pointer): number {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y, this.worldPoint)
      .y;
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.powers.handlePointerDown();
    const wx = this.pointerWorldX(p);
    const wy = this.pointerWorldY(p);

    // Modal / UI cerró en este mismo gesto: no tratar el down como jugada.
    if (this.powers.isSuppressingPointerUp()) {
      this.gestureConsumed = true;
      return;
    }

    // Red de seguridad: si el down cae sobre un botón de poder / top HUD, consumir.
    if (this.powers.hitTestHud(wx, wy) || this.topHud.hitTest(wx, wy)) {
      this.gestureConsumed = true;
      return;
    }

    if (this.powers.blocksAllPlayInput() || this.isOver) {
      this.gestureConsumed = true;
      return;
    }

    if (this.powers.blocksDrop()) {
      // SELECTING / modal: no mover preview; el move solo actualiza highlight.
      // Sin ripples: competiría con el resaltado de selección.
      this.gestureConsumed = true;
      this.powers.handlePointerMove(wx, wy);
      return;
    }

    this.gestureConsumed = false;
    if (this.isPlayableBoardTap(wx, wy)) {
      // Ripple visual siempre; el SFX de tap solo al soltar (drop real).
      this.juice.onTap(wx, wy);
    }
    this.movePreview(wx);
  }

  /** Área jugable (casco interior), no HUD. */
  private isPlayableBoardTap(wx: number, wy: number): boolean {
    return (
      wx >= PLAYABLE_INSET &&
      wx <= W - PLAYABLE_INSET &&
      wy >= DROP_Y - 30 &&
      wy <= FLOOR_Y
    );
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.isOver) return;
    if (this.gestureConsumed || this.powers.isSuppressingPointerUp()) return;
    const wx = this.pointerWorldX(p);
    const wy = this.pointerWorldY(p);

    if (this.powers.handlePointerMove(wx, wy)) return;
    if (this.powers.blocksDrop()) return;

    this.movePreview(wx);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const wx = this.pointerWorldX(p);
    const wy = this.pointerWorldY(p);
    const consumed = this.gestureConsumed;
    this.gestureConsumed = false;

    // SELECTING / cierre de modal: nunca drop.
    if (this.powers.handlePointerUp(wx, wy)) {
      this.syncDropGuideVisibility();
      return;
    }

    if (
      consumed ||
      this.powers.blocksDrop() ||
      this.powers.blocksAllPlayInput() ||
      this.powers.isSuppressingPointerUp()
    ) {
      return;
    }

    this.drop(wx);
  }

  private movePreview(x: number): void {
    if (this.isOver || this.powers.blocksDrop()) return;
    const r = getAnimal(this.currentLevel).radius;
    const clamped = Phaser.Math.Clamp(
      x,
      PLAYABLE_INSET + r,
      W - PLAYABLE_INSET - r
    );
    this.preview.setX(clamped);
    this.juice.followPreview();
    this.redrawDropGuide(clamped, r);
  }

  private syncDropGuideVisibility(): void {
    if (this.powers.blocksDrop() || !this.canDrop || this.isOver) {
      this.dropGuide.clear().setVisible(false);
      return;
    }
    this.drawDropGuide();
  }

  private redrawDropGuide(x: number, radius: number): void {
    this.dropGuideX = x;
    this.dropGuideRadius = radius;
    this.drawDropGuide();
  }

  /**
   * Un solo Graphics reutilizado. clear()+stroke es inevitable para animar el
   * offset del patrón (Graphics no tiene UV scroll); no se crea ni destruye.
   *
   * El final de la línea es la superficie de impacto (pieza debajo o piso),
   * no siempre FLOOR_Y. Coste: O(n) piezas, ~40 checks/frame → irrelevante.
   */
  private drawDropGuide(): void {
    const g = this.dropGuide;
    g.clear();
    if (!this.canDrop || this.isOver || this.powers.blocksDrop()) {
      g.setVisible(false);
      return;
    }

    const cfg = juiceConfig.dropGuide;
    const pitch = cfg.dashPx + cfg.gapPx;
    const offset = this.juice.motionEnabled
      ? ((this.time.now / 1000) * cfg.scrollPxPerSec) % pitch
      : 0;
    const top = DROP_Y + this.dropGuideRadius;
    const endY = this.dropImpactY(this.dropGuideX, this.dropGuideRadius);
    if (endY <= top) {
      g.setVisible(false);
      return;
    }

    g.setVisible(true);
    g.lineStyle(cfg.widthPx, cfg.color, cfg.alpha);
    for (let y = top + offset - pitch; y < endY; y += pitch) {
      const from = Math.max(top, y);
      const to = Math.min(y + cfg.dashPx, endY);
      if (to > from) g.lineBetween(this.dropGuideX, from, this.dropGuideX, to);
    }
  }

  /**
   * Y de la superficie donde aterrizaría un círculo de `radius` cayendo en `x`.
   * Sweep geométrico contra cada pieza (sin Matter raycast): si |dx| < R+r,
   * el centro toca en py - sqrt((R+r)² - dx²) y la superficie es centro + R.
   */
  private dropImpactY(x: number, radius: number): number {
    // Piso vacío: el borde inferior de la pieza queda en FLOOR_Y.
    let surfaceY = FLOOR_Y;

    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      const level = piece.body.getData("level") as number;
      const otherR = getAnimal(level).radius;
      const dx = Math.abs(x - piece.body.x);
      const sumR = radius + otherR;
      if (dx >= sumR) continue;

      const touchCenterY =
        piece.body.y - Math.sqrt(sumR * sumR - dx * dx);
      const contactY = touchCenterY + radius;
      if (contactY < surfaceY && contactY > DROP_Y) surfaceY = contactY;
    }

    return surfaceY;
  }

  private drop(x: number): void {
    if (
      this.isOver ||
      !this.canDrop ||
      this.midRunAdBusy ||
      this.powers.blocksDrop()
    ) {
      return;
    }
    this.canDrop = false;

    const level = this.currentLevel;
    const r = getAnimal(level).radius;
    const clamped = Phaser.Math.Clamp(
      x,
      PLAYABLE_INSET + r,
      W - PLAYABLE_INSET - r
    );
    const armed = this.powers.consumeArmedDrop();

    if (armed === "two-by-two") {
      const gap = twoByTwoStackGap(r);
      const y2 = DROP_Y + gap;
      this.spawnAnimal(clamped, DROP_Y, level);
      this.spawnAnimal(clamped, y2, level);
      this.juice.onDrop(clamped, DROP_Y, level);
      this.audio.onTap();
    } else {
      this.spawnAnimal(clamped, DROP_Y, level);
      this.juice.onDrop(clamped, DROP_Y, level);
      this.audio.onTap();
    }

    // Rotar preview al siguiente
    this.currentLevel = this.nextLevel;
    this.nextLevel = pickDropLevel();
    this.preview.setVisible(false);
    this.juice.setPreviewActive(false);
    this.dropGuide.clear().setVisible(false);

    this.time.delayedCall(DROP_COOLDOWN_MS, () => {
      if (this.isOver) return;
      this.canDrop = true;
      this.refreshPreview();
    });
  }

  private refreshPreview(): void {
    const scale = this.animalScale(this.currentLevel);
    this.preview
      .setTexture(`animal-${this.currentLevel}`)
      .setVisible(true);
    this.juice.refreshPreviewVisual(scale);
    this.juice.setPreviewActive(true);
    this.movePreview(this.preview.x);

    this.topHud.setNextLevel(this.nextLevel, (t) => this.animalScale(t));
  }

  /**
   * Primera creación Matter+textura animal es cara en Canvas.
   * Calentamos offscreen 1 nivel por frame (1–5 = drops; luego 6–10).
   */
  private warmMatterAnimalBodies(): void {
    let level = 1;
    const step = (): void => {
      if (!this.sys?.isActive() || level > 10) return;
      const key = `animal-${level}`;
      const r = getAnimal(level).radius;
      if (this.textures.exists(key)) {
        const body = this.matter.add.image(-5000, -5000, key, undefined, {
          shape: { type: "circle", radius: r },
          isStatic: true
        });
        body.setVisible(false);
        this.time.delayedCall(0, () => {
          if (body.active) body.destroy();
        });
      }
      level += 1;
      this.time.delayedCall(0, step);
    };
    this.time.delayedCall(0, step);
  }

  private spawnAnimal(x: number, y: number, level: number): AnimalPiece {
    const def = getAnimal(level);
    const texW = (
      this.textures.get(`animal-${level}`).getSourceImage() as { width: number }
    ).width;
    const baseScale = (def.radius * 2) / texW;

    // El cuerpo nunca se escala después de crearse. Todo squash/breathing vive
    // exclusivamente en el Image visual desacoplado.
    const body = this.matter.add.image(x, y, `animal-${level}`, undefined, {
      shape: { type: "circle", radius: def.radius },
      restitution: RESTITUTION,
      friction: FRICTION,
      frictionStatic: 0.5,
      density: 0.001
    });
    body.setVisible(false);

    const visual = this.add
      .image(x, y, `animal-${level}`)
      .setScale(baseScale)
      .setDepth(10);
    const visualState: JuicePieceVisual = {
      visual,
      tier: level,
      baseScale,
      squashX: 1,
      squashY: 1,
      // Fase aleatoria: sin esto el tablero late al unísono.
      breathPhase: Math.random() * Math.PI * 2,
      breath: 1,
      blinkY: 1,
      selectHighlight: 1,
      nextBlinkAt: 0,
      blinkStartAt: 0,
      blinkActive: false,
      mergeSquashActive: false,
      landSquashActive: false,
      alive: true
    };
    const piece: AnimalPiece = {
      id: this.nextPieceId++,
      body,
      visual,
      visualState,
      preImpactSpeed: 0,
      lastLandFrame: -1
    };

    body.setData("piece", piece);
    body.setData("level", level);
    body.setData("spawnAt", this.time.now);
    body.setData("merging", false);
    body.setData("dangerMs", 0);

    this.animals.push(piece);
    this.juice.registerPiece(visualState);
    this.onTierAppeared(level, x, y);
    this.powers.notifyBoardChanged();
    return piece;
  }

  /**
   * Hojas al HUD: el saldo real ya está otorgado; el número arranca en
   * `total - amount` y crece cuando cada hoja llega al contador.
   */
  private feedOlivesHud(
    fromX: number,
    fromY: number,
    amount: number,
    overlay = false
  ): void {
    const total = this.powers.debugSnapshot().olives;
    const from = Math.max(0, total - amount);
    this.topHud.setOlives(from);
    const to = this.topHud.olivesAnchor();
    const timing = this.juice.playOliveReward(
      fromX,
      fromY,
      to.x,
      to.y,
      amount,
      overlay,
      () => this.topHud.punchOlives()
    );
    if (timing) {
      this.topHud.tweenOlives(from, total, timing.arriveDelayMs, timing.spanMs);
    }
  }

  /** Cadena: otorga 2/3/5 hojas al alcanzar vaca/león/elefante (1× por partida). */
  private onTierAppeared(tier: number, x: number, y: number): void {
    const granted = this.chainBar.notifyTierReached(tier);
    if (granted <= 0) return;
    this.olivesThisRun += granted;
    this.powers.grantOlives(granted);
    this.feedOlivesHud(x, y, granted);
    this.audio.onReward();
  }

  private tryMerge(a: AnimalPiece, b: AnimalPiece): void {
    if (this.isOver || this.suppressNaturalMerges) return;
    const la = a.body.getData("level") as number | undefined;
    const lb = b.body.getData("level") as number | undefined;
    if (la === undefined || la !== lb) return;
    if (a.body.getData("merging") || b.body.getData("merging")) return;

    this.commitMerge(a, b, la);
  }

  /**
   * Ruta única de fusión (física y Rayo). Marca merging, destruye ambos,
   * spawnea el siguiente nivel (o ark_complete) y aplica score + juice.
   */
  private commitMerge(
    a: AnimalPiece,
    b: AnimalPiece,
    level: number,
    at?: { x: number; y: number }
  ): void {
    a.body.setData("merging", true);
    b.body.setData("merging", true);

    // Natural: punto medio. Rayo: la pieza más baja, para que el resultado
    // no nazca entre dos ovejas lejanas (sale del casco y “desaparece”).
    const mx = at?.x ?? (a.body.x + b.body.x) / 2;
    const my = at?.y ?? (a.body.y + b.body.y) / 2;

    this.destroyAnimal(a);
    this.destroyAnimal(b);

    if (level >= 10) {
      this.beginArkComplete(mx, my);
      return;
    }

    const newLevel = level + 1;
    this.spawnAnimal(mx, my, newLevel);
    this.addScore(newLevel * MERGE_SCORE_MULT);
    this.juice.onMerge(newLevel, mx, my);
    this.audio.onMerge(newLevel);
  }

  /**
   * Fusión por ids con revalidación (Rayo). false si alguna pieza ya no vale.
   */
  private mergePairByIds(
    idA: number,
    idB: number,
    at?: { x: number; y: number }
  ): boolean {
    if (this.isOver) return false;
    const a = this.findPieceById(idA);
    const b = this.findPieceById(idB);
    if (!a || !b) return false;
    if (!a.visualState.alive || !b.visualState.alive) return false;
    if (a.body.getData("merging") || b.body.getData("merging")) return false;

    const la = a.body.getData("level") as number | undefined;
    const lb = b.body.getData("level") as number | undefined;
    if (la === undefined || la !== lb) return false;

    this.commitMerge(a, b, la, at);
    return true;
  }

  private destroyAnimal(piece: AnimalPiece): void {
    piece.visualState.alive = false;
    this.juice.unregisterPiece(piece.visualState);
    this.tweens.killTweensOf(piece.visualState);
    piece.body.setData("piece", null);
    piece.body.destroy();
    piece.visual.destroy();

    for (let i = 0; i < this.animals.length; i++) {
      if (this.animals[i] === piece) {
        this.animals.splice(i, 1);
        break;
      }
    }
    this.powers.notifyBoardChanged();
  }

  private addScore(points: number): void {
    this.score += points;
    this.topHud.setScore(this.score);
  }

  /**
   * Clímax al fusionar dos Elefantes: bonus, hojas, freeze, arcoíris, banner.
   * firstTime = vida del jugador.
   */
  private beginArkComplete(x: number, y: number, grantRewards = true): void {
    const firstTime = !hasSeenArkComplete();

    if (grantRewards) {
      if (firstTime) markArkCompleteSeen();
      this.arksThisRun += 1;
      this.chainBar.setArkCompletes(this.arksThisRun);
      this.addScore(ARK_BONUS);
      this.olivesThisRun += ARK_OLIVE_REWARD;
      this.powers.grantOlives(ARK_OLIVE_REWARD);
      this.feedOlivesHud(x, y, ARK_OLIVE_REWARD);
      sendToShell({ type: "ark_complete" });
      this.audio.onArkComplete();
    }

    this.arkCompleteAnimating = true;
    this.powers.setGameDisabled(true);
    this.matter.world.pause();

    this.juice.onArkComplete({
      x,
      y,
      firstTime,
      scoreBonus: ARK_BONUS,
      oliveReward: ARK_OLIVE_REWARD,
      onFreezeEnd: () => {
        this.matter.world.resume();
        this.arkCompleteAnimating = false;
        if (!this.isOver) this.powers.setGameDisabled(false);
      },
      onComplete: () => {
        this.matter.world.resume();
        this.arkCompleteAnimating = false;
        if (!this.isOver) this.powers.setGameDisabled(false);
      }
    });
  }

  private unlockAudio(): void {
    // WebAudio/HTML5 Audio puede iniciar bloqueado dentro del WebView de iOS.
    this.sound.unlock();
    this.audio.onUnlocked();
  }

  private onBeforePhysics(): void {
    this.cachePreImpactSpeeds();
    this.applyWatersBuoyancy();
  }

  private cachePreImpactSpeeds(): void {
    for (let i = 0; i < this.animals.length; i++) {
      const matterBody = this.animals[i].body.body as { speed: number };
      this.animals[i].preImpactSpeed = matterBody.speed;
    }
  }

  /**
   * Empuje + drag Y en el centro del body (sin torque).
   * No muta density ni frictionAir. enableSleeping está off en este proyecto.
   *
   * lift = mass × |g×scale| × buoyancyStrength × tier × submerged.
   * Matter integra force/mass × Δt² (~278 a 60Hz): strength~4 da flotación
   * visible; strength~1 es casi neutro; 0.042 era erupción.
   */
  private applyWatersBuoyancy(): void {
    if (!this.watersActive || this.isOver) return;

    const cfg = juiceConfig.waters;
    const surfaceY = this.waterSurfaceY;
    const dampZone = Math.max(1, cfg.ceilingDampPx);
    const grav = this.matter.world.localWorld.gravity as {
      y: number;
      scale: number;
    };
    const gMag = Math.abs(grav.y) * (grav.scale ?? 0.001);

    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      if (!piece.visualState.alive || piece.body.getData("merging")) continue;

      const tier = piece.visualState.tier;
      const r = getAnimal(tier).radius;
      const y = piece.body.y;
      const bottom = y + r;
      const top = y - r;

      // Y crece hacia abajo: agua es y > surfaceY.
      let submerged = 0;
      if (top >= surfaceY) submerged = 1;
      else if (bottom > surfaceY) {
        submerged = Phaser.Math.Clamp((bottom - surfaceY) / (2 * r), 0, 1);
      }
      if (submerged <= 0) continue;

      const matterBody = piece.body.body as {
        mass: number;
        velocity: { y: number };
      };
      const tierFactor = cfg.buoyancyByTier[tier] ?? 1;
      let lift =
        matterBody.mass *
        gMag *
        cfg.buoyancyStrength *
        tierFactor *
        submerged;

      // Red de seguridad: cerca de DANGER_Y el agua deja de empujar hacia arriba.
      // No clava posiciones — colisiones desde abajo siguen pudiendo subir la pieza.
      if (lift > 0) {
        const t = Phaser.Math.Clamp((top - DANGER_Y) / dampZone, 0, 1);
        // smoothstep 0 en la línea / por encima, 1 lejos (más abajo).
        const ceilingMul = t * t * (3 - 2 * t);
        lift *= ceilingMul;
      }

      const drag =
        cfg.dragY * matterBody.mass * matterBody.velocity.y * submerged;

      // applyForce de Phaser copia body.position al vector de aplicación → centro.
      this.buoyancyForce.set(0, -lift - drag);
      piece.body.applyForce(this.buoyancyForce);
    }
  }

  /**
   * Solo si un body ya tuneló el casco (fuera de cámara). No corre cada
   * frame: pelear con la pared/piso mete torque y los animales no dejan de girar.
   */
  private containEscapedPieces(): void {
    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      if (!piece.visualState.alive) continue;
      if (piece.body.getData("merging")) continue;

      const r = getAnimal(piece.visualState.tier).radius;
      const body = piece.body;
      const x = body.x;
      const y = body.y;
      // Margen holgado: el reposo contra la pared es x ≈ WALL+r, no hay que tocarlo.
      const tunneled =
        x < WALL - 8 ||
        x > W - WALL + 8 ||
        y < -r ||
        y > FLOOR_Y + r + 16;
      if (!tunneled) continue;

      body.setPosition(
        Phaser.Math.Clamp(x, WALL + r + 2, W - WALL - r - 2),
        Phaser.Math.Clamp(y, r + 24, FLOOR_Y - r - 1)
      );
      body.setVelocity(0, 4);
      body.setAngularVelocity(0);
    }
  }

  private syncPieceVisuals(): void {
    // Breathing/blink primero para que la composición use valores del frame actual.
    this.juice.afterUpdate(this.time.now, this.game.loop.delta);
    this.powers.tick(this.game.loop.delta);

    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      const state = piece.visualState;
      const bob = this.juice.watersVisualBob(
        piece.body.y,
        getAnimal(state.tier).radius,
        this.waterSurfaceY,
        this.time.now,
        piece.id
      );
      piece.visual.setPosition(piece.body.x, piece.body.y + bob);
      piece.visual.setRotation(piece.body.rotation);
      this.juice.syncWatersTint(
        piece.visual,
        piece.body.y,
        getAnimal(state.tier).radius,
        this.waterSurfaceY
      );

      // Punto único de composición. selectHighlight lo escribe PowerManager;
      // nunca scaleX/Y directo desde poderes.
      piece.visual.scaleX =
        state.baseScale * state.squashX * state.breath * state.selectHighlight;
      piece.visual.scaleY =
        state.baseScale *
        state.squashY *
        state.breath *
        state.blinkY *
        state.selectHighlight;
    }
  }

  private handleCollisionStart(
    event: Phaser.Physics.Matter.Events.CollisionStartEvent
  ): void {
    for (let i = 0; i < event.pairs.length; i++) {
      const pair = event.pairs[i];
      const a = this.pieceFromGameObject(pair.bodyA.gameObject);
      const b = this.pieceFromGameObject(pair.bodyB.gameObject);

      if (a) this.emitLandOncePerFrame(a);
      if (b) this.emitLandOncePerFrame(b);
      if (a && b) this.tryMerge(a, b);
    }
  }

  private pieceFromGameObject(gameObject: unknown): AnimalPiece | null {
    if (!gameObject) return null;
    const body = gameObject as Phaser.Physics.Matter.Image;
    return (body.getData("piece") as AnimalPiece | null) ?? null;
  }

  private emitLandOncePerFrame(piece: AnimalPiece): void {
    const frame = this.game.loop.frame;
    if (
      piece.lastLandFrame === frame ||
      piece.preImpactSpeed < this.juice.landImpactThreshold
    ) {
      return;
    }
    piece.lastLandFrame = frame;
    this.juice.onLand(
      piece.visualState.tier,
      piece.body.x,
      piece.body.y,
      piece.preImpactSpeed
    );
    this.audio.onLand();
  }

  private shutdown(): void {
    // MatterPhysics registra su SHUTDOWN en el START de la escena, antes que el
    // nuestro, y deja this.matter.world en null. Sin esta guarda el restart
    // lanzaba un TypeError aquí y la escena nunca volvía a arrancar.
    const world = this.matter.world;
    if (world) {
      world.off("beforeupdate", this.onBeforePhysics, this);
      world.off("afterupdate", this.syncPieceVisuals, this);
      world.off("collisionstart", this.handleCollisionStart, this);
    }

    for (let i = 0; i < this.animals.length; i++) {
      this.animals[i].visualState.alive = false;
    }
    this.animals.length = 0;
    this.watersActive = false;
    this.suppressNaturalMerges = false;
    this.topHud?.destroy();
    this.chainBar?.destroy();
    this.continueModal?.destroy();
    this.gameOverModal?.destroy();
    this.shareRewardModal?.destroy();
    this.reviewPromptModal?.destroy();
    this.powers.destroy();
    this.juice.destroy();
    this.loader?.destroy();
    this.audio?.destroy();
    this.unsubLifecycle?.();
    this.unsubLifecycle = null;
    this.clearMidRunSafetyTimer();
    this.game.events.off(
      Phaser.Core.Events.VISIBLE,
      this.onMidRunForeground,
      this
    );
    this.scale.off("resize", this.layoutView, this);
    window.arcaDebug = undefined;
  }

  /**
   * Cámara contain de 390×844. Solo el cielo (bg) hace cover del overscan.
   * El casco mantiene la altura lógica; el ancho se estira un poco (ARK_WIDTH_SCALE).
   */
  private layoutView(): void {
    this.renderScale = getRenderScale();
    const zoom = getContainZoom(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(W / 2, H / 2);

    const viewW = this.scale.width / zoom;
    const viewH = this.scale.height / zoom;
    const cover = Math.max(viewW / W, viewH / H);
    this.sceneBg?.setDisplaySize(W * cover, H * cover).setPosition(W / 2, H / 2);
    // Más ancho que el canvas lógico: aprovecha márgenes del PNG y el
    // overscan lateral. La altura sigue en H para no desfasar FLOOR_Y.
    this.sceneArk?.setDisplaySize(W * ARK_WIDTH_SCALE, H).setPosition(W / 2, H / 2);
  }

  /** Consola: arcaDebug() para el snapshot, arcaDebug.physics(true) y demás. */
  private installDebugApi(): void {
    if (!ENABLE_GAME_DEBUG) {
      window.arcaDebug = undefined;
      return;
    }
    const api = ((): ArcaDebugSnapshot => this.debugCounts()) as ArcaDebug;
    api.physics = (enabled: boolean) => this.setPhysicsDebug(enabled);
    api.forceCombo = (count, x, y) => this.juice.forceCombo(count, x, y);
    api.forceArkComplete = (x, y) => this.forceArkComplete(x, y);
    api.mergeGaps = () => this.juice.mergeGapReport();
    api.comboTextures = () => this.juice.comboTextureReport();
    api.logMerges = (enabled: boolean) => this.juice.setLogMerges(enabled);
    api.grantOlives = (n) => this.powers.grantOlives(n);
    api.grantPowerUse = (id, n = 1) => this.powers.grantPowerUse(id, n);
    api.resetEconomy = () => this.powers.resetEconomy();
    api.setPowerState = (id, state) => this.powers.setPowerState(id, state);
    api.clearPowerDebugStates = () => this.powers.clearPowerDebugStates();
    api.clearPowerSeenFlags = () => clearPowerSeenFlags();
    api.clearArkCompleteSeen = () => clearArkCompleteSeen();
    api.clearAdsRemoved = () => {
      clearAdsRemoved();
      this.topHud.setAdsRemoved(false);
    };
    api.bannerReservePx = BANNER_RESERVE_PX;
    api.showGameOver = () => this.previewGameOverLayout();
    api.showContinue = () => this.previewContinueLayout();
    window.arcaDebug = api;
  }

  /** Modal de Game Over con datos de muestra, sin puntuar ni avisar al shell. */
  private previewGameOverLayout(): void {
    this.isOver = true;
    this.canDrop = false;
    this.powers.setGameDisabled(true);
    this.continueModal?.close();
    this.gameOverModal.show({
      score: 8420,
      best: 15360,
      isNewBest: true,
      arkCompletes: 3,
      olivesEarned: 30
    });
  }

  /** Modal de continue, sin puntuar ni avisar al shell. */
  private previewContinueLayout(): void {
    this.isOver = true;
    this.canDrop = false;
    this.awaitingContinue = true;
    this.powers.setGameDisabled(true);
    this.matter.world.pause();
    this.continueModal.show({
      adsRemoved: hasAdsRemoved(),
      rewardedAvailable: true,
      freeze: true
    });
  }

  /**
   * Solo el efecto visual/háptico del clímax. No suma ARK_BONUS, hojas ni manda
   * ark_complete al shell, para no ensuciar partidas de prueba.
   */
  private forceArkComplete(
    x = W / 2,
    y = H / 2
  ): { x: number; y: number } {
    this.beginArkComplete(x, y, false);
    return { x, y };
  }

  private createPowerHost(): PowerHost {
    const isSelectable = (piece: AnimalPiece): boolean =>
      piece.visualState.alive && !piece.body.getData("merging");

    const toRef = (piece: AnimalPiece): PowerPieceRef => ({
      id: piece.id,
      x: piece.body.x,
      y: piece.body.y,
      tier: piece.visualState.tier,
      selectHighlight: piece.visualState.selectHighlight,
      flash: () => this.flashPieceById(piece.id)
    });

    return {
      isGameOver: () => this.isOver,
      isArkCompleteAnimating: () => this.arkCompleteAnimating,
      listPieces: () =>
        this.animals.filter(isSelectable).map(toRef),
      hasSelectablePieces: () => this.animals.some(isSelectable),
      findPieceAt: (worldX, worldY) => {
        let best: AnimalPiece | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.animals.length; i++) {
          const piece = this.animals[i];
          if (!isSelectable(piece)) continue;
          const r = getAnimal(piece.visualState.tier).radius;
          const dx = piece.body.x - worldX;
          const dy = piece.body.y - worldY;
          const d = dx * dx + dy * dy;
          if (d <= r * r && d < bestDist) {
            best = piece;
            bestDist = d;
          }
        }
        return best ? toRef(best) : null;
      },
      isPieceSelectable: (pieceId) => {
        const piece = this.findPieceById(pieceId);
        return !!piece && isSelectable(piece);
      },
      claimPieceForRemoval: (pieceId) => {
        const piece = this.findPieceById(pieceId);
        if (!piece || !isSelectable(piece)) return null;

        // Snapshot ANTES de destroyAnimal (destruye body + visual).
        const snapshot = {
          id: piece.id,
          x: piece.body.x,
          y: piece.body.y,
          tier: piece.visualState.tier,
          textureKey: piece.visual.texture.key,
          scaleX: piece.visual.scaleX,
          scaleY: piece.visual.scaleY,
          rotation: piece.visual.rotation
        };

        // Marca merging para que un tryMerge concurrente no la toque.
        piece.body.setData("merging", true);
        this.destroyAnimal(piece);
        return snapshot;
      },
      playRavenCapture: (snapshot) => this.juice.onRavenCapture(snapshot),
      listTierSlots: () => this.listTierSlots(),
      hasMergeableTiers: () =>
        this.listTierSlots().some((s) => s.selectable),
      isTierSelectable: (tier) => {
        const slot = this.listTierSlots().find((s) => s.tier === tier);
        return !!slot?.selectable;
      },
      playLightning: (tier) => this.playLightning(tier),
      playWaters: () => this.playWaters(),
      isInDangerZone: () => this.isInDangerZone(),
      isWatersActive: () => this.watersActive,
      flashPiece: (pieceId) => this.flashPieceById(pieceId),
      setPieceHighlight: (pieceId, highlight) => {
        const piece = this.findPieceById(pieceId);
        if (piece) piece.visualState.selectHighlight = highlight;
      },
      clearPieceHighlights: () => {
        for (let i = 0; i < this.animals.length; i++) {
          this.animals[i].visualState.selectHighlight = 1;
        }
        this.juice.clearPickReticles();
      },
      setPickReticles: (targets, hoveredId) => {
        this.juice.setPickReticles(targets, hoveredId);
      },
      clearPickReticles: () => {
        this.juice.clearPickReticles();
      },
      setDropArmed: (powerId) => {
        if (powerId === "two-by-two") {
          const r = getAnimal(this.currentLevel).radius;
          this.juice.setArmedDoublePreview(twoByTwoStackGap(r));
        } else {
          this.juice.setArmedDoublePreview(0);
        }
      },
      pausePhysics: () => {
        this.matter.world.pause();
      },
      resumePhysics: () => {
        this.matter.world.resume();
        this.containEscapedPieces();
      },
      playOliveFly: (fromX, fromY, amount) => {
        this.feedOlivesHud(fromX, fromY, amount, true);
      }
    };
  }

  private listTierSlots(): TierSlotInfo[] {
    const counts = new Map<number, number>();
    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      if (!piece.visualState.alive || piece.body.getData("merging")) continue;
      const tier = piece.visualState.tier;
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }

    return CHAIN.map((def) => {
      const count = counts.get(def.level) ?? 0;
      return {
        tier: def.level,
        count,
        // Elefante (10) nunca seleccionable: ark_complete se gana jugando.
        selectable: def.level < 10 && count >= 2
      };
    });
  }

  /**
   * Cascada del Rayo: empareja piezas del tier, salta el bolt y fusiona
   * con stagger. Usa commitMerge vía mergePairByIds.
   */
  private async playLightning(tier: number): Promise<void> {
    const candidates = this.animals
      .filter(
        (p) =>
          p.visualState.alive &&
          !p.body.getData("merging") &&
          p.visualState.tier === tier
      )
      .sort((a, b) => {
        const dx = a.body.x - b.body.x;
        if (Math.abs(dx) > 0.5) return dx;
        return a.body.y - b.body.y;
      });

    const pairs: { idA: number; idB: number }[] = [];
    for (let i = 0; i + 1 < candidates.length; i += 2) {
      pairs.push({ idA: candidates[i].id, idB: candidates[i + 1].id });
    }
    if (pairs.length === 0) return;

    const staggerMs = juiceConfig.lightning.staggerMs;
    this.juice.beginLightning(pairs.length);
    // No pausar Matter: pause→resume con el merge spawn encima del montón
    // resuelve solapes en un frame y expulsa animales por el techo.
    this.suppressNaturalMerges = true;

    let prevX = candidates[0].body.x;
    let prevY = candidates[0].body.y;

    try {
      for (let i = 0; i < pairs.length; i++) {
        if (this.isOver || this.arkCompleteAnimating) break;

        const { idA, idB } = pairs[i];
        const a = this.findPieceById(idA);
        const b = this.findPieceById(idB);

        if (
          !a ||
          !b ||
          !a.visualState.alive ||
          !b.visualState.alive ||
          a.body.getData("merging") ||
          b.body.getData("merging")
        ) {
          continue;
        }

        const ax = a.body.x;
        const ay = a.body.y;
        const bx = b.body.x;
        const by = b.body.y;

        await this.juice.lightningHop(prevX, prevY, ax, ay, bx, by);

        if (this.isOver || this.arkCompleteAnimating) break;

        // El bolt aterriza en B; si A está más abajo, nacemos ahí (más en el montón).
        const at = ay >= by ? { x: ax, y: ay } : { x: bx, y: by };
        const ok = this.mergePairByIds(idA, idB, at);
        if (ok) {
          this.juice.onLightningStrike(i, pairs.length);
        }

        prevX = (ax + bx) / 2;
        prevY = (ay + by) / 2;

        if (i < pairs.length - 1) {
          await this.delayMs(staggerMs);
        }
      }
    } finally {
      this.juice.endLightning();
      this.suppressNaturalMerges = false;
      this.containEscapedPieces();
    }
  }

  /**
   * Las Aguas: sube → hold → drena. releaseInputOnDrain puede resolver el
   * promise al iniciar el drenaje; la física sigue hasta surfaceY = FLOOR_Y.
   */
  private async playWaters(): Promise<void> {
    if (this.watersActive || this.isOver) return;

    const cfg = juiceConfig.waters;
    const targetSurface = this.computeWaterTargetSurfaceY();

    this.watersActive = true;
    this.waterSurfaceY = FLOOR_Y;
    this.waterLevelProxy.y = FLOOR_Y;
    this.juice.beginWaters();
    this.powers.notifyBoardChanged();
    GameAudio.current?.onPower("waters");

    await this.tweenWaterSurface(targetSurface, cfg.riseMs, "Sine.easeOut");

    if (this.isOver || !this.watersActive) {
      this.endWatersImmediate();
      return;
    }

    await this.delayMs(cfg.holdMs);

    if (this.isOver || !this.watersActive) {
      this.endWatersImmediate();
      return;
    }

    const drainWork = async () => {
      this.juice.onWatersDrainStart();
      await this.tweenWaterSurface(FLOOR_Y, cfg.drainMs, "Sine.easeIn");
      this.endWatersImmediate();
    };

    if (cfg.releaseInputOnDrain) {
      void drainWork();
      return;
    }

    await drainWork();
  }

  private tweenWaterSurface(
    to: number,
    duration: number,
    ease: string
  ): Promise<void> {
    this.tweens.killTweensOf(this.waterLevelProxy);
    this.waterLevelProxy.y = this.waterSurfaceY;
    return new Promise((resolve) => {
      if (!this.watersActive) {
        resolve();
        return;
      }
      this.tweens.add({
        targets: this.waterLevelProxy,
        y: to,
        duration,
        ease,
        onUpdate: () => {
          if (!this.watersActive) return;
          this.waterSurfaceY = this.waterLevelProxy.y;
          this.juice.setWaterSurfaceY(this.waterLevelProxy.y);
        },
        onComplete: () => resolve()
      });
    });
  }

  private computeWaterTargetSurfaceY(): number {
    const cfg = juiceConfig.waters;
    const boardSpan = FLOOR_Y - DANGER_Y;
    const minFill = boardSpan * cfg.fillRatioMin;

    let pileTop = FLOOR_Y;
    let any = false;
    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      if (!piece.visualState.alive || piece.body.getData("merging")) continue;
      any = true;
      const top = piece.body.y - getAnimal(piece.visualState.tier).radius;
      if (top < pileTop) pileTop = top;
    }

    let fill = minFill;
    if (any) {
      const pileFill = FLOOR_Y - (pileTop - cfg.pileMarginPx);
      fill = Math.max(minFill, pileFill);
    }

    const maxFill = FLOOR_Y - (DANGER_Y - cfg.maxAboveDangerPx);
    fill = Math.min(fill, maxFill);
    return FLOOR_Y - fill;
  }

  private isInDangerZone(): boolean {
    for (let i = 0; i < this.animals.length; i++) {
      const body = this.animals[i].body;
      if (!this.animals[i].visualState.alive) continue;
      const age = this.time.now - (body.getData("spawnAt") as number);
      const level = body.getData("level") as number;
      const top = body.y - getAnimal(level).radius;
      if (age > DANGER_SETTLE_MS && top < DANGER_Y) return true;
    }
    return false;
  }

  private endWatersImmediate(): void {
    const wasActive = this.watersActive;
    this.watersActive = false;
    this.tweens.killTweensOf(this.waterLevelProxy);
    this.waterSurfaceY = FLOOR_Y;
    this.waterLevelProxy.y = FLOOR_Y;
    this.juice.endWaters();
    GameAudio.current?.stopWatersLoop();
    // Timers en cero: el cruce durante el agua no arrastra dwell al terminar.
    // A partir de aquí update() vuelve a contar con normalidad.
    for (let i = 0; i < this.animals.length; i++) {
      this.animals[i].body.setData("dangerMs", 0);
    }
    if (wasActive) this.powers.notifyBoardChanged();
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  private findPieceById(id: number): AnimalPiece | null {
    for (let i = 0; i < this.animals.length; i++) {
      if (this.animals[i].id === id) return this.animals[i];
    }
    return null;
  }

  /** Flash del poder dummy: tint blanco breve, sin tocar el cuerpo. */
  private flashPieceById(pieceId: number): void {
    const piece = this.findPieceById(pieceId);
    if (!piece || !piece.visualState.alive) return;
    piece.visual.setTintFill(0xffffff);
    this.time.delayedCall(140, () => {
      if (piece.visualState.alive) piece.visual.clearTint();
    });
    // Un segundo destello para que se lea como "parpadeo" del dummy.
    this.time.delayedCall(220, () => {
      if (!piece.visualState.alive) return;
      piece.visual.setTintFill(0xffffff);
      this.time.delayedCall(120, () => {
        if (piece.visualState.alive) piece.visual.clearTint();
      });
    });
  }

  private setPhysicsDebug(enabled: boolean): boolean {
    const world = this.matter.world;
    if (!world) return false;

    if (enabled) {
      if (!world.debugGraphic) world.createDebugGraphic();
      world.drawDebug = true;
      return true;
    }

    world.drawDebug = false;
    // World.shutdown() sólo destruye el debugGraphic si drawDebug sigue en true,
    // así que hay que soltarlo a mano para no dejar el Graphics colgando.
    world.debugGraphic?.destroy();
    world.debugGraphic = undefined as unknown as Phaser.GameObjects.Graphics;
    return false;
  }

  /** Contadores para verificar leaks desde consola: window.arcaDebug(). */
  private debugCounts(): ArcaDebugSnapshot {
    return {
      matterBodies: this.matter.world
        ? this.matter.world.getAllBodies().length
        : 0,
      animals: this.animals.length,
      juiceVisuals: this.juice.debugVisualCount,
      activeParticles: this.juice.debugActiveParticleCount,
      combo: this.juice.debugComboCount,
      maxCombo: this.juice.debugMaxCombo,
      totalCombos: this.juice.debugTotalCombos,
      comboTextsShown: this.juice.debugComboTextsShown,
      breathingPieces: this.juice.debugBreathingCount,
      firstBreathPhase: this.juice.debugFirstBreathPhase,
      lastLandTier: this.juice.debugLastLandTier,
      lastLandIntensity: this.juice.debugLastLandIntensity,
      shakesTriggered: this.juice.debugShakesTriggered,
      dustBursts: this.juice.debugDustBursts,
      powers: this.powers.debugSnapshot()
    };
  }

  // ---------- Game over ----------

  update(_time: number, delta: number): void {
    if (this.isOver) return;

    // La guía anima el offset del patrón; reusa el mismo Graphics.
    // Durante SELECTING/APPLYING se oculta (blocksDrop).
    if (this.canDrop) this.drawDropGuide();

    // Ocultar preview mientras el jugador elige objetivo de un poder.
    if (this.powers.blocksDrop() || this.midRunAdBusy) {
      this.preview.setVisible(false);
      this.juice.setPreviewActive(false);
    } else if (this.canDrop && !this.preview.visible) {
      this.refreshPreview();
    }

    let dangerProximity = 0;
    let dangerOverLine = false;
    // No acumular peligro si la física está pausada (modal / mid-run ad):
    // el animal queda congelado sobre la línea y disparaba Game Over falso.
    const physicsPaused = !this.matter.world.enabled;
    if (
      this.watersActive ||
      this.powers.blocksDrop() ||
      this.midRunAdBusy ||
      this.awaitingContinue ||
      physicsPaused
    ) {
      for (let i = 0; i < this.animals.length; i++) {
        this.animals[i].body.setData("dangerMs", 0);
      }
      this.juice.onDangerZone(false, 0);
      this.pulseDangerLine(0, false, delta);
      if (!this.midRunAdBusy && !this.awaitingContinue && !physicsPaused) {
        this.maybeOfferMidRunAd();
      }
      return;
    }

    for (let i = 0; i < this.animals.length; i++) {
      const piece = this.animals[i];
      const body = piece.body;
      // Detección de peligro: cuerpo asentado por encima de la línea
      const age = this.time.now - (body.getData("spawnAt") as number);
      const level = body.getData("level") as number;
      const top = body.y - getAnimal(level).radius;
      if (age > DANGER_SETTLE_MS && top < DANGER_Y) {
        const ms = (body.getData("dangerMs") as number) + delta;
        body.setData("dangerMs", ms);
        if (ms > DANGER_TIME_MS) {
          this.gameOver();
          return;
        }
      } else {
        body.setData("dangerMs", 0);
      }

      // Aviso visual: solo el montón ya quieto, no el animal que acaba de caer.
      if (
        !piece.visualState.alive ||
        body.getData("merging") ||
        age < DANGER_SETTLE_MS
      ) {
        continue;
      }
      const speed = (body.body as { speed: number }).speed;
      if (speed > DANGER_SETTLED_SPEED) continue;
      const proximity = Phaser.Math.Clamp(
        (DANGER_Y + DANGER_WARN_PX - top) / DANGER_WARN_PX,
        0,
        1
      );
      if (proximity > dangerProximity) dangerProximity = proximity;
      if (top < DANGER_Y) dangerOverLine = true;
    }
    this.juice.onDangerZone(dangerProximity > 0, dangerProximity);
    this.pulseDangerLine(dangerProximity, dangerOverLine, delta);

    const inDanger = this.isInDangerZone();
    if (inDanger !== this.lastHudDanger) {
      this.lastHudDanger = inDanger;
      this.powers.notifyBoardChanged();
    }

    this.maybeOfferMidRunAd();
  }

  /**
   * Un solo intersticial a mitad de partida (~90s), en un momento seguro.
   * No corre si compró “sin anuncios”, ni durante poderes / peligro / modales.
   */
  private maybeOfferMidRunAd(): void {
    if (
      this.midRunAdDone ||
      this.midRunAdBusy ||
      this.isOver ||
      this.awaitingContinue ||
      hasAdsRemoved() ||
      !this.canDrop ||
      this.powers.blocksDrop() ||
      this.isInDangerZone() ||
      this.animals.length < 1 ||
      Date.now() - this.runStartedAt < MID_RUN_AD_AFTER_MS
    ) {
      return;
    }
    void this.runMidRunAd();
  }

  private async runMidRunAd(): Promise<void> {
    if (this.midRunAdDone || this.midRunAdBusy || hasAdsRemoved()) return;
    this.midRunAdBusy = true;
    this.midRunAdDone = true;
    this.canDrop = false;
    this.powers.setGameDisabled(true);
    this.preview.setVisible(false);
    this.juice.setPreviewActive(false);
    // Contador CON física aún activa (el montón no queda congelado en peligro).
    try {
      await AdCountdown.play(
        this,
        3,
        t({
          es: "Anuncio en…",
          en: "Ad in…",
          pt: "Anúncio em…"
        })
      );
      if (!this.sys.isActive() || this.isOver) return;
      this.matter.world.pause();
      this.midRunAdAwaitingResult = true;
      // Si AdMob no abre el fullscreen, no hay background/VISIBLE ni result:
      // sin este watchdog el tablero queda congelado y sin música.
      this.clearMidRunSafetyTimer();
      this.midRunSafetyTimer = this.time.delayedCall(7_000, () => {
        if (!this.midRunAdAwaitingResult) return;
        console.warn("[mid-run ad] safety restore (no ad / no result)");
        this.restoreAfterMidRunAd();
      });
      await requestInterstitialAd("mid_run");
    } catch (e) {
      console.warn("[mid-run ad]", e);
    } finally {
      this.midRunAdAwaitingResult = false;
      this.restoreAfterMidRunAd();
    }
  }

  /**
   * Si el shell no inyecta interstitial_ad_result (WebView en background),
   * al volver a foreground hay que desbloquear drops/preview igualmente.
   * Solo tras pedir el intersticial — no durante el 3-2-1.
   */
  private onMidRunForeground(): void {
    if (!this.midRunAdAwaitingResult) return;
    this.restoreAfterMidRunAd();
  }

  private clearMidRunSafetyTimer(): void {
    this.midRunSafetyTimer?.remove(false);
    this.midRunSafetyTimer = null;
  }

  /** Idempotente: reanuda física, drops, poderes y preview tras mid-run ad. */
  private restoreAfterMidRunAd(): void {
    this.clearMidRunSafetyTimer();
    this.midRunAdBusy = false;
    this.midRunAdAwaitingResult = false;
    if (!this.sys.isActive() || this.isOver || this.awaitingContinue) return;
    try {
      this.matter.world.resume();
    } catch {
      // ignore
    }
    this.canDrop = true;
    this.powers.setGameDisabled(false);
    this.refreshPreview();
    this.powers.notifyBoardChanged();
    this.audio?.resumeAfterAd();
  }

  private gameOver(): void {
    if (this.awaitingContinue) return;
    this.isOver = true;
    this.canDrop = false;
    this.dropGuide.clear().setVisible(false);
    this.endWatersImmediate();
    this.powers.setGameDisabled(true);
    this.preview.setVisible(false);
    this.juice.setPreviewActive(false);

    if (!this.continueUsedThisRun) {
      this.offerContinue();
      return;
    }
    this.finalizeGameOver();
  }

  private offerContinue(): void {
    this.awaitingContinue = true;
    this.matter.world.pause();
    this.continueModal.show({
      adsRemoved: hasAdsRemoved(),
      rewardedAvailable:
        typeof window === "undefined" ||
        window.arcaBridgeStub?.rewarded !== "unavailable"
    });
  }

  private applyContinue(): void {
    this.continueModal.close();
    this.continueUsedThisRun = true;
    this.awaitingContinue = false;
    this.evacuateSmallestAnimals();
    this.isOver = false;
    this.canDrop = true;
    this.dangerWarnLatched = false;
    this.dangerCrossLatched = false;
    this.dangerBurstUntil = 0;
    this.lastHudDanger = false;
    this.powers.setGameDisabled(false);
    this.matter.world.resume();
    this.containEscapedPieces();
    this.refreshPreview();
    this.powers.notifyBoardChanged();
    this.topHud.setSecondChance(true);
  }

  /**
   * Continue: salen Paloma (1), Rana (2) y Gallina (3). El resto se queda.
   */
  private evacuateSmallestAnimals(): void {
    const doomed = this.animals.filter(
      (p) => p.visualState.alive && p.visualState.tier <= 3
    );
    for (let i = 0; i < doomed.length; i++) this.destroyAnimal(doomed[i]);
    for (let i = 0; i < this.animals.length; i++) {
      this.animals[i].body.setData("dangerMs", 0);
    }
  }

  private finalizeGameOver(opts?: { showInterstitial?: boolean }): void {
    void this.runFinalizeGameOver(opts);
  }

  /**
   * Resultado final.
   * - 2ª muerte: 3-2-1 → intersticial (shell) → modal.
   * - TERMINAR tras continue: sin intersticial (ya le ofrecimos rewarded).
   * - “sin anuncios”: salta contador e intersticial.
   */
  private async runFinalizeGameOver(opts?: {
    showInterstitial?: boolean;
  }): Promise<void> {
    this.awaitingContinue = false;
    this.isOver = true;
    this.canDrop = false;
    this.continueModal.close();
    this.matter.world.resume();
    this.dropGuide.clear().setVisible(false);
    this.preview.setVisible(false);
    this.juice.setPreviewActive(false);
    this.powers.setGameDisabled(true);
    this.juice.onGameOver();
    this.audio.onGameOver();

    const isNewBest = this.score > this.best;
    if (isNewBest) {
      this.best = this.score;
      storageSetNumber(STORAGE_KEYS.best, this.best);
      this.topHud.setBest(this.best);
    }
    bumpGamesPlayed();
    this.pendingReviewAfterGo = isNewBest;
    const durationSec = Math.max(
      0,
      Math.round((Date.now() - this.runStartedAt) / 1000)
    );
    const payload = {
      score: this.score,
      best: this.best,
      isNewBest,
      arkCompletes: this.arksThisRun,
      olivesEarned: this.olivesThisRun
    };

    const wantInterstitial =
      opts?.showInterstitial !== false && !hasAdsRemoved();
    if (wantInterstitial) {
      await AdCountdown.play(
        this,
        3,
        t({
          es: "Anuncio en…",
          en: "Ad in…",
          pt: "Anúncio em…"
        })
      );
      if (!this.sys.isActive()) return;
    }

    sendToShell({
      type: "game_over",
      score: this.score,
      best: this.best,
      arkCompletes: this.arksThisRun,
      isNewBest,
      olivesEarned: this.olivesThisRun,
      durationSec,
      showInterstitial: wantInterstitial
    });

    if (wantInterstitial) {
      // Feedback mientras el shell muestra el intersticial / entrega el done.
      this.loader?.show();
      try {
        await waitForGameOverAdsDone();
      } finally {
        this.loader?.hide();
      }
      if (!this.sys.isActive()) return;
    }

    // Tras el anuncio (o al instante si sin ads): oferta de share 1× vida.
    if (shouldOfferShareReward()) {
      markShareOfferShown();
      const shareResult = await this.shareRewardModal.showAndWait();
      if (!this.sys.isActive()) return;
      if (shareResult === "shared" && tryMarkShareRewardClaimed()) {
        this.powers.grantOlives(SHARE_REWARD_OLIVES);
        this.olivesThisRun += SHARE_REWARD_OLIVES;
        this.topHud.setOlives(this.powers.debugSnapshot().olives);
      }
    }

    this.gameOverModal.show({
      ...payload,
      olivesEarned: this.olivesThisRun
    });
  }
}
