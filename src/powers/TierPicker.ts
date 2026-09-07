import Phaser from "phaser";
import { CHAIN } from "../chain";
import type { TierSlotInfo } from "./powerDefs";
import { HUD_LAYOUT } from "../hud/hudLayout";
import { LOGICAL_WIDTH } from "../layout";
import { t } from "./locale";
import { NUNITO_FAMILY } from "../fonts";

export type { TierSlotInfo };

/**
 * Selector pick-tier (Rayo). Layout desde HUD_LAYOUT.tierPicker.
 */
export const TIER_PICKER_LAYOUT = {
  get y() {
    return HUD_LAYOUT.tierPicker.y;
  },
  get slotW() {
    return HUD_LAYOUT.tierPicker.slotW;
  },
  get slotH() {
    return HUD_LAYOUT.tierPicker.slotH;
  },
  get gap() {
    return HUD_LAYOUT.tierPicker.gap;
  },
  get depth() {
    return HUD_LAYOUT.depth.tierPicker;
  },
  get startX(): number {
    const n = CHAIN.length;
    const total = n * this.slotW + (n - 1) * this.gap;
    return (LOGICAL_WIDTH - total) / 2 + this.slotW / 2;
  }
};

type SlotViews = {
  tier: number;
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  countText: Phaser.GameObjects.Text;
  hit: { x: number; y: number; w: number; h: number };
  selectable: boolean;
};

/**
 * Al activar el Rayo: oscurece toda la UI y pone el foco en el texto + lista.
 */
export class TierPicker {
  private readonly root: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly slots: SlotViews[] = [];
  private visible = false;
  private hoveredTier: number | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly renderScale: number,
    _animalScaleFn: (tier: number) => number
  ) {
    const L = TIER_PICKER_LAYOUT;
    const T = HUD_LAYOUT.tierPicker;
    this.root = scene.add.container(0, 0).setDepth(L.depth).setVisible(false);

    // Más grande que 390×844: cubre overscan (cielo a los costados).
    this.dim = scene.add
      .rectangle(195, 422, 2000, 3000, T.dimColor, T.dimAlpha)
      .setInteractive();

    const panelH = T.slotH + 72;
    const panelY = T.y - 8;
    this.panel = scene.add
      .rectangle(
        LOGICAL_WIDTH / 2,
        panelY,
        LOGICAL_WIDTH - 16,
        panelH,
        T.panelColor,
        T.panelAlpha
      )
      .setStrokeStyle(2, 0xf2c14e, 0.55);

    this.title = scene.add
      .text(
        LOGICAL_WIDTH / 2,
        T.titleY,
        t({
          es: "RAYO — elige un tipo",
          en: "LIGHTNING — pick a type",
          pt: "RAIO — escolha um tipo"
        }),
        {
          ...this.textStyle(T.titleFontSize, "#f5f0e6", true),
          align: "center",
          wordWrap: { width: 340 }
        }
      )
      .setOrigin(0.5);

    this.hint = scene.add
      .text(
        LOGICAL_WIDTH / 2,
        T.titleY + 22 + T.titleMarginBottom,
        t({
          es: "Fusiona todos los de ese nivel. Toca fuera para cancelar.",
          en: "Merges all of that tier. Tap outside to cancel.",
          pt: "Fundir todos desse nível. Toque fora para cancelar."
        }),
        this.textStyle(T.hintFontSize, "#c8d6e5")
      )
      .setOrigin(0.5);

    this.root.add([this.dim, this.panel, this.title, this.hint]);

    for (let i = 0; i < CHAIN.length; i++) {
      const tier = CHAIN[i].level;
      const x = L.startX + i * (L.slotW + L.gap);
      const y = L.y;

      const bg = scene.add
        .rectangle(x, y, L.slotW, L.slotH, 0x243044, 0.95)
        .setStrokeStyle(1.5, 0x5a6f86);

      const icon = scene.add
        .image(x, y - 6, `animal-${tier}`)
        .setDisplaySize(T.thumbSize, T.thumbSize)
        .setOrigin(0.5);

      const countText = scene.add
        .text(x, y + 20, "", this.textStyle(10, "#9fb3c8", true))
        .setOrigin(0.5);

      this.root.add([bg, icon, countText]);
      this.slots.push({
        tier,
        bg,
        icon,
        countText,
        selectable: false,
        hit: {
          x: x - L.slotW / 2,
          y: y - L.slotH / 2,
          w: L.slotW,
          h: L.slotH
        }
      });
    }
  }

  show(slots: TierSlotInfo[]): void {
    this.visible = true;
    this.root.setVisible(true);
    this.hoveredTier = null;
    this.refresh(slots);
  }

  hide(): void {
    this.visible = false;
    this.root.setVisible(false);
    this.hoveredTier = null;
  }

  isVisible(): boolean {
    return this.visible;
  }

  setHovered(tier: number | null): void {
    if (this.hoveredTier === tier) return;
    this.hoveredTier = tier;
    this.paintHover();
  }

  refresh(slots: TierSlotInfo[]): void {
    const T = HUD_LAYOUT.tierPicker;
    const byTier = new Map(slots.map((s) => [s.tier, s]));
    for (let i = 0; i < this.slots.length; i++) {
      const view = this.slots[i];
      const info = byTier.get(view.tier) ?? {
        tier: view.tier,
        count: 0,
        selectable: false
      };
      view.selectable = info.selectable;
      view.countText.setText(info.count > 0 ? String(info.count) : "·");
      view.icon.setDisplaySize(T.thumbSize, T.thumbSize);

      if (info.selectable) {
        view.bg.setFillStyle(0x2a3d55, 0.98).setStrokeStyle(1.5, 0xf2c14e);
        view.icon.setAlpha(1);
        view.countText.setAlpha(1).setColor("#e8f0fa");
      } else {
        view.bg.setFillStyle(0x152033, 0.92).setStrokeStyle(1.5, 0x3a4a5c);
        view.icon.setAlpha(0.22);
        view.countText.setAlpha(0.35).setColor("#6a7a8c");
      }
    }
    this.paintHover();
  }

  hitTest(worldX: number, worldY: number): number | null {
    if (!this.visible) return null;
    for (let i = 0; i < this.slots.length; i++) {
      const h = this.slots[i].hit;
      if (
        worldX >= h.x &&
        worldX <= h.x + h.w &&
        worldY >= h.y &&
        worldY <= h.y + h.h
      ) {
        return this.slots[i].tier;
      }
    }
    return null;
  }

  destroy(): void {
    this.root.destroy(true);
    this.slots.length = 0;
  }

  private paintHover(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const view = this.slots[i];
      if (view.tier === this.hoveredTier && view.selectable) {
        view.bg.setStrokeStyle(2.5, 0xffe08a);
      } else if (view.selectable) {
        view.bg.setStrokeStyle(1.5, 0xf2c14e);
      } else {
        view.bg.setStrokeStyle(1.5, 0x3a4a5c);
      }
    }
  }

  private textStyle(
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
