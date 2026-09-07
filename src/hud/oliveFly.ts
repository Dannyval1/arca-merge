import Phaser from "phaser";

/** Primer impacto y ventana hasta el último, para sincronizar el contador. */
export function oliveFlyTiming(
  leafCount: number,
  staggerMs: number,
  durationMs: number
): { arriveDelayMs: number; spanMs: number } {
  const n = Math.max(1, leafCount);
  return {
    arriveDelayMs: durationMs,
    spanMs: Math.max(80, (n - 1) * staggerMs)
  };
}

/**
 * Hojas volando al contador. `onLeafHit` se dispara al llegar cada una
 * (punch del número).
 */
export function flyOlivesToCounter(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  amount: number,
  opts?: { depth?: number; onLeafHit?: () => void }
): { arriveDelayMs: number; spanMs: number } {
  const count =
    amount <= 8 ? Math.max(1, Math.round(amount)) : Math.min(8, Math.max(3, Math.round(amount / 5)));
  const stagger = 45;
  const duration = 520;
  const depth = opts?.depth ?? 80;
  for (let i = 0; i < count; i++) {
    const delay = i * stagger;
    const ox = fromX + (Math.random() - 0.5) * 24;
    const oy = fromY + (Math.random() - 0.5) * 14;
    scene.time.delayedCall(delay, () => {
      const leaf = scene.add
        .image(ox, oy, "icon_olivo")
        .setDisplaySize(22, 22)
        .setDepth(depth)
        .setAlpha(0.95);
      scene.tweens.add({
        targets: leaf,
        x: toX + (Math.random() - 0.5) * 8,
        y: toY,
        alpha: 0.2,
        scale: 0.55,
        duration,
        ease: "Cubic.easeIn",
        onComplete: () => {
          opts?.onLeafHit?.();
          leaf.destroy();
        }
      });
    });
  }
  return oliveFlyTiming(count, stagger, duration);
}

/** El número crece mientras llegan las hojas. Punch en cada entero. */
export function tweenOliveCounter(
  scene: Phaser.Scene,
  from: number,
  to: number,
  delayMs: number,
  durationMs: number,
  apply: (n: number) => void,
  punch?: () => void
): void {
  const start = Math.max(0, Math.floor(from));
  const end = Math.max(start, Math.floor(to));
  apply(start);
  if (end <= start) return;
  const state = { v: start };
  let last = start;
  scene.tweens.add({
    targets: state,
    v: end,
    delay: delayMs,
    duration: Math.max(80, durationMs),
    ease: "Linear",
    onUpdate: () => {
      const n = Math.round(state.v);
      if (n === last) return;
      last = n;
      apply(n);
      punch?.();
    },
    onComplete: () => {
      apply(end);
      punch?.();
    }
  });
}

export function punchOliveLabel(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform
): void {
  scene.tweens.killTweensOf(target);
  const sx = target.scaleX;
  const sy = target.scaleY;
  scene.tweens.add({
    targets: target,
    scaleX: sx * 1.22,
    scaleY: sy * 1.22,
    duration: 90,
    yoyo: true,
    ease: "Quad.easeOut",
    onComplete: () => {
      target.setScale(sx, sy);
    }
  });
}
