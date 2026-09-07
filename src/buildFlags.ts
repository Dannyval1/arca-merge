/**
 * Flags de build del juego (Phaser / Vite).
 * Mantener IS_PRODUCTION alineado con arca-shell/src/config.ts.
 * false = seguir en desarrollo.
 */
export const IS_PRODUCTION = false;

/** Consola arcaDebug, ping debug_viewport, logMerges, etc. */
export const ENABLE_GAME_DEBUG = !IS_PRODUCTION;
