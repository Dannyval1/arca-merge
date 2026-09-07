import Phaser from "phaser";
import { restorePurchases as requestRestorePurchases, sendToShell } from "../bridge";
import { isNetworkOnline } from "../networkStatus";
import { isPrivacyOptionsRequired } from "../privacyOptions";
import { POWER_DEFS } from "../powers/powerDefs";
import {
  getGameLocale,
  setGameLocale,
  t,
  type GameLocale
} from "../powers/locale";
import { GameAudio } from "../audio/GameAudio";
import {
  getSettingsPrefs,
  setSettingsPrefs,
  type SettingsPrefs
} from "../settingsPrefs";
import { HUD_LAYOUT } from "./hudLayout";
import { NUNITO_FAMILY } from "../fonts";
import { hasAdsRemoved, markAdsRemoved } from "../adsRemoved";
import { ScreenLoader } from "./ScreenLoader";

function uiTap(): void {
  GameAudio.current?.onUiTap();
}

type Handlers = {
  onClose: () => void;
  onLocaleChanged?: () => void;
  onPrefsChanged?: () => void;
  onOpenShop?: () => void;
  onNewGame?: () => void;
  onGoHome?: () => void;
};

type ToggleRow = {
  key: keyof SettingsPrefs;
  icon: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  toggle: Phaser.GameObjects.Image;
};

/**
 * Modal de Ajustes con modal_frame / modal_header / toggles del art pack.
 * Layout calibrado al mock: padding lateral amplio + footer no pegado abajo.
 */
