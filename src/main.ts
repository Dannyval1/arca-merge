import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { HomeScene } from "./HomeScene";
import { getBufferSize, getParentCssSize } from "./layout";
import { waitForUiFonts } from "./fonts";
import { applyDailyOliveGrant } from "./dailyGrant";
import { tryInstallNativeStorageFromShell } from "./storage";
import { ENABLE_GAME_DEBUG } from "./buildFlags";

type GameInternal = Phaser.Game & {
  texturesReady: () => void;
  start: () => void;
};

type SceneManagerInternal = Phaser.Scenes.SceneManager & {
  bootQueue: () => void;
  isBooted: boolean;
  _pending: unknown[];
};

type TextureManagerInternal = Phaser.Textures.TextureManager & {
  _pending: number;
};

function pingShell(payload: Record<string, unknown>): void {
  if (!ENABLE_GAME_DEBUG) return;
  try {
    (
      window as Window & { ReactNativeWebView?: { postMessage: (m: string) => void } }
    ).ReactNativeWebView?.postMessage(
      JSON.stringify({ type: "debug_viewport", ...payload })
    );
  } catch {
    // browser
  }
  console.log("[debug_viewport]", payload);
}

function canvasSnapshot(game: Phaser.Game): Record<string, unknown> {
  const c = game.canvas;
  const sm = game.scene as SceneManagerInternal;
  return {
    canvasW: c?.width ?? 0,
    canvasH: c?.height ?? 0,
    styleW: c?.style.width ?? "",
    styleH: c?.style.height ?? "",
    dpr: window.devicePixelRatio || 1,
    scaleW: game.scale.width,
    scaleH: game.scale.height,
    inner: [window.innerWidth, window.innerHeight],
    isBooted: game.isBooted,
    isRunning: game.isRunning,
    sceneBooted: sm.isBooted,
    pendingScenes: sm._pending?.length ?? -1,
    keys: sm.getScenes(false).map((s) => s.sys.settings.key),
    active: sm.getScenes(true).map((s) => s.sys.settings.key),
    readyState: document.readyState,
    hasRenderer: Boolean(game.renderer)
  };
}

function textureUsable(
  tm: Phaser.Textures.TextureManager,
  key: string
): boolean {
  try {
    if (!tm.exists(key)) return false;
    const texture = tm.get(key);
    return Boolean(texture && typeof texture.get === "function" && texture.has("__BASE"));
  } catch {
    return false;
  }
}

function pixelCanvas(r: number, g: number, b: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 1, 1);
  }
  return canvas;
}

/**
 * En este WebView Android las data-URI internas de Phaser (`__DEFAULT` /
 * `__MISSING` / `__WHITE`) a veces no disparan Image.onload ni onerror.
 * El TextureManager se queda con `_pending > 0`, nunca emite READY, y al
 * forzar el boot el stamp hace `texture.get()` sobre `undefined`.
 */
function ensureDefaultTextures(game: Phaser.Game): void {
  const tm = game.textures;
  const pixels: Array<[string, number, number, number]> = [
    ["__DEFAULT", 0, 0, 0],
    ["__MISSING", 255, 0, 255],
    ["__WHITE", 255, 255, 255]
  ];
  for (const [key, r, g, b] of pixels) {
    if (textureUsable(tm, key)) continue;
    if (tm.exists(key)) {
      try {
        tm.remove(key);
      } catch {
        // ignore
      }
    }
    tm.addCanvas(key, pixelCanvas(r, g, b));
  }
}

function finishTextureManager(game: Phaser.Game): void {
  const tm = game.textures as TextureManagerInternal;
  tm.off(Phaser.Textures.Events.LOAD);
  tm.off(Phaser.Textures.Events.ERROR);
  tm._pending = 0;
}

function runBootQueue(game: Phaser.Game): void {
  const sm = game.scene as SceneManagerInternal;
  if (sm.isBooted) return;
  sm.bootQueue();
}

