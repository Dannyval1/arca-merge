import Phaser from "phaser";
import { CHAIN } from "../chain";
import { HUD_LAYOUT } from "./hudLayout";
import { addNineSlice } from "./nineSlice";
import { BALOO_BITMAP_KEY, NUNITO_FAMILY } from "../fonts";
import { LOGICAL_WIDTH } from "../layout";

function silhouetteKey(tier: number): string {
  return `animal-${tier}-sil`;
}

/**
 * Barra de cadena evolutiva (abajo, no interactiva).
 * Contenedor: cadena_evolutiva.png. No alcanzados = PNG silueta
 * (animal-N-sil.png), sin generar texturas en runtime (evita hitch).
 */
export class ChainBar {
  private readonly root: Phaser.GameObjects.Container;
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly nodes: Phaser.GameObjects.Arc[] = [];
  private readonly rewardMarks: Phaser.GameObjects.Image[] = [];
  private readonly rewardLabels: Phaser.GameObjects.Text[] = [];
  private readonly arkIcon: Phaser.GameObjects.Image;
  private readonly arkCountText: Phaser.GameObjects.BitmapText;
  private maxReached = 0;
  private arkCompletes = 0;

  constructor(
    scene: Phaser.Scene,
    _renderScale: number,
    _animalScaleFn: (tier: number) => number
  ) {
    const L = HUD_LAYOUT.chain;
    this.root = scene.add.container(0, 0).setDepth(HUD_LAYOUT.depth.chain);

    const slice = L.imageSlice;
    const panel = addNineSlice(
      scene,
      LOGICAL_WIDTH / 2,
      L.centerY,
      "cadena_evolutiva",
      L.width,
      L.height,
      slice
    );
    this.root.add(panel);

    const n = CHAIN.length;
    const lineLeft = L.startX;
    const lineRight = L.startX + (n - 1) * (L.slotW + L.gap);
    const lineY = L.centerY + L.lineY;
    const line = scene.add
      .rectangle(
        (lineLeft + lineRight) / 2,
        lineY,
        lineRight - lineLeft,
        2,
        L.lineColor,
        0.95
      )
      .setOrigin(0.5);
    this.root.add(line);

    const D = L.divider;
    const divH = Math.max(2, L.height - D.pad * 2);
    for (let i = 0; i < n - 1; i++) {
      const midX = L.startX + i * (L.slotW + L.gap) + (L.slotW + L.gap) / 2;
      this.root.add(
        scene.add
          .rectangle(midX, L.centerY, D.w, divH, D.color, D.alpha)
          .setOrigin(0.5)
      );
    }

    for (let i = 0; i < n; i++) {
      const tier = CHAIN[i].level;
      const x = L.startX + i * (L.slotW + L.gap);
      const isReward = (L.rewardTiers as readonly number[]).includes(tier);
      const sil = silhouetteKey(tier);
      const startKey = scene.textures.exists(sil) ? sil : `animal-${tier}`;

      const icon = scene.add
        .image(x, L.centerY + 4, startKey)
        .setDisplaySize(L.thumbSize, L.thumbSize)
        .setOrigin(0.5)
        .setAlpha(L.silhouetteAlpha);
      this.root.add(icon);
      this.icons.push(icon);

      const node = scene.add
        .circle(x, lineY, L.nodeRadius, L.nodePending, 1)
        .setStrokeStyle(1, 0x2a5a28, 0.85);
      this.root.add(node);
      this.nodes.push(node);

      if (isReward) {
        const olives = L.rewardOlives[tier] ?? 0;
        const mark = scene.add
          .image(x - 8, L.centerY + L.oliveY, "hoja_olivo")
          .setDisplaySize(L.oliveSize, L.oliveSize)
          .setOrigin(0.5);
        const label = scene.add
          .text(x, L.centerY + L.oliveY, String(olives), {
            fontFamily: NUNITO_FAMILY,
            fontSize: `${L.oliveNumFont}px`,
            color: L.oliveNumColor,
            fontStyle: "bold",
            stroke: "#fff6e8",
            strokeThickness: 3
          })
          .setOrigin(0, 0.5);
        const clusterW = L.oliveSize + 3 + label.width;
        mark.setPosition(x - clusterW / 2 + L.oliveSize / 2, L.centerY + L.oliveY);
        label.setPosition(mark.x + L.oliveSize / 2 + 3, L.centerY + L.oliveY);
        this.root.add([mark, label]);
        this.rewardMarks.push(mark);
        this.rewardLabels.push(label);
      }
    }

    const A = L.arkCount;
    this.arkIcon = scene.add
      .image(A.x - 14, L.centerY, "animal-10")
      .setDisplaySize(A.iconSize, A.iconSize)
      .setOrigin(0.5)
      .setVisible(false);
    this.arkCountText = scene.add
      .bitmapText(A.x + 4, L.centerY, BALOO_BITMAP_KEY, "×0", A.fontSize)
      .setOrigin(0, 0.5)
      .setTint(A.color)
      .setVisible(false);
    this.root.add([this.arkIcon, this.arkCountText]);

    this.refresh(0);
  }

  resetRun(): void {
    this.maxReached = 0;
    this.setArkCompletes(0);
    this.refresh(0);
  }

  setArkCompletes(n: number): void {
    this.arkCompletes = Math.max(0, Math.floor(n));
    const show = this.arkCompletes > 0;
    this.arkIcon.setVisible(show);
    this.arkCountText.setVisible(show).setText(`×${this.arkCompletes}`);
  }

  getArkCompletes(): number {
    return this.arkCompletes;
  }

  notifyTierReached(tier: number): number {
    if (tier <= this.maxReached) return 0;
    const prev = this.maxReached;
    this.maxReached = Math.max(this.maxReached, tier);
    this.refresh(this.maxReached);

    const rewards = HUD_LAYOUT.chain.rewardOlives;
    let granted = 0;
    for (const t of HUD_LAYOUT.chain.rewardTiers) {
      if (t > prev && t <= this.maxReached) {
        granted += rewards[t] ?? 0;
      }
    }
    return granted;
  }

  getMaxReached(): number {
    return this.maxReached;
  }

  slotWorldPos(tier: number): { x: number; y: number } {
    const L = HUD_LAYOUT.chain;
    const i = Math.max(0, Math.min(9, tier - 1));
    return {
      x: L.startX + i * (L.slotW + L.gap),
      y: L.centerY
    };
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private refresh(maxReached: number): void {
    const L = HUD_LAYOUT.chain;
    for (let i = 0; i < this.icons.length; i++) {
      const tier = i + 1;
      const icon = this.icons[i];
      const node = this.nodes[i];
      const colorKey = `animal-${tier}`;
      const silKey = silhouetteKey(tier);
      const tex =
        tier <= maxReached
          ? colorKey
          : icon.scene.textures.exists(silKey)
            ? silKey
            : colorKey;
      if (icon.texture.key !== tex) icon.setTexture(tex);
      icon.setDisplaySize(L.thumbSize, L.thumbSize);
      if (tier <= maxReached) {
        icon.setAlpha(1);
        node.setFillStyle(L.nodeReached, 1);
      } else {
        icon.setAlpha(L.silhouetteAlpha);
        node.setFillStyle(L.nodePending, 0.7);
      }
    }
  }
}
