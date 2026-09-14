import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";
import { requestShare } from "../bridge";
import { SHARE_REWARD_OLIVES } from "../shareOffer";

type CloseResult = "shared" | "dismissed";

/**
 * Modal único: comparte el juego → olivos.
 * Mismo chrome que diaria/ajustes (modal_frame + header).
 * showAndWait() resuelve al cerrar.
 */
export class ShareRewardModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly shareBtn: Phaser.GameObjects.Image;
  private readonly shareLabel: Phaser.GameObjects.Text;
  private readonly laterBtn: Phaser.GameObjects.Image;
  private readonly laterLabel: Phaser.GameObjects.Text;
  private busy = false;
  private waiter: ((r: CloseResult) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number
  ) {
    const L = HUD_LAYOUT.shareReward;
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

    const close = scene.add
      .image(L.close.x, L.close.y, "btn_close")
      .setDisplaySize(L.close.size, L.close.size)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => GameAudio.current?.onUiTap());
    close.on("pointerup", () => this.dismiss());

    this.body = scene.add
      .text(0, L.bodyY, "", {
        ...this.style(L.bodyFont, C.label, true),
        align: "center",
        wordWrap: { width: L.bodyWrap }
      })
      .setOrigin(0.5, 0);

    this.shareBtn = scene.add
      .image(0, L.shareY, "btn_green_large")
      .setDisplaySize(L.shareW, L.shareH)
      .setInteractive({ useHandCursor: true });
    this.shareLabel = scene.add
      .text(0, L.shareY, "", {
        ...this.style(L.btnFont, "#fff8f0", true),
        align: "center"
      })
      .setOrigin(0.5);
    this.shareBtn.on("pointerdown", () => {
      if (this.busy) {
        this.setStatus(
          t({
            es: "Esperá: se está abriendo compartir…",
            en: "Please wait: opening share…",
            pt: "Aguarde: abrindo compartilhar…"
          })
        );
        return;
      }
      void this.onShare();
    });

    this.laterBtn = scene.add
      .image(0, L.laterY, "btn_beige")
      .setDisplaySize(L.laterW, L.laterH)
      .setInteractive({ useHandCursor: true });
    this.laterLabel = scene.add
      .text(0, L.laterY, "", this.style(L.btnFont, "#5a3010", true))
      .setOrigin(0.5);
    this.laterBtn.on("pointerdown", () => {
      if (this.busy) return;
      this.laterBtn.setTint(0x7a7a7a);
      GameAudio.current?.onUiTap();
    });
    this.laterBtn.on("pointerup", () => {
      this.laterBtn.clearTint();
      if (this.busy) return;
      this.dismiss();
    });
    this.laterBtn.on("pointerout", () => this.laterBtn.clearTint());

    this.statusText = scene.add
      .text(0, L.statusY, "", {
        ...this.style(13, "#8a4030", true),
        align: "center",
        wordWrap: { width: L.bodyWrap }
      })
      .setOrigin(0.5)
      .setVisible(false);

    panel.add([
      frame,
      header,
      this.titleText,
      close,
      this.body,
      this.shareBtn,
      this.shareLabel,
      this.laterBtn,
      this.laterLabel,
      this.statusText
    ]);
    this.root.add([dim, panel]);
  }

  showAndWait(): Promise<CloseResult> {
    this.busy = false;
    this.setStatus("");
    this.paint();
    this.setShareEnabled(true);
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
        es: "¡COMPARTE!",
        en: "SHARE!",
        pt: "COMPARTILHE!"
      }).toUpperCase()
    );
    this.body.setText(
      t({
        es: `Recomiéndalo a un amigo y te regalamos ${SHARE_REWARD_OLIVES} olivos.`,
        en: `Recommend it to a friend and get ${SHARE_REWARD_OLIVES} olive leaves.`,
        pt: `Indique a um amigo e ganhe ${SHARE_REWARD_OLIVES} azeitonas.`
      })
    );
    this.shareLabel.setText(
      t({
        es: "COMPARTIR",
        en: "SHARE",
        pt: "COMPARTILHAR"
      }).toUpperCase()
    );
    this.laterLabel.setText(
      t({
        es: "AHORA NO",
        en: "NOT NOW",
        pt: "AGORA NÃO"
      }).toUpperCase()
    );
  }

  private async onShare(): Promise<void> {
    if (this.busy || !this.root.visible) return;
    this.busy = true;
    GameAudio.current?.onUiTap();
    this.setShareEnabled(false);
    this.setStatus(
      t({
        es: "Abriendo compartir…",
        en: "Opening share…",
        pt: "Abrindo compartilhar…"
      })
    );
    this.shareLabel.setText(
      t({ es: "ESPERÁ…", en: "WAIT…", pt: "AGUARDE…" }).toUpperCase()
    );

    const message = t({
      es: "¡Estoy jugando Arca Merge! Pruébalo:",
      en: "I'm playing Arca Merge! Try it:",
      pt: "Estou jogando Arca Merge! Experimente:"
    });

    let status: Awaited<ReturnType<typeof requestShare>> = "error";
    try {
      status = await requestShare(message);
    } finally {
      this.busy = false;
      if (this.root.visible) {
        this.setShareEnabled(true);
        this.paint();
      }
    }
    if (!this.root.visible) return;

    if (status === "shared") {
      this.finish("shared");
      return;
    }

    if (status === "dismissed") {
      this.setStatus(
        t({
          es: "No se envió. Podés intentar de nuevo o tocar Ahora no.",
          en: "Nothing was sent. Try again or tap Not now.",
          pt: "Nada foi enviado. Tente de novo ou toque Agora não."
        })
      );
      return;
    }

    if (status === "unavailable") {
      this.setStatus(
        t({
          es: "Compartir no está disponible en este dispositivo.",
          en: "Sharing isn't available on this device.",
          pt: "Compartilhar não está disponível neste dispositivo."
        })
      );
      return;
    }

    this.setStatus(
      t({
        es: "No se pudo compartir. Probá de nuevo o tocá Ahora no.",
        en: "Couldn't share. Try again or tap Not now.",
        pt: "Não foi possível compartilhar. Tente de novo ou toque Agora não."
      })
    );
  }

  private dismiss(): void {
    if (this.busy) return;
    this.finish("dismissed");
  }

  private setShareEnabled(on: boolean): void {
    if (on) {
      this.shareBtn.setInteractive({ useHandCursor: true });
      this.shareBtn.setAlpha(1);
      this.shareLabel.setAlpha(1);
    } else {
      this.shareBtn.disableInteractive();
      this.shareBtn.setAlpha(0.7);
      this.shareLabel.setAlpha(0.85);
    }
  }

  private setStatus(msg: string): void {
    if (!msg) {
      this.statusText.setVisible(false).setText("");
      return;
    }
    this.statusText.setText(msg).setVisible(true);
  }

  private finish(result: CloseResult): void {
    this.busy = false;
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
