import Phaser from "phaser";
import { sendToShell, startBridgeListener } from "./bridge";
import { GameAudio } from "./audio/GameAudio";
import { HUD_LAYOUT } from "./hud/hudLayout";
import { ShopModal } from "./hud/ShopModal";
import { SettingsModal } from "./hud/SettingsModal";
import { OtherGamesModal } from "./hud/OtherGamesModal";
import { ScreenLoader } from "./hud/ScreenLoader";
import { Economy } from "./powers/economy";
import { t } from "./powers/locale";
import { syncSettingsPrefsToShell } from "./settingsPrefs";
import { NUNITO_FAMILY, BALOO_BITMAP_KEY } from "./fonts";
import {
  LOGICAL_WIDTH as W,
  LOGICAL_HEIGHT as H,
  getRenderScale,
  getContainZoom
} from "./layout";
import { DailyRewardModal } from "./hud/DailyRewardModal";
import { prewarmAnimalTextures } from "./hud/warmAnimals";
import { ENABLE_GAME_DEBUG } from "./buildFlags";
import { flyOlivesToCounter, punchOliveLabel, tweenOliveCounter } from "./hud/oliveFly";
import { DAILY_OLIVES, dismissDailyModal, shouldShowDailyModal } from "./dailyGrant";
import { queueGameAssets } from "./preload";

const ICON_KEYS = ["btn_tienda", "btn_settings", "btn_questions"] as const;

/**
 * Pantalla de Inicio. JUGAR arranca la partida.
 * Layout en HUD_LAYOUT.home.
 */
export class HomeScene extends Phaser.Scene {
  private renderScale = 1;
  private bg!: Phaser.GameObjects.Image;
  private playLabel!: Phaser.GameObjects.BitmapText;
  private otherLabel!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private audio!: GameAudio;
  private shop!: ShopModal;
  private settings!: SettingsModal;
  private otherGames!: OtherGamesModal;
  private dailyReward!: DailyRewardModal;
  private loader!: ScreenLoader;
  private olivesText!: Phaser.GameObjects.Text;
  private readonly economy = new Economy();

  constructor() {
    super("home");
  }

  preload(): void {
    queueGameAssets(this);
  }

