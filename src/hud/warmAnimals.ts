import type Phaser from "phaser";
import { CHAIN } from "../chain";

/**
 * Canvas: el primer draw de cada animal-N es caro (decode → blit).
 * Pregenera el paint en Home, 1 por frame, para que Jugar no hitee.
 */
export function prewarmAnimalTextures(scene: Phaser.Scene): void {
  let i = 0;
  const step = (): void => {
    if (!scene.sys?.isActive()) return;
    while (i < CHAIN.length) {
      const key = `animal-${CHAIN[i].level}`;
      i += 1;
      if (!scene.textures.exists(key)) continue;
      const img = scene.add
        .image(-9000, -9000, key)
        .setAlpha(0)
        .setScale(0.04)
        .setDepth(-100);
      scene.time.delayedCall(0, () => {
        img.destroy();
        step();
      });
      return;
    }
  };
  scene.time.delayedCall(120, step);
}
