import Phaser from "phaser";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../layout";
import { BALOO_BITMAP_KEY } from "../fonts";
import { HUD_LAYOUT } from "./hudLayout";

/**
 * Stub de rewarded ad: dim + número grande 3-2-1, luego resuelve.
 * Sustituir por AdMob cuando el shell esté cableado.
 */
export class AdCountdown {
  static play(scene: Phaser.Scene, seconds = 3): Promise<void> {
    const L = HUD_LAYOUT.adCountdown;
    return new Promise((resolve) => {
      const cx = LOGICAL_WIDTH / 2;
      const cy = LOGICAL_HEIGHT / 2;
      const dim = scene.add
        .rectangle(cx, cy, 2000, 3000, 0x08060a, L.dimAlpha)
        .setDepth(L.depth)
        .setInteractive();
      const num = scene.add
        .bitmapText(cx, cy, BALOO_BITMAP_KEY, String(seconds), L.fontSize)
        .setOrigin(0.5)
        .setTint(0xfff6e8)
        .setDepth(L.depth + 1);

      const pop = (): void => {
        num.setScale(0.55);
        scene.tweens.add({
          targets: num,
          scale: 1,
          duration: 220,
          ease: "Back.easeOut"
        });
      };
      pop();

      let left = seconds;
      scene.time.addEvent({
        delay: 1000,
        repeat: Math.max(0, seconds - 1),
        callback: () => {
          left -= 1;
          if (left <= 0) {
            dim.destroy();
            num.destroy();
            resolve();
            return;
          }
          num.setText(String(left));
          pop();
        }
      });
    });
  }
}
