import Phaser from "phaser";
import { onAppLifecycle, setAdAudioGuards } from "../bridge";
import { getSettingsPrefs } from "../settingsPrefs";
import type { PowerId } from "../powers/powerDefs";
import { AUDIO_KEYS, AUDIO_PATHS, audioConfig } from "./audioConfig";

/**
 * Audio del juego: música de fondo + SFX por eventos (estilo juice).
 *
 * - Música y efectos son toggles independientes (settingsPrefs).
 * - iOS WebView: llamar `onUnlocked()` solo tras el primer pointer + sound.unlock().
 * - Samples ausentes → no-op silencioso.
 *
 * Cuando tengas el pack SFX en `public/assets/sfx/` (nombres en audioConfig.ts),
 * llama `GameAudio.queueSfxLoads(scene)` desde preload junto a la música.
 */
export class GameAudio {
  static current: GameAudio | null = null;

  private music: Phaser.Sound.BaseSound | null = null;
  private watersLoop: Phaser.Sound.BaseSound | null = null;
  private unlocked = false;
  private musicWanted = true;
  private sfxEnabled = true;
  private musicEnabled = true;
  private backgroundPaused = false;
  private adPaused = false;
  private readonly unsubLifecycle: () => void;
  private readonly onHidden: () => void;
  private readonly onVisible: () => void;
  private readonly onVisibilityChange: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    GameAudio.current = this;
    this.applyPrefs();
    setAdAudioGuards(
      () => this.pauseForAd(),
      () => this.resumeAfterAd()
    );
    this.unsubLifecycle = onAppLifecycle((type) => {
      if (type === "app_background") this.onAppBackground();
      else this.onAppForeground();
    });

