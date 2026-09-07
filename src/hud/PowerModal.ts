import Phaser from "phaser";
import type { Economy } from "../powers/economy";
import type { PowerDef, PowerId } from "../powers/powerDefs";
import { t } from "../powers/locale";
import type { RewardedAdStatus } from "../bridge";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { GameAudio } from "../audio/GameAudio";
import { ScreenLoader } from "./ScreenLoader";
import { AdCountdown } from "./AdCountdown";
import { STUB_POWER_REWARDED_ADS, STUB_REWARDED_ADS } from "../bridge";
import { unavailableRewardedMessage } from "./rewardedCopy";

export type PowerModalMode =
  | "reload"
  | "first-use"
  | "info"
  | "confirm-olives"
  | "confirm-ad";

export type PowerBlockReason =
  | "empty-board"
  | "no-pairs"
  | "in-danger"
  | "waters-active"
  | "too-few-pieces";

export interface PowerModalOpenArgs {
  def: PowerDef;
  mode: PowerModalMode;
  blockReason?: PowerBlockReason;
  olives: number;
  rewardedAvailable: boolean;
}

type Handlers = {
  onClose: () => void;
  onUse: (id: PowerId) => void;
  onBuyOlives: (id: PowerId) => void | Promise<void>;
  onWatchAd: (id: PowerId) => Promise<RewardedAdStatus>;
  onOpenShop: () => void;
};

const BLOCK_COPY: Record<PowerBlockReason, { es: string; en: string; pt?: string }> = {
  "empty-board": {
    es: "El tablero está vacío.",
    en: "The board is empty.",
    pt: "O tabuleiro está vazio."
  },
  "no-pairs": {
    es: "No hay pares en el tablero.",
    en: "There are no pairs on the board.",
    pt: "Não há pares no tabuleiro."
  },
  "in-danger": {
    es: "Ya estás en peligro.",
    en: "You're already in the danger zone.",
    pt: "Você já está em perigo."
  },
  "waters-active": {
    es: "AGUAS aún están activas.",
    en: "WATERS are still active.",
    pt: "ÁGUAS ainda estão ativas."
  },
  "too-few-pieces": {
    es: "Necesitas al menos 5 animales en el arca.",
    en: "You need at least 5 animals in the ark.",
    pt: "Você precisa de pelo menos 5 animais na arca."
  }
};

/**
 * Modal de poder sobre fondo_modal.png.
 * boton1 = compra con hojas · boton2 = rewarded ad.
 */
