import Phaser from "phaser";
import { BALOO_BITMAP_KEY } from "../fonts";

/**
 * Pool de BitmapText (un atlas, sin regenerar texturas al cambiar el string).
 */
export class BitmapTextPool {
  private readonly items: Phaser.GameObjects.BitmapText[] = [];

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    size: number,
    fontSize: number
  ) {
    for (let i = 0; i < size; i++) {
      const bt = scene.add
        .bitmapText(0, 0, BALOO_BITMAP_KEY, "0", fontSize)
        .setOrigin(0.5)
        .setVisible(false)
        .setActive(false);
      parent.add(bt);
      this.items.push(bt);
    }
  }

  acquire(text: string): Phaser.GameObjects.BitmapText | null {
    for (let i = 0; i < this.items.length; i++) {
      const bt = this.items[i];
      if (!bt.active) {
        bt.setText(text)
          .setActive(true)
          .setVisible(true)
          .setAlpha(1)
          .setScale(1)
          .setTint(0xffffff)
          .setLeftAlign()
          .setLineSpacing(0);
        return bt;
      }
    }
    return null;
  }

  release(bt: Phaser.GameObjects.BitmapText): void {
    bt.setVisible(false).setActive(false).setAlpha(1).setScale(1);
  }
}
