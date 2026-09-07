import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";
import { ScreenLoader } from "./ScreenLoader";
import { requestRewardedAd, sendToShell } from "../bridge";
import { DAILY_OLIVES, dismissDailyModal, markDailyDoubled } from "../dailyGrant";
import { unavailableRewardedMessage } from "./rewardedCopy";
import { flyOlivesToCounter } from "./oliveFly";
import type { Economy } from "../powers/economy";

type Handlers = {
  onOlivesChanged: () => void;
  olivesAnchor: () => { x: number; y: number };
  /** Quita del HUD las hojas del día para que Recoger/Ad las hagan crecer. */
  previewDailyOlives?: (amount: number) => void;
  /** Contador: mostrar `from` y crecer hasta `to` al ritmo de las hojas. */
  onOliveFlyGain?: (
    from: number,
    to: number,
    timing: { arriveDelayMs: number; spanMs: number }
  ) => void;
  onOliveLeafHit?: () => void;
};

/**
 * Recompensa diaria: +5 olivos y opción de duplicar con el mismo rewarded.
 * Piezas: modal_frame, header, btn_green_large, icon_video, btn_beige.
 */
export class DailyRewardModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly amountText: Phaser.GameObjects.Text;
  private readonly oliveIcon: Phaser.GameObjects.Image;
  private readonly blurb: Phaser.GameObjects.Text;
  private readonly adIdle: Phaser.GameObjects.Image;
  private readonly adPressed: Phaser.GameObjects.Image;
  private readonly adIcon: Phaser.GameObjects.Image;
  private readonly adLabel: Phaser.GameObjects.Text;
  private readonly collectBtn: Phaser.GameObjects.Image;
  private readonly collectLabel: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private handlers: Handlers | null = null;
  private busy = false;
  private doubled = false;
  private settled = false;
  private adGen = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly economy: Economy,
    private readonly renderScale: number
  ) {
    const D = HUD_LAYOUT.dailyReward;
    const C = HUD_LAYOUT.settingsModal.colors;

    this.root = scene.add.container(0, 0).setDepth(D.depth).setVisible(false);
    this.dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.78)
      .setInteractive();
    this.panel = scene.add.container(195, D.panelY);

    const frame = scene.add
      .image(0, 0, "modal_frame")
      .setDisplaySize(D.frame.w, D.frame.h);
    const header = scene.add
      .image(0, D.header.y, "modal_header")
      .setDisplaySize(D.header.w, D.header.h);

    this.titleText = scene.add
      .text(0, D.title.y, "", {
        ...this.style(D.title.fontSize, "#fff8f0", true),
        stroke: "#3a2010",
        strokeThickness: 5
      })
      .setOrigin(0.5);

    const close = scene.add
      .image(D.close.x, D.close.y, "btn_close")
      .setDisplaySize(D.close.size, D.close.size)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => GameAudio.current?.onUiTap());
    close.on("pointerup", () => this.collect());

    this.oliveIcon = scene.add
      .image(0, D.amountY, "icon_olivo")
      .setDisplaySize(D.oliveSize, D.oliveSize);
    this.amountText = scene.add
      .text(0, D.amountY, `+${DAILY_OLIVES}`, this.style(D.amountFont, D.amountColor, true))
      .setOrigin(0.5);

    this.blurb = scene.add
      .text(0, D.blurbY, "", {
        ...this.style(D.blurbFont, C.label, true),
        align: "center",
        wordWrap: { width: D.blurbWrap }
      })
      .setOrigin(0.5, 0);

    this.adIdle = scene.add
      .image(0, D.ad.y, "btn_green_large")
      .setDisplaySize(D.ad.w, D.ad.h)
      .setInteractive({ useHandCursor: true });
    this.adPressed = scene.add
      .image(0, D.ad.y, "btn_green_large_pressed")
      .setDisplaySize(D.ad.w, D.ad.h)
      .setVisible(false);
    this.adIcon = scene.add
      .image(0, D.ad.y, "icon_video")
      .setDisplaySize(D.ad.icon, D.ad.icon);
    this.adLabel = scene.add
      .text(0, D.ad.y, "", {
        ...this.style(D.ad.font, "#fff8f0", true),
        align: "center",
        lineSpacing: D.ad.lineSpacing
      })
      .setOrigin(0.5);
    const kickAd = (): void => {
      if (this.busy || this.doubled || this.settled) return;
      this.busy = true;
      this.setAdPressed(true);
      GameAudio.current?.onUiTap();
      void this.onAdTap();
    };
    this.adIdle.on("pointerdown", kickAd);

    this.collectBtn = scene.add
      .image(0, D.collect.y, "btn_beige")
      .setDisplaySize(D.collect.w, D.collect.h);
    this.collectLabel = scene.add
      .text(0, D.collect.y, "", this.style(D.collect.font, "#5a3010", true))
      .setOrigin(0.5);
    const collectHit = scene.add
      .rectangle(0, D.collect.y, D.collect.w, D.collect.h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    collectHit.on("pointerdown", () => {
      if (this.busy) return;
      this.collectBtn.setTint(0x7a7a7a);
      GameAudio.current?.onUiTap();
    });
    collectHit.on("pointerup", () => {
      this.collectBtn.clearTint();
      this.collect();
    });
    collectHit.on("pointerout", () => this.collectBtn.clearTint());

    this.statusText = scene.add
      .text(0, D.statusY, "", {
        ...this.style(11, "#8a4030"),
        align: "center",
        wordWrap: { width: 260 }
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.panel.add([
      frame,
      header,
      this.titleText,
      close,
      this.oliveIcon,
      this.amountText,
      this.blurb,
      this.adIdle,
      this.adPressed,
      this.adIcon,
      this.adLabel,
      this.collectBtn,
      this.collectLabel,
      collectHit,
      this.statusText
    ]);
    this.root.add([this.dim, this.panel]);
    this.paintStrings();
    this.layoutAmount();
    this.layoutAdLabel();
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  show(): void {
    this.busy = false;
    this.doubled = false;
    this.settled = false;
    this.adGen += 1;
    this.statusText.setVisible(false).setText("");
    this.paintStrings();
    this.layoutAmount();
    this.layoutAdLabel();
    this.setAdPressed(false);
    this.collectBtn.clearTint();
    this.adIdle.setInteractive({ useHandCursor: true });
    this.adIdle.setAlpha(1);
    this.adIcon.setAlpha(1);
    this.adLabel.setAlpha(1);
    this.handlers?.previewDailyOlives?.(DAILY_OLIVES);
    this.root.setVisible(true);
  }

  close(): void {
    this.busy = false;
    this.root.setVisible(false);
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private collect(): void {
    if (this.settled) return;
    this.adGen += 1;
    this.busy = false;
    ScreenLoader.current?.hide();
    dismissDailyModal();
    this.payoutVisual(DAILY_OLIVES);
    sendToShell({
      type: "daily_reward_claimed",
      olives: DAILY_OLIVES,
      doubled: false
    });
  }

  private async onAdTap(): Promise<void> {
    if (!this.root.visible || this.doubled || this.settled) {
      this.busy = false;
      this.setAdPressed(false);
      return;
    }
    const gen = this.adGen;
    this.adIdle.disableInteractive();
    this.adPressed.disableInteractive();
    this.statusText
      .setText(
        t({
          es: "Cargando anuncio…",
          en: "Loading ad…",
          pt: "Carregando anúncio…"
        })
      )
      .setVisible(true);
    this.adLabel.setText(t({ es: "CARGANDO…", en: "LOADING…", pt: "CARREGANDO…" }).toUpperCase());
    this.layoutAdLabel();
    let status: Awaited<ReturnType<typeof requestRewardedAd>> = "error";
    try {
      status = await requestRewardedAd("daily");
    } finally {
      if (gen === this.adGen) {
        this.busy = false;
        this.setAdPressed(false);
        this.adIdle.setInteractive({ useHandCursor: true });
        this.adPressed.setInteractive({ useHandCursor: true });
        this.paintStrings();
        this.layoutAdLabel();
      }
    }
    if (gen !== this.adGen || this.settled) return;

    if (status === "completed") {
      this.applyDouble();
      return;
    }
    if (status === "unavailable") {
      this.statusText.setText(unavailableRewardedMessage()).setVisible(true);
      return;
    }
    if (status === "dismissed") {
      this.statusText
        .setText(
          t({
            es: "Te quedas con 5 olivos.",
            en: "You keep 5 olive leaves.",
            pt: "Você fica com 5 azeitonas."
          })
        )
        .setVisible(true);
      return;
    }
    this.statusText
      .setText(
        t({
          es: "No se pudo cargar el anuncio. Te quedas con 5 olivos.",
          en: "Couldn't load the ad. You keep 5 olive leaves.",
          pt: "Não foi possível carregar o anúncio. Você fica com 5."
        })
      )
      .setVisible(true);
  }

  private applyDouble(): void {
    if (this.settled && this.doubled) return;
    this.doubled = true;
    this.economy.grantOlives(DAILY_OLIVES);
    markDailyDoubled();
    this.payoutVisual(DAILY_OLIVES * 2);
    sendToShell({
      type: "daily_reward_claimed",
      olives: DAILY_OLIVES * 2,
      doubled: true
    });
  }

  private payoutVisual(amount: number): void {
    if (this.settled && amount === DAILY_OLIVES) return;
    this.settled = true;
    const to = this.economy.getOlives();
    const from = Math.max(0, to - amount);
    const timing = this.flyLeavesToCounter(amount);
    this.handlers?.onOliveFlyGain?.(from, to, timing);
    GameAudio.current?.onReward();
    this.close();
  }

  private flyLeavesToCounter(
    amount: number = DAILY_OLIVES
  ): { arriveDelayMs: number; spanMs: number } {
    const D = HUD_LAYOUT.dailyReward;
    const to = this.handlers?.olivesAnchor() ?? { x: 195, y: 38 };
    return flyOlivesToCounter(
      this.root.scene,
      195,
      D.panelY + D.amountY,
      to.x,
      to.y,
      amount,
      {
        depth: D.depth + 8,
        onLeafHit: () => this.handlers?.onOliveLeafHit?.()
      }
    );
  }

  private paintStrings(): void {
    this.titleText.setText(
      t({
        es: "RECOMPENSA DIARIA",
        en: "DAILY REWARD",
        pt: "RECOMPENSA DIÁRIA"
      }).toUpperCase()
    );
    this.blurb.setText(
      t({
        es: "Mirá un anuncio y duplicá tus olivos.",
        en: "Watch an ad and double your olives.",
        pt: "Assista a um anúncio e dobre suas azeitonas."
      })
    );
    this.adLabel.setText(
      t({
        es: "VER ANUNCIO\nY DUPLICAR",
        en: "WATCH AD\nAND DOUBLE",
        pt: "VER ANÚNCIO\nE DOBRAR"
      }).toUpperCase()
    );
    this.collectLabel.setText(
      t({ es: "RECOGER 5", en: "COLLECT 5", pt: "COLETAR 5" }).toUpperCase()
    );
  }

  private layoutAmount(): void {
    const D = HUD_LAYOUT.dailyReward;
    const iconW = D.oliveSize;
    const gap = D.oliveGap;
    const textW = this.amountText.width;
    const total = iconW + gap + textW;
    this.oliveIcon.setPosition(-total / 2 + iconW / 2, D.amountY);
    this.amountText.setPosition(-total / 2 + iconW + gap + textW / 2, D.amountY);
  }

  private layoutAdLabel(): void {
    const D = HUD_LAYOUT.dailyReward.ad;
    const iconW = D.icon;
    const gap = D.iconGap;
    const textW = this.adLabel.width;
    const total = iconW + gap + textW;
    this.adIcon.setPosition(-total / 2 + iconW / 2, D.y);
    this.adLabel.setPosition(-total / 2 + iconW + gap + textW / 2, D.y);
  }

  private setAdPressed(on: boolean): void {
    this.adPressed.setVisible(on);
    this.adIdle.setVisible(!on);
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