export class PowerModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly closeHit: Phaser.GameObjects.Zone;
  private title!: Phaser.GameObjects.Text;
  private blurb!: Phaser.GameObjects.Text;
  private reasonText!: Phaser.GameObjects.Text;
  private olivesText!: Phaser.GameObjects.Text;
  private olivesIcon!: Phaser.GameObjects.Image;
  private statusText!: Phaser.GameObjects.Text;
  private buyBtn!: Phaser.GameObjects.Image;
  private buyIcon!: Phaser.GameObjects.Image;
  private buyLabel!: Phaser.GameObjects.Text;
  private adBtn!: Phaser.GameObjects.Image;
  private adLabel!: Phaser.GameObjects.Text;
  private useBtn!: Phaser.GameObjects.Image;
  private useLabel!: Phaser.GameObjects.Text;
  private icon!: Phaser.GameObjects.Image;
  private busy = false;
  private adLoading = false;
  private current: PowerModalOpenArgs | null = null;
  private handlers: Handlers | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly economy: Economy,
    private readonly renderScale: number
  ) {
    const M = HUD_LAYOUT.powerModal;
    const dy = M.contentOffsetY;
    this.root = scene.add.container(0, 0).setDepth(M.depth).setVisible(false);

    this.dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x1a1208, 0.72)
      .setInteractive();
    this.dim.on("pointerdown", () => {
      /* bloquea el tablero; no cierra */
    });

    this.panel = scene.add.container(195, M.panelY);

    const frame = scene.add
      .image(0, 0, "fondo_modal")
      .setDisplaySize(M.panelW, M.panelH);

    this.closeHit = scene.add.zone(M.close.x, M.close.y, M.close.hitW, M.close.hitH);
    this.closeHit.setInteractive({ useHandCursor: true });
    this.closeHit.on("pointerdown", () => {
      GameAudio.current?.onUiTap();
      this.handlers?.onClose();
    });

    this.title = scene.add
      .text(0, M.title.y, "", {
        ...this.style(M.title.fontSize, M.title.color, true),
        wordWrap: { width: M.title.maxWidth },
        align: "center",
        stroke: M.title.stroke,
        strokeThickness: M.title.strokeThickness
      })
      .setOrigin(0.5);

    this.icon = scene.add
      .image(0, M.icon.y + dy, "icon_de_dos")
      .setDisplaySize(M.icon.size, M.icon.size);

    this.blurb = scene.add
      .text(0, M.blurb.y + dy, "", {
        ...this.style(M.blurb.fontSize, M.blurb.color, true),
        wordWrap: { width: M.blurb.maxWidth },
        align: "center"
      })
      .setOrigin(0.5, 0);

    this.reasonText = scene.add
      .text(0, M.reason.y + dy, "", this.style(M.reason.fontSize, M.reason.color, true))
      .setOrigin(0.5)
      .setVisible(false);

    const buyX = -(M.buy.w / 2 + M.actionsGap / 2);
    const adX = M.ad.w / 2 + M.actionsGap / 2;
    const actionsY = M.actionsY + dy;

    this.buyBtn = scene.add
      .image(buyX, actionsY, M.buy.texture)
      .setDisplaySize(M.buy.w, M.buy.h)
      .setInteractive({ useHandCursor: true });
    this.buyIcon = scene.add
      .image(buyX - 18, actionsY - 2, "icon_olivo")
      .setDisplaySize(22, 22)
      .setOrigin(0.5);
    this.buyLabel = scene.add
      .text(buyX + 12, actionsY - 2, "", this.style(M.buy.fontSize, M.buy.labelColor, true))
      .setOrigin(0.5);
    this.buyBtn.on("pointerdown", () => {
      GameAudio.current?.onUiTap();
      void this.onBuyTap();
    });

    this.adBtn = scene.add
      .image(adX, actionsY, M.ad.texture)
      .setDisplaySize(M.ad.w, M.ad.h)
      .setInteractive({ useHandCursor: true });
    this.adLabel = scene.add
      .text(adX, actionsY - 2, "", this.style(M.ad.fontSize, M.ad.labelColor, true))
      .setOrigin(0.5);
    this.adBtn.on("pointerdown", () => {
      GameAudio.current?.onUiTap();
      void this.onAdTap();
    });

    this.useBtn = scene.add
      .image(0, actionsY, M.use.texture)
      .setDisplaySize(M.use.w, M.use.h)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.useLabel = scene.add
      .text(
        0,
        actionsY - 2,
        t({ es: "USAR", en: "USE", pt: "USAR" }),
        this.style(M.use.fontSize, M.use.labelColor, true)
      )
      .setOrigin(0.5)
      .setVisible(false);
    this.useBtn.on("pointerdown", () => {
      if (!this.current || this.busy) return;
      GameAudio.current?.onUiTap();
      this.handlers?.onUse(this.current.def.id);
    });

    this.olivesIcon = scene.add
      .image(-72, M.olives.y, "icon_olivo")
      .setDisplaySize(22, 22)
      .setOrigin(0.5);
    this.olivesText = scene.add
      .text(12, M.olives.y, "", this.style(M.olives.fontSize, M.olives.color, true))
      .setOrigin(0.5);

    this.statusText = scene.add
      .text(0, M.status.y + dy, "", this.style(M.status.fontSize, M.status.color))
      .setOrigin(0.5)
      .setVisible(false);

    this.panel.add([
      frame,
      this.title,
      this.icon,
      this.blurb,
      this.reasonText,
      this.buyBtn,
      this.buyIcon,
      this.buyLabel,
      this.adBtn,
      this.adLabel,
      this.useBtn,
      this.useLabel,
      this.olivesIcon,
      this.olivesText,
      this.statusText,
      this.closeHit
    ]);
    this.root.add([this.dim, this.panel]);
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  open(args: PowerModalOpenArgs): void {
    this.current = args;
    this.busy = false;
    this.adLoading = false;
    this.statusText.setVisible(false).setText("");
    this.panel.setVisible(true);
    this.dim.setVisible(true);
    this.root.setVisible(true);
    this.panel.bringToTop(this.closeHit);

    const def = args.def;
    const M = HUD_LAYOUT.powerModal;

    this.title.setText(t(def.name).toUpperCase());
    this.icon.setTexture(def.iconTexture).setDisplaySize(M.icon.size, M.icon.size);
    this.blurb.setText(t(def.blurb));
    this.refreshOlives(args.olives);

    const isInfo = args.mode === "info";
    const isFirst = args.mode === "first-use";
    const isReload = args.mode === "reload";
    const isConfirmOlives = args.mode === "confirm-olives";
    const isConfirmAd = args.mode === "confirm-ad";

    this.reasonText.setVisible(!!args.blockReason);
    if (args.blockReason) {
      this.reasonText.setText(t(BLOCK_COPY[args.blockReason]));
    }

    this.useBtn.setVisible(isFirst);
    this.useLabel.setVisible(isFirst);
    this.buyBtn.setVisible(isReload || isConfirmOlives);
    this.buyIcon.setVisible(isReload || isConfirmOlives);
    this.buyLabel.setVisible(isReload || isConfirmOlives);
    this.adBtn.setVisible((isReload || isConfirmAd) && def.rewardedEligible);
    this.adLabel.setVisible((isReload || isConfirmAd) && def.rewardedEligible);

    if (isInfo) {
      this.buyBtn.setVisible(false);
      this.buyIcon.setVisible(false);
      this.buyLabel.setVisible(false);
      this.adBtn.setVisible(false);
      this.adLabel.setVisible(false);
      this.useBtn.setVisible(false);
      this.useLabel.setVisible(false);
    }

    if (isReload) {
      this.blurb.setText(
        t({
          es: `Gasta ${def.oliveCost} olivos o mira un anuncio para obtener 1 uso.`,
          en: `Spend ${def.oliveCost} olive leaves or watch an ad for 1 use.`,
          pt: `Gaste ${def.oliveCost} azeitonas ou assista a um anúncio para 1 uso.`
        })
      );
    }

    if (isConfirmOlives) {
      this.adBtn.setVisible(false);
      this.adLabel.setVisible(false);
      this.blurb.setText(
        t({
          es: `Vas a gastar ${def.oliveCost} olivos para obtener 1 uso de ${t(def.name)}. ¿Seguro?`,
          en: `You'll spend ${def.oliveCost} olive leaves for 1 use of ${t(def.name)}. Continue?`,
          pt: `Você vai gastar ${def.oliveCost} azeitonas para 1 uso de ${t(def.name)}. Continuar?`
        })
      );
    }

    if (isConfirmAd) {
      this.buyBtn.setVisible(false);
      this.buyIcon.setVisible(false);
      this.buyLabel.setVisible(false);
      this.blurb.setText(
        t({
          es: `Vas a ver un anuncio para obtener 1 uso de ${t(def.name)}. ¿Seguro?`,
          en: `You'll watch an ad to get 1 use of ${t(def.name)}. Continue?`,
          pt: `Você vai assistir a um anúncio para 1 uso de ${t(def.name)}. Continuar?`
        })
      );
    }

    this.layoutActionButtons();

    if (isReload || isConfirmOlives) {
      this.paintBuyButton(args.olives, def.oliveCost);
    }
    if (isReload || isConfirmAd) {
      this.paintAdButton(args.rewardedAvailable);
    }
  }

  close(): void {
    this.root.setVisible(false);
    this.current = null;
    this.busy = false;
    this.adLoading = false;
  }

  refreshOlives(n: number): void {
    this.olivesText.setText(
      t({
        es: `Olivos actuales: ${n}`,
        en: `Current olive leaves: ${n}`,
        pt: `Azeitonas atuais: ${n}`
      })
    );
    if (this.current?.mode === "reload" || this.current?.mode === "confirm-olives") {
      this.paintBuyButton(n, this.current.def.oliveCost);
    }
  }

  setStatus(msg: string): void {
    this.statusText.setText(msg).setVisible(!!msg);
  }

  setRewardedAvailable(available: boolean): void {
    if (this.current) this.current.rewardedAvailable = available;
    this.paintAdButton(available);
  }

  destroy(): void {
    this.root.destroy(true);
  }

  /** Compra y ad lado a lado; en confirmación el CTA queda al centro. */
  private layoutActionButtons(): void {
    const M = HUD_LAYOUT.powerModal;
    const actionsY = M.actionsY + M.contentOffsetY;
    const buySideX = -(M.buy.w / 2 + M.actionsGap / 2);
    const adSideX = M.ad.w / 2 + M.actionsGap / 2;
    const mode = this.current?.mode;
    const buyX = mode === "confirm-olives" ? 0 : buySideX;
    const adX = mode === "confirm-ad" ? 0 : adSideX;

    this.buyBtn.setPosition(buyX, actionsY);
    this.buyIcon.setPosition(buyX - 18, actionsY - 2);
    this.buyLabel.setPosition(buyX + 12, actionsY - 2);
    this.adBtn.setPosition(adX, actionsY);
    this.adLabel.setPosition(adX, actionsY - 2);
    this.useBtn.setPosition(0, actionsY);
    this.useLabel.setPosition(0, actionsY - 2);
  }

  private paintBuyButton(olives: number, cost: number): void {
    const M = HUD_LAYOUT.powerModal;
    this.buyLabel.setText(
      this.current?.mode === "confirm-olives"
        ? t({ es: "SÍ", en: "YES", pt: "SIM" })
        : String(cost)
    );
    if (olives >= cost) {
      this.buyBtn.setAlpha(1).clearTint();
      this.buyIcon.setAlpha(1);
      this.buyLabel.setColor(M.buy.labelColor).setAlpha(1);
    } else {
      this.buyBtn.setAlpha(0.75).setTint(0xc8c0a8);
      this.buyIcon.setAlpha(0.75);
      this.buyLabel.setColor(M.buy.labelColor).setAlpha(0.7);
    }
  }

  private paintAdButton(available: boolean): void {
    const M = HUD_LAYOUT.powerModal;
    if (this.adLoading) {
      this.adBtn.setAlpha(0.55).setTint(0x888888);
      this.adBtn.disableInteractive();
      this.adLabel.setAlpha(0.8).setColor(M.ad.labelColor);
      this.adLabel.setText(t({ es: "Cargando…", en: "Loading…", pt: "Carregando…" }));
      return;
    }
    this.adBtn.setInteractive({ useHandCursor: true });
    if (available) {
      this.adBtn.setAlpha(1).clearTint();
      this.adLabel.setAlpha(1).setColor(M.ad.labelColor);
      this.adLabel.setText(
        t({ es: "VER ANUNCIO", en: "WATCH AD", pt: "VER ANÚNCIO" })
      );
    } else {
      this.adBtn.setAlpha(0.55).setTint(0x888888);
      this.adLabel.setAlpha(0.8).setColor(M.ad.labelColor);
      this.adLabel.setText(t({ es: "Sin anuncio", en: "No ad", pt: "Sem anúncio" }));
    }
  }

  private async onBuyTap(): Promise<void> {
    if (
      !this.current ||
      this.busy ||
      (this.current.mode !== "reload" && this.current.mode !== "confirm-olives")
    ) {
      return;
    }
    const def = this.current.def;
    if (this.economy.getOlives() < def.oliveCost) {
      this.handlers?.onOpenShop();
      return;
    }
    this.busy = true;
    await this.handlers?.onBuyOlives(def.id);
    this.busy = false;
  }

  private async onAdTap(): Promise<void> {
    if (
      !this.current ||
      this.busy ||
      this.adLoading ||
      (this.current.mode !== "reload" && this.current.mode !== "confirm-ad")
    ) {
      return;
    }
    if (!this.current.rewardedAvailable) {
      this.setStatus(
        t({
          es: "No hay anuncios disponibles, intenta más tarde",
          en: "No ads available, try again later",
          pt: "Não há anúncios disponíveis, tente mais tarde"
        })
      );
      return;
    }
    this.adLoading = true;
    this.paintAdButton(this.current.rewardedAvailable);

    let status: RewardedAdStatus;
    if (STUB_REWARDED_ADS || STUB_POWER_REWARDED_ADS) {
      this.panel.setVisible(false);
      this.dim.setVisible(false);
      this.closeHit.disableInteractive();
      await AdCountdown.play(this.root.scene, 3);
      try {
        status = await this.handlers!.onWatchAd(this.current.def.id);
      } finally {
        this.closeHit.setInteractive({ useHandCursor: true });
      }
    } else {
      this.setStatus(
        t({
          es: "Cargando anuncio…",
          en: "Loading ad…",
          pt: "Carregando anúncio…"
        })
      );
      ScreenLoader.current?.show();
      try {
        status = await this.handlers!.onWatchAd(this.current.def.id);
      } finally {
        ScreenLoader.current?.hide();
      }
    }
    this.adLoading = false;
    if (!this.root.visible || !this.current) return;
    this.paintAdButton(this.current.rewardedAvailable);
    if (status === "completed") return;
    if (status === "unavailable") {
      this.setRewardedAvailable(false);
      this.setStatus(unavailableRewardedMessage());
      return;
    }
    if (status === "dismissed") {
      this.setStatus(
        t({
          es: "Video cancelado.",
          en: "Video dismissed.",
          pt: "Vídeo cancelado."
        })
      );
      return;
    }
    this.setStatus(
      t({
        es: "No hay anuncios disponibles, intenta más tarde",
        en: "No ads available, try again later",
        pt: "Não há anúncios disponíveis, tente mais tarde"
      })
    );
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
