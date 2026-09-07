/**
 * Canvas lógico. TODO el juego —física, radios de chain.ts, posiciones del HUD
 * y las constantes de juiceConfig— vive en estas unidades y nunca cambia.
 *
 * Lo que sí cambia con la pantalla es el buffer (contenedor CSS × renderScale)
 * y el zoom de cámara: contain de 390×844. El overscan pinta más cielo (cover
 * solo de bg). El casco se queda en 390×844 para coincidir con Matter.
 */
export const LOGICAL_WIDTH = 390;
export const LOGICAL_HEIGHT = 844;

/**
 * Inset del casco respecto al collider (preview/drop/fantasma no invaden el marco).
 */
export const PLAYABLE_INSET = 28;

/**
 * Tope de resolución de render.
 *
 * bg.png y new_ark.png miden 780 px de ancho, así que a 2x el arca se dibuja 1:1
 * con su fuente: lo mejor que puede verse. A 3x pagaríamos 2.25x de fill rate
 * (2.96 Mpx por frame contra 1.32) para mostrar una textura escalada hacia
 * arriba, sin un solo píxel de detalle extra. En WebView Android de gama media
 * ese costo sí se nota, y aquí no compra nada.
 */
export const MAX_RENDER_SCALE = 2;

export function getRenderScale(): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(Math.max(dpr, 1), MAX_RENDER_SCALE);
}

/** Tamaño CSS del contenedor #game (o el viewport). */
export function getParentCssSize(): { cssW: number; cssH: number } {
  if (typeof document === "undefined") {
    return { cssW: LOGICAL_WIDTH, cssH: LOGICAL_HEIGHT };
  }
  const el = document.getElementById("game");
  const cssW = Math.max(1, el?.clientWidth || window.innerWidth || LOGICAL_WIDTH);
  const cssH = Math.max(1, el?.clientHeight || window.innerHeight || LOGICAL_HEIGHT);
  return { cssW, cssH };
}

/** Buffer HiDPI que llena el contenedor (Scale.NONE + CSS 100%). */
export function getBufferSize(): { width: number; height: number } {
  const { cssW, cssH } = getParentCssSize();
  const rs = getRenderScale();
  return {
    width: Math.max(1, Math.round(cssW * rs)),
    height: Math.max(1, Math.round(cssH * rs))
  };
}

/**
 * Zoom de cámara para que 390×844 quepa entero (contain). El resto del
 * viewport es overscan: mismo escenario, sin tocar física ni HUD.
 */
export function getContainZoom(bufferW: number, bufferH: number): number {
  return Math.min(bufferW / LOGICAL_WIDTH, bufferH / LOGICAL_HEIGHT);
}
