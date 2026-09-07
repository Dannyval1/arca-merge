import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { getGameLocale, t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";

const SPARKLE_KEY = "go-sparkle";

export type GameOverPayload = {
  score: number;
  best: number;
  isNewBest: boolean;
  arkCompletes: number;
  olivesEarned: number;
};

type Handlers = {
  onPlayAgain: () => void;
  onShop: () => void;
  onHome: () => void;
};

/**
 * Overlay de Game Over. Marco = gameover-frame.png (animales incluidos).
 * Layout en HUD_LAYOUT.gameOver.
 */
export class GameOverModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly scoreBox: Phaser.GameObjects.Graphics;
  private readonly scoreGlow: Phaser.GameObjects.Graphics;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly ribbon: Phaser.GameObjects.Image;
  private readonly ribbonLabel: Phaser.GameObjects.Text;
  private readonly sparkles: Phaser.GameObjects.Image[] = [];
  private readonly statLabels: Phaser.GameObjects.Text[] = [];
  private readonly statValues: Phaser.GameObjects.Text[] = [];
  private readonly playLabel: Phaser.GameObjects.Text;
  private readonly shopLabel: Phaser.GameObjects.Text;
  private readonly homeLabel: Phaser.GameObjects.Text;
  private handlers: Handlers | null = null;
  private glowTween: Phaser.Tweens.Tween | null = null;
  private readonly glowPulse = { a: 0.35 };
  private lastData: GameOverPayload | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number
  ) {
    GameOverModal.ensureSparkle(scene);
    const G = HUD_LAYOUT.gameOver;
    const C = G.scoreBox;
    const depth = HUD_LAYOUT.depth.gameOver;

    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    const dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.78)
      .setInteractive();
    this.panel = scene.add.container(195, G.panelY);

    const frame = scene.add
      .image(0, 0, "gameover_frame")
      .setDisplaySize(G.frame.w, G.frame.h);

    const banner = scene.add
      .image(0, G.banner.y, "score_container")
      .setDisplaySize(G.banner.w, G.banner.h);

    this.titleText = scene.add
      .text(0, G.banner.y, "", {
        ...this.style(G.titleFont, G.titleColor, true),
        align: "center",
        lineSpacing: G.titleLineSpacing
      })
      .setOrigin(0.5);

    this.scoreBox = scene.add.graphics();
    this.scoreGlow = scene.add.graphics().setVisible(false);
    this.drawBox(this.scoreBox, C.y, C.w, C.h, C.radius, C.fill, C.stroke, C.strokeWidth);

    this.scoreText = scene.add
      .text(0, C.y + G.scoreOffsetY, "0", {
        ...this.style(G.scoreFont, G.scoreColor, true),
        align: "center"
      })
      .setOrigin(0.5);

    this.ribbon = scene.add
      .image(G.ribbon.ox, C.y + G.ribbon.oy, "ribbon_record")
      .setDisplaySize(G.ribbon.w, G.ribbon.h)
      .setRotation(G.ribbon.rot)
      .setVisible(false);
    this.ribbonLabel = scene.add
      .text(G.ribbon.ox, C.y + G.ribbon.oy - 1, "", {
        ...this.style(G.ribbon.font, "#5a3010", true),
        align: "center"
      })
      .setOrigin(0.5)
      .setRotation(G.ribbon.rot)
      .setVisible(false);

    for (let i = 0; i < 6; i++) {
      const sp = scene.add
        .image(0, 0, SPARKLE_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false)
        .setAlpha(0.85);
      this.sparkles.push(sp);
    }

    const S = G.stats;
    const statsW = S.w;
    const half = statsW / 2;
    const dividers = scene.add.graphics();
    dividers.lineStyle(S.dividerH, S.dividerColor, S.dividerAlpha);

    this.panel.add([
      frame,
      banner,
      this.titleText,
      this.scoreGlow,
      this.scoreBox,
      this.scoreText,
      this.ribbon,
      this.ribbonLabel,
      ...this.sparkles,
      dividers
    ]);

    const rowIcons = ["icon_elephant", "icon_leaf_branch", "icon_coin"];
    for (let i = 0; i < 3; i++) {
      const ry = S.firstY + i * S.rowH;
      const icon = scene.add
        .image(-half + 18, ry, rowIcons[i])
        .setDisplaySize(S.icon, S.icon);
      const label = scene.add
        .text(-half + 34, ry, "", {
          ...this.style(S.labelFont, "#6a5038"),
          wordWrap: { width: statsW - 80 }
        })
        .setOrigin(0, 0.5);
      const value = scene.add
        .text(half - 12, ry, "0", this.style(S.valueFont, "#5a3010", true))
        .setOrigin(1, 0.5);
      this.statLabels.push(label);
      this.statValues.push(value);
      this.panel.add([icon, label, value]);
      const lineY = ry + S.rowH / 2;
      dividers.lineBetween(-half, lineY, half, lineY);
    }

    this.makeButton(
      scene,
      0,
      G.play.y,
      "btn_green",
      G.play.w,
      G.play.h,
      () => this.handlers?.onPlayAgain()
    );
    this.playLabel = scene.add
      .text(0, G.play.y, "", this.style(G.play.font, G.play.color, true))
      .setOrigin(0.5);

    const sec = G.secondary;
    const shopX = -(sec.w + sec.gap) / 2;
    const homeX = (sec.w + sec.gap) / 2;
    this.makeButton(
      scene,
      shopX,
      sec.y,
      "btn_blue",
      sec.w,
      sec.h,
      () => this.handlers?.onShop()
    );
    this.shopLabel = scene.add
      .text(shopX, sec.y, "", this.style(sec.font, "#fff8f0", true))
      .setOrigin(0.5);
    this.makeButton(
      scene,
      homeX,
      sec.y,
      "btn_beige",
      sec.w,
      sec.h,
      () => this.handlers?.onHome()
    );
    this.homeLabel = scene.add
      .text(homeX, sec.y, "", this.style(sec.font, "#5a3010", true))
      .setOrigin(0.5);

    this.panel.add([this.playLabel, this.shopLabel, this.homeLabel]);
    this.root.add([dim, this.panel]);
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  show(data: GameOverPayload): void {
    this.lastData = data;
    this.paint(data);
    this.root.setVisible(true);
    this.root.setDepth(HUD_LAYOUT.depth.gameOver);
  }

  relabel(data?: GameOverPayload): void {
    const next = data ?? this.lastData;
    if (next) this.paint(next);
    else this.paintStrings();
  }

  destroy(): void {
    this.glowTween?.stop();
    this.root.destroy(true);
  }

  private paint(data: GameOverPayload): void {
    const G = HUD_LAYOUT.gameOver;
    const C = G.scoreBox;
    this.scoreText.setText(formatCount(data.score));

    this.statValues[0].setText(String(data.arkCompletes));
    this.statValues[1].setText(formatCount(data.olivesEarned));
    this.statValues[2].setText(formatCount(data.score));

    this.ribbon.setVisible(data.isNewBest);
    this.ribbonLabel.setVisible(data.isNewBest);
    this.scoreGlow.setVisible(data.isNewBest);
    for (const sp of this.sparkles) sp.setVisible(data.isNewBest);

    this.paintStrings();
    this.stopGlow();
    if (data.isNewBest) {
      this.drawBox(
        this.scoreGlow,
        C.y,
        C.w + 6,
        C.h + 6,
        C.radius + 2,
        0x000000,
        C.glow,
        C.glowWidth,
        true
      );
      this.startGlow();
      this.placeSparkles(C.y, C.w, C.h);
    }
  }

  private paintStrings(): void {
    this.fitTitle(
      t({
        es: "¡EL ARCA\nSE DESBORDÓ!",
        en: "THE ARK\nOVERFLOWED!",
        pt: "A ARCA\nTRANSBORDOU!"
      })
    );
    this.statLabels[0].setText(
      t({
        es: "Arcas completadas",
        en: "Arks completed",
        pt: "Arcas completadas"
      })
    );
    this.statLabels[1].setText(
      t({
        es: "Hojas de olivo ganadas",
        en: "Olive leaves earned",
        pt: "Folhas de oliveira ganhas"
      })
    );
    this.statLabels[2].setText(
      t({
        es: "Puntaje ganado",
        en: "Score earned",
        pt: "Pontuação ganha"
      })
    );
    this.playLabel.setText(
      t({
        es: "JUGAR DE NUEVO",
        en: "PLAY AGAIN",
        pt: "JOGAR DE NOVO"
      }).toUpperCase()
    );
    this.shopLabel.setText(
      t({ es: "TIENDA", en: "SHOP", pt: "LOJA" }).toUpperCase()
    );
    this.homeLabel.setText(
      t({ es: "INICIO", en: "HOME", pt: "INÍCIO" }).toUpperCase()
    );
    this.ribbonLabel.setText(
      t({
        es: "¡NUEVO RÉCORD!",
        en: "NEW RECORD!",
        pt: "NOVO RECORDE!"
      })
    );
  }

  /**
   * Título en Baloo. Tamaño e interlineado: HUD_LAYOUT.gameOver.titleFont / titleLineSpacing.
   * Si una línea no cabe en el banner, baja el tamaño hasta que quepa.
   */
  private fitTitle(text: string): void {
    const G = HUD_LAYOUT.gameOver;
    const maxW = G.banner.w - G.titlePad;
    this.titleText.setText(text);
    this.titleText.setFontSize(`${G.titleFont}px`);
    this.titleText.setLineSpacing(G.titleLineSpacing);
    const w = this.titleText.width;
    if (w > maxW && w > 0) {
      this.titleText.setFontSize(
        `${Math.max(12, Math.floor(G.titleFont * (maxW / w)))}px`
      );
    }
  }

  private startGlow(): void {
    const scene = this.root.scene;
    this.glowPulse.a = 0.4;
    this.glowTween = scene.tweens.add({
      targets: this.glowPulse,
      a: 1,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.scoreGlow.setAlpha(this.glowPulse.a);
      }
    });
    for (let i = 0; i < this.sparkles.length; i++) {
      const sp = this.sparkles[i];
      scene.tweens.add({
        targets: sp,
        alpha: { from: 0.15, to: 1 },
        scale: { from: 0.45, to: 1.05 },
        duration: 480 + i * 90,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: i * 80
      });
    }
  }

  private stopGlow(): void {
    this.glowTween?.stop();
    this.glowTween = null;
    this.scoreGlow.setAlpha(1);
    const scene = this.root.scene;
    for (const sp of this.sparkles) scene.tweens.killTweensOf(sp);
  }

  private placeSparkles(cy: number, w: number, h: number): void {
    const pts = [
      [-w / 2 + 8, cy - h / 2 + 10],
      [w / 2 - 10, cy - h / 2 + 8],
      [-w / 2 + 14, cy + h / 2 - 10],
      [w / 2 - 12, cy + h / 2 - 8],
      [0, cy - h / 2 - 4],
      [w / 2 - 4, cy]
    ];
    for (let i = 0; i < this.sparkles.length; i++) {
      this.sparkles[i].setPosition(pts[i][0], pts[i][1]).setDisplaySize(10, 10);
    }
  }

  private makeButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    key: string,
    w: number,
    h: number,
    onClick: () => void
  ): Phaser.GameObjects.Image {
    const img = scene.add.image(x, y, key).setDisplaySize(w, h);
    const hit = scene.add
      .rectangle(x, y, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => {
      img.setScale(img.scaleX * 0.96);
      GameAudio.current?.onUiTap();
    });
    hit.on("pointerup", () => {
      img.setDisplaySize(w, h);
      onClick();
    });
    hit.on("pointerout", () => img.setDisplaySize(w, h));
    this.panel.add([img, hit]);
    return img;
  }

  private drawBox(
    g: Phaser.GameObjects.Graphics,
    cy: number,
    w: number,
    h: number,
    radius: number,
    fill: number,
    stroke: number,
    strokeWidth: number,
    strokeOnly = false
  ): void {
    const x = -w / 2;
    const y = cy - h / 2;
    g.clear();
    if (!strokeOnly) {
      g.fillStyle(fill, 1);
      g.fillRoundedRect(x, y, w, h, radius);
    } else {
      g.fillStyle(fill, 0);
    }
    g.lineStyle(strokeWidth, stroke, 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }

  private style(
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

  private static ensureSparkle(scene: Phaser.Scene): void {
    if (scene.textures.exists(SPARKLE_KEY)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xfff6c8, 1);
    g.fillTriangle(8, 0, 10, 8, 6, 8);
    g.fillTriangle(8, 16, 10, 8, 6, 8);
    g.fillTriangle(0, 8, 8, 6, 8, 10);
    g.fillTriangle(16, 8, 8, 6, 8, 10);
    g.generateTexture(SPARKLE_KEY, 16, 16);
    g.destroy();
  }
}

function formatCount(n: number): string {
  const loc = getGameLocale();
  const tag = loc === "en" ? "en-US" : loc === "pt" ? "pt-BR" : "es-ES";
  return Math.max(0, Math.floor(n)).toLocaleString(tag);
}
