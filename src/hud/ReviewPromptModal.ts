import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";

type CloseResult = "yes" | "no";

/**
 * Pre-prompt de reseña (estilo “¿Te gusta la app?”).
 * Sí → el shell dispara el diálogo nativo de Play / App Store.
 * No → no molestamos con la tienda; el gate aplica cooldown igual.
 */
export class ReviewPromptModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly yesLabel: Phaser.GameObjects.Text;
  private readonly noLabel: Phaser.GameObjects.Text;
  private waiter: ((r: CloseResult) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number
  ) {
    const L = HUD_LAYOUT.reviewPrompt;
    const C = HUD_LAYOUT.settingsModal.colors;

    this.root = scene.add.container(0, 0).setDepth(L.depth).setVisible(false);

    const dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.78)
      .setInteractive();
    const panel = scene.add.container(195, L.panelY);

    const frame = scene.add
      .image(0, 0, "modal_frame")
      .setDisplaySize(L.frame.w, L.frame.h);
    const header = scene.add
      .image(0, L.header.y, "modal_header")
      .setDisplaySize(L.header.w, L.header.h);

    this.titleText = scene.add
      .text(0, L.title.y, "", {
        ...this.style(L.title.fontSize, "#fff8f0", true),
        stroke: "#3a2010",
        strokeThickness: 5,
        align: "center",
        wordWrap: { width: L.frame.w - 80 }
      })
      .setOrigin(0.5);

    this.body = scene.add
      .text(0, L.bodyY, "", {
        ...this.style(L.bodyFont, C.label, true),
        align: "center",
        wordWrap: { width: L.bodyWrap }
      })
      .setOrigin(0.5, 0);

    const yesBtn = scene.add
      .image(0, L.yesY, "btn_green_large")
      .setDisplaySize(L.btnW, L.btnH)
      .setInteractive({ useHandCursor: true });
    this.yesLabel = scene.add
      .text(0, L.yesY, "", {
        ...this.style(L.btnFont, "#fff8f0", true)
      })
      .setOrigin(0.5);
    yesBtn.on("pointerdown", () => GameAudio.current?.onUiTap());
    yesBtn.on("pointerup", () => this.finish("yes"));

    const noBtn = scene.add
      .image(0, L.noY, "btn_beige")
      .setDisplaySize(L.btnW, L.btnH)
      .setInteractive({ useHandCursor: true });
    this.noLabel = scene.add
      .text(0, L.noY, "", this.style(L.btnFont, "#5a3010", true))
      .setOrigin(0.5);
    noBtn.on("pointerdown", () => {
      noBtn.setTint(0x7a7a7a);
      GameAudio.current?.onUiTap();
    });
    noBtn.on("pointerup", () => {
      noBtn.clearTint();
      this.finish("no");
    });
    noBtn.on("pointerout", () => noBtn.clearTint());

    panel.add([
      frame,
      header,
      this.titleText,
      this.body,
      yesBtn,
      this.yesLabel,
      noBtn,
      this.noLabel
    ]);
    this.root.add([dim, panel]);
    this.paint();
  }

  showAndWait(): Promise<CloseResult> {
    this.paint();
    this.root.setVisible(true);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private paint(): void {
    this.titleText.setText(
      t({
        es: "¿TE GUSTA?",
        en: "ENJOYING IT?",
        pt: "ESTÁ GOSTANDO?"
      }).toUpperCase()
    );
    this.body.setText(
      t({
        es: "¿Te está gustando Arca Merge?",
        en: "Are you enjoying Arca Merge?",
        pt: "Você está gostando de Arca Merge?"
      })
    );
    this.yesLabel.setText(
      t({ es: "SÍ", en: "YES", pt: "SIM" }).toUpperCase()
    );
    this.noLabel.setText(
      t({ es: "NO", en: "NO", pt: "NÃO" }).toUpperCase()
    );
  }

  private finish(result: CloseResult): void {
    this.root.setVisible(false);
    const w = this.waiter;
    this.waiter = null;
    w?.(result);
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
}
