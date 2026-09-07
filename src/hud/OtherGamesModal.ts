import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";
import { openExternalUrl } from "../bridge";
import { OTHER_GAMES, storeUrlFor } from "./otherGamesConfig";

function uiTap(): void {
  GameAudio.current?.onUiTap();
}

/**
 * Lista de otros juegos del estudio. Chrome = modal de Ajustes.
 */
export class OtherGamesModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly nameTexts: Phaser.GameObjects.Text[] = [];
  private readonly blurbTexts: Phaser.GameObjects.Text[] = [];
  private readonly playLabels: Phaser.GameObjects.Text[] = [];
  private readonly closeBtn: Phaser.GameObjects.Image;
  private onClose: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number
  ) {
    const S = HUD_LAYOUT.settingsModal;
    const G = HUD_LAYOUT.otherGames;
    const C = S.colors;
    const half = S.contentHalfW;

    this.root = scene.add.container(0, 0).setDepth(G.depth).setVisible(false);
    const dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.72)
      .setInteractive();
    const panel = scene.add.container(195, S.panelY);

    const frame = scene.add
      .image(0, 0, "modal_frame")
      .setDisplaySize(S.frame.w, S.frame.h);
    const header = scene.add
      .image(0, S.header.y, "modal_header")
      .setDisplaySize(S.header.w, S.header.h);
    this.titleText = scene.add
      .text(0, S.title.y, "", {
        fontFamily: NUNITO_FAMILY,
        fontSize: `${S.title.fontSize}px`,
        color: S.title.color,
        fontStyle: "bold",
        stroke: S.title.stroke,
        strokeThickness: S.title.strokeThickness,
        shadow: {
          offsetX: 0,
          offsetY: S.title.shadowOffsetY,
          color: S.title.shadowColor,
          blur: 0,
          stroke: true,
          fill: true
        },
        resolution: this.renderScale
      })
      .setOrigin(0.5);

    this.closeBtn = scene.add
      .image(S.close.x, S.close.y, "btn_close")
      .setDisplaySize(S.close.size, S.close.size)
      .setInteractive({ useHandCursor: true });
    this.closeBtn.on("pointerdown", () => {
      this.closeBtn.setTexture("btn_close_pressed");
      uiTap();
    });
    this.closeBtn.on("pointerup", () => {
      this.closeBtn.setTexture("btn_close");
      this.close();
    });
    this.closeBtn.on("pointerout", () => this.closeBtn.setTexture("btn_close"));

    panel.add([frame, header, this.titleText, this.closeBtn]);

    for (let i = 0; i < OTHER_GAMES.length; i++) {
      const game = OTHER_GAMES[i];
      const cy = G.rowY + i * (G.rowH + 10);
      const top = cy - G.rowH / 2;
      const bg = scene.add.graphics();
      bg.fillStyle(C.rowFill, 1);
      bg.fillRoundedRect(-half, top, half * 2, G.rowH, 10);
      bg.lineStyle(1.5, C.rowStroke, 1);
      bg.strokeRoundedRect(-half, top, half * 2, G.rowH, 10);

      const name = scene.add
        .text(-half + 12, top + G.nameY, "", this.bodyStyle(G.nameFont, C.label, true))
        .setOrigin(0, 0.5);
      const blurb = scene.add
        .text(-half + 12, top + G.blurbY, "", {
          ...this.bodyStyle(G.blurbFont, C.labelMuted),
          wordWrap: { width: half * 2 - 24 },
          lineSpacing: 2
        })
        .setOrigin(0, 0);

      const playX = -half + 12 + G.playW / 2;
      const playY = top + G.rowH - G.playPad - G.playH / 2;
      const playImg = scene.add
        .image(playX, playY, "btn_green")
        .setDisplaySize(G.playW, G.playH);
      const playHit = scene.add
        .rectangle(playX, playY, G.playW, G.playH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      const playLabel = scene.add
        .text(playX, playY, "", this.bodyStyle(G.playFont, "#fff8f0", true))
        .setOrigin(0.5);
      playHit.on("pointerdown", () => {
        playImg.setTint(0x7a7a7a);
        uiTap();
      });
      playHit.on("pointerup", () => {
        playImg.clearTint();
        openExternalUrl(storeUrlFor(game));
      });
      playHit.on("pointerout", () => playImg.clearTint());

      this.nameTexts.push(name);
      this.blurbTexts.push(blurb);
      this.playLabels.push(playLabel);
      panel.add([bg, name, blurb, playImg, playHit, playLabel]);
    }

    this.root.add([dim, panel]);
    this.relabel();
  }

  setOnClose(fn: () => void): void {
    this.onClose = fn;
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.relabel();
    this.root.setVisible(true);
  }

  close(): void {
    this.root.setVisible(false);
    this.onClose?.();
  }

  destroy(): void {
    this.root.destroy(true);
  }

  relabel(): void {
    this.titleText.setText(
      t({ es: "OTROS JUEGOS", en: "OTHER GAMES", pt: "OUTROS JOGOS" })
    );
    for (let i = 0; i < OTHER_GAMES.length; i++) {
      const g = OTHER_GAMES[i];
      this.nameTexts[i].setText(t(g.name));
      this.blurbTexts[i].setText(t(g.blurb));
      this.playLabels[i].setText(
        t({ es: "ABRIR", en: "OPEN", pt: "ABRIR" })
      );
    }
  }

  private bodyStyle(
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
