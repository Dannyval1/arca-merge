import Phaser from "phaser";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../layout";
import { HUD_LAYOUT } from "./hudLayout";

const CUTOUT_KEY = "wheel_cutout";

/**
 * Overlay a pantalla completa: dim + timón girando, agua subiendo
 * en los huecos del wheel (máscara circular + recorte de negro).
 */
export class ScreenLoader {
  static current: ScreenLoader | null = null;

  private readonly root: Phaser.GameObjects.Container;
  private readonly wheel: Phaser.GameObjects.Image;
  private readonly water: Phaser.GameObjects.Rectangle;
  private readonly maskGfx: Phaser.GameObjects.Graphics;
  private readonly fillProxy = { t: 0.22 };
  private spinTween: Phaser.Tweens.Tween | null = null;
  private fillTween: Phaser.Tweens.Tween | null = null;
  private shown = false;

  constructor(private readonly scene: Phaser.Scene) {
    ScreenLoader.ensureCutout(scene);
    const L = HUD_LAYOUT.loader;
    this.root = scene.add.container(0, 0).setDepth(L.depth).setVisible(false);

    const dim = scene.add
      .rectangle(
        LOGICAL_WIDTH / 2,
        LOGICAL_HEIGHT / 2,
        2000,
        3000,
        0x0a121c,
        0.78
      )
      .setInteractive();

    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;
    const size = L.size;

    this.maskGfx = scene.add.graphics().setVisible(false);
    this.maskGfx.fillStyle(0xffffff, 1);
    this.maskGfx.fillCircle(cx, cy, size * 0.42);

    this.water = scene.add
      .rectangle(cx, cy + size * 0.42, size * 0.84, 8, L.waterColor, 0.88)
      .setOrigin(0.5, 1)
      .setMask(this.maskGfx.createGeometryMask());

    const tex = scene.textures.exists(CUTOUT_KEY) ? CUTOUT_KEY : "wheel";
    this.wheel = scene.add.image(cx, cy, tex).setDisplaySize(size, size);

    this.root.add([dim, this.water, this.wheel]);
    ScreenLoader.current = this;
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.setVisible(true);
    this.root.setDepth(HUD_LAYOUT.loader.depth);
    this.fillProxy.t = 0.18;
    this.layoutFill();

    this.spinTween?.stop();
    this.fillTween?.stop();
    this.spinTween = this.scene.tweens.add({
      targets: this.wheel,
      angle: 360,
      duration: 2600,
      repeat: -1,
      ease: "Linear"
    });
    this.fillTween = this.scene.tweens.add({
      targets: this.fillProxy,
      t: 0.92,
      duration: 2100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      onUpdate: () => this.layoutFill()
    });
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.spinTween?.stop();
    this.fillTween?.stop();
    this.spinTween = null;
    this.fillTween = null;
    this.wheel.setAngle(0);
    this.root.setVisible(false);
  }

  isShown(): boolean {
    return this.shown;
  }

  destroy(): void {
    this.hide();
    this.root.destroy(true);
    this.maskGfx.destroy();
    if (ScreenLoader.current === this) ScreenLoader.current = null;
  }

  private layoutFill(): void {
    const size = HUD_LAYOUT.loader.size;
    const maxH = size * 0.84;
    this.water.height = Math.max(6, maxH * this.fillProxy.t);
    this.water.setDisplaySize(size * 0.84, this.water.height);
  }

  /** Recorta el fondo negro de wheel.png para ver el agua entre los radios. */
  private static ensureCutout(scene: Phaser.Scene): void {
    if (scene.textures.exists(CUTOUT_KEY) || !scene.textures.exists("wheel")) {
      return;
    }
    const src = scene.textures.get("wheel").getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;
    const w = src.width;
    const h = src.height;
    const canvasTex = scene.textures.createCanvas(CUTOUT_KEY, w, h);
    if (!canvasTex) return;
    const ctx = canvasTex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 28 && d[i + 1] < 28 && d[i + 2] < 28) d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    canvasTex.refresh();
  }
}
