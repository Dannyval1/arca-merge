/**
 * Configuración de audio (música + SFX).
 *
 * SFX listos (hoy en public/assets/music/ junto a la BGM):
 *   pop_up_touch.mp3  → onTap (al soltar / enviar animal, no en cada toque)
 *   merge.mp3         → onMerge(tier)  [un sample; detune por tier]
 *   tap.mp3           → onUiTap (botones HUD / modales)
 *
 * Poderes (public/assets/sfx/):
 *   power_doble.mp3, power_cuervo.mp3, power_rayo.mp3, power_water.mp3
 *
 * Si falta un archivo, el evento no falla: simplemente no suena.
 */

export const AUDIO_KEYS = {
  music: "bgm_ark",
  /** Toque en el área jugable. */
  boardTap: "sfx_board_tap",
  /** Botones de interfaz (HUD, poderes, modales). */
  uiTap: "sfx_ui_tap",
  drop: "sfx_drop",
  land: "sfx_land",
  merge: "sfx_merge",
  powerTwoByTwo: "sfx_power_two_by_two",
  powerRaven: "sfx_power_raven",
  powerLightning: "sfx_power_lightning",
  powerWaters: "sfx_power_waters",
  reward: "sfx_reward",
  gameOver: "sfx_game_over",
  arkComplete: "sfx_ark_complete"
} as const;

/** Rutas relativas a public/ (Vite / Phaser load). */
export const AUDIO_PATHS = {
  music: "assets/music/ark_game_music.mp3",
  boardTap: "assets/music/pop_up_touch.mp3",
  uiTap: "assets/music/tap.mp3",
  merge: "assets/music/merge.mp3",
  drop: "assets/sfx/drop.mp3",
  land: "assets/sfx/land.mp3",
  powerTwoByTwo: "assets/sfx/power_doble.mp3",
  powerRaven: "assets/sfx/power_cuervo.mp3",
  powerLightning: "assets/sfx/power_rayo.mp3",
  powerWaters: "assets/sfx/power_water.mp3",
  reward: "assets/sfx/reward.mp3",
  gameOver: "assets/sfx/game_over.mp3",
  arkComplete: "assets/sfx/ark_complete.mp3"
} as const;

export const audioConfig = {
  music: {
    /** Fondo: por debajo de sfx.volume, pero audible a volumen medio del dispositivo. */
    volume: 0.48,
    loop: true
  },
  sfx: {
    volume: 0.7,
    uiTapVolume: 0.65,
    boardTapVolume: 0.7,
    mergeVolume: 0.75,
    /** Loop de Las Aguas: un poco más bajo; dura todo el poder. */
    watersVolume: 0.55,
    /**
     * Detune en cents por escalón de tier sobre el 2 (fusión mínima).
     * tier 2 → 0; tier 3 → +40; …; tier 10 → +320.
     */
    mergeDetunePerTier: 40,
    mergeBaseTier: 2
  }
} as const;
