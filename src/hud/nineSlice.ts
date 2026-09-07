import Phaser from "phaser";

export type NineSliceMargins = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** NineSlice no pinta en Canvas (NOOP). Ahí degradamos a Image. */
export type SlicedSprite = Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image;

/**
 * Nine-slice a tamaño de pantalla: los márgenes van en px de la PNG fuente.
 * Se estira el centro en espacio fuente y luego se aplica scale uniforme
 * por ancho, para que las esquinas no se deformen.
 */
export function addNineSlice(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  displayW: number,
  displayH: number,
  slice: NineSliceMargins
): SlicedSprite {
  if (!("gl" in scene.game.renderer)) {
    return scene.add.image(x, y, key).setDisplaySize(displayW, displayH).setOrigin(0.5);
  }

  const frame = scene.textures.get(key).get();
  const srcW = frame.width;
  const scale = displayW / Math.max(1, srcW);
  const layoutH = Math.max(displayH / scale, slice.top + slice.bottom + 1);
  const ns = scene.add.nineslice(
    x,
    y,
    key,
    undefined,
    srcW,
    layoutH,
    slice.left,
    slice.right,
    slice.top,
    slice.bottom
  );
  ns.setScale(scale);
  ns.setOrigin(0.5);
  return ns;
}
