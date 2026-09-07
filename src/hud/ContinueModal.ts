import Phaser from "phaser";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { t } from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";
import { AdCountdown } from "./AdCountdown";
import { ScreenLoader } from "./ScreenLoader";
import {
  STUB_REWARDED_ADS,
  requestRewardedAd,
  type RewardedAdStatus
} from "../bridge";
import { hasAdsRemoved } from "../adsRemoved";
import { unavailableRewardedMessage } from "./rewardedCopy";

type Handlers = {
  onContinue: () => void;
  onEndRun: () => void;
};

/**
 * Overlay al perder: ver anuncio y seguir, o terminar.
 * Layout en HUD_LAYOUT.continue. 1 vez por partida (lo decide GameScene).
 */
export class ContinueModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly blurbBox: Phaser.GameObjects.Graphics;
  private readonly blurb: Phaser.GameObjects.Text;
  private readonly timerFill: Phaser.GameObjects.Graphics;
  private readonly timerNum: Phaser.GameObjects.Text;
  private readonly adIdle: Phaser.GameObjects.Image;
  private readonly adPressed: Phaser.GameObjects.Image;
  private readonly adIcon: Phaser.GameObjects.Image;
  private readonly adLabel: Phaser.GameObjects.Text;
  private readonly endBtn: Phaser.GameObjects.Image;
  private readonly endLabel: Phaser.GameObjects.Text;
  private readonly badgeLabel: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private handlers: Handlers | null = null;
  private timerTween: Phaser.Tweens.Tween | null = null;
  private readonly timerState = { remaining: HUD_LAYOUT.continue.seconds };
  private lastShownSecond = -1;
  private busy = false;
  private settled = false;
  private adsRemoved = false;
  private rewardedAvailable = true;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number
  ) {
    const C = HUD_LAYOUT.continue;
    const depth = HUD_LAYOUT.depth.continue;

    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    this.dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.78)
      .setInteractive();
    this.panel = scene.add.container(195, C.panelY);

    const frame = scene.add
      .image(0, 0, "continue_frame")
      .setDisplaySize(C.frame.w, C.frame.h);

    this.titleText = scene.add
      .text(0, C.title.y, "", {
        ...this.style(C.title.font, C.title.color, true),
        align: "center",
        lineSpacing: C.title.lineSpacing
      })
      .setOrigin(0.5);

    this.blurbBox = scene.add.graphics();
    this.blurb = scene.add
      .text(0, C.blurb.y, "", {
        ...this.style(C.blurb.font, C.blurb.color, true),
        align: "center",
        wordWrap: { width: C.blurb.wrap },
        lineSpacing: C.blurb.lineSpacing
      })
      .setOrigin(0.5, 0);

    const timerY = C.timer.y;
    this.timerFill = scene.add.graphics().setPosition(0, timerY);
    const ring = scene.add
      .image(0, timerY, "timer_ring")
      .setDisplaySize(C.timer.size, C.timer.size);
    this.timerNum = scene.add
      .text(0, timerY, String(C.seconds), this.style(C.timer.font, C.timer.color, true))
      .setOrigin(0.5);

    this.adIdle = scene.add
      .image(0, C.ad.y, "btn_green_large")
      .setDisplaySize(C.ad.w, C.ad.h);
    this.adPressed = scene.add
      .image(0, C.ad.y, "btn_green_large_pressed")
      .setDisplaySize(C.ad.w, C.ad.h)
      .setVisible(false);
    this.adIcon = scene.add
      .image(0, C.ad.y, "icon_video")
      .setDisplaySize(C.ad.icon, C.ad.icon);
    this.adLabel = scene.add
      .text(0, C.ad.y, "", {
        ...this.style(C.ad.font, C.ad.color, true),
        align: "center",
        lineSpacing: C.ad.lineSpacing
      })
      .setOrigin(0.5);
    const adHit = scene.add
      .rectangle(0, C.ad.y, C.ad.w, C.ad.h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    adHit.on("pointerdown", () => {
      if (this.busy || this.settled) return;
      this.busy = true;
      this.setAdPressed(true);
      GameAudio.current?.onUiTap();
      void this.onAdTap();
    });
    adHit.on("pointerup", () => {
      this.setAdPressed(false);
    });
    adHit.on("pointerout", () => this.setAdPressed(false));

    this.endBtn = scene.add
      .image(0, C.end.y, "btn_beige")
      .setDisplaySize(C.end.w, C.end.h);
    this.endLabel = scene.add
      .text(0, C.end.y, "", this.style(C.end.font, C.end.color, true))
      .setOrigin(0.5);
    const endHit = scene.add
      .rectangle(0, C.end.y, C.end.w, C.end.h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    endHit.on("pointerdown", () => {
      if (this.busy) return;
      this.endBtn.setTint(0x7a7a7a);
      GameAudio.current?.onUiTap();
    });
    endHit.on("pointerup", () => {
      this.endBtn.clearTint();
      this.onEndTap();
    });
    endHit.on("pointerout", () => this.endBtn.clearTint());

    const badge = scene.add
      .image(0, C.badge.y, "continue_badge")
      .setDisplaySize(C.badge.w, C.badge.h);
    this.badgeLabel = scene.add
      .text(0, C.badge.y + C.badge.textY, "", this.style(C.badge.font, C.badge.color, true))
      .setOrigin(0.5);

    this.statusText = scene.add
      .text(0, C.statusY, "", {
        ...this.style(11, "#8a4030"),
        align: "center",
        wordWrap: { width: 260 }
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.panel.add([
      frame,
      this.titleText,
      this.blurbBox,
      this.blurb,
      this.adIdle,
      this.adPressed,
      this.adIcon,
      this.adLabel,
      adHit,
      this.endBtn,
      this.endLabel,
      endHit,
      ring,
      this.timerFill,
      this.timerNum,
      badge,
      this.badgeLabel,
      this.statusText
    ]);
    this.root.add([this.dim, this.panel]);
    this.paintStrings();
    this.layoutBadge();
    this.layoutAdLabel();
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  show(opts?: {
    adsRemoved?: boolean;
    rewardedAvailable?: boolean;
    /** Congela el 5 y no cierra: para acomodar layout. */
    freeze?: boolean;
  }): void {
    this.adsRemoved = opts?.adsRemoved ?? hasAdsRemoved();
    this.rewardedAvailable = opts?.rewardedAvailable ?? true;
    this.busy = false;
    this.settled = !!opts?.freeze;
    this.statusText.setVisible(false).setText("");
    this.paintStrings();
    this.layoutAdLabel();
    this.layoutBadge();
    this.setAdPressed(false);
    this.endBtn.clearTint();
    this.panel.setVisible(true);
    this.dim.setVisible(true);
    this.dim.setInteractive();
    this.root.setVisible(true);
    this.root.setDepth(HUD_LAYOUT.depth.continue);
    if (opts?.freeze) {
      this.stopTimer();
      this.timerState.remaining = HUD_LAYOUT.continue.seconds;
      this.lastShownSecond = HUD_LAYOUT.continue.seconds;
      this.timerNum.setText(String(HUD_LAYOUT.continue.seconds)).setScale(1);
      this.paintTimer(false);
      return;
    }
    this.startTimer();
  }

  close(): void {
    this.stopTimer();
    this.busy = false;
    this.dim.disableInteractive();
    this.root.setVisible(false);
  }

  relabel(): void {
    this.paintStrings();
    this.layoutAdLabel();
    this.layoutBadge();
  }

  destroy(): void {
    this.stopTimer();
    this.root.destroy(true);
  }

  private startTimer(): void {
    this.stopTimer();
    const scene = this.root.scene;
    const total = HUD_LAYOUT.continue.seconds;
    this.timerState.remaining = total;
    this.lastShownSecond = -1;
    this.paintTimer(true);
    this.timerTween = scene.tweens.add({
      targets: this.timerState,
      remaining: 0,
      duration: total * 1000,
      ease: "Linear",
      onUpdate: () => this.paintTimer(false),
      onComplete: () => {
        this.timerState.remaining = 0;
        this.paintTimer(true);
        this.onEndTap();
      }
    });
  }

  private stopTimer(): void {
    this.timerTween?.stop();
    this.timerTween = null;
    const scene = this.root.scene;
    if (!scene?.tweens) return;
    scene.tweens.killTweensOf(this.timerNum);
    scene.tweens.killTweensOf(this.timerState);
  }

  private pauseTimer(): void {
    this.timerTween?.pause();
  }

  private resumeTimer(): void {
    if (this.timerTween && this.timerTween.isPaused()) this.timerTween.resume();
  }

  /**
   * Arco verde = tiempo que queda. Empieza lleno (5) y se vacía en sentido
   * horario; no es un wipe plano de arriba a abajo.
   */
  private paintTimer(forcePop: boolean): void {
    const C = HUD_LAYOUT.continue.timer;
    const total = HUD_LAYOUT.continue.seconds;
    const progress = Phaser.Math.Clamp(this.timerState.remaining / total, 0, 1);
    const shown = Math.max(0, Math.ceil(this.timerState.remaining - 1e-4));

    this.timerFill.clear();
    if (progress > 0.001) {
      const start = -Math.PI / 2;
      const end = start + progress * Math.PI * 2;
      this.timerFill.lineStyle(C.fillWidth, C.fillColor, 1);
      this.timerFill.beginPath();
      this.timerFill.arc(0, 0, C.fillRadius, start, end, false);
      this.timerFill.strokePath();
      this.timerFill.fillStyle(C.fillColor, 1);
      this.timerFill.fillCircle(
        Math.cos(start) * C.fillRadius,
        Math.sin(start) * C.fillRadius,
        C.fillWidth / 2
      );
      this.timerFill.fillCircle(
        Math.cos(end) * C.fillRadius,
        Math.sin(end) * C.fillRadius,
        C.fillWidth / 2
      );
    }

    if (shown !== this.lastShownSecond || forcePop) {
      this.lastShownSecond = shown;
      this.timerNum.setText(String(shown));
      this.timerNum.setScale(0.55);
      this.root.scene.tweens.add({
        targets: this.timerNum,
        scale: 1,
        duration: 180,
        ease: "Back.easeOut"
      });
    }
  }

  private async onAdTap(): Promise<void> {
    if (!this.root.visible || this.settled) {
      this.busy = false;
      this.setAdPressed(false);
      return;
    }
    if (this.adsRemoved) {
      this.settled = true;
      this.stopTimer();
      this.handlers?.onContinue();
      return;
    }
    if (!this.rewardedAvailable) {
      this.busy = false;
      this.setAdPressed(false);
      this.statusText.setText(unavailableRewardedMessage()).setVisible(true);
      return;
    }

    this.pauseTimer();
    let status: RewardedAdStatus = "error";
    const scene = this.root.scene;

    if (STUB_REWARDED_ADS) {
      this.panel.setVisible(false);
      this.dim.setVisible(false);
      await AdCountdown.play(scene, 3);
      status = await requestRewardedAd("continue");
    } else {
      this.statusText
        .setText(
          t({
            es: "Cargando anuncio…",
            en: "Loading ad…",
            pt: "Carregando anúncio…"
          })
        )
        .setVisible(true);
      ScreenLoader.current?.show();
      try {
        status = await requestRewardedAd("continue");
      } finally {
        ScreenLoader.current?.hide();
      }
    }

    if (!this.root.visible) return;
    this.busy = false;
    this.setAdPressed(false);
    this.panel.setVisible(true);
    this.dim.setVisible(true);

    if (status === "completed") {
      this.settled = true;
      this.stopTimer();
      this.handlers?.onContinue();
      return;
    }
    if (status === "unavailable") {
      this.rewardedAvailable = false;
      this.statusText.setText(unavailableRewardedMessage()).setVisible(true);
    } else if (status === "dismissed") {
      this.statusText
        .setText(t({ es: "Video cancelado.", en: "Video dismissed.", pt: "Vídeo cancelado." }))
        .setVisible(true);
    } else {
      this.statusText
        .setText(
          t({
            es: "No se pudo cargar el anuncio.",
            en: "Couldn't load the ad.",
            pt: "Não foi possível carregar o anúncio."
          })
        )
        .setVisible(true);
    }
    this.resumeTimer();
  }

  private onEndTap(): void {
    if (!this.root.visible || this.busy || this.settled) return;
    this.settled = true;
    this.stopTimer();
    this.handlers?.onEndRun();
  }

  private setAdPressed(on: boolean): void {
    this.adIdle.setVisible(!on);
    this.adPressed.setVisible(on);
  }

  private paintStrings(): void {
    this.titleText.setText(
      t({
        es: "¿SALVAR\nEL ARCA?",
        en: "SAVE\nTHE ARK?",
        pt: "SALVAR\nA ARCA?"
      })
    );
    this.blurb.setText(
      t({
        es: "Los animales más pequeños saldrán del arca y liberarás espacio para poder seguir jugando.",
        en: "The smallest animals will leave the ark and free up space so you can keep playing.",
        pt: "Os animais menores sairão da arca e liberarão espaço para você continuar jogando."
      })
    );
    this.endLabel.setText(
      t({
        es: "TERMINAR PARTIDA",
        en: "END GAME",
        pt: "ENCERRAR PARTIDA"
      }).toUpperCase()
    );
    this.badgeLabel.setText(
      t({
        es: "Solo 1 vez por partida",
        en: "Only once per game",
        pt: "Só 1 vez por partida"
      })
    );
    this.adLabel.setText(
      this.adsRemoved
        ? t({ es: "CONTINUAR", en: "CONTINUE", pt: "CONTINUAR" }).toUpperCase()
        : t({
            es: "VER ANUNCIO\nY CONTINUAR",
            en: "WATCH AD\nAND CONTINUE",
            pt: "VER ANÚNCIO\nE CONTINUAR"
          }).toUpperCase()
    );
    this.adIcon.setVisible(!this.adsRemoved);
    this.layoutBlurbBox();
  }

  private layoutBlurbBox(): void {
    const C = HUD_LAYOUT.continue.blurb;
    const w = C.boxW;
    const h = this.blurb.height + C.padY * 2;
    const top = C.y;
    this.blurb.setPosition(0, top + C.padY);
    const g = this.blurbBox;
    g.clear();
    g.fillStyle(C.boxFill, 1);
    g.fillRoundedRect(-w / 2, top, w, h, C.radius);
    g.lineStyle(C.boxStrokeWidth, C.boxStroke, 1);
    g.strokeRoundedRect(-w / 2, top, w, h, C.radius);
  }

  private layoutAdLabel(): void {
    const C = HUD_LAYOUT.continue.ad;
    if (this.adsRemoved) {
      this.adLabel.setPosition(0, C.y);
      return;
    }
    const iconW = C.icon;
    const gap = C.iconGap;
    const textW = this.adLabel.width;
    const total = iconW + gap + textW;
    this.adIcon.setPosition(-total / 2 + iconW / 2, C.y);
    this.adLabel.setPosition(-total / 2 + iconW + gap + textW / 2, C.y);
  }

  private layoutBadge(): void {
    const C = HUD_LAYOUT.continue.badge;
    this.badgeLabel.setPosition(0, C.y + C.textY);
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