  create(): void {
    startBridgeListener();
    syncSettingsPrefsToShell();
    this.renderScale = getRenderScale();
    this.audio = new GameAudio(this);
    this.loader = new ScreenLoader(this);

    this.bg = this.add.image(W / 2, H / 2, "home_bg").setDepth(0);
    this.layoutView();
    this.scale.on("resize", this.layoutView, this);

    const L = HUD_LAYOUT.home;
    this.add
      .image(W / 2, L.logo.y, "home_logo")
      .setDisplaySize(L.logo.size, L.logo.size)
      .setDepth(2);

    const arkSrc = this.textures.get("home_ark").getSourceImage() as HTMLImageElement;
    const arkH = L.ark.w * (arkSrc.height / arkSrc.width);
    this.add
      .image(
        W / 2,
        L.play.y - L.play.h / 2 - L.ark.gapAbovePlay,
        "home_ark"
      )
      .setOrigin(0.5, 1)
      .setDisplaySize(L.ark.w, arkH)
      .setDepth(1);

    this.makeImageButton(
      W / 2,
      L.play.y,
      "btn_green",
      L.play.w,
      L.play.h,
      () => this.goToGame(),
      "dim"
    );
    this.playLabel = this.add
      .bitmapText(W / 2, L.play.y, BALOO_BITMAP_KEY, "", L.play.font)
      .setOrigin(0.5)
      .setTint(0xfff8f0)
      .setDepth(3);

    for (let i = 0; i < ICON_KEYS.length; i++) {
      const x = L.icons.startX + i * (L.icons.size + L.icons.gap);
      const key = ICON_KEYS[i];
      this.makeImageButton(x, L.icons.y, key, L.icons.size, L.icons.size, () =>
        this.onIcon(key)
      );
    }

    this.makeImageButton(
      W / 2,
      L.other.y,
      "btn_beige",
      L.other.w,
      L.other.h,
      () => this.otherGames.open(),
      "dim"
    );
    this.otherLabel = this.add
      .text(W / 2, L.other.y, "", this.labelStyle(L.other.font, "#000000"))
      .setOrigin(0.5)
      .setDepth(3);

    const ol = L.olives;
    this.add
      .image(ol.cx, ol.y, "olivo_container")
      .setDisplaySize(ol.w, ol.h)
      .setDepth(4)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.audio.onUiTap();
        sendToShell({ type: "open_shop" });
        this.shop.open();
      });
    this.add
      .image(ol.cx + ol.iconX, ol.y, "hoja_olivo")
      .setDisplaySize(ol.iconSize, ol.iconSize)
      .setDepth(4);
    this.olivesText = this.add
      .text(ol.cx + ol.textX, ol.y, "0", {
        ...this.labelStyle(ol.textFont, ol.textColor, true),
        align: "center"
      })
      .setOrigin(0.5)
      .setDepth(4);

    this.toast = this.add
      .text(W / 2, L.toastY, "", this.labelStyle(L.toastFont, "#fff8f0"))
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0)
      .setStroke("#3a2010", 4);

    this.shop = new ShopModal(this, this.economy, this.renderScale);
    this.shop.setHandlers({
      onClose: () => this.shop.close(),
      onOlivesChanged: () => this.refreshOlives(),
      onOlivesPurchased: (amount, fromX, fromY) => {
        this.playOliveGain(amount, fromX, fromY);
      },
      onAdsRemoved: () => undefined
    });
    this.settings = new SettingsModal(this, this.renderScale);
    this.settings.setHandlers({
      onClose: () => this.settings.close(),
      onLocaleChanged: () => this.relabel(),
      onPrefsChanged: () => this.audio.applyPrefs(),
      onOpenShop: () => {
        this.settings.close();
        sendToShell({ type: "open_shop" });
        this.shop.open();
      }
    });
    this.otherGames = new OtherGamesModal(this, this.renderScale);

    this.dailyReward = new DailyRewardModal(this, this.economy, this.renderScale);
    this.dailyReward.setHandlers({
      onOlivesChanged: () => this.refreshOlives(),
      olivesAnchor: () => ({ x: L.olives.cx, y: L.olives.y }),
      // Mientras el modal está abierto, mostrar saldo “antes” del grant (+5 ya en storage).
      previewDailyOlives: (amount) => {
        this.setOliveLabel(Math.max(0, this.economy.getOlives() - amount));
      },
      onOliveFlyGain: (from, to, timing) => {
        this.setOliveLabel(from);
        tweenOliveCounter(this, from, to, timing.arriveDelayMs, timing.spanMs, (n) =>
          this.setOliveLabel(n)
        );
      },
      onOliveLeafHit: () => punchOliveLabel(this, this.olivesText)
    });

    this.relabel();
    this.refreshOlives();
    sendToShell({ type: "game_start" });
    sendToShell({ type: "game_ready" });
    prewarmAnimalTextures(this);

    if (shouldShowDailyModal()) {
      this.setOliveLabel(Math.max(0, this.economy.getOlives() - DAILY_OLIVES));
      this.time.delayedCall(280, () => this.dailyReward.show());
    }

    if (this.sound.locked === false) {
      this.audio.onUnlocked();
    } else {
      this.input.once("pointerdown", () => {
        this.sound.unlock();
        this.audio.onUnlocked();
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    if (ENABLE_GAME_DEBUG) {
      try {
        (
          window as Window & { ReactNativeWebView?: { postMessage: (m: string) => void } }
        ).ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: "debug_viewport",
            phase: "home-created",
            hasBg: this.textures.exists("home_bg"),
            hasLogo: this.textures.exists("home_logo"),
            hasBaloo: this.cache.bitmapFont.exists("baloo2")
          })
        );
      } catch {
        // browser
      }
    }
  }

  private onIcon(key: (typeof ICON_KEYS)[number]): void {
    if (key === "btn_tienda") {
      sendToShell({ type: "open_shop" });
      this.shop.open();
      return;
    }
    if (key === "btn_settings") {
      sendToShell({ type: "open_settings" });
      this.settings.open();
      return;
    }
    sendToShell({ type: "open_settings" });
    this.settings.openHelp();
  }

  private relabel(): void {
    this.playLabel.setText(
      t({ es: "JUGAR", en: "PLAY", pt: "JOGAR" }).toUpperCase()
    );
    this.otherLabel.setText(
      t({
        es: "OTROS JUEGOS",
        en: "OTHER GAMES",
        pt: "OUTROS JOGOS"
      }).toUpperCase()
    );
    this.otherGames.relabel();
  }

  private refreshOlives(): void {
    this.setOliveLabel(this.economy.getOlives());
  }

  /** Al entrar al juego: cerrar claim diario pendiente (olivos ya están en storage). */
  private goToGame(): void {
    if (shouldShowDailyModal()) {
      dismissDailyModal();
      this.dailyReward.close();
    }
    this.refreshOlives();
    this.scene.start("game");
  }

  private setOliveLabel(n: number): void {
    const from = HUD_LAYOUT.home.olives.abbreviateFrom;
    const label =
      n >= from ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
    this.olivesText.setText(label);
  }

  private playOliveGain(amount: number, fromX: number, fromY: number): void {
    const to = this.economy.getOlives();
    const from = Math.max(0, to - amount);
    const L = HUD_LAYOUT.home;
    this.setOliveLabel(from);
    const timing = flyOlivesToCounter(
      this,
      fromX,
      fromY,
      L.olives.cx,
      L.olives.y,
      amount,
      {
        depth: 80,
        onLeafHit: () => punchOliveLabel(this, this.olivesText)
      }
    );
    tweenOliveCounter(
      this,
      from,
      to,
      timing.arriveDelayMs,
      timing.spanMs,
      (n) => this.setOliveLabel(n)
    );
  }

  private showToast(msg: string): void {
    this.toast.setText(msg);
    this.tweens.killTweensOf(this.toast);
    this.toast.setAlpha(1);
    this.tweens.add({
      targets: this.toast,
      alpha: 0,
      delay: 1400,
      duration: 380
    });
  }

  private makeImageButton(
    x: number,
    y: number,
    key: string,
    w: number,
    h: number,
    onClick: () => void,
    press: "scale" | "dim" = "scale"
  ): void {
    const img = this.add.image(x, y, key).setDisplaySize(w, h).setDepth(2);
    const hit = this.add
      .rectangle(x, y, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(2);
    const pressIn = (): void => {
      if (press === "dim") img.setTint(0x7a7a7a);
      else img.setScale(img.scaleX * 0.96);
      this.audio.onUiTap();
    };
    const pressOut = (): void => {
      if (press === "dim") img.clearTint();
      else img.setDisplaySize(w, h);
    };
    hit.on("pointerdown", pressIn);
    hit.on("pointerup", () => {
      pressOut();
      onClick();
    });
    hit.on("pointerout", pressOut);
  }

  private labelStyle(
    fontSize: number,
    color: string
  ): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: NUNITO_FAMILY,
      fontSize: `${fontSize}px`,
      color,
      fontStyle: "bold",
      resolution: this.renderScale
    };
  }

  private layoutView(): void {
    this.renderScale = getRenderScale();
    const zoom = getContainZoom(this.scale.width, this.scale.height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(W / 2, H / 2);
    const viewW = this.scale.width / zoom;
    const viewH = this.scale.height / zoom;
    const cover = Math.max(viewW / W, viewH / H);
    this.bg?.setDisplaySize(W * cover, H * cover).setPosition(W / 2, H / 2);
  }

  private shutdown(): void {
    this.scale.off("resize", this.layoutView, this);
    this.shop?.destroy();
    this.settings?.destroy();
    this.otherGames?.destroy();
    this.dailyReward?.destroy();
    this.loader?.destroy();
    this.audio?.destroy();
  }
}
