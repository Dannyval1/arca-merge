import Phaser from "phaser";
import {
  getShopPrice,
  onShopCatalog,
  purchaseOlives,
  requestRemoveAds,
  requestShopCatalog,
  restorePurchases as requestRestorePurchases,
  type PurchaseStatus
} from "../bridge";
import { isNetworkOnline } from "../networkStatus";
import type { Economy } from "../powers/economy";
import { t } from "../powers/locale";
import {
  SHOP_OLIVE_PACKAGES,
  SHOP_REMOVE_ADS,
  SHOP_RIBBON_LABEL,
  SHOP_RIBBON_TEXTURE,
  type ShopOlivePackage
} from "./shopConfig";
import { HUD_LAYOUT } from "./hudLayout";
import { addNineSlice, type SlicedSprite } from "./nineSlice";
import { NUNITO_FAMILY } from "../fonts";
import { hasAdsRemoved, markAdsRemoved } from "../adsRemoved";
import { GameAudio } from "../audio/GameAudio";
import { ScreenLoader } from "./ScreenLoader";

function uiTap(): void {
  GameAudio.current?.onUiTap();
}

function inNativeShell(): boolean {
  return typeof window !== "undefined" && !!window.ReactNativeWebView;
}

type Handlers = {
  onClose: () => void;
  onOlivesChanged: () => void;
  onOlivesPurchased: (amount: number, fromX: number, fromY: number) => void;
  onAdsRemoved: () => void;
};

type BuyBtn = {
  idle: SlicedSprite;
  pressed: SlicedSprite;
  label: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
  enabled: boolean;
};

type PackCard = {
  pkg: ShopOlivePackage;
  buy: BuyBtn;
  fromX: number;
  fromY: number;
};

type SectionHead = {
  left: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  right: Phaser.GameObjects.Image;
};

/**
 * Tienda: paquetes en fila, quitar anuncios, saldo + restaurar.
 * Precios solo desde RevenueCat (`shop_catalog`). Nunca un $ inventado.
 */