/** Buffer = CSS × DPR (tope 2). El canvas CSS llena #game; la cámara hace contain. */
function syncCanvas(game: Phaser.Game): void {
  const { width, height } = getBufferSize();
  const { cssW, cssH } = getParentCssSize();
  if (game.scale.width !== width || game.scale.height !== height) {
    game.scale.resize(width, height);
  }
  const canvas = game.canvas;
  if (!canvas) return;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.marginLeft = "0";
  canvas.style.marginTop = "0";
  canvas.style.display = "block";
}

function forceStart(game: Phaser.Game): void {
  const g = game as GameInternal;
  ensureDefaultTextures(game);
  finishTextureManager(game);

  pingShell({
    phase: "force-before",
    hasDefault: textureUsable(game.textures, "__DEFAULT"),
    hasMissing: textureUsable(game.textures, "__MISSING"),
    ...canvasSnapshot(game)
  });

  try {
    if (!game.isRunning) {
      g.texturesReady();
    }
  } catch (e) {
    pingShell({
      phase: "READY-throw",
      msg: e instanceof Error ? e.stack ?? e.message : String(e)
    });
    ensureDefaultTextures(game);
    try {
      runBootQueue(game);
    } catch (e2) {
      pingShell({
        phase: "bootQueue-throw",
        msg: e2 instanceof Error ? e2.stack ?? e2.message : String(e2)
      });
    }
  }

  if (!(game.scene as SceneManagerInternal).isBooted) {
    ensureDefaultTextures(game);
    try {
      runBootQueue(game);
    } catch (e) {
      pingShell({
        phase: "bootQueue-retry-throw",
        msg: e instanceof Error ? e.stack ?? e.message : String(e)
      });
    }
  }

  try {
    if (!game.isRunning) g.start();
  } catch (e) {
    pingShell({
      phase: "start-throw",
      msg: e instanceof Error ? e.stack ?? e.message : String(e)
    });
  }

  pingShell({ phase: "force-after", ...canvasSnapshot(game) });
  window.setTimeout(() => {
    pingShell({ phase: "ready+500ms", ...canvasSnapshot(game) });
  }, 500);
  window.setTimeout(() => {
    pingShell({ phase: "ready+2s", ...canvasSnapshot(game) });
  }, 2000);
}

function boot(): void {
  window.addEventListener("error", (ev) => {
    pingShell({
      phase: "window-error",
      msg: ev.message,
      src: ev.filename,
      line: ev.lineno
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    pingShell({ phase: "unhandled", msg: String(ev.reason) });
  });

  tryInstallNativeStorageFromShell();
  applyDailyOliveGrant();
  pingShell({
    phase: "boot-start",
    inner: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio || 1,
    readyState: document.readyState
  });

  try {
    const buffer = getBufferSize();
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: "game",
      width: buffer.width,
      height: buffer.height,
      backgroundColor: "#1b2a41",
      scale: {
        mode: Phaser.Scale.NONE
      },
      physics: {
        default: "matter",
        matter: {
          gravity: { x: 0, y: 1.1 },
          positionIterations: 8,
          velocityIterations: 6
        }
      },
      scene: [HomeScene, GameScene],
      callbacks: {
        postBoot: (g) => {
          syncCanvas(g);
          pingShell({ phase: "postBoot", ...canvasSnapshot(g) });
        }
      }
    });

    syncCanvas(game);
    const onViewport = (): void => syncCanvas(game);
    window.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("resize", onViewport);
    game.scale.on(Phaser.Scale.Events.RESIZE, () => {
      const { cssW, cssH } = getParentCssSize();
      const canvas = game.canvas;
      if (!canvas) return;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.style.marginLeft = "0";
      canvas.style.marginTop = "0";
    });
    pingShell({ phase: "constructed", ...canvasSnapshot(game) });

    if (!game.isRunning) {
      forceStart(game);
    }
    window.setTimeout(() => syncCanvas(game), 0);
    window.setTimeout(() => syncCanvas(game), 250);

    void waitForUiFonts().then((ms) => {
      console.log(`[fonts] Nunito lista en ${ms}ms`);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e);
    console.error("[boot]", e);
    pingShell({ phase: "error", msg });
  }
}

void boot();