    // Red de seguridad: el shell a veces no inyecta a tiempo al apagar pantalla.
    // Phaser HIDDEN/VISIBLE + Page Visibility cubren WebView iOS/Android.
    this.onHidden = () => this.onAppBackground();
    this.onVisible = () => this.onAppForeground();
    this.onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.hidden) {
        this.onAppBackground();
      } else {
        this.onAppForeground();
      }
    };
    scene.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden);
    scene.game.events.on(Phaser.Core.Events.VISIBLE, this.onVisible);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  /** Música. Si el archivo falla, el juego sigue sin ella. */
  static queueMusicLoad(scene: Phaser.Scene): void {
    if (scene.cache.audio.exists(AUDIO_KEYS.music)) return;
    scene.load.audio(AUDIO_KEYS.music, AUDIO_PATHS.music);
  }

  /**
   * SFX que ya existen (tablero, merge, UI).
   * El resto del pack se añade en queueSfxLoads cuando estén en assets/sfx/.
   */
  static queueReadySfxLoads(scene: Phaser.Scene): void {
    const pairs: [string, string][] = [
      [AUDIO_KEYS.boardTap, AUDIO_PATHS.boardTap],
      [AUDIO_KEYS.uiTap, AUDIO_PATHS.uiTap],
      [AUDIO_KEYS.merge, AUDIO_PATHS.merge]
    ];
    for (const [key, path] of pairs) {
      if (!scene.cache.audio.exists(key)) scene.load.audio(key, path);
    }
  }

  /**
   * SFX de poderes (public/assets/sfx/). El resto del pack (drop/land/…)
   * se añade cuando existan los archivos.
   */
  static queueSfxLoads(scene: Phaser.Scene): void {
    const pairs: [string, string][] = [
      [AUDIO_KEYS.powerTwoByTwo, AUDIO_PATHS.powerTwoByTwo],
      [AUDIO_KEYS.powerRaven, AUDIO_PATHS.powerRaven],
      [AUDIO_KEYS.powerLightning, AUDIO_PATHS.powerLightning],
      [AUDIO_KEYS.powerWaters, AUDIO_PATHS.powerWaters]
    ];
    for (const [key, path] of pairs) {
      if (!scene.cache.audio.exists(key)) scene.load.audio(key, path);
    }
  }

  applyPrefs(): void {
    const prefs = getSettingsPrefs();
    this.sfxEnabled = prefs.sound;
    this.musicEnabled = prefs.music;
    if (!this.sfxEnabled) this.stopWatersLoop();
    if (!this.musicEnabled) {
      this.pauseMusicInternal();
    } else if (this.unlocked && !this.backgroundPaused && !this.adPaused) {
      this.ensureMusicPlaying();
    }
  }

  /**
   * Tras el primer toque del jugador (y sound.unlock()).
   * Arranca la música si el toggle lo permite.
   */
  onUnlocked(): void {
    this.unlocked = true;
    this.musicWanted = true;
    if (this.musicEnabled && !this.backgroundPaused && !this.adPaused) {
      this.ensureMusicPlaying();
    }
  }

  onAppBackground(): void {
    if (this.backgroundPaused) return;
    this.backgroundPaused = true;
    this.pauseMusicInternal();
    try {
      this.scene.sound.pauseAll();
    } catch {
      // ignore
    }
  }

  onAppForeground(): void {
    if (!this.backgroundPaused) return;
    this.backgroundPaused = false;
    // No hacer early-return por adPaused: el anuncio fullscreen ya no tiene
    // el foco; si el bridge no entregó result, mute/BGM quedarían muertos.
    this.adPaused = false;
    try {
      this.scene.sound.mute = false;
      this.scene.sound.resumeAll();
    } catch {
      // ignore
    }
    if (this.unlocked && this.musicEnabled && this.musicWanted) {
      this.ensureMusicPlaying();
    }
  }

  /** Fullscreen ad (rewarded / interstitial): corta BGM y SFX. */
  pauseForAd(): void {
    if (this.adPaused) return;
    this.adPaused = true;
    try {
      this.scene.sound.mute = true;
      this.scene.sound.pauseAll();
    } catch {
      // ignore
    }
    this.pauseMusicInternal();
  }

  resumeAfterAd(): void {
    this.adPaused = false;
    // Siempre desmutear: el ad puede cerrarse aún con backgroundPaused=true;
    // si no, la música queda muteada para siempre.
    try {
      this.scene.sound.mute = false;
    } catch {
      // ignore
    }
    if (this.backgroundPaused) return;
    try {
      this.scene.sound.resumeAll();
    } catch {
      // ignore
    }
    if (this.unlocked && this.musicEnabled && this.musicWanted) {
      this.ensureMusicPlaying();
    }
  }

  /** Toque que envía animal (drop real). No en pointerdown vacío. */
  onTap(): void {
    this.playSfx(AUDIO_KEYS.boardTap, {
      volume: audioConfig.sfx.boardTapVolume
    });
  }

  /** Botones de HUD / poderes / modales. */
  onUiTap(): void {
    this.playSfx(AUDIO_KEYS.uiTap, { volume: audioConfig.sfx.uiTapVolume });
  }

  onDrop(): void {
    this.playSfx(AUDIO_KEYS.drop);
  }

  onLand(): void {
    this.playSfx(AUDIO_KEYS.land);
  }

  onMerge(tier: number): void {
    const steps = Math.max(0, tier - audioConfig.sfx.mergeBaseTier);
    const detune = steps * audioConfig.sfx.mergeDetunePerTier;
    this.playSfx(AUDIO_KEYS.merge, {
      detune,
      volume: audioConfig.sfx.mergeVolume
    });
  }

  onPower(id: PowerId): void {
    if (id === "waters") {
      this.startWatersLoop();
      return;
    }
    const key =
      id === "two-by-two"
        ? AUDIO_KEYS.powerTwoByTwo
        : id === "raven"
          ? AUDIO_KEYS.powerRaven
          : AUDIO_KEYS.powerLightning;
    this.playSfx(key);
  }

  /** Corta el loop de Las Aguas (fin del poder, game over, shutdown). */
  stopWatersLoop(): void {
    if (!this.watersLoop) return;
    try {
      this.watersLoop.stop();
      this.watersLoop.destroy();
    } catch {
      // ignore
    }
    this.watersLoop = null;
  }

  onReward(): void {
    this.playSfx(AUDIO_KEYS.reward);
  }

  onGameOver(): void {
    this.playSfx(AUDIO_KEYS.gameOver);
  }

  onArkComplete(): void {
    this.playSfx(AUDIO_KEYS.arkComplete);
  }

  destroy(): void {
    this.unsubLifecycle();
    this.scene.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden);
    this.scene.game.events.off(Phaser.Core.Events.VISIBLE, this.onVisible);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.pauseMusicInternal();
    this.stopWatersLoop();
    if (this.music) {
      try {
        this.music.destroy();
      } catch {
        // ignore
      }
    }
    this.music = null;
    if (GameAudio.current === this) {
      GameAudio.current = null;
      setAdAudioGuards(
        () => undefined,
        () => undefined
      );
    }
  }

  private startWatersLoop(): void {
    this.stopWatersLoop();
    if (!this.sfxEnabled || !this.unlocked) return;
    if (!this.scene.cache.audio.exists(AUDIO_KEYS.powerWaters)) return;
    try {
      this.watersLoop = this.scene.sound.add(AUDIO_KEYS.powerWaters, {
        loop: true,
        volume: audioConfig.sfx.watersVolume
      });
      this.watersLoop.play();
    } catch {
      this.watersLoop = null;
    }
  }

  private ensureMusicPlaying(): void {
    if (
      !this.unlocked ||
      !this.musicEnabled ||
      this.backgroundPaused ||
      this.adPaused
    ) {
      return;
    }
    if (!this.scene.cache.audio.exists(AUDIO_KEYS.music)) return;

    try {
      if (!this.music) {
        this.music = this.scene.sound.add(AUDIO_KEYS.music, {
          loop: audioConfig.music.loop,
          volume: audioConfig.music.volume
        });
      }
      if (!this.music.isPlaying) {
        this.music.play();
      } else if (this.music.isPaused) {
        this.music.resume();
      }
    } catch {
      this.music = null;
    }
  }

  private pauseMusicInternal(): void {
    if (!this.music) return;
    try {
      if (this.music.isPlaying) this.music.pause();
    } catch {
      // ignore
    }
  }

  private playSfx(
    key: string,
    opts?: { detune?: number; volume?: number }
  ): void {
    if (!this.sfxEnabled || !this.unlocked) return;
    if (!this.scene.cache.audio.exists(key)) return;
    try {
      this.scene.sound.play(key, {
        volume: opts?.volume ?? audioConfig.sfx.volume,
        detune: opts?.detune ?? 0
      });
    } catch {
      // ignore
    }
  }
}