export class ShopModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly closeBtn: Phaser.GameObjects.Image;
  private readonly packsHead: SectionHead;
  private readonly adsHead: SectionHead;
  private readonly saldoHead: SectionHead;
  private readonly adsRoot: Phaser.GameObjects.Container;
  private readonly saldoRoot: Phaser.GameObjects.Container;
  private readonly adsBuy: BuyBtn;
  private readonly adsSub: Phaser.GameObjects.Text;
  private readonly olivesText: Phaser.GameObjects.Text;
  private readonly restoreLabel: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly packs: PackCard[] = [];
  private readonly panelX: number;
  private readonly panelY: number;
  private readonly adsBlockH: number;
  private readonly saldoHomeY: number;
  private busy = false;
  private handlers: Handlers | null = null;
  private unsubCatalog: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly economy: Economy,
    private readonly renderScale: number
  ) {
    const S = HUD_LAYOUT.shopModal;
    const C = S.colors;
    const half = S.contentHalfW;
    const contentW = half * 2;
    this.panelX = 195;
    this.panelY = S.panelY;

    this.root = scene.add.container(0, 0).setDepth(S.depth).setVisible(false);

    const dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.72)
      .setInteractive();

    this.panel = scene.add.container(this.panelX, this.panelY);

    const frame = addNineSlice(
      scene,
      0,
      0,
      "modal_frame",
      S.frame.w,
      S.frame.h,
      S.slices.frame
    );
    const header = addNineSlice(
      scene,
      0,
      S.header.y,
      "modal_header",
      S.header.w,
      S.header.h,
      S.slices.header
    );

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
      this.handlers?.onClose();
    });
    this.closeBtn.on("pointerout", () => {
      this.closeBtn.setTexture("btn_close");
    });

    this.panel.add([frame, header, this.titleText, this.closeBtn]);

    let y = S.contentTop + S.section.firstMarginTop;
    this.packsHead = this.addSectionHead(scene, y);
    y += S.section.fontSize / 2 + S.section.packsGapAfter;
    const card = S.card;

    const rowW = 3 * card.w + 2 * card.gap;
    const cardTop = y;
    for (let i = 0; i < SHOP_OLIVE_PACKAGES.length; i++) {
      const pkg = SHOP_OLIVE_PACKAGES[i];
      const cx = -rowW / 2 + card.w / 2 + i * (card.w + card.gap);
      const cy = cardTop + card.h / 2;
      this.packs.push(this.buildCard(scene, pkg, cx, cy));
    }
    y = cardTop + card.h + S.section.adsMarginTop;

    const adsHeadY = y;
    this.adsHead = this.addSectionHead(scene, adsHeadY);
    y += S.section.fontSize + S.section.gapAfter;
    const adsCenter = y + S.ads.h / 2;
    this.adsRoot = scene.add.container(0, 0);
    const adsBg = scene.add.graphics();
    this.drawChip(
      adsBg,
      0,
      adsCenter,
      contentW,
      S.ads.h,
      S.ads.radius,
      C.adsFill,
      C.adsStroke
    );
    const adsIcon = scene.add
      .image(-half + 20, adsCenter, "icon_no_ads_2")
      .setDisplaySize(S.ads.icon, S.ads.icon);
    this.adsSub = scene.add
      .text(-half + 42, adsCenter, "", {
        ...this.bodyStyle(10, C.labelMuted),
        wordWrap: { width: contentW - S.ads.btnW - 64 }
      })
      .setOrigin(0, 0.5);
    this.adsRoot.add([adsBg, adsIcon, this.adsSub]);
    this.adsBuy = this.makeBuyButton(
      scene,
      half - S.ads.btnW / 2 - 4,
      adsCenter,
      S.ads.btnW,
      S.ads.btnH,
      () => void this.buyRemoveAds(),
      this.adsRoot
    );
    this.panel.add(this.adsRoot);
    y += S.ads.h;
    this.adsBlockH = y - adsHeadY;
    y += S.section.saldoMarginTop;

    this.saldoHomeY = 0;
    this.saldoRoot = scene.add.container(0, 0);
    const saldoHeadY = y;
    this.saldoHead = this.addSectionHead(scene, saldoHeadY);
    y += S.section.fontSize + S.section.gapAfter + S.balance.rowOffsetY;
    const balCenter = y + S.balance.h / 2;
    const pillBg = scene.add.graphics();
    this.drawChip(
      pillBg,
      -half + S.balance.pillW / 2,
      balCenter,
      S.balance.pillW,
      S.balance.h,
      S.balance.radius,
      C.pillFill,
      C.pillStroke
    );
    const leaf = scene.add
      .image(-half + 18, balCenter, "hoja_olivo")
      .setDisplaySize(S.balance.icon, S.balance.icon);
    this.olivesText = scene.add
      .text(-half + 32, balCenter, "", this.bodyStyle(S.balance.fontSize, C.label, true))
      .setOrigin(0, 0.5);
    this.restoreLabel = scene.add
      .text(half, balCenter, "", this.bodyStyle(10, C.label, true))
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    this.restoreLabel.on("pointerdown", () => {
      uiTap();
      this.restorePurchases();
    });
    this.saldoRoot.add([pillBg, leaf, this.olivesText, this.restoreLabel]);
    this.panel.add(this.saldoRoot);

    this.statusText = scene.add
      .text(0, S.footerY, "", this.bodyStyle(10, C.labelMuted))
      .setOrigin(0.5);
    this.panel.add(this.statusText);

    this.root.add([dim, this.panel]);
    this.relabel();
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.busy = false;
    this.statusText.setText("");
    this.unsubCatalog?.();
    this.unsubCatalog = onShopCatalog(() => this.paintPrices());
    if (!isNetworkOnline()) {
      this.statusText.setText(
        t({
          es: "Sin conexión. Las compras no están disponibles.",
          en: "You're offline. Purchases are unavailable.",
          pt: "Sem conexão. Compras indisponíveis."
        })
      );
    } else {
      requestShopCatalog();
    }
    this.relabel();
    this.root.setVisible(true);
  }

  close(): void {
    this.root.setVisible(false);
    this.busy = false;
    this.unsubCatalog?.();
    this.unsubCatalog = null;
  }

  destroy(): void {
    this.unsubCatalog?.();
    this.root.destroy(true);
  }

  private async restorePurchases(): Promise<void> {
    if (this.busy) return;
    uiTap();
    if (!isNetworkOnline()) {
      this.statusText.setText(
        t({
          es: "Sin conexión. No se pueden restaurar compras.",
          en: "You're offline. Can't restore purchases.",
          pt: "Sem conexão. Não é possível restaurar compras."
        })
      );
      return;
    }
    this.busy = true;
    this.statusText.setText(
      t({
        es: "Restaurando compras…",
        en: "Restoring purchases…",
        pt: "Restaurando compras…"
      })
    );
    ScreenLoader.current?.show();
    const status = await requestRestorePurchases();
    ScreenLoader.current?.hide();
    this.busy = false;
    if (!this.root.visible) return;

    if (status === "completed") {
      markAdsRemoved();
      this.layoutAdsRemoved();
      this.handlers?.onAdsRemoved();
      this.statusText.setText(
        t({
          es: "Compras restauradas.",
          en: "Purchases restored.",
          pt: "Compras restauradas."
        })
      );
      return;
    }
    if (status === "unavailable") {
      this.statusText.setText(
        t({
          es: "No hay compras para restaurar.",
          en: "No purchases to restore.",
          pt: "Não há compras para restaurar."
        })
      );
      return;
    }
    this.setStatus(status);
  }

  private async buyPackage(pack: PackCard): Promise<void> {
    if (this.busy || !pack.buy.enabled) return;
    this.busy = true;
    this.setStatus("processing");
    ScreenLoader.current?.show();
    const result = await purchaseOlives(pack.pkg.id);
    ScreenLoader.current?.hide();
    this.busy = false;
    if (!this.root.visible) return;

    if (result.status === "completed") {
      const n = result.olivesGranted || pack.pkg.olives;
      this.economy.grantOlives(n);
      this.refreshOlives();
      this.handlers?.onOlivesChanged();
      const worldX = this.panelX + pack.fromX;
      const worldY = this.panelY + pack.fromY;
      this.handlers?.onOlivesPurchased(n, worldX, worldY);
      this.statusText.setText(
        t({
          es: `+${n} hojas`,
          en: `+${n} leaves`,
          pt: `+${n} folhas`
        })
      );
      return;
    }
    this.setStatus(result.status);
  }

  private async buyRemoveAds(): Promise<void> {
    if (this.busy || hasAdsRemoved() || !this.adsBuy.enabled) return;
    this.busy = true;
    this.setStatus("processing");
    ScreenLoader.current?.show();
    const status = await requestRemoveAds();
    ScreenLoader.current?.hide();
    this.busy = false;
    if (!this.root.visible) return;

    if (status === "completed") {
      markAdsRemoved();
      this.layoutAdsRemoved();
      this.handlers?.onAdsRemoved();
      this.statusText.setText(
        t({
          es: "Anuncios desactivados.",
          en: "Ads removed.",
          pt: "Anúncios desativados."
        })
      );
      return;
    }
    this.setStatus(status);
  }

  private setStatus(kind: PurchaseStatus | "processing"): void {
    if (kind === "processing") {
      this.statusText.setText(
        t({ es: "Procesando compra…", en: "Processing…", pt: "Processando…" })
      );
      return;
    }
    if (kind === "cancelled") {
      this.statusText.setText(
        t({
          es: "Compra cancelada.",
          en: "Purchase cancelled.",
          pt: "Compra cancelada."
        })
      );
      return;
    }
    if (kind === "unavailable") {
      this.statusText.setText(
        t({
          es: "Tienda no disponible.",
          en: "Store unavailable.",
          pt: "Loja indisponível."
        })
      );
      return;
    }
    if (kind === "pending") {
      this.statusText.setText(
        t({
          es: "Compra pendiente de aprobación.",
          en: "Purchase pending approval.",
          pt: "Compra pendente de aprovação."
        })
      );
      return;
    }
    this.statusText.setText(
      t({ es: "Compra fallida.", en: "Purchase failed.", pt: "Compra falhou." })
    );
  }

  private relabel(): void {
    const S = HUD_LAYOUT.shopModal;
    this.titleText.setText(
      t({ es: "TIENDA", en: "SHOP", pt: "LOJA" }).toUpperCase()
    );
    this.setSectionText(
      this.packsHead,
      t({
        es: "PAQUETES DE HOJAS DE OLIVO",
        en: "OLIVE LEAF PACKS",
        pt: "PACOTES DE FOLHAS DE OLIVEIRA"
      })
    );
    this.setSectionText(
      this.adsHead,
      t({
        es: "QUITAR ANUNCIOS",
        en: "REMOVE ADS",
        pt: "REMOVER ANÚNCIOS"
      })
    );
    this.setSectionText(
      this.saldoHead,
      t({ es: "TU SALDO", en: "YOUR BALANCE", pt: "SEU SALDO" })
    );
    this.adsSub.setText(
      t({
        es: "Disfruta el Arca sin anuncios",
        en: "Enjoy the Ark ad-free",
        pt: "Aproveite a Arca sem anúncios"
      })
    );
    this.restoreLabel.setText(
      t({
        es: "Restaurar compras",
        en: "Restore purchases",
        pt: "Restaurar compras"
      })
    );
    const restoreMax = S.contentHalfW * 2 - S.balance.pillW - 16;
    this.restoreLabel.setFontSize(10);
    if (this.restoreLabel.width > restoreMax) this.restoreLabel.setFontSize(8);
    this.refreshOlives();
    this.paintPrices();
    this.layoutAdsRemoved();
    this.paintRibbons();
  }

  private paintRibbons(): void {
    const maxW = HUD_LAYOUT.shopModal.card.ribbonW - 12;
    const font = HUD_LAYOUT.shopModal.card.ribbonFont;
    for (const pack of this.packs) {
      if (!pack.pkg.ribbon) continue;
      const ribbon = this.panel.getByName(`ribbon_${pack.pkg.id}`) as
        | Phaser.GameObjects.Text
        | null;
      if (!ribbon) continue;
      ribbon.setFontSize(font);
      ribbon.setText(t(SHOP_RIBBON_LABEL[pack.pkg.ribbon]));
      if (ribbon.width > maxW) ribbon.setFontSize(Math.max(6, font - 1));
    }
  }

  private refreshOlives(): void {
    this.olivesText.setText(String(this.economy.getOlives()));
  }

  private paintPrices(): void {
    const native = inNativeShell();
    const offline = !isNetworkOnline();
    for (const pack of this.packs) {
      const price = offline ? null : getShopPrice(pack.pkg.id);
      this.setBuyPrice(pack.buy, price, native, offline);
    }
    const adsPrice = offline ? null : getShopPrice(SHOP_REMOVE_ADS.id);
    this.setBuyPrice(this.adsBuy, adsPrice, native, offline);
  }

  private setBuyPrice(
    btn: BuyBtn,
    price: string | null,
    native: boolean,
    offline = false
  ): void {
    if (offline) {
      btn.enabled = false;
      btn.label.setText(
        t({ es: "Sin conexión", en: "Offline", pt: "Sem conexão" })
      );
      btn.idle.setAlpha(0.45);
      btn.pressed.setAlpha(0);
      btn.label.setAlpha(0.45);
      btn.hit.disableInteractive();
      return;
    }
    const ready = !!price;
    btn.enabled = ready || !native;
    btn.label.setText(price ?? "…");
    const alpha = btn.enabled ? 1 : 0.45;
    btn.idle.setAlpha(alpha);
    btn.pressed.setAlpha(0);
    btn.label.setAlpha(alpha);
    if (btn.enabled) btn.hit.setInteractive({ useHandCursor: true });
    else btn.hit.disableInteractive();
  }

  private layoutAdsRemoved(): void {
    const gone = hasAdsRemoved();
    this.adsHead.left.setVisible(!gone);
    this.adsHead.text.setVisible(!gone);
    this.adsHead.right.setVisible(!gone);
    this.adsRoot.setVisible(!gone);
    if (gone) this.adsBuy.hit.disableInteractive();
    this.saldoRoot.y = gone ? -this.adsBlockH : this.saldoHomeY;
    this.saldoHead.left.y =
      (this.saldoHead.left.getData("homeY") as number) + this.saldoRoot.y;
    this.saldoHead.text.y =
      (this.saldoHead.text.getData("homeY") as number) + this.saldoRoot.y;
    this.saldoHead.right.y =
      (this.saldoHead.right.getData("homeY") as number) + this.saldoRoot.y;
  }

  private addSectionHead(scene: Phaser.Scene, y: number): SectionHead {
    const S = HUD_LAYOUT.shopModal;
    const left = scene.add
      .image(0, y, "section_leaf")
      .setDisplaySize(S.section.leaf, S.section.leaf)
      .setFlipX(true)
      .setData("homeY", y);
    const text = scene.add
      .text(0, y, "", this.bodyStyle(S.section.fontSize, S.colors.label, true))
      .setOrigin(0.5)
      .setData("homeY", y);
    const right = scene.add
      .image(0, y, "section_leaf")
      .setDisplaySize(S.section.leaf, S.section.leaf)
      .setData("homeY", y);
    this.panel.add([left, text, right]);
    return { left, text, right };
  }

  private setSectionText(head: SectionHead, label: string): void {
    const S = HUD_LAYOUT.shopModal;
    const contentW = S.contentHalfW * 2;
    head.text.setFontSize(S.section.fontSize);
    head.text.setText(label.toUpperCase());
    let size = S.section.fontSize;
    const leafSpace = 2 * (S.section.leaf + S.section.leafGap + 2);
    while (size > 7 && head.text.width + leafSpace > contentW) {
      size -= 1;
      head.text.setFontSize(size);
    }
    const tw = head.text.width;
    const gap = S.section.leafGap + S.section.leaf / 2;
    head.left.x = -tw / 2 - gap;
    head.right.x = tw / 2 + gap;
  }

  private buildCard(
    scene: Phaser.Scene,
    pkg: ShopOlivePackage,
    cx: number,
    cy: number
  ): PackCard {
    const S = HUD_LAYOUT.shopModal;
    const C = S.colors;
    const card = S.card;
    const bg = scene.add.graphics();
    this.drawChip(
      bg,
      cx,
      cy,
      card.w,
      card.h,
      card.radius,
      C.cardFill,
      C.cardStroke,
      card.strokeWidth
    );
    const artY = cy - card.h / 2 + card.artPad + card.art / 2;
    const art = scene.add
      .image(cx, artY, pkg.art)
      .setDisplaySize(card.art, card.art);
    const buyY = cy + card.h / 2 - card.buyPad - card.buyH / 2;
    const amountY = (artY + card.art / 2 + buyY - card.buyH / 2) / 2;
    const leaf = scene.add
      .image(cx, amountY, "hoja_olivo")
      .setDisplaySize(14, 14);
    const amount = scene.add
      .text(cx, amountY, `x${pkg.olives}`, this.bodyStyle(card.amountFont, C.label, true))
      .setOrigin(0, 0.5);
    const clusterW = 14 + 4 + amount.width;
    leaf.setPosition(cx - clusterW / 2 + 7, amountY);
    amount.setPosition(leaf.x + 11, amountY);
    this.panel.add([bg, art, leaf, amount]);
    const buy = this.makeBuyButton(
      scene,
      cx,
      buyY,
      card.buyW,
      card.buyH,
      () => {
        const found = this.packs.find((p) => p.pkg.id === pkg.id);
        if (found) void this.buyPackage(found);
      },
      this.panel
    );

    if (pkg.ribbon) {
      const ry = cy - card.h / 2 - card.ribbonLift;
      const ribbon = addNineSlice(
        scene,
        cx,
        ry,
        SHOP_RIBBON_TEXTURE[pkg.ribbon],
        card.ribbonW,
        card.ribbonH,
        S.slices.ribbon
      );
      const rText = scene.add
        .text(cx, ry + card.ribbonTextOffsetY, "", {
          ...this.bodyStyle(card.ribbonFont, C.ribbonText, true),
          align: "center"
        })
        .setOrigin(0.5)
        .setName(`ribbon_${pkg.id}`);
      this.panel.add([ribbon, rText]);
    }

    return { pkg, buy, fromX: cx, fromY: buyY };
  }

  private makeBuyButton(
    scene: Phaser.Scene,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onClick: () => void,
    parent: Phaser.GameObjects.Container
  ): BuyBtn {
    const S = HUD_LAYOUT.shopModal;
    const idle = addNineSlice(scene, cx, cy, "btn_buy", w, h, S.slices.buy);
    const pressed = addNineSlice(
      scene,
      cx,
      cy,
      "btn_buy_pressed",
      w,
      h,
      S.slices.buy
    );
    pressed.setVisible(false);
    const label = scene.add
      .text(cx, cy, "…", this.bodyStyle(S.card.buyFont, S.colors.buyText, true))
      .setOrigin(0.5);
    const hit = scene.add
      .rectangle(cx, cy, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    const showPressed = (on: boolean): void => {
      idle.setVisible(!on);
      pressed.setVisible(on);
    };
    hit.on("pointerdown", () => {
      if (!btn.enabled || this.busy) return;
      showPressed(true);
      uiTap();
    });
    hit.on("pointerup", () => {
      showPressed(false);
      if (!btn.enabled || this.busy) return;
      onClick();
    });
    hit.on("pointerout", () => showPressed(false));
    parent.add([idle, pressed, label, hit]);
    const btn: BuyBtn = { idle, pressed, label, hit, enabled: false };
    return btn;
  }

  private drawChip(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    radius: number,
    fill: number,
    stroke: number,
    strokeWidth = 1.75
  ): void {
    const x = cx - w / 2;
    const y = cy - h / 2;
    g.clear();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, y, w, h, radius);
    g.lineStyle(strokeWidth, stroke, 1);
    g.strokeRoundedRect(x, y, w, h, radius);
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
