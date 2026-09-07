import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";
import { punchOliveLabel, tweenOliveCounter } from "./oliveFly";

/**
 * Fila 1 del HUD: ajustes, sin anuncios, hojas, puntaje/récord, próxima pieza.
 */
export class TopHud {
  private readonly root: Phaser.GameObjects.Container;
  private readonly olivesBg: Phaser.GameObjects.Image;
  private readonly olivesIcon: Phaser.GameObjects.Image;
  private readonly olivesText: Phaser.GameObjects.Text;
  private olivesShown = 0;
  private readonly scoreBg: Phaser.GameObjects.Image;
  private readonly triumphIcon: Phaser.GameObjects.Image;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly noAdsBg: Phaser.GameObjects.Image;
  private readonly noAdsIcon: Phaser.GameObjects.Image;
  private readonly nextBg: Phaser.GameObjects.Image;
  private readonly nextLabel: Phaser.GameObjects.Text;
  private nextIcon: Phaser.GameObjects.Image;
  private readonly nextCx: number;
  private readonly secondChanceRoot: Phaser.GameObjects.Container;
  private readonly secondChanceBadge: Phaser.GameObjects.Image;
  private readonly secondChanceText: Phaser.GameObjects.Text;
  private readonly hitZones: { id: string; x: number; y: number; w: number; h: number }[] =
    [];

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number,
    _animalScale: (tier: number) => number,
    nextLevel: number,
    best: number,
    score: number,
    private readonly onOpenShop?: () => void,
    adsRemoved = false,
    private readonly onOpenSettings?: () => void
  ) {
    const L = HUD_LAYOUT.fila1;
    this.root = scene.add.container(0, 0).setDepth(HUD_LAYOUT.depth.top);

    // Ajustes
    const set = L.settings;
    const settingsBg = scene.add
      .image(set.cx, L.centerY, "hud_button")
      .setDisplaySize(set.size, set.size)
      .setInteractive({ useHandCursor: true });
    const settingsIcon = scene.add
      .text(set.cx, L.centerY, "⚙", this.textStyle(set.iconSize, "#5a4030"))
      .setOrigin(0.5);
    settingsBg.on("pointerdown", () => {
      GameAudio.current?.onUiTap();
      this.onOpenSettings?.();
    });
    this.root.add([settingsBg, settingsIcon]);
    this.hitZones.push({
      id: "settings",
      x: set.cx - set.size / 2,
      y: L.centerY - set.size / 2,
      w: set.size,
      h: set.size
    });

    // Sin anuncios
    const na = L.noAds;
    this.noAdsBg = scene.add
      .image(na.cx, L.centerY, "hud_button")
      .setDisplaySize(na.size, na.size)
      .setInteractive({ useHandCursor: true });
    this.noAdsIcon = scene.add
      .image(na.cx, L.centerY, "icon_no_ads_2")
      .setDisplaySize(na.iconSize, na.iconSize)
      .setOrigin(0.5);
    this.noAdsBg.on("pointerdown", () => {
      GameAudio.current?.onUiTap();
      if (this.onOpenShop) this.onOpenShop();
    });
    this.root.add([this.noAdsBg, this.noAdsIcon]);
    this.hitZones.push({
      id: "no-ads",
      x: na.cx - na.size / 2,
      y: L.centerY - na.size / 2,
      w: na.size,
      h: na.size
    });

    // Hojas: olivo_container + hoja_olivo + número
    const ol = L.olives;
    this.olivesBg = scene.add
      .image(ol.cx, L.centerY, "olivo_container")
      .setDisplaySize(ol.w, ol.h)
      .setInteractive({ useHandCursor: true });
    this.olivesIcon = scene.add
      .image(ol.cx + ol.iconX, L.centerY, "hoja_olivo")
      .setDisplaySize(ol.iconSize, ol.iconSize)
      .setOrigin(0.5);
    this.olivesText = scene.add
      .text(ol.cx + ol.textX, L.centerY, "0", {
        ...this.textStyle(ol.textFont, ol.textColor, true),
        align: "center"
      })
      .setOrigin(0.5);
    this.olivesBg.on("pointerdown", () => {
      GameAudio.current?.onUiTap();
      this.onOpenShop?.();
    });
    this.root.add([this.olivesBg, this.olivesIcon, this.olivesText]);
    this.hitZones.push({
      id: "olives",
      x: ol.cx - ol.w / 2,
      y: L.centerY - ol.h / 2,
      w: ol.w,
      h: ol.h
    });

    // Puntaje: score_container + triumph al lado del récord
    const sc = L.score;
    this.scoreBg = scene.add
      .image(sc.cx, L.centerY, "score_container")
      .setDisplaySize(sc.w, sc.h);
    this.scoreText = scene.add
      .text(sc.cx, sc.scoreY, String(score), this.textStyle(sc.scoreFont, sc.scoreColor, true))
      .setOrigin(0.5);
    this.triumphIcon = scene.add
      .image(sc.cx, sc.bestY, "triumph")
      .setDisplaySize(sc.triumphSize, sc.triumphSize)
      .setOrigin(0.5);
    this.bestText = scene.add
      .text(sc.cx, sc.bestY, "", this.textStyle(sc.bestFont, sc.bestColor, true))
      .setOrigin(0, 0.5);
    this.root.add([this.scoreBg, this.scoreText, this.triumphIcon, this.bestText]);
    this.layoutBest(best);

    const nx = L.next;
    this.nextCx = nx.right - nx.size / 2;
    this.nextBg = scene.add
      .image(this.nextCx, L.centerY, "hud_button")
      .setDisplaySize(nx.size, nx.size);
    this.nextLabel = scene.add
      .text(
        this.nextCx,
        L.centerY + nx.labelY,
        t({ es: "Sigue", en: "Next", pt: "Segue" }),
        this.textStyle(nx.labelFont, "#5a4030", true)
      )
      .setOrigin(0.5, 0.5);
    this.nextIcon = scene.add
      .image(this.nextCx, L.centerY + nx.iconY, `animal-${nextLevel}`)
      .setDisplaySize(nx.thumbSize, nx.thumbSize)
      .setOrigin(0.5);
    this.root.add([this.nextBg, this.nextLabel, this.nextIcon]);
    this.setAdsRemoved(adsRemoved);

    const SC = HUD_LAYOUT.secondChance;
    this.secondChanceBadge = scene.add
      .image(0, 0, "continue_badge")
      .setDisplaySize(SC.w, SC.h);
    this.secondChanceText = scene.add
      .text(0, SC.textY, "", this.textStyle(SC.font, SC.color, true))
      .setOrigin(0.5);
    this.secondChanceRoot = scene.add
      .container(195, SC.y, [this.secondChanceBadge, this.secondChanceText])
      .setDepth(HUD_LAYOUT.depth.top + 1)
      .setVisible(false)
      .setAlpha(0);
  }

  setScore(score: number): void {
    this.scoreText.setText(String(score));
  }

  setBest(best: number): void {
    this.layoutBest(best);
  }

  setOlives(n: number): void {
    this.olivesShown = Math.max(0, Math.floor(n));
    this.olivesText.setText(
      formatOliveCount(this.olivesShown, HUD_LAYOUT.fila1.olives.abbreviateFrom)
    );
  }

  tweenOlives(
    from: number,
    to: number,
    delayMs: number,
    durationMs: number
  ): void {
    tweenOliveCounter(
      this.olivesText.scene,
      from,
      to,
      delayMs,
      durationMs,
      (n) => this.setOlives(n)
    );
  }

  punchOlives(): void {
    punchOliveLabel(this.olivesText.scene, this.olivesText);
  }

  /** Comprado: marco dorado, no abre la tienda de IAP. */
  setAdsRemoved(removed: boolean): void {
    if (removed) {
      this.noAdsBg.setTint(0xf2c14e);
      this.noAdsIcon.clearTint().setAlpha(1);
      this.noAdsBg.disableInteractive();
    } else {
      this.noAdsBg.clearTint();
      this.noAdsIcon.clearTint().setAlpha(1);
      this.noAdsBg.setInteractive({ useHandCursor: true });
    }
  }

  setNextLevel(tier: number, _animalScale?: (t: number) => number): void {
    const thumb = HUD_LAYOUT.fila1.next.thumbSize;
    this.nextIcon.setTexture(`animal-${tier}`);
    this.nextIcon.setDisplaySize(thumb, thumb);
  }

  /**
   * Tras Continuar: pastilla visible el resto de la partida
   * (“última oportunidad” — la próxima pérdida cierra el run).
   */
  setSecondChance(active: boolean): void {
    const scene = this.secondChanceRoot.scene;
    scene.tweens.killTweensOf(this.secondChanceRoot);
    if (!active) {
      this.secondChanceRoot.setVisible(false).setAlpha(0).setScale(1);
      return;
    }
    this.secondChanceText.setText(
      t({
        es: "¡ÚLTIMA OPORTUNIDAD!",
        en: "LAST CHANCE!",
        pt: "ÚLTIMA CHANCE!"
      }).toUpperCase()
    );
    this.secondChanceRoot.setVisible(true).setAlpha(0).setScale(0.86);
    scene.tweens.add({
      targets: this.secondChanceRoot,
      alpha: 1,
      scale: 1,
      duration: 320,
      ease: "Back.Out"
    });
  }

  olivesAnchor(): { x: number; y: number } {
    return { x: HUD_LAYOUT.fila1.olives.cx, y: HUD_LAYOUT.fila1.centerY };
  }

  hitTest(worldX: number, worldY: number): boolean {
    for (let i = 0; i < this.hitZones.length; i++) {
      const z = this.hitZones[i];
      if (
        worldX >= z.x &&
        worldX <= z.x + z.w &&
        worldY >= z.y &&
        worldY <= z.y + z.h
      ) {
        return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.secondChanceRoot.destroy(true);
    this.root.destroy(true);
  }

  /** Trofeo + “Mejor N” centrados como bloque bajo el puntaje. */
  private layoutBest(best: number): void {
    const sc = HUD_LAYOUT.fila1.score;
    const prefix = t({ es: "Mejor", en: "Best", pt: "Recorde" });
    this.bestText.setText(`${prefix} ${best}`);
    const gap = sc.triumphGap;
    const total = sc.triumphSize + gap + this.bestText.width;
    const left = sc.cx - total / 2;
    this.triumphIcon.setPosition(left + sc.triumphSize / 2, sc.bestY);
    this.bestText.setPosition(left + sc.triumphSize + gap, sc.bestY);
  }

  private textStyle(
    fontSize: number,
    color: string,
    bold = false
  ): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: NUNITO_FAMILY,
      fontSize: `${fontSize}px`,
      color,
      fontStyle: bold ? "bold" : "normal",
      resolution: this.renderScale
    };
  }
}

/**
 * Abrevia ≥ abbreviateFrom (p. ej. 1000 → "1.2k").
 *
 * CUIDADO: si un poder cuesta 1200 y el saldo es 1150, "1.2k" vs "1.2k"
 * oculta que no alcanza. Con costos de 2 dígitos actuales no hay problema;
 * si suben a 4 dígitos, mostrar entero cerca del umbral de compra o
 * no abreviar en el modal de compra.
 */
function formatOliveCount(n: number, abbreviateFrom: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < abbreviateFrom) return String(v);
  if (v < 10_000) {
    const tenths = Math.round(v / 100) / 10;
    return `${tenths}k`.replace(/\.0k$/, "k");
  }
  return `${Math.round(v / 1000)}k`;
}
