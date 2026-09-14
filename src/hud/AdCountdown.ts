import Phaser from "phaser";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../layout";
import { BALOO_BITMAP_KEY, NUNITO_FAMILY } from "../fonts";
import { HUD_LAYOUT } from "./hudLayout";

/**
 * Contador a pantalla completa antes de un intersticial / stub rewarded.
 * Opcionalmente muestra un mensaje ("Anuncio en…").
 */
export class AdCountdown {
  static play(
    scene: Phaser.Scene,
    seconds = 3,
    message?: string
  ): Promise<void> {
    const L = HUD_LAYOUT.adCountdown;
    return new Promise((resolve) => {
      const cx = LOGICAL_WIDTH / 2;
      const cy = LOGICAL_HEIGHT / 2;
      const dim = scene.add
        .rectangle(cx, cy, 2000, 3000, 0x08060a, L.dimAlpha)
        .setDepth(L.depth)
        .setInteractive();
      const label = message
        ? scene.add
            .text(cx, cy - 110, message, {
              fontFamily: NUNITO_FAMILY,
              fontSize: "22px",
              color: "#fff6e8",
              fontStyle: "bold",
              align: "center",
              wordWrap: { width: 320 }
            })
            .setOrigin(0.5)
            .setDepth(L.depth + 1)
        : null;
      const num = scene.add
        .bitmapText(cx, cy + (message ? 12 : 0), BALOO_BITMAP_KEY, String(seconds), L.fontSize)
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
            label?.destroy();
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
