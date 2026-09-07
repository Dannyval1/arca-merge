import Phaser from "phaser";
import { getAnimal, MERGE_SCORE_MULT } from "../chain";
import { sendToShell } from "../bridge";
import { BitmapTextPool } from "./BitmapTextPool";
import { LOGICAL_WIDTH, LOGICAL_HEIGHT, PLAYABLE_INSET } from "../layout";
import { HUD_LAYOUT } from "../hud/hudLayout";
import { oliveFlyTiming } from "../hud/oliveFly";
import { BALOO_BITMAP_KEY, NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { comboShoutColor, comboShoutFor, comboShoutTint } from "./comboShouts";
import {
  juiceConfig,
  juiceEnabled,
  type JuiceConfig,
  type JuiceQuality
} from "./juiceConfig";

const PARTICLE_TEXTURE = "juice-particle";
const RING_TEXTURE = "juice-ring";
const GLOW_TEXTURE = "juice-glow";
const RAVEN_TEXTURE = "juice-raven";
const RETICLE_TEXTURE = "juice-pick-reticle";

export interface JuicePieceVisual {
  visual: Phaser.GameObjects.Image;
  tier: number;
  baseScale: number;
  squashX: number;
  squashY: number;
  /** Offset de fase fijo al spawn; sin esto el tablero late al unísono. */
  breathPhase: number;
  /** Multiplicador de respiración (≈1.0–1.015). Se compone con squash. */
  breath: number;
  /** Multiplicador Y del parpadeo; 1 salvo durante el blink. */
  blinkY: number;
  /**
   * Resaltado de selección de poderes (1 = nada). Pasa por la composición
   * de escala; no escribir scaleX/Y directo desde PowerManager.
   */
  selectHighlight: number;
  nextBlinkAt: number;
  blinkStartAt: number;
  blinkActive: boolean;
  mergeSquashActive: boolean;
  landSquashActive: boolean;
  alive: boolean;
}

export class JuiceManager {
  private readonly root: Phaser.GameObjects.Container;
  private readonly burstEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] =
    [];
  private readonly dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly featherEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly bubbleEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly tapEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly pickReticles: Phaser.GameObjects.Image[] = [];
  private pickReticleActive = 0;
  private readonly visuals: JuicePieceVisual[] = [];
  private readonly scorePool: BitmapTextPool;
  private readonly comboPool: BitmapTextPool;
  private readonly reducedMotion: boolean;
  private readonly quality: JuiceQuality;
  private preview: Phaser.GameObjects.Image | null = null;
  private previewGlow: Phaser.GameObjects.Image | null = null;
  private previewGhost: Phaser.GameObjects.Image | null = null;
  private previewBaseScale = 1;
  private previewBaseY = 0;
  private previewBreathPhase = Math.random() * Math.PI * 2;
  private previewBreath = 1;
  private previewBobTween: Phaser.Tweens.Tween | null = null;
  /** Gap vertical centro-a-centro del fantasma 2×2; 0 = desarmado. */
  private armedStackGap = 0;
  private comboCount = 0;
  private lastMergeAt = -1;
  private lastMergeX = 0;
  private lastMergeY = 0;
  private lastLandTier = 0;
  private lastLandIntensity = 0;
  private shakesTriggered = 0;
  private dustBursts = 0;
  private maxCombo = 0;
  /** Cap efectivo elevado durante cascada del Rayo / clímax; null = config normal. */
  private particleCapOverride: number | null = null;
  /** true mientras corre la secuencia del Rayo (merge juice sin shake/háptica propia). */
  private lightningActive = false;
  private arkParticleBoostTimer: Phaser.Time.TimerEvent | null = null;
  private lightningFlash: Phaser.GameObjects.Rectangle | null = null;
  private lightningBolt: Phaser.GameObjects.Graphics | null = null;
  private watersActive = false;
  private waterSurfaceY = LOGICAL_HEIGHT;
  private waterFill: Phaser.GameObjects.Rectangle | null = null;
  private waterSurfaceGfx: Phaser.GameObjects.Graphics | null = null;
  private waterAmbientAcc = 0;
  private totalCombos = 0;
  private comboTextsShown = 0;
  private lastComboAt = 0;
  private lastComboX = 0;
  private lastComboY = 0;
  /** Un solo texto de combo a la vez: x3 se reemplaza por x4, no se apilan. */
  private comboShout: Phaser.GameObjects.BitmapText | null = null;
  private comboShadow: Phaser.GameObjects.BitmapText | null = null;
  private canvasComboText: Phaser.GameObjects.Text | null = null;
  private comboShoutGen = 0;
  private readonly isWebGL: boolean = false;
  // Reloj propio de medición: independiente de lastMergeAt, que sólo avanza
  // cuando el juice está activo.
  private lastMergeLogAt = -1;
  private readonly mergeGaps: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: JuiceConfig = juiceConfig
  ) {
    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    this.quality = this.reducedMotion ? "low" : config.quality;
    this.isWebGL =
      scene.sys.game.renderer.type === Phaser.WEBGL;
    this.root = scene.add.container(0, 0).setDepth(config.depths.root);

    this.createBurstEmitters();
    this.createRingPool();
    this.createPickReticlePool();
    this.dustEmitter = this.createDustEmitter();
    this.featherEmitter = this.createFeatherEmitter();
    this.bubbleEmitter = this.createBubbleEmitter();
    this.tapEmitter = this.createTapEmitter();
    this.scorePool = new BitmapTextPool(
      scene,
      this.root,
      this.quality === "high"
        ? config.floatingScore.poolSizeHigh
        : config.floatingScore.poolSizeLow,
      config.runtimeTextures.scoreFontSize
    );
    this.comboPool = new BitmapTextPool(
      scene,
      this.root,
      config.combo.poolSize,
      config.runtimeTextures.comboFontSize
    );
  }

  static generateRuntimeTextures(scene: Phaser.Scene): void {
    JuiceManager.generateParticleTexture(scene);
    JuiceManager.generateRingTexture(scene);
    JuiceManager.generateGlowTexture(scene);
    JuiceManager.generateRavenTexture(scene);
    JuiceManager.generatePickReticleTexture(scene);
    // Puntaje/combo flotantes: BitmapText (baloo2). Ya no se pregeneran texturas.
  }

  /**
   * La pieza en espera vive fuera del array de animales: el JuiceManager le
   * aplica breathing, bobbing y glow sin tocar el cuerpo Matter (no hay).
   */
  attachPreview(
    preview: Phaser.GameObjects.Image,
    baseScale: number,
    baseY: number
  ): void {
    this.preview = preview;
    this.previewBaseScale = baseScale;
    this.previewBaseY = baseY;
    preview.setAlpha(this.config.preview.alpha);

    if (!this.previewGlow) {
      this.previewGlow = this.scene.add
        .image(preview.x, preview.y, GLOW_TEXTURE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(this.config.preview.glowColor)
        .setAlpha(this.config.preview.glowAlpha)
        .setVisible(false);
      // Misma capa que el resto del VFX aditivo → un solo batch.
      this.root.add(this.previewGlow);
    }

    this.refreshPreviewVisual(baseScale);
    this.restartPreviewBob();
  }

  /** Tras cambiar textura/nivel o al mostrar de nuevo tras el cooldown. */
  refreshPreviewVisual(baseScale: number): void {
    this.previewBaseScale = baseScale;
    if (!this.preview) return;
    if (!this.isEnabled()) {
      this.preview.setScale(baseScale);
      this.previewGlow?.setVisible(false);
      this.previewGhost?.setVisible(false);
      return;
    }
    this.preview.setScale(baseScale * this.previewBreath);
    this.syncPreviewGlow();
    if (this.armedStackGap > 0) {
      this.previewGhost
        ?.setTexture(this.preview.texture.key)
        .setVisible(this.preview.visible);
      this.syncPreviewGhost();
    }
  }

  setPreviewActive(active: boolean): void {
    if (!this.previewGlow) return;
    if (!active || !this.isEnabled()) {
      this.previewGlow.setVisible(false);
      this.previewGhost?.setVisible(false);
      this.previewBobTween?.pause();
      return;
    }
    this.previewGlow.setVisible(true);
    this.syncPreviewGlow();
    if (this.armedStackGap > 0) {
      this.previewGhost?.setVisible(true);
      this.syncPreviewGhost();
    }
    this.previewBobTween?.resume();
  }

  /** Sigue al preview cuando el jugador arrastra. */
  followPreview(): void {
    if (!this.isEnabled()) return;
    this.syncPreviewGlow();
    this.syncPreviewGhost();
  }

  /**
   * Miras sobre piezas seleccionables. Se llama cada tick en SELECTING.
   * No depende de juiceEnabled: es la affordance de pick-piece.
   */
  setPickReticles(
    targets: readonly { id: number; x: number; y: number }[],
    hoveredId: number | null
  ): void {
    const cfg = this.config.pickReticle;
    const n = Math.min(targets.length, this.pickReticles.length);
    this.pickReticleActive = n;
    for (let i = 0; i < this.pickReticles.length; i++) {
      const img = this.pickReticles[i];
      if (i >= n) {
        img.setVisible(false).setActive(false);
        continue;
      }
      const t = targets[i];
      const hovered = t.id === hoveredId;
      const size = cfg.displaySize * (hovered ? cfg.hoveredScale : 1);
      img
        .setPosition(t.x, t.y)
        .setDisplaySize(size, size)
        .setAlpha(hovered ? cfg.hoveredAlpha : cfg.alpha)
        .setVisible(true)
        .setActive(true);
    }
  }

  clearPickReticles(): void {
    this.pickReticleActive = 0;
    for (let i = 0; i < this.pickReticles.length; i++) {
      this.pickReticles[i].setVisible(false).setActive(false);
    }
  }

  /**
   * Estado armado de "De Dos en Dos": fantasma justo debajo del preview.
   * @param stackGap >0 activa; 0 desactiva.
   */
  setArmedDoublePreview(stackGap: number): void {
    this.armedStackGap = Math.max(0, stackGap);
    if (!this.preview) return;

    if (this.armedStackGap <= 0) {
      this.previewGhost?.setVisible(false);
      if (this.previewGlow && this.preview.visible && this.isEnabled()) {
        this.previewGlow.setAlpha(this.config.preview.glowAlpha);
      }
      return;
    }

    if (!this.previewGhost) {
      this.previewGhost = this.scene.add
        .image(this.preview.x, this.preview.y, this.preview.texture.key)
        .setAlpha(this.config.preview.ghostAlpha)
        .setDepth(19)
        .setVisible(false);
    }

    this.previewGhost
      .setTexture(this.preview.texture.key)
      .setAlpha(this.config.preview.ghostAlpha)
      .setVisible(this.preview.visible && this.isEnabled());
    this.syncPreviewGhost();

    if (this.previewGlow) {
      this.previewGlow.setAlpha(
        Math.min(0.7, this.config.preview.glowAlpha * 1.65)
      );
      this.syncPreviewGlow();
    }
  }

  registerPiece(piece: JuicePieceVisual): void {
    this.visuals.push(piece);
  }

  unregisterPiece(piece: JuicePieceVisual): void {
    for (let i = 0; i < this.visuals.length; i++) {
      if (this.visuals[i] === piece) {
        this.visuals.splice(i, 1);
        return;
      }
    }
  }

  onMerge(tier: number, x: number, y: number): void {
    // Fuera del guard de isEnabled: la medición debe funcionar aunque el juice
    // esté apagado o el dispositivo pida reduced-motion.
    this.recordMergeGap(tier);
    if (!this.isEnabled()) return;

    this.updateCombo(x, y);
    const piece = this.findMergePiece(tier, x, y);
    if (piece) {
      this.playMergeSquash(piece);
      this.playMergeFlash(piece);
    }

    this.emitMergeParticles(tier, x, y);
    this.playRing(tier, x, y);
    this.playFloatingScore(tier, x, y);
    if (!this.lightningActive) {
      this.playMergeShake(tier);
      sendToShell({
        type: "haptic",
        intensity: tier >= 5 ? "medium" : "light"
      });
    }
  }

  onDrop(_x: number, _y: number, _tier: number): void {
    // Fase 2/3.
  }

  /**
   * Toque en el área jugable (pointerdown). Anillo + partículas suaves ~300ms.
   */
  onTap(x: number, y: number): void {
    if (!this.isEnabled()) return;
    this.playTapRing(x, y);
    this.emitTapParticles(x, y);
  }

  /**
   * El Cuervo: ave placeholder baja, captura, se lleva la silueta hacia arriba.
   * La pieza ya fue destroyAnimal'd; animamos un fantasma + el ave.
   */
  onRavenCapture(snapshot: {
    x: number;
    y: number;
    textureKey: string;
    scaleX: number;
    scaleY: number;
    rotation: number;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return Promise.resolve();
    }

    const cfg = this.config.raven;
    sendToShell({ type: "haptic", intensity: "light" });

    const ghost = this.scene.add
      .image(snapshot.x, snapshot.y, snapshot.textureKey)
      .setScale(snapshot.scaleX, snapshot.scaleY)
      .setRotation(snapshot.rotation)
      .setDepth(this.config.depths.root + 2);

    const bird = this.scene.add
      .image(snapshot.x, snapshot.y - 140, RAVEN_TEXTURE)
      .setDisplaySize(cfg.birdDisplaySize, cfg.birdDisplaySize)
      .setTint(cfg.birdTint)
      .setDepth(this.config.depths.root + 3);

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: bird,
        y: snapshot.y - 8,
        duration: cfg.diveMs,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.emitFeathers(snapshot.x, snapshot.y);
          // Captura: pieza se encoge y sube con el ave.
          this.scene.tweens.add({
            targets: ghost,
            y: cfg.exitY,
            scaleX: snapshot.scaleX * cfg.shrinkTo,
            scaleY: snapshot.scaleY * cfg.shrinkTo,
            alpha: 0.35,
            duration: cfg.carryMs,
            ease: "Cubic.easeIn"
          });
          this.scene.tweens.add({
            targets: bird,
            y: cfg.exitY - 20,
            duration: cfg.carryMs,
            ease: "Cubic.easeIn",
            onComplete: () => {
              ghost.destroy();
              bird.destroy();
              resolve();
            }
          });
        }
      });
    });
  }

  private emitFeathers(x: number, y: number): void {
    const cfg = this.config.raven;
    const count = cfg.featherCount;
    if (this.aliveParticleCount() + count > this.effectiveParticleCap()) {
      return;
    }
    this.featherEmitter.emitParticleAt(x, y, count);
  }

  /**
   * Inicio del Rayo: flash blanco, háptica medium, cap temporal de partículas.
   */
  beginLightning(pairCount: number): void {
    const cfg = this.config.lightning;
    this.lightningActive = true;
    const boosted = Math.min(
      cfg.particleCapMax,
      cfg.particleCapBase + Math.max(0, pairCount) * cfg.particleCapPerPair
    );
    this.beginParticleBoost(boosted);

    if (!this.isEnabled()) {
      sendToShell({ type: "haptic", intensity: "medium" });
      return;
    }

    sendToShell({ type: "haptic", intensity: "medium" });
    this.playLightningFlash();
  }

  /**
   * Bolt que salta de (from) → A → B (pareja). Resuelve al terminar el hop.
   */
  lightningHop(
    fromX: number,
    fromY: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): Promise<void> {
    if (!this.isEnabled()) return Promise.resolve();

    const cfg = this.config.lightning;
    if (!this.lightningBolt) {
      this.lightningBolt = this.scene.add
        .graphics()
        .setDepth(this.config.depths.root + 6);
      this.root.add(this.lightningBolt);
    }
    const g = this.lightningBolt;
    g.clear();
    g.setAlpha(1);

    this.strokeBolt(g, fromX, fromY, ax, ay);
    this.strokeBolt(g, ax, ay, bx, by);

    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: g,
        alpha: 0.15,
        duration: cfg.hopMs,
        ease: "Quad.easeOut",
        onComplete: () => resolve()
      });
    });
  }

  /** Shake acumulativo suave + háptica light por fusión de la cadena. */
  onLightningStrike(index: number, total: number): void {
    sendToShell({ type: "haptic", intensity: "light" });
    if (!this.isEnabled() || this.reducedMotion) return;

    const cfg = this.config.lightning;
    const t = total <= 1 ? 1 : index / (total - 1);
    const intensity = Phaser.Math.Linear(
      cfg.shakeMinIntensity,
      cfg.shakeMaxIntensity,
      t
    );
    const camera = this.scene.cameras.main;
    camera.shake(cfg.shakeDurationMs, intensity / camera.zoom);
    this.shakesTriggered++;
  }

  endLightning(): void {
    this.lightningActive = false;
    // Si el clímax del arca / aguas todavía tiene boost, no lo apagues.
    if (!this.arkParticleBoostTimer && !this.watersActive) {
      this.endParticleBoost();
    }
    if (this.lightningBolt) {
      this.lightningBolt.clear();
      this.lightningBolt.setAlpha(1);
    }
  }

  /** Las Aguas: cap, háptica light, capa de agua. */
  beginWaters(): void {
    const cfg = this.config.waters;
    this.watersActive = true;
    this.waterSurfaceY = LOGICAL_HEIGHT;
    this.waterAmbientAcc = 0;
    this.beginParticleBoost(cfg.particleCap);
    sendToShell({ type: "haptic", intensity: "light" });

    if (!this.isEnabled()) return;

    if (!this.waterFill) {
      this.waterFill = this.scene.add
        .rectangle(
          LOGICAL_WIDTH / 2,
          LOGICAL_HEIGHT,
          LOGICAL_WIDTH - 40,
          4,
          cfg.fillColor,
          cfg.fillAlpha
        )
        .setDepth(this.config.depths.root + 1);
      this.root.add(this.waterFill);
    }
    if (!this.waterSurfaceGfx) {
      this.waterSurfaceGfx = this.scene.add
        .graphics()
        .setDepth(this.config.depths.root + 2);
      this.root.add(this.waterSurfaceGfx);
    }
    this.waterFill.setVisible(true);
    this.setWaterSurfaceY(LOGICAL_HEIGHT);
  }

  setWaterSurfaceY(y: number): void {
    this.waterSurfaceY = y;
    const cfg = this.config.waters;
    const fill = this.waterFill;
    if (fill) {
      const bottom = LOGICAL_HEIGHT + 8;
      const height = Math.max(2, bottom - y);
      fill.setPosition(LOGICAL_WIDTH / 2, y + height / 2);
      fill.setSize(LOGICAL_WIDTH - 40, height);
      fill.setFillStyle(cfg.fillColor, cfg.fillAlpha);
    }
    this.redrawWaterSurface(this.scene.time.now);
  }

  onWatersDrainStart(): void {
    if (!this.isEnabled()) return;
    const cfg = this.config.waters;
    this.emitBubbles(
      LOGICAL_WIDTH / 2,
      this.waterSurfaceY,
      cfg.dripCount
    );
  }

  /**
   * Hojas de recompensa (cadena 8/9/10): vuelan del origen al contador.
   * `overlay` las pinta por encima de modales (compra en tienda).
   */
  playOliveReward(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    amount: number,
    overlay = false,
    onLeafHit?: () => void
  ): { arriveDelayMs: number; spanMs: number } | null {
    if (amount <= 0) return null;
    if (!overlay && !this.isEnabled()) return null;
    const count = Math.min(8, Math.max(3, Math.round(amount / 5)));
    const depth = overlay ? 80 : this.config.depths.root + 10;
    const stagger = 40;
    const duration = 480;
    for (let i = 0; i < count; i++) {
      const delay = i * stagger;
      const ox = fromX + (Math.random() - 0.5) * 20;
      const oy = fromY + (Math.random() - 0.5) * 12;
      this.scene.time.delayedCall(delay, () => {
        const leaf = this.scene.add
          .image(ox, oy, "icon_olivo")
          .setDisplaySize(20, 20)
          .setOrigin(0.5)
          .setDepth(depth)
          .setAlpha(0.95);
        if (!overlay) this.root.add(leaf);
        this.scene.tweens.add({
          targets: leaf,
          x: toX + (Math.random() - 0.5) * 8,
          y: toY,
          alpha: 0.2,
          scale: 0.6,
          duration,
          ease: "Cubic.easeIn",
          onComplete: () => {
            onLeafHit?.();
            leaf.destroy();
          }
        });
      });
    }
    sendToShell({ type: "haptic", intensity: "light" });
    return oliveFlyTiming(count, stagger, duration);
  }

  endWaters(): void {
    this.watersActive = false;
    this.waterFill?.setVisible(false);
    this.waterSurfaceGfx?.clear();
    for (let i = 0; i < this.visuals.length; i++) {
      const piece = this.visuals[i];
      if (piece.alive) piece.visual.clearTint();
    }
    if (!this.lightningActive && !this.arkParticleBoostTimer) {
      this.endParticleBoost();
    }
  }

  isWatersEffectActive(): boolean {
    return this.watersActive;
  }

  watersVisualBob(
    bodyY: number,
    radius: number,
    surfaceY: number,
    timeMs: number,
    pieceId: number
  ): number {
    if (!this.watersActive || !this.isEnabled()) return 0;
    const submerged = this.submergedFraction(bodyY, radius, surfaceY);
    if (submerged <= 0) return 0;
    const cfg = this.config.waters;
    const phase =
      timeMs / cfg.bobPeriodMs + pieceId * 0.37;
    return Math.sin(phase * Math.PI * 2) * cfg.bobAmpPx * submerged;
  }

  syncWatersTint(
    visual: Phaser.GameObjects.Image,
    bodyY: number,
    radius: number,
    surfaceY: number
  ): void {
    if (!this.watersActive) {
      // No clearTint aquí: puede pisar el flash de merge. Solo limpiamos
      // tinte de agua cuando salimos del efecto completo (endWaters no basta
      // para piezas individuales) — al salir de sumersión sí.
      return;
    }
    const submerged = this.submergedFraction(bodyY, radius, surfaceY);
    if (submerged <= 0.05) {
      visual.clearTint();
      return;
    }
    const cfg = this.config.waters;
    // Tint multiplicativo suave; merge flash (tintFill) gana mientras dure.
    visual.setTint(cfg.tintColor);
  }

  private submergedFraction(
    bodyY: number,
    radius: number,
    surfaceY: number
  ): number {
    const bottom = bodyY + radius;
    const top = bodyY - radius;
    if (top >= surfaceY) return 1;
    if (bottom <= surfaceY) return 0;
    return Phaser.Math.Clamp((bottom - surfaceY) / (2 * radius), 0, 1);
  }

  private redrawWaterSurface(timeMs: number): void {
    const g = this.waterSurfaceGfx;
    if (!g || !this.watersActive || !this.isEnabled()) return;
    const cfg = this.config.waters;
    const y = this.waterSurfaceY;
    g.clear();
    g.lineStyle(2.5, cfg.surfaceColor, 0.85);
    g.beginPath();
    const left = 20;
    const right = LOGICAL_WIDTH - 20;
    const phase = (timeMs / cfg.wavePeriodMs) * Math.PI * 2;
    g.moveTo(left, y);
    for (let x = left; x <= right; x += 6) {
      const t = (x - left) / (right - left);
      const wave =
        Math.sin(t * Math.PI * 4 + phase) * cfg.waveAmpPx +
        Math.sin(t * Math.PI * 7 + phase * 1.3) * (cfg.waveAmpPx * 0.35);
      g.lineTo(x, y + wave);
    }
    g.strokePath();
  }

  private emitBubbles(x: number, y: number, count: number): void {
    if (this.aliveParticleCount() + count > this.effectiveParticleCap()) {
      return;
    }
    this.bubbleEmitter.emitParticleAt(x, y, count);
  }

  private playLightningFlash(): void {
    const cfg = this.config.lightning;
    if (!this.lightningFlash) {
      this.lightningFlash = this.scene.add
        .rectangle(
          LOGICAL_WIDTH / 2,
          LOGICAL_HEIGHT / 2,
          LOGICAL_WIDTH,
          LOGICAL_HEIGHT,
          0xffffff,
          cfg.flashAlpha
        )
        .setDepth(this.config.depths.root + 8);
      this.root.add(this.lightningFlash);
    }
    const flash = this.lightningFlash;
    flash.setAlpha(cfg.flashAlpha).setVisible(true);
    this.scene.tweens.killTweensOf(flash);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: cfg.flashMs,
      ease: "Cubic.easeOut",
      onComplete: () => flash.setVisible(false)
    });
  }

  private strokeBolt(
    g: Phaser.GameObjects.Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    const cfg = this.config.lightning;
    const midX = (x0 + x1) / 2 + (Math.random() - 0.5) * 28;
    const midY = (y0 + y1) / 2 + (Math.random() - 0.5) * 22;

    g.lineStyle(cfg.boltGlowWidth, cfg.boltGlowColor, 0.35);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(midX, midY);
    g.lineTo(x1, y1);
    g.strokePath();

    g.lineStyle(cfg.boltWidth, cfg.boltColor, cfg.boltAlpha);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(midX, midY);
    g.lineTo(x1, y1);
    g.strokePath();
  }

  private effectiveParticleCap(): number {
    return this.particleCapOverride ?? this.config.particles.globalCap;
  }

  onLand(
    tier: number,
    x: number,
    y: number,
    impactSpeed: number
  ): void {
    const cfg = this.config.land;
    const intensity = Phaser.Math.Clamp(
      (impactSpeed - cfg.minImpactSpeed) /
        (cfg.maxImpactSpeed - cfg.minImpactSpeed),
      0,
      1
    );
    this.lastLandTier = tier;
    this.lastLandIntensity = intensity;
    if (!this.isEnabled() || intensity <= 0) return;

    const piece = this.findNearestPiece(tier, x, y);
    // El land es atómico: si merge/otro land bloquea el squash, también se
    // bloquea el polvo para no dar feedback sin deformación visible.
    // Sin háptica: vibrar en cada caída cansa; solo se vibra en merge.
    if (!piece || !this.playLandSquash(piece, intensity)) return;

    if (intensity >= this.config.dust.minIntensity) {
      if (this.watersActive) {
        this.emitBubbles(x, y, Math.max(3, Math.round(intensity * 6)));
      } else {
        this.emitDust(tier, x, y, intensity);
      }
    }
  }

  onCombo(count: number): void {
    if (!this.isEnabled() || count < this.config.combo.minDisplayed) return;
    this.playComboText(count);
    if (count >= this.config.combo.hapticMinCount) {
      sendToShell({ type: "haptic", intensity: "medium" });
    }
  }

  /**
   * Un solo loop por frame para breathing + blink + preview. Cero allocations:
   * no hay pushes, no hay tweens de breath, no hay objetos temporales.
   * Lo llama GameScene desde matter afterupdate (junto a la composición).
   */
  afterUpdate(time: number, delta: number): void {
    this.spinPickReticles(delta);

    if (
      this.comboCount > 0 &&
      time - this.lastMergeAt > this.config.combo.windowMs
    ) {
      this.comboCount = 0;
      this.lastMergeAt = -1;
    }

    if (!this.isEnabled()) {
      // juiceEnabled=false → factores en identidad, sin VFX residual.
      for (let i = 0; i < this.visuals.length; i++) {
        const piece = this.visuals[i];
        piece.breath = 1;
        piece.blinkY = 1;
        piece.blinkActive = false;
      }
      this.previewBreath = 1;
      if (this.preview) this.preview.setScale(this.previewBaseScale);
      this.previewGlow?.setVisible(false);
      this.previewBobTween?.pause();
      return;
    }

    this.updateBreathing(delta);
    this.updateBlink(time);
    this.updatePreviewLife(delta);
    if (this.watersActive) {
      this.redrawWaterSurface(time);
      this.waterAmbientAcc += delta;
      if (this.waterAmbientAcc > 180) {
        this.waterAmbientAcc = 0;
        const x = 40 + Math.random() * (LOGICAL_WIDTH - 80);
        this.emitBubbles(x, this.waterSurfaceY + 10, 1);
      }
    }
    // Reanuda el bob tras un ciclo juiceEnabled=false → true.
    if (this.previewBobTween?.paused && this.preview?.visible) {
      this.previewBobTween.resume();
    }
  }

  private updateBreathing(delta: number): void {
    const cfg = this.config.breathing;
    // phase += 2π * Δt / periodo. Un sin() por pieza, sin Math.sin cacheado
    // porque la fase es distinta en cada una.
    const step = (delta / cfg.periodMs) * Math.PI * 2;
    const amplitude = cfg.amplitude;

    for (let i = 0; i < this.visuals.length; i++) {
      const piece = this.visuals[i];
      if (!piece.alive) continue;
      // Breathing NO se pausa durante squash: solo se multiplica en la composición.
      piece.breathPhase += step;
      // Remapea sin de [-1,1] a [1, 1+amplitude] para que nunca encoja bajo 1.0.
      piece.breath = 1 + amplitude * (0.5 + 0.5 * Math.sin(piece.breathPhase));
    }
  }

  private updateBlink(time: number): void {
    const cfg = this.config.blink;
    // Ida + vuelta = 2 * durationMs. Sin tweens → cero alloc por blink.
    const half = cfg.durationMs;
    const total = half * 2;

    for (let i = 0; i < this.visuals.length; i++) {
      const piece = this.visuals[i];
      if (!piece.alive) continue;

      if (piece.blinkActive) {
        // Si arranca un squash a mitad del blink, abortamos: dos deformaciones
        // a la vez se leen como un salto, no como un parpadeo.
        if (piece.mergeSquashActive || piece.landSquashActive) {
          piece.blinkActive = false;
          piece.blinkY = 1;
          piece.nextBlinkAt = time + this.randomBlinkDelay();
          continue;
        }

        const elapsed = time - piece.blinkStartAt;
        if (elapsed >= total) {
          piece.blinkActive = false;
          piece.blinkY = 1;
          piece.nextBlinkAt = time + this.randomBlinkDelay();
        } else if (elapsed < half) {
          const t = elapsed / half;
          piece.blinkY = 1 + (cfg.squashY - 1) * t;
        } else {
          const t = (elapsed - half) / half;
          piece.blinkY = cfg.squashY + (1 - cfg.squashY) * t;
        }
        continue;
      }

      if (piece.nextBlinkAt === 0) {
        piece.nextBlinkAt = time + this.randomBlinkDelay();
        continue;
      }
      if (
        time < piece.nextBlinkAt ||
        piece.mergeSquashActive ||
        piece.landSquashActive
      ) {
        continue;
      }

      piece.blinkActive = true;
      piece.blinkStartAt = time;
    }
  }

  private updatePreviewLife(delta: number): void {
    if (!this.preview || !this.preview.visible) return;

    const cfg = this.config.breathing;
    this.previewBreathPhase += (delta / cfg.periodMs) * Math.PI * 2;
    this.previewBreath =
      1 + cfg.amplitude * (0.5 + 0.5 * Math.sin(this.previewBreathPhase));
    this.preview.setScale(this.previewBaseScale * this.previewBreath);
    this.syncPreviewGlow();
    this.syncPreviewGhost();
  }

  private syncPreviewGlow(): void {
    const glow = this.previewGlow;
    const preview = this.preview;
    if (!glow || !preview) return;

    const cfg = this.config.preview;
    const diameter = preview.displayWidth;
    glow.setPosition(preview.x, preview.y);
    glow.setScale((diameter * cfg.glowScale) / cfg.glowSize);
    glow.setVisible(preview.visible && this.isEnabled());
  }

  private syncPreviewGhost(): void {
    const ghost = this.previewGhost;
    const preview = this.preview;
    if (!ghost || !preview || this.armedStackGap <= 0) return;

    const cfg = this.config.preview;
    const diameter = preview.displayWidth;
    const radius = diameter / 2;

    const minY = HUD_LAYOUT.fila2.bottom + 8 + radius;
    const gy = Math.max(preview.y + this.armedStackGap, minY);

    ghost.setPosition(preview.x, gy);
    ghost.setScale(this.previewBaseScale * this.previewBreath);
    ghost.setAlpha(cfg.ghostAlpha);
    ghost.setTexture(preview.texture.key);
    ghost.setVisible(preview.visible && this.isEnabled());
  }

  private restartPreviewBob(): void {
    this.previewBobTween?.stop();
    this.previewBobTween = null;
    if (!this.preview || !this.isEnabled()) return;

    const cfg = this.config.preview;
    // Arranca en el extremo bajo para que el yoyo cubra ±bobPx en un ciclo.
    this.preview.setY(this.previewBaseY - cfg.bobPx);
    this.previewBobTween = this.scene.tweens.add({
      targets: this.preview,
      y: this.previewBaseY + cfg.bobPx,
      duration: cfg.bobPeriodMs / 2,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
  }

  private randomBlinkDelay(): number {
    const cfg = this.config.blink;
    return Phaser.Math.Between(cfg.minDelayMs, cfg.maxDelayMs);
  }

  onDangerZone(_active: boolean, _proximity: number): void {
    // Fase 4.
  }

  onGameOver(): void {
    this.endWaters();
    this.endLightning();
    this.setPreviewActive(false);
    if (!this.isEnabled()) return;
    for (let i = 0; i < this.burstEmitters.length; i++) {
      this.burstEmitters[i].stop();
    }
    this.dustEmitter.stop();
    this.featherEmitter.stop();
    this.bubbleEmitter.stop();
    this.tapEmitter.stop();
  }

  onArkComplete(args: {
    x: number;
    y: number;
    firstTime: boolean;
    scoreBonus: number;
    oliveReward: number;
    /** Se llama al terminar el freeze de física (el banner puede seguir). */
    onFreezeEnd: () => void;
    /** Se llama al terminar arcoíris + banner. */
    onComplete: () => void;
  }): void {
    const cfg = this.config.arkComplete;
    const timing = args.firstTime ? cfg.firstTime : cfg.repeat;

    this.beginParticleBoost(cfg.particleCap);
    this.arkParticleBoostTimer?.remove(false);
    this.arkParticleBoostTimer = this.scene.time.delayedCall(
      timing.particleBoostMs,
      () => {
        this.arkParticleBoostTimer = null;
        if (!this.lightningActive) this.endParticleBoost();
      }
    );

    this.scene.time.delayedCall(timing.freezeMs, () => args.onFreezeEnd());
    sendToShell({ type: "haptic", intensity: "heavy" });

    if (!this.isEnabled()) {
      this.scene.time.delayedCall(
        timing.freezeMs + timing.bannerHoldMs + timing.bannerFadeMs,
        () => args.onComplete()
      );
      return;
    }

    this.playArkRainbow(args.x, args.y, timing);
    this.playArkBanner(args, timing);
    const flash = timing.cameraFlashAlpha >= 0.5 ? 255 : 200;
    this.scene.cameras.main.flash(280, flash, 240, 200);

    const totalMs =
      Math.max(timing.rainbowMs, timing.bannerHoldMs + timing.bannerFadeMs) + 80;
    this.scene.time.delayedCall(totalMs, () => args.onComplete());
  }

  /**
   * Arcoíris temático: nace cerca del merge/arca y se abre sobre el tablero.
   * Depth del clímax > Rayo / fusiones normales.
   */
  private playArkRainbow(
    originX: number,
    originY: number,
    timing: {
      rainbowMs: number;
    }
  ): void {
    const cfg = this.config.arkComplete;
    const g = this.scene.add.graphics().setDepth(cfg.depth);
    const colors = cfg.rainbowColors;
    const cx = Phaser.Math.Clamp(originX, 80, LOGICAL_WIDTH - 80);
    const cy = Math.min(originY + 40, LOGICAL_HEIGHT - 120);
    const proxy = { t: 0 };

    const draw = (t: number): void => {
      g.clear();
      const sweep = Phaser.Math.Clamp(t, 0, 1);
      const start = Math.PI + 0.15;
      const end = start + Math.PI * 0.92 * sweep;
      for (let i = 0; i < colors.length; i++) {
        const radius = cfg.arcRadiusMin + i * cfg.rainbowGap;
        g.lineStyle(cfg.rainbowStroke, colors[i], 0.92 - i * 0.04);
        g.beginPath();
        g.arc(cx, cy, Math.min(radius, cfg.arcRadiusMax), start, end, false);
        g.strokePath();
      }
    };

    draw(0);
    this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: timing.rainbowMs * 0.55,
      ease: "Cubic.easeOut",
      onUpdate: () => draw(proxy.t),
      onComplete: () => {
        this.scene.tweens.add({
          targets: g,
          alpha: 0,
          delay: timing.rainbowMs * 0.25,
          duration: timing.rainbowMs * 0.35,
          ease: "Sine.easeIn",
          onComplete: () => g.destroy()
        });
      }
    });
  }

  private playArkBanner(
    args: {
      firstTime: boolean;
      scoreBonus: number;
      oliveReward: number;
    },
    timing: {
      bannerHoldMs: number;
      bannerFadeMs: number;
      bannerFontSize: number;
      bonusFontSize: number;
    }
  ): void {
    const cfg = this.config.arkComplete;
    const root = this.scene.add.container(LOGICAL_WIDTH / 2, 300).setDepth(cfg.depth + 1);
    root.setAlpha(0).setScale(args.firstTime ? 0.7 : 0.85);

    const title = this.scene.add
      .bitmapText(
        0,
        -22,
        BALOO_BITMAP_KEY,
        t({
          es: "¡El arca está completa!",
          en: "The ark is complete!",
          pt: "A arca está completa!"
        }),
        timing.bannerFontSize
      )
      .setOrigin(0.5)
      .setCenterAlign();

    const scoreLine = this.scene.add
      .bitmapText(0, 14, BALOO_BITMAP_KEY, `+${args.scoreBonus}`, timing.bonusFontSize)
      .setOrigin(0.5)
      .setCenterAlign();

    const oliveIcon = this.scene.add
      .image(-28, 42, "icon_olivo")
      .setDisplaySize(20, 20)
      .setOrigin(0.5);
    const oliveLine = this.scene.add
      .bitmapText(10, 42, BALOO_BITMAP_KEY, `+${args.oliveReward}`, timing.bonusFontSize - 2)
      .setOrigin(0.5)
      .setCenterAlign();

    if (this.isWebGL) {
      title.setTint(0xfff6d8);
      scoreLine.setTint(0xffe08a);
      oliveLine.setTint(0xc8e6a0);
    }
    if (args.oliveReward <= 0) {
      oliveIcon.setVisible(false);
      oliveLine.setVisible(false);
    }

    root.add([title, scoreLine, oliveIcon, oliveLine]);

    this.scene.tweens.add({
      targets: root,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: "Back.easeOut"
    });
    this.scene.tweens.add({
      targets: root,
      alpha: 0,
      y: 260,
      delay: timing.bannerHoldMs,
      duration: timing.bannerFadeMs,
      ease: "Cubic.easeIn",
      onComplete: () => root.destroy(true)
    });
  }

  /** Sube el techo global de partículas; no baja si ya hay un boost mayor. */
  private beginParticleBoost(cap: number): void {
    const next = Math.max(this.config.particles.globalCap, cap);
    this.particleCapOverride = Math.max(
      this.particleCapOverride ?? 0,
      next
    );
  }

  private endParticleBoost(): void {
    this.particleCapOverride = null;
  }

  get landImpactThreshold(): number {
    return this.config.land.minImpactSpeed;
  }

  /** False con prefers-reduced-motion o con el juice apagado. */
  get motionEnabled(): boolean {
    return this.isEnabled();
  }

  get debugBreathingCount(): number {
    let count = 0;
    for (let i = 0; i < this.visuals.length; i++) {
      if (this.visuals[i].alive) count++;
    }
    return count;
  }

  get debugFirstBreathPhase(): number {
    for (let i = 0; i < this.visuals.length; i++) {
      if (this.visuals[i].alive) return this.visuals[i].breathPhase;
    }
    return this.preview ? this.previewBreathPhase : 0;
  }

  get debugVisualCount(): number {
    return this.visuals.length;
  }

  get debugActiveParticleCount(): number {
    return this.aliveParticleCount();
  }

  get debugComboCount(): number {
    return this.comboCount;
  }

  get debugLastLandTier(): number {
    return this.lastLandTier;
  }

  get debugLastLandIntensity(): number {
    return this.lastLandIntensity;
  }

  get debugShakesTriggered(): number {
    return this.shakesTriggered;
  }

  get debugDustBursts(): number {
    return this.dustBursts;
  }

  get debugMaxCombo(): number {
    return this.maxCombo;
  }

  get debugTotalCombos(): number {
    return this.totalCombos;
  }

  get debugComboTextsShown(): number {
    return this.comboTextsShown;
  }

  setLogMerges(enabled: boolean): boolean {
    this.config.debug.logMerges = enabled;
    return enabled;
  }

  /** Estado de las texturas x2..x8 y de la última posición usada. */
  comboTextureReport(): {
    font: string;
    range: string;
    depth: number;
    poolSize: number;
    lastShownAt: number;
    lastX: number;
    lastY: number;
  } {
    const cfg = this.config.combo;
    return {
      font: BALOO_BITMAP_KEY,
      range: `x${cfg.minDisplayed}..x${cfg.maxDisplayed}`,
      depth: this.config.depths.root,
      poolSize: cfg.poolSize,
      lastShownAt: this.lastComboAt,
      lastX: this.lastComboX,
      lastY: this.lastComboY
    };
  }

  /**
   * Distribución de la separación entre fusiones. `captured` dice cuántas
   * fusiones encadenarían con cada ventana candidata.
   */
  mergeGapReport(): {
    samples: number;
    minMs: number;
    p25Ms: number;
    medianMs: number;
    p75Ms: number;
    p90Ms: number;
    maxMs: number;
    buckets: Record<string, number>;
    captured: Record<string, string>;
  } {
    const sorted = this.mergeGaps.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const at = (q: number): number =>
      n === 0 ? 0 : Math.round(sorted[Math.min(n - 1, Math.floor(q * n))]);

    const edges = [400, 700, 1000, 1500, 2500];
    const buckets: Record<string, number> = {
      "0-400": 0,
      "400-700": 0,
      "700-1000": 0,
      "1000-1500": 0,
      "1500-2500": 0,
      "2500+": 0
    };
    const labels = Object.keys(buckets);
    for (let i = 0; i < n; i++) {
      let index = edges.length;
      for (let e = 0; e < edges.length; e++) {
        if (sorted[i] < edges[e]) {
          index = e;
          break;
        }
      }
      buckets[labels[index]]++;
    }

    const captured: Record<string, string> = {};
    const windows = this.config.debug.candidateWindowsMs;
    for (let i = 0; i < windows.length; i++) {
      let count = 0;
      for (let j = 0; j < n; j++) if (sorted[j] <= windows[i]) count++;
      const pct = n === 0 ? 0 : Math.round((count / n) * 100);
      captured[`${windows[i]}ms`] = `${count}/${n} (${pct}%)`;
    }

    return {
      samples: n,
      minMs: at(0),
      p25Ms: at(0.25),
      medianMs: at(0.5),
      p75Ms: at(0.75),
      p90Ms: at(0.9),
      maxMs: n === 0 ? 0 : Math.round(sorted[n - 1]),
      buckets,
      captured
    };
  }

  destroy(): void {
    this.arkParticleBoostTimer?.remove(false);
    this.arkParticleBoostTimer = null;
    this.endLightning();
    this.endParticleBoost();
    this.previewBobTween?.stop();
    this.previewBobTween = null;
    this.preview = null;
    this.previewGlow = null;
    this.previewGhost?.destroy();
    this.previewGhost = null;
    this.visuals.length = 0;
    this.root.destroy(true);
  }

  private isEnabled(): boolean {
    return this.config.enabled && juiceEnabled && !this.reducedMotion;
  }

  private createBurstEmitters(): void {
    const cfg = this.config.particles;
    const maxP = this.emitterHardCap();
    const scales = [
      cfg.scaleMin,
      (cfg.scaleMin + cfg.scaleMax) * 0.5,
      cfg.scaleMax
    ];

    for (let i = 0; i < scales.length; i++) {
      const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE, {
        emitting: false,
        frequency: -1,
        angle: { min: 0, max: 360 },
        speed: { min: cfg.speedMin, max: cfg.speedMax },
        gravityY: cfg.gravityY,
        lifespan: { min: cfg.lifespanMin, max: cfg.lifespanMax },
        scale: { start: scales[i], end: 0 },
        alpha: { start: cfg.alphaStart, end: 0 },
        maxParticles: maxP
      });
      emitter.setBlendMode(Phaser.BlendModes.ADD);
      this.root.add(emitter);
      this.burstEmitters.push(emitter);
    }
  }

  private createRingPool(): void {
    const size =
      this.quality === "high"
        ? this.config.ring.poolSizeHigh
        : this.config.ring.poolSizeLow;
    for (let i = 0; i < size; i++) {
      const ring = this.scene.add
        .image(0, 0, RING_TEXTURE)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false)
        .setActive(false);
      this.root.add(ring);
      this.rings.push(ring);
    }
  }

  private createPickReticlePool(): void {
    const cfg = this.config.pickReticle;
    for (let i = 0; i < cfg.poolSize; i++) {
      const img = this.scene.add
        .image(0, 0, RETICLE_TEXTURE)
        .setTint(cfg.color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false)
        .setActive(false);
      this.root.add(img);
      this.pickReticles.push(img);
    }
  }

  private spinPickReticles(delta: number): void {
    if (this.pickReticleActive <= 0) return;
    const step =
      Phaser.Math.DegToRad(this.config.pickReticle.spinDegPerSec) *
      (delta / 1000);
    for (let i = 0; i < this.pickReticleActive; i++) {
      this.pickReticles[i].rotation += step;
    }
  }

  private createDustEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    const cfg = this.config.dust;
    const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      emitting: false,
      frequency: -1,
      angle: { min: cfg.angleMin, max: cfg.angleMax },
      speed: { min: cfg.speedMin, max: cfg.speedMax },
      gravityY: cfg.gravityY,
      lifespan: cfg.lifespanMs,
      scale: { start: cfg.scaleStart, end: 0 },
      alpha: { start: cfg.alphaStart, end: 0 },
      tint: cfg.color,
      maxParticles: this.emitterHardCap()
    });
    this.root.add(emitter);
    return emitter;
  }

  private createTapEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    const cfg = this.config.tap;
    const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      emitting: false,
      frequency: -1,
      angle: { min: 0, max: 360 },
      speed: { min: cfg.speedMin, max: cfg.speedMax },
      gravityY: cfg.gravityY,
      lifespan: cfg.lifespanMs,
      scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
      alpha: { start: cfg.alphaStart, end: 0 },
      tint: cfg.color,
      maxParticles: this.emitterHardCap()
    });
    // NORMAL: suaves, no aditivas (el tap no debe “brillar”).
    this.root.add(emitter);
    return emitter;
  }

  private createFeatherEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    const cfg = this.config.raven;
    const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      emitting: false,
      frequency: -1,
      angle: { min: 0, max: 360 },
      speed: { min: cfg.featherSpeedMin, max: cfg.featherSpeedMax },
      gravityY: cfg.featherGravityY,
      lifespan: cfg.featherLifespanMs,
      scale: { start: cfg.featherScale, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: cfg.featherColor,
      maxParticles: this.emitterHardCap()
    });
    this.root.add(emitter);
    return emitter;
  }

  private createBubbleEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    const cfg = this.config.waters;
    const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      emitting: false,
      frequency: -1,
      angle: { min: -110, max: -70 },
      speed: { min: cfg.bubbleSpeedMin, max: cfg.bubbleSpeedMax },
      gravityY: -20,
      lifespan: cfg.bubbleLifespanMs,
      scale: { start: 0.28, end: 0.08 },
      alpha: { start: 0.55, end: 0 },
      tint: 0xd8f0ff,
      maxParticles: this.emitterHardCap()
    });
    this.root.add(emitter);
    return emitter;
  }

  /** Tope duro de cada emisor: admite boosts temporales (Rayo / arca / aguas). */
  private emitterHardCap(): number {
    return Math.max(
      this.config.particles.globalCap,
      this.config.lightning.particleCapMax,
      this.config.arkComplete.particleCap,
      this.config.waters.particleCap
    );
  }

  private findMergePiece(
    tier: number,
    x: number,
    y: number
  ): JuicePieceVisual | null {
    for (let i = this.visuals.length - 1; i >= 0; i--) {
      const piece = this.visuals[i];
      if (
        piece.alive &&
        piece.tier === tier &&
        Math.abs(piece.visual.x - x) < 0.5 &&
        Math.abs(piece.visual.y - y) < 0.5
      ) {
        return piece;
      }
    }
    return null;
  }

  private findNearestPiece(
    tier: number,
    x: number,
    y: number
  ): JuicePieceVisual | null {
    let nearest: JuicePieceVisual | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    for (let i = this.visuals.length - 1; i >= 0; i--) {
      const piece = this.visuals[i];
      if (!piece.alive || piece.tier !== tier) continue;
      const dx = piece.visual.x - x;
      const dy = piece.visual.y - y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearest = piece;
        nearestDistanceSq = distanceSq;
      }
    }
    return nearest;
  }

  private playMergeSquash(piece: JuicePieceVisual): void {
    const cfg = this.config.mergeSquash;
    // Merge gana sobre land: ambos usan el mismo estado compuesto.
    if (piece.landSquashActive) {
      this.scene.tweens.killTweensOf(piece);
      piece.landSquashActive = false;
    }
    piece.mergeSquashActive = true;
    piece.squashX = cfg.start;
    piece.squashY = cfg.start;
    this.scene.tweens.add({
      targets: piece,
      squashX: cfg.overshoot,
      squashY: cfg.overshoot,
      duration: cfg.riseMs,
      ease: cfg.ease,
      onComplete: () => {
        if (!piece.alive) return;
        this.scene.tweens.add({
          targets: piece,
          squashX: 1,
          squashY: 1,
          duration: cfg.settleMs,
          ease: cfg.settleEase,
          onComplete: () => {
            if (piece.alive) piece.mergeSquashActive = false;
          }
        });
      }
    });
  }

  private playLandSquash(
    piece: JuicePieceVisual,
    intensity: number
  ): boolean {
    if (
      !piece.alive ||
      piece.mergeSquashActive ||
      piece.landSquashActive
    ) {
      return false;
    }

    const cfg = this.config.land;
    const amount = cfg.squashAmount * intensity;
    piece.landSquashActive = true;
    piece.squashX = 1 + amount;
    piece.squashY = 1 - amount;
    this.scene.tweens.add({
      targets: piece,
      squashX: 1,
      squashY: 1,
      duration: cfg.squashDurationMs,
      ease: cfg.squashEase,
      onComplete: () => {
        if (piece.alive) piece.landSquashActive = false;
      }
    });
    return true;
  }

  private playMergeFlash(piece: JuicePieceVisual): void {
    piece.visual.setTintFill(this.config.mergeFlash.color);
    this.scene.time.delayedCall(this.config.mergeFlash.durationMs, () => {
      if (piece.alive) piece.visual.clearTint();
    });
  }

  private emitMergeParticles(tier: number, x: number, y: number): void {
    const cfg = this.config.particles;
    // tier 2 es la fusión más baja, así que la rampa arranca ahí.
    const tierStepsAboveBase = tier - 2;
    const count =
      this.quality === "high"
        ? Math.min(
            cfg.highMaxCount,
            Math.round(cfg.highBaseCount + tierStepsAboveBase * cfg.highTierStep)
          )
        : Math.min(
            cfg.lowMaxCount,
            Math.round(cfg.lowBaseCount + tierStepsAboveBase * cfg.lowTierStep)
          );

    if (this.aliveParticleCount() + count > this.effectiveParticleCap()) return;

    const emitterIndex =
      tier <= cfg.smallMaxTier ? 0 : tier <= cfg.mediumMaxTier ? 1 : 2;
    const emitter = this.burstEmitters[emitterIndex];
    emitter.setParticleTint(this.config.tierColors[tier]);
    emitter.emitParticleAt(x, y, count);
  }

  private emitDust(
    tier: number,
    x: number,
    y: number,
    intensity: number
  ): void {
    const cfg = this.config.dust;
    const normalizedAboveThreshold =
      (intensity - cfg.minIntensity) / (1 - cfg.minIntensity);
    const count = Math.round(
      cfg.minCount +
        normalizedAboveThreshold * (cfg.maxCount - cfg.minCount)
    );
    if (
      this.aliveParticleCount() + count >
      this.effectiveParticleCap()
    ) {
      return;
    }

    const contactY =
      y + getAnimal(tier).radius * cfg.contactOffsetRadius;
    this.dustEmitter.emitParticleAt(x, contactY, count);
    this.dustBursts++;
  }

  private aliveParticleCount(): number {
    let count = 0;
    for (let i = 0; i < this.burstEmitters.length; i++) {
      count += this.burstEmitters[i].getAliveParticleCount();
    }
    if (this.dustEmitter) {
      count += this.dustEmitter.getAliveParticleCount();
    }
    if (this.featherEmitter) {
      count += this.featherEmitter.getAliveParticleCount();
    }
    if (this.bubbleEmitter) {
      count += this.bubbleEmitter.getAliveParticleCount();
    }
    if (this.tapEmitter) {
      count += this.tapEmitter.getAliveParticleCount();
    }
    return count;
  }

  private playMergeShake(tier: number): void {
    const cfg = this.config.shake;
    const camera = this.scene.cameras.main;
    if (
      this.reducedMotion ||
      tier < cfg.minTier ||
      camera.shakeEffect.isRunning
    ) {
      return;
    }

    const progress = Phaser.Math.Clamp(
      (tier - cfg.minTier) / (cfg.maxTier - cfg.minTier),
      0,
      1
    );
    const intensity = Phaser.Math.Linear(
      cfg.minIntensity,
      cfg.maxIntensity,
      progress
    );
    // Phaser calcula el offset como intensity * viewport * zoom, y el viewport
    // ya creció por renderScale, así que sin dividir por el zoom la sacudida se
    // duplicaría en HiDPI. Dividiendo, juiceConfig sigue siendo fracción de
    // pantalla y el tuneo de Fase 2 se conserva tal cual.
    camera.shake(cfg.durationMs, intensity / camera.zoom);
    this.shakesTriggered++;
  }

  private recordMergeGap(tier: number): void {
    const cfg = this.config.debug;
    const now = this.scene.time.now;
    const gap = this.lastMergeLogAt >= 0 ? now - this.lastMergeLogAt : -1;
    this.lastMergeLogAt = now;

    if (gap >= 0) {
      this.mergeGaps.push(gap);
      if (this.mergeGaps.length > cfg.mergeGapSamples) this.mergeGaps.shift();
    }

    if (!cfg.logMerges) return;
    const windowMs = this.config.combo.windowMs;
    const gapLabel = gap < 0 ? "primera" : `${Math.round(gap)}ms`;
    const verdict =
      gap < 0 ? "—" : gap <= windowMs ? "ENCADENA" : "fuera de ventana";
    console.log(
      `[merge] tier=${tier} t=${Math.round(now)}ms Δ=${gapLabel} ` +
        `ventana=${windowMs}ms → ${verdict}`
    );
  }

  private updateCombo(x: number, y: number): void {
    const now = this.scene.time.now;
    if (
      this.lastMergeAt >= 0 &&
      now - this.lastMergeAt <= this.config.combo.windowMs
    ) {
      this.comboCount++;
    } else {
      this.comboCount = 1;
    }
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    // Sólo al cruzar el umbral: una cascada x4 cuenta como un combo, no tres.
    if (this.comboCount === this.config.combo.minDisplayed) this.totalCombos++;
    this.lastMergeAt = now;
    this.lastMergeX = x;
    this.lastMergeY = y;
    this.onCombo(this.comboCount);
  }

  /** Dispara el visual de combo sin depender de lograr una cascada real. */
  forceCombo(
    count: number,
    x?: number,
    y?: number
  ): { count: number; text: string; x: number; y: number; depth: number } {
    const cfg = this.config.combo;
    const displayed = Phaser.Math.Clamp(
      Math.round(count),
      cfg.minDisplayed,
      cfg.maxDisplayed
    );
    this.lastMergeX = x ?? LOGICAL_WIDTH / 2;
    this.lastMergeY = y ?? LOGICAL_HEIGHT / 2;
    this.playComboText(displayed);
    return {
      count: displayed,
      text: `x${displayed}`,
      x: this.lastComboX,
      y: this.lastComboY,
      depth: this.config.depths.root
    };
  }

  private playComboText(count: number): void {
    const cfg = this.config.combo;
    const displayedCount = Math.min(count, cfg.maxDisplayed);
    const shout = count >= cfg.shoutFrom;
    const label = shout
      ? `x${displayedCount}\n${t(comboShoutFor(displayedCount))}`
      : `x${displayedCount}`;

    const gen = ++this.comboShoutGen;

    const startY = shout
      ? cfg.shoutY
      : Math.max(cfg.minY, this.lastMergeY - cfg.offsetY);
    const startX = shout ? LOGICAL_WIDTH / 2 : this.lastMergeX;
    const scale =
      cfg.baseScale +
      (displayedCount - cfg.minDisplayed) * cfg.scaleStep +
      (shout ? 0.18 : 0);
    this.lastComboX = startX;
    this.lastComboY = startY;
    this.lastComboAt = this.scene.time.now;
    this.comboTextsShown++;
    const anim = shout ? { ...cfg, holdMs: cfg.holdMs + 160 } : cfg;

    if (!this.isWebGL) {
      const color = shout ? comboShoutColor(displayedCount) : "#fff2c8";
      let txt = this.canvasComboText;
      if (txt) {
        this.scene.tweens.killTweensOf(txt);
        txt.setText(label).setAlpha(1).setColor(color);
      } else {
        txt = this.scene.add.text(0, 0, label, {
          fontFamily: NUNITO_FAMILY,
          fontSize: "38px",
          fontStyle: "bold",
          color,
          stroke: "#2a1208",
          strokeThickness: 5,
          align: "center"
        }).setOrigin(0.5);
        this.root.add(txt);
        this.canvasComboText = txt;
      }
      this.root.bringToTop(txt);
      txt.setPosition(startX, startY)
        .setScale(scale * cfg.popScale)
        .setAlpha(1);
      this.playReadableText(txt, scale, startY, anim, () => {
        if (gen !== this.comboShoutGen) return;
        txt.setVisible(false);
        if (this.canvasComboText === txt) this.canvasComboText = null;
      });
      txt.setVisible(true);
      return;
    }

    // WebGL: BitmapText con tint + sombra
    const tint = shout ? comboShoutTint(displayedCount) : 0xfff2c8;
    let bt = this.comboShout;
    if (bt) {
      this.scene.tweens.killTweensOf(bt);
      bt.setText(label).setAlpha(1);
    } else {
      bt = this.comboPool.acquire(label);
      if (!bt) return;
      this.comboShout = bt;
    }
    if (shout) bt.setCenterAlign().setLineSpacing(6);
    else bt.setLeftAlign().setLineSpacing(0);

    let shadow = this.comboShadow;
    if (shadow) {
      this.scene.tweens.killTweensOf(shadow);
      shadow.setText(label).setAlpha(0.9);
    } else {
      shadow = this.comboPool.acquire(label);
      if (shadow) this.comboShadow = shadow;
    }
    if (shadow) {
      if (shout) shadow.setCenterAlign().setLineSpacing(6);
      else shadow.setLeftAlign().setLineSpacing(0);
    }

    if (shadow) {
      shadow
        .setPosition(startX + 3, startY + 4)
        .setScale(scale * cfg.popScale)
        .setAlpha(0.9)
        .setTint(0x2a1208);
      this.root.bringToTop(shadow);
      this.playReadableText(shadow, scale, startY + 4, anim, () => {
        if (gen !== this.comboShoutGen) return;
        this.comboPool.release(shadow!);
        if (this.comboShadow === shadow) this.comboShadow = null;
      });
    }
    this.root.bringToTop(bt);
    bt.setPosition(startX, startY)
      .setScale(scale * cfg.popScale)
      .setAlpha(1)
      .setTint(tint);
    this.playReadableText(bt, scale, startY, anim, () => {
      if (gen !== this.comboShoutGen) return;
      this.comboPool.release(bt);
      if (this.comboShout === bt) this.comboShout = null;
    });
  }

  /**
   * Perfil legible en tres actos: overshoot de escala, pausa quieto y recién
   * ahí sube desvaneciéndose. Sin la pausa el texto es ilegible en móvil.
   */
  private playReadableText(
    target: Phaser.GameObjects.Image | Phaser.GameObjects.BitmapText | Phaser.GameObjects.Text,
    scale: number,
    startY: number,
    cfg: {
      popMs: number;
      holdMs: number;
      fadeMs: number;
      risePx: number;
      popEase: string;
      fadeEase: string;
    },
    onDone: () => void
  ): void {
    this.scene.tweens.add({
      targets: target,
      scaleX: scale,
      scaleY: scale,
      duration: cfg.popMs,
      ease: cfg.popEase
    });
    this.scene.tweens.add({
      targets: target,
      y: startY - cfg.risePx,
      alpha: 0,
      delay: cfg.popMs + cfg.holdMs,
      duration: cfg.fadeMs,
      ease: cfg.fadeEase,
      onComplete: onDone
    });
  }

  private playRing(tier: number, x: number, y: number): void {
    let ring: Phaser.GameObjects.Image | null = null;
    for (let i = 0; i < this.rings.length; i++) {
      if (!this.rings[i].active) {
        ring = this.rings[i];
        break;
      }
    }
    if (!ring) return;

    const radius = this.getTierRadius(tier);
    const targetScale =
      (radius * 2 * this.config.ring.radiusMultiplier) /
      this.config.runtimeTextures.ringSize;
    ring
      .setPosition(x, y)
      .setTint(this.config.tierColors[tier])
      .setScale(this.config.ring.startScale)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: ring,
      scaleX: targetScale,
      scaleY: targetScale,
      alpha: 0,
      duration: this.config.ring.durationMs,
      ease: this.config.ring.ease,
      onComplete: () => {
        ring?.setActive(false).setVisible(false).clearTint();
      }
    });
  }

  private playTapRing(x: number, y: number): void {
    let ring: Phaser.GameObjects.Image | null = null;
    for (let i = 0; i < this.rings.length; i++) {
      if (!this.rings[i].active) {
        ring = this.rings[i];
        break;
      }
    }
    if (!ring) return;

    const cfg = this.config.tap;
    ring
      .setPosition(x, y)
      .setTint(cfg.ringColor)
      .setScale(cfg.ringStartScale)
      .setAlpha(cfg.ringAlpha)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: ring,
      scaleX: cfg.ringEndScale,
      scaleY: cfg.ringEndScale,
      alpha: 0,
      duration: cfg.durationMs,
      ease: cfg.ease,
      onComplete: () => {
        ring?.setActive(false).setVisible(false).clearTint();
      }
    });
  }

  private emitTapParticles(x: number, y: number): void {
    const cfg = this.config.tap;
    const count =
      this.quality === "high" ? cfg.particleCountHigh : cfg.particleCountLow;
    if (this.aliveParticleCount() + count > this.effectiveParticleCap()) return;
    this.tapEmitter.emitParticleAt(x, y, count);
  }

  private playFloatingScore(tier: number, x: number, y: number): void {
    const points = tier * MERGE_SCORE_MULT;
    const bt = this.scorePool.acquire(`+${points}`);
    if (!bt) return;

    const cfg = this.config.floatingScore;
    const scale = cfg.baseScale + (tier - 2) * cfg.tierScaleStep;
    bt.setPosition(x, y)
      .setScale(scale * cfg.popScale)
      .setAlpha(1)
      .setTint(0xffffff);
    this.playReadableText(bt, scale, y, cfg, () => this.scorePool.release(bt));
  }

  private getTierRadius(tier: number): number {
    return getAnimal(tier).radius;
  }

  private static generateParticleTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PARTICLE_TEXTURE)) return;
    const size = juiceConfig.runtimeTextures.particleSize;
    const center = size / 2;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let radius = center; radius >= 2; radius -= 2) {
      const alpha = 0.035 + (center - radius) * 0.012;
      graphics.fillStyle(0xffffff, alpha);
      graphics.fillCircle(center, center, radius);
    }
    graphics.generateTexture(PARTICLE_TEXTURE, size, size);
    graphics.destroy();
  }

  private static generateRingTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(RING_TEXTURE)) return;
    const size = juiceConfig.runtimeTextures.ringSize;
    const center = size / 2;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.lineStyle(juiceConfig.runtimeTextures.ringStroke, 0xffffff, 1);
    graphics.strokeCircle(center, center, center - 3);
    graphics.generateTexture(RING_TEXTURE, size, size);
    graphics.destroy();
  }

  /** Círculo + cruz para poderes pick-piece. */
  private static generatePickReticleTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(RETICLE_TEXTURE)) return;
    const cfg = juiceConfig.pickReticle;
    const size = cfg.textureSize;
    const c = size / 2;
    const r = c - cfg.stroke - 2;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(cfg.stroke, 0xffffff, 1);
    g.strokeCircle(c, c, r);
    const arm = r * 0.55;
    g.lineBetween(c - arm, c - arm, c + arm, c + arm);
    g.lineBetween(c + arm, c - arm, c - arm, c + arm);
    g.generateTexture(RETICLE_TEXTURE, size, size);
    g.destroy();
  }

  /** Aura suave del preview: mismo soft-circle que las partículas, más grande. */
  private static generateGlowTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(GLOW_TEXTURE)) return;
    const size = juiceConfig.preview.glowSize;
    const center = size / 2;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    for (let radius = center; radius >= 2; radius -= 2) {
      const t = 1 - radius / center;
      const alpha = 0.02 + t * t * 0.45;
      graphics.fillStyle(0xffffff, alpha);
      graphics.fillCircle(center, center, radius);
    }
    graphics.generateTexture(GLOW_TEXTURE, size, size);
    graphics.destroy();
  }

  /** Silueta oscura placeholder del cuervo (cuerpo + alas). */
  private static generateRavenTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(RAVEN_TEXTURE)) return;
    const size = juiceConfig.raven.birdTextureSize;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    // Cuerpo
    g.fillEllipse(size * 0.5, size * 0.55, size * 0.28, size * 0.42);
    // Alas
    g.fillTriangle(
      size * 0.5,
      size * 0.45,
      size * 0.08,
      size * 0.62,
      size * 0.42,
      size * 0.58
    );
    g.fillTriangle(
      size * 0.5,
      size * 0.45,
      size * 0.92,
      size * 0.62,
      size * 0.58,
      size * 0.58
    );
    // Cabeza / pico
    g.fillCircle(size * 0.5, size * 0.28, size * 0.12);
    g.fillTriangle(
      size * 0.5,
      size * 0.22,
      size * 0.5,
      size * 0.34,
      size * 0.72,
      size * 0.28
    );
    g.generateTexture(RAVEN_TEXTURE, size, size);
    g.destroy();
  }
}