export class SettingsModal {
  private readonly root: Phaser.GameObjects.Container;
  private readonly mainPanel: Phaser.GameObjects.Container;
  private readonly helpPanel: Phaser.GameObjects.Container;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly closeBtn: Phaser.GameObjects.Image;
  private readonly langButtons: {
    locale: GameLocale;
    bg: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    index: number;
  }[] = [];
  private readonly langRowBg: Phaser.GameObjects.Graphics;
  private langTabGeom = { y: 0, w: 0, h: 0, cellW: 0 };
  private readonly toggleRows: ToggleRow[] = [];
  private readonly adsTitle: Phaser.GameObjects.Text;
  private readonly adsSub: Phaser.GameObjects.Text;
  private readonly helpBtnLabel: Phaser.GameObjects.Text;
  private readonly restoreLabel: Phaser.GameObjects.Text;
  private readonly privacyLabel: Phaser.GameObjects.Text;
  private readonly consentLabel: Phaser.GameObjects.Text;
  private readonly langSectionLabel: Phaser.GameObjects.Text;
  private readonly footerRoot: Phaser.GameObjects.Container;
  private readonly gameActionsRoot: Phaser.GameObjects.Container;
  private readonly newGameLabel: Phaser.GameObjects.Text;
  private readonly goHomeLabel: Phaser.GameObjects.Text;
  private readonly confirmRoot: Phaser.GameObjects.Container;
  private readonly confirmTitle: Phaser.GameObjects.Text;
  private readonly confirmBody: Phaser.GameObjects.Text;
  private readonly confirmYesLabel: Phaser.GameObjects.Text;
  private handlers: Handlers | null = null;
  private busy = false;
  private pendingAction: "new" | "home" | null = null;
  /** true = Ayuda abierta desde Ajustes; false = abierta desde el ? del Inicio. */
  private helpFromSettings = true;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number
  ) {
    const S = HUD_LAYOUT.settingsModal;
    const C = S.colors;
    const half = S.contentHalfW;
    const contentW = half * 2;

    this.root = scene.add.container(0, 0).setDepth(S.depth).setVisible(false);

    const dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.72)
      .setInteractive();

    this.mainPanel = scene.add.container(195, S.panelY);
    this.helpPanel = scene.add.container(195, S.panelY).setVisible(false);

    const frame = scene.add
      .image(0, 0, "modal_frame")
      .setDisplaySize(S.frame.w, S.frame.h);

    const header = scene.add
      .image(0, S.header.y, "modal_header")
      .setDisplaySize(S.header.w, S.header.h);

    this.titleText = scene.add
      .text(0, S.title.y, "AJUSTES", {
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

    this.mainPanel.add([frame, header, this.titleText, this.closeBtn]);

    // —— Idioma ——
    let y = S.contentTop;
    this.langSectionLabel = scene.add
      .text(-half, y, "🌐  Idioma", this.bodyStyle(13, C.label, true))
      .setOrigin(0, 0.5);
    this.mainPanel.add(this.langSectionLabel);
    y += 26;

    const segH = S.langSeg.h;
    const langW = contentW * S.langSeg.widthRatio;
    const cellW = langW / 3;
    this.langTabGeom = { y, w: langW, h: segH, cellW };
    this.langRowBg = scene.add.graphics();
    this.mainPanel.add(this.langRowBg);

    const locales: { locale: GameLocale; label: string }[] = [
      { locale: "es", label: "ES" },
      { locale: "en", label: "EN" },
      { locale: "pt", label: "PT" }
    ];
    for (let i = 0; i < locales.length; i++) {
      const { locale, label } = locales[i];
      const x = -langW / 2 + cellW * (i + 0.5);
      const bg = scene.add.graphics();
      const hit = scene.add
        .rectangle(x, y, cellW, segH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      const text = scene.add
        .text(x, y, label, this.bodyStyle(S.langSeg.fontSize, C.label, true))
        .setOrigin(0.5);
      hit.on("pointerdown", () => {
        uiTap();
        this.setLocale(locale);
      });
      this.mainPanel.add([bg, hit, text]);
      this.langButtons.push({ locale, bg, label: text, index: i });
    }
    y += segH / 2 + S.divider.margin;
    this.mainPanel.add(this.makeDivider(scene, 0, y, contentW));
    y += S.divider.margin;

    // —— Toggles (filas #e7c99f con radio 8) ——
    const toggleDefs: {
      key: keyof SettingsPrefs;
      icon: string;
    }[] = [
      { key: "sound", icon: "🔊" },
      { key: "music", icon: "🎵" },
      { key: "haptic", icon: "📳" }
    ];
    for (let i = 0; i < toggleDefs.length; i++) {
      const def = toggleDefs[i];
      const rowCenter = y + S.toggle.rowH / 2;
      const rowBg = scene.add.graphics();
      this.drawChip(
        rowBg,
        0,
        rowCenter,
        contentW,
        S.toggle.rowH,
        S.toggle.radius,
        C.rowFill,
        C.rowStroke
      );
      const hit = scene.add
        .rectangle(0, rowCenter, contentW, S.toggle.rowH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        uiTap();
        this.togglePref(def.key);
      });

      const icon = scene.add
        .text(-half + 8, rowCenter, def.icon, this.bodyStyle(15, C.label))
        .setOrigin(0, 0.5);
      const label = scene.add
        .text(-half + 34, rowCenter, "", this.bodyStyle(14, C.label, true))
        .setOrigin(0, 0.5);
      const toggle = scene.add
        .image(half - S.toggle.w / 2 - 4, rowCenter, "toggle_on")
        .setDisplaySize(S.toggle.w, S.toggle.h)
        .setInteractive({ useHandCursor: true });
      toggle.on("pointerdown", () => {
        uiTap();
        this.togglePref(def.key);
      });
      this.mainPanel.add([rowBg, hit, icon, label, toggle]);
      this.toggleRows.push({ key: def.key, icon, label, toggle });
      y += S.toggle.rowH;
      if (i < toggleDefs.length - 1) y += S.toggle.gap;
    }
    y += S.divider.margin;
    this.mainPanel.add(this.makeDivider(scene, 0, y, contentW));
    y += S.divider.margin + S.rowBtn.h / 2;

    // —— Quitar anuncios ——
    const adsBg = scene.add
      .rectangle(0, y, contentW, S.rowBtn.h, C.adsFill, 1)
      .setStrokeStyle(2, C.adsStroke)
      .setInteractive({ useHandCursor: true });
    const adsIcon = scene.add
      .image(-half + 18, y, "icon_no_ads_2")
      .setDisplaySize(26, 26);
    this.adsTitle = scene.add
      .text(-half + 40, y - 8, "", this.bodyStyle(13, "#5a3010", true))
      .setOrigin(0, 0.5);
    this.adsSub = scene.add
      .text(-half + 40, y + 9, "", this.bodyStyle(10, C.labelMuted))
      .setOrigin(0, 0.5);
    const adsChevron = scene.add
      .text(half - 10, y, "›", this.bodyStyle(20, C.label, true))
      .setOrigin(0.5);
    adsBg.on("pointerdown", () => {
      uiTap();
      this.handlers?.onOpenShop?.();
    });
    this.mainPanel.add([
      adsBg,
      adsIcon,
      this.adsTitle,
      this.adsSub,
      adsChevron
    ]);
    y += S.rowBtn.h + S.rowBtn.gap;

    // —— Ayuda y poderes ——
    const helpBg = scene.add
      .rectangle(0, y, contentW, S.rowBtn.h, C.helpFill, 1)
      .setStrokeStyle(1.5, C.helpStroke)
      .setInteractive({ useHandCursor: true });
    const helpIcon = scene.add
      .circle(-half + 18, y, 13, 0x3a6a9a)
      .setStrokeStyle(2, 0xffffff);
    const helpQ = scene.add
      .text(-half + 18, y, "?", this.bodyStyle(14, "#ffffff", true))
      .setOrigin(0.5);
    this.helpBtnLabel = scene.add
      .text(-half + 40, y, "", this.bodyStyle(13, C.label, true))
      .setOrigin(0, 0.5);
    const helpChevron = scene.add
      .text(half - 10, y, "›", this.bodyStyle(20, C.label, true))
      .setOrigin(0.5);
    helpBg.on("pointerup", () => {
      uiTap();
      this.helpFromSettings = true;
      this.showHelp();
    });
    this.mainPanel.add([
      helpBg,
      helpIcon,
      helpQ,
      this.helpBtnLabel,
      helpChevron
    ]);

    const GA = S.gameActions;
    this.gameActionsRoot = scene.add.container(0, 0).setVisible(false);
    const newX = -(GA.w + GA.gap) / 2;
    const homeX = (GA.w + GA.gap) / 2;
    const newBtn = scene.add
      .image(newX, GA.y, "btn_green")
      .setDisplaySize(GA.w, GA.h)
      .setInteractive({ useHandCursor: true });
    this.newGameLabel = scene.add
      .text(newX, GA.y, "", this.bodyStyle(GA.font, "#fff8f0", true))
      .setOrigin(0.5);
    newBtn.on("pointerup", () => {
      uiTap();
      this.showConfirm("new");
    });
    const homeBtn = scene.add
      .image(homeX, GA.y, "btn_beige")
      .setDisplaySize(GA.w, GA.h)
      .setInteractive({ useHandCursor: true });
    this.goHomeLabel = scene.add
      .text(homeX, GA.y, "", this.bodyStyle(GA.font, "#5a3010", true))
      .setOrigin(0.5);
    homeBtn.on("pointerup", () => {
      uiTap();
      this.showConfirm("home");
    });
    this.gameActionsRoot.add([
      newBtn,
      this.newGameLabel,
      homeBtn,
      this.goHomeLabel
    ]);
    this.mainPanel.add(this.gameActionsRoot);
    this.mainPanel.bringToTop(this.gameActionsRoot);

    // —— Footer (más arriba, con margen bajo el pergamino) ——
    const fy = S.footerY;
    this.footerRoot = scene.add.container(0, 0);
    this.restoreLabel = scene.add
      .text(-6, fy, "", this.bodyStyle(10, C.labelMuted, true))
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    this.restoreLabel.on("pointerdown", () => {
      uiTap();
      void this.restorePurchases();
    });
    const sep = scene.add.rectangle(0, fy, 1.5, 12, 0xc0b0a0, 1);
    this.privacyLabel = scene.add
      .text(6, fy, "", this.bodyStyle(10, C.labelMuted, true))
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    this.privacyLabel.on("pointerdown", () => {
      uiTap();
      this.openPrivacy();
    });
    this.consentLabel = scene.add
      .text(0, fy + 16, "", this.bodyStyle(10, C.labelMuted, true))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.consentLabel.on("pointerdown", () => {
      uiTap();
      this.openAdConsent();
    });
    this.statusText = scene.add
      .text(0, fy + 32, "", this.bodyStyle(9, C.labelMuted))
      .setOrigin(0.5);
    this.footerRoot.add([
      this.restoreLabel,
      sep,
      this.privacyLabel,
      this.consentLabel,
      this.statusText
    ]);
    this.mainPanel.add(this.footerRoot);

    // —— Help panel ——
    const helpFrame = scene.add
      .image(0, 0, "modal_frame")
      .setDisplaySize(S.frame.w, S.frame.h);
    const helpHeader = scene.add
      .image(0, S.header.y, "modal_header")
      .setDisplaySize(S.header.w, S.header.h);
    const helpTitle = scene.add
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
      .setOrigin(0.5)
      .setName("helpTitle");
    const helpBack = scene.add
      .text(-half, S.title.y, "←", this.bodyStyle(20, C.label, true))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    helpBack.setColor(S.title.color);
    helpBack.on("pointerdown", () => {
      uiTap();
      this.leaveHelp();
    });
    this.helpPanel.add([helpFrame, helpHeader, helpTitle, helpBack]);

    const helpClose = scene.add
      .image(S.close.x, S.close.y, "btn_close")
      .setDisplaySize(S.close.size, S.close.size)
      .setInteractive({ useHandCursor: true });
    helpClose.on("pointerdown", () => {
      helpClose.setTexture("btn_close_pressed");
      uiTap();
    });
    helpClose.on("pointerup", () => {
      helpClose.setTexture("btn_close");
      this.leaveHelp();
    });
    helpClose.on("pointerout", () => {
      helpClose.setTexture("btn_close");
    });
    this.helpPanel.add(helpClose);

    let hy = S.helpFirstY;
    for (const def of POWER_DEFS) {
      const icon = scene.add
        .image(-half + 8, hy, def.iconTexture)
        .setDisplaySize(32, 32);
      const name = scene.add
        .text(-half + 32, hy - 12, "", this.bodyStyle(12, "#5a3010", true))
        .setOrigin(0, 0.5)
        .setName(`helpName_${def.id}`);
      const blurb = scene.add
        .text(-half + 32, hy + 2, "", {
          ...this.bodyStyle(10, C.labelMuted),
          wordWrap: { width: contentW - 44 }
        })
        .setOrigin(0, 0)
        .setName(`helpBlurb_${def.id}`);
      this.helpPanel.add([icon, name, blurb]);
      hy += S.helpRowH;
    }

    this.root.add([dim, this.mainPanel, this.helpPanel]);
    this.buildConfirm(scene);
    this.relabel();
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
    const inGame = !!(handlers.onNewGame || handlers.onGoHome);
    this.gameActionsRoot.setVisible(inGame);
    const S = HUD_LAYOUT.settingsModal;
    this.footerRoot.y = inGame ? S.footerYInGame - S.footerY : 0;
  }

  isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.busy = false;
    this.pendingAction = null;
    this.helpFromSettings = true;
    this.statusText.setText("");
    this.showMain();
    this.relabel();
    this.paintLang();
    this.paintToggles();
    this.root.setVisible(true);
    this.hideConfirm();
  }

  /** Abre directo en Ayuda y poderes (botón ? del Inicio). */
  openHelp(): void {
    this.busy = false;
    this.helpFromSettings = false;
    this.statusText.setText("");
    this.relabel();
    this.paintLang();
    this.paintToggles();
    this.showHelp();
    this.root.setVisible(true);
  }

  close(): void {
    this.hideConfirm();
    this.root.setVisible(false);
    this.busy = false;
    this.pendingAction = null;
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private showMain(): void {
    this.mainPanel.setVisible(true);
    this.helpPanel.setVisible(false);
  }

  private showHelp(): void {
    this.relabel();
    this.mainPanel.setVisible(false);
    this.helpPanel.setVisible(true);
  }

  private leaveHelp(): void {
    if (this.helpFromSettings) this.showMain();
    else this.handlers?.onClose();
  }

  private buildConfirm(scene: Phaser.Scene): void {
    this.confirmRoot = scene.add.container(0, 0).setVisible(false);
    const dim = scene.add
      .rectangle(195, 422, 2000, 3000, 0x0d1626, 0.55)
      .setInteractive();
    const box = scene.add.graphics();
    box.fillStyle(0xf6ebe0, 1);
    box.fillRoundedRect(195 - 132, 422 - 92, 264, 184, 14);
    box.lineStyle(2, 0xc4a06a, 1);
    box.strokeRoundedRect(195 - 132, 422 - 92, 264, 184, 14);

    this.confirmTitle = scene.add
      .text(195, 358, "", this.bodyStyle(16, "#5a3010", true))
      .setOrigin(0.5);
    this.confirmBody = scene.add
      .text(195, 400, "", {
        ...this.bodyStyle(13, "#5a4030"),
        align: "center",
        wordWrap: { width: 228 }
      })
      .setOrigin(0.5);

    const noBtn = scene.add
      .image(140, 468, "btn_beige")
      .setDisplaySize(108, 36)
      .setInteractive({ useHandCursor: true });
    const noLabel = scene.add
      .text(140, 468, "", this.bodyStyle(12, "#5a3010", true))
      .setOrigin(0.5)
      .setName("confirmNo");
    noBtn.on("pointerup", () => {
      uiTap();
      this.hideConfirm();
    });

    const yesBtn = scene.add
      .image(250, 468, "btn_green")
      .setDisplaySize(108, 36)
      .setInteractive({ useHandCursor: true });
    this.confirmYesLabel = scene.add
      .text(250, 468, "", this.bodyStyle(12, "#fff8f0", true))
      .setOrigin(0.5);
    yesBtn.on("pointerup", () => {
      uiTap();
      this.commitConfirm();
    });

    this.confirmRoot.add([
      dim,
      box,
      this.confirmTitle,
      this.confirmBody,
      noBtn,
      noLabel,
      yesBtn,
      this.confirmYesLabel
    ]);
    this.root.add(this.confirmRoot);
  }

  private showConfirm(kind: "new" | "home"): void {
    this.pendingAction = kind;
    if (kind === "new") {
      this.confirmTitle.setText(
        t({
          es: "¿Reiniciar la partida?",
          en: "Restart this run?",
          pt: "Reiniciar a partida?"
        })
      );
      this.confirmBody.setText(
        t({
          es: "Se perderá el progreso de esta partida. El arca volverá a empezar de cero.",
          en: "Your current game will be lost. The ark will start over.",
          pt: "O progresso desta partida será perdido. A arca recomeça do zero."
        })
      );
      this.confirmYesLabel.setText(
        t({ es: "REINICIAR", en: "RESTART", pt: "REINICIAR" })
      );
    } else {
      this.confirmTitle.setText(
        t({
          es: "¿Volver al inicio?",
          en: "Return to home?",
          pt: "Voltar ao início?"
        })
      );
      this.confirmBody.setText(
        t({
          es: "Se perderá la partida actual. No se guardará el puntaje en curso.",
          en: "Your current game will be lost. The run score will not be saved.",
          pt: "A partida atual será perdida. A pontuação em curso não será salva."
        })
      );
      this.confirmYesLabel.setText(
        t({ es: "INICIO", en: "HOME", pt: "INÍCIO" })
      );
    }
    const noLabel = this.confirmRoot.getByName("confirmNo") as
      | Phaser.GameObjects.Text
      | null;
    noLabel?.setText(t({ es: "CANCELAR", en: "CANCEL", pt: "CANCELAR" }));
    this.confirmRoot.setVisible(true);
  }

  private hideConfirm(): void {
    this.pendingAction = null;
    this.confirmRoot?.setVisible(false);
  }

  private commitConfirm(): void {
    const kind = this.pendingAction;
    this.hideConfirm();
    this.handlers?.onClose();
    if (kind === "new") this.handlers?.onNewGame?.();
    else if (kind === "home") this.handlers?.onGoHome?.();
  }

  private setLocale(locale: GameLocale): void {
    setGameLocale(locale);
    this.relabel();
    this.paintLang();
    this.handlers?.onLocaleChanged?.();
  }

  private togglePref(key: keyof SettingsPrefs): void {
    const cur = getSettingsPrefs();
    setSettingsPrefs({ [key]: !cur[key] });
    this.paintToggles();
    this.handlers?.onPrefsChanged?.();
  }

  private openPrivacy(): void {
    sendToShell({ type: "open_privacy_policy" });
    this.statusText.setText(
      t({
        es: "Abriendo política de privacidad…",
        en: "Opening privacy policy…",
        pt: "Abrindo política de privacidade…"
      })
    );
  }

  private openAdConsent(): void {
    sendToShell({ type: "open_ad_consent" });
    this.statusText.setText(
      t({
        es: "Opciones de privacidad de anuncios…",
        en: "Ad privacy options…",
        pt: "Opções de privacidade de anúncios…"
      })
    );
  }

  private async restorePurchases(): Promise<void> {
    if (this.busy) return;
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
    if (!this.root.visible) return;
    this.busy = false;

    if (status === "completed") {
      markAdsRemoved();
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
    if (status === "cancelled") {
      this.statusText.setText(
        t({
          es: "Restauración cancelada.",
          en: "Restore cancelled.",
          pt: "Restauração cancelada."
        })
      );
      return;
    }
    if (status === "pending") {
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
      t({
        es: "No se pudieron restaurar las compras.",
        en: "Couldn't restore purchases.",
        pt: "Não foi possível restaurar as compras."
      })
    );
  }

  private paintLang(): void {
    const S = HUD_LAYOUT.settingsModal;
    const C = S.colors;
    const { y, w, h, cellW } = this.langTabGeom;
    const r = S.langSeg.radius;
    const cur = getGameLocale();

    this.drawChip(this.langRowBg, 0, y, w, h, r, C.langIdle, C.rowStroke);
    this.langRowBg.lineStyle(1.25, C.rowStroke, 1);
    const divTop = y - h / 2 + 4;
    const divBot = y + h / 2 - 4;
    this.langRowBg.lineBetween(-cellW / 2, divTop, -cellW / 2, divBot);
    this.langRowBg.lineBetween(cellW / 2, divTop, cellW / 2, divBot);

    for (const b of this.langButtons) {
      const on = b.locale === cur;
      const cx = -w / 2 + cellW * (b.index + 0.5);
      b.bg.clear();
      if (on) {
        const radii = this.langTabRadii(b.index, Math.max(0, r - 1.5));
        this.drawChip(b.bg, cx, y, cellW - 2, h - 3, radii, C.langActive, 0, 0);
      }
      b.label.setColor(on ? C.langActiveText : C.label);
    }
  }

  private langTabRadii(
    index: number,
    r: number
  ): number | { tl: number; tr: number; bl: number; br: number } {
    if (index === 0) return { tl: r, tr: 0, bl: r, br: 0 };
    if (index === 2) return { tl: 0, tr: r, bl: 0, br: r };
    return 0;
  }

  private drawChip(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    radii: number | { tl: number; tr: number; bl: number; br: number },
    fill: number,
    stroke: number,
    strokeWidth = 1.5
  ): void {
    const x = cx - w / 2;
    const y = cy - h / 2;
    g.clear();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, y, w, h, radii);
    if (strokeWidth > 0) {
      g.lineStyle(strokeWidth, stroke, 1);
      g.strokeRoundedRect(x, y, w, h, radii);
    }
  }

  private makeDivider(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number
  ): Phaser.GameObjects.Rectangle {
    const S = HUD_LAYOUT.settingsModal;
    return scene.add.rectangle(x, y, w, S.divider.h, S.colors.divider, 0.9);
  }

  private paintToggles(): void {
    const prefs = getSettingsPrefs();
    for (const row of this.toggleRows) {
      const on = prefs[row.key];
      row.toggle.setTexture(on ? "toggle_on" : "toggle_off");
    }
  }

  private relabel(): void {
    const title = t({
      es: "AJUSTES",
      en: "SETTINGS",
      pt: "AJUSTES"
    }).toUpperCase();
    this.titleText.setText(title);

    this.langSectionLabel.setText(
      `🌐  ${t({ es: "Idioma", en: "Language", pt: "Idioma" })}`
    );

    const toggleNames: Record<
      keyof SettingsPrefs,
      { es: string; en: string; pt?: string }
    > = {
      sound: { es: "Sonido", en: "Sound", pt: "Som" },
      music: { es: "Música", en: "Music", pt: "Música" },
      haptic: { es: "Vibración", en: "Vibration", pt: "Vibração" }
    };
    for (const row of this.toggleRows) {
      row.label.setText(t(toggleNames[row.key]));
    }

    if (hasAdsRemoved()) {
      this.adsTitle.setText(
        t({ es: "Sin anuncios", en: "Ad-free", pt: "Sem anúncios" })
      );
      this.adsSub.setText(t({ es: "Activo", en: "Active", pt: "Ativo" }));
    } else {
      this.adsTitle.setText(
        t({
          es: "Quitar anuncios",
          en: "Remove ads",
          pt: "Remover anúncios"
        })
      );
      this.adsSub.setText(
        t({
          es: "Disfruta el Arca sin anuncios",
          en: "Enjoy the Ark ad-free",
          pt: "Aproveite a Arca sem anúncios"
        })
      );
    }

    this.helpBtnLabel.setText(
      t({
        es: "Ayuda y poderes",
        en: "Help & powers",
        pt: "Ajuda e poderes"
      })
    );
    this.newGameLabel.setText(
      t({
        es: "REINICIAR",
        en: "RESTART",
        pt: "REINICIAR"
      }).toUpperCase()
    );
    this.goHomeLabel.setText(
      t({ es: "INICIO", en: "HOME", pt: "INÍCIO" }).toUpperCase()
    );
    this.restoreLabel.setText(
      t({
        es: "↻ Restaurar compras",
        en: "↻ Restore purchases",
        pt: "↻ Restaurar compras"
      })
    );
    this.privacyLabel.setText(
      t({
        es: "Política de privacidad",
        en: "Privacy policy",
        pt: "Política de privacidade"
      })
    );
    this.consentLabel.setText(
      t({
        es: "Cambiar consentimiento de anuncios",
        en: "Change ad consent",
        pt: "Alterar consentimento de anúncios"
      })
    );
    const showConsent = isPrivacyOptionsRequired();
    this.consentLabel.setVisible(showConsent);
    if (showConsent) {
      this.consentLabel.setInteractive({ useHandCursor: true });
    } else {
      this.consentLabel.disableInteractive();
    }

    const helpTitle = this.helpPanel.getByName("helpTitle") as
      | Phaser.GameObjects.Text
      | null;
    helpTitle?.setText(
      t({ es: "PODERES", en: "POWERS", pt: "PODERES" }).toUpperCase()
    );

    for (const def of POWER_DEFS) {
      const name = this.helpPanel.getByName(`helpName_${def.id}`) as
        | Phaser.GameObjects.Text
        | null;
      const blurb = this.helpPanel.getByName(`helpBlurb_${def.id}`) as
        | Phaser.GameObjects.Text
        | null;
      name?.setText(t(def.name).toUpperCase());
      blurb?.setText(t(def.blurb));
    }

    this.paintToggles();
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
