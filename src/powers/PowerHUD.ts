import Phaser from "phaser";
import {
  POWER_DEFS,
  type PowerDef,
  type PowerId,
  type PowerManagerState
} from "./powerDefs";
import type { Economy } from "./economy";
import { HUD_LAYOUT } from "../hud/hudLayout";
import { BALOO_BITMAP_KEY, NUNITO_FAMILY } from "../fonts";
import { GameAudio } from "../audio/GameAudio";
import { t } from "./locale";

export type PowerButtonVisual =
  | "available"
  | "reload"
  | "armed"
  | "selected"
  | "disabled";

/** Estados forzables desde arcaDebug.setPowerState. */
export type DebugPowerState =
  | "available"
  | "reload"
  | "armed"
  | "disabled"
  /** @deprecated alias de reload */
  | "olives"
  | "rewarded";

type BadgeMode = "uses" | "empty";

type Handlers = {
  onPowerTap: (id: PowerId) => void;
};

type ButtonViews = {
  id: PowerId;
  def: PowerDef;
  root: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  colorKey: string;
  mutedKey: string;
  /** Pastilla de usos (esquina superior derecha). */
  badgeBg: Phaser.GameObjects.Graphics;
  badgeText: Phaser.GameObjects.BitmapText;
  bodyHit: Phaser.GameObjects.Rectangle;
  /** Armado / seleccionado: zoom + vibración en tick(). */
  pulsing: boolean;
};

function mutedIconKey(srcKey: string): string {
  return `${srcKey}-muted`;
}

/**
 * Canvas (Android WebView) ignora Image.setTint. Bakeamos una textura
 * desaturada/oscurecida una vez por icono, manteniendo detalle y alpha 1.
 */
function ensureMutedPowerIcon(
  scene: Phaser.Scene,
  srcKey: string,
  desaturate: number,
  darken: number
): string {
  const key = mutedIconKey(srcKey);
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(srcKey)) return srcKey;

  const frame = scene.textures.get(srcKey).get();
  const src = frame.source?.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | undefined;
  if (!src) return srcKey;

  const sw = Math.max(1, frame.cutWidth || frame.width || 64);
  const sh = Math.max(1, frame.cutHeight || frame.height || 64);
  const maxSide = 96;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(24, Math.round(sw * scale));
  const h = Math.max(24, Math.round(sh * scale));

  const canvasTex = scene.textures.createCanvas(key, w, h);
  if (!canvasTex) return srcKey;
  const ctx = canvasTex.getContext();
  const sx = frame.cutX || 0;
  const sy = frame.cutY || 0;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);

  const d = Math.min(1, Math.max(0, desaturate));
  const k = Math.min(1, Math.max(0.12, 1 - darken));
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = Math.round((r * (1 - d) + lum * d) * k);
    data[i + 1] = Math.round((g * (1 - d) + lum * d) * k);
    data[i + 2] = Math.round((b * (1 - d) + lum * d) * k);
  }
  ctx.putImageData(imageData, 0, 0);
  canvasTex.refresh();
  return key;
}

/**
 * Mezcla un color de poder hacia gris manteniendo identidad cromática.
 */
function mutedPowerColor(color: number, towardGray = 0.55): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const gray = 0x9a;
  const mr = Math.round(r * (1 - towardGray) + gray * towardGray);
  const mg = Math.round(g * (1 - towardGray) + gray * towardGray);
  const mb = Math.round(b * (1 - towardGray) + gray * towardGray);
  return (mr << 16) | (mg << 8) | mb;
}

/**
 * Fila 2: iconos de poder + badge / chips de recarga (sin contenedor de color).
 */
export class PowerHUD {
  private readonly buttons: ButtonViews[] = [];
  private readonly root: Phaser.GameObjects.Container;
  private cancelHint: Phaser.GameObjects.Text;
  private handlers: Handlers | null = null;
  private readonly hitRects: {
    id: PowerId;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];
  private readonly debugOverride = new Map<PowerId, DebugPowerState>();
  private pulseMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly economy: Economy,
    private readonly renderScale: number
  ) {
    const F = HUD_LAYOUT.fila2;
    this.root = scene.add.container(0, 0).setDepth(HUD_LAYOUT.depth.powers);

    const H = HUD_LAYOUT.cancelHint;
    this.cancelHint = scene.add
      .text(195, H.y, "", {
        fontFamily: NUNITO_FAMILY,
        fontSize: `${H.fontSize}px`,
        color: H.color,
        fontStyle: "bold",
        align: "center",
        stroke: H.stroke,
        strokeThickness: H.strokeThickness,
        wordWrap: { width: 360 },
        resolution: this.renderScale
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.root.add(this.cancelHint);

    for (let i = 0; i < POWER_DEFS.length; i++) {
      const def = POWER_DEFS[i];
      const x = F.centersX[i];
      const y = F.centerY;
      const w = F.buttonW;
      const h = F.buttonH;
      const B = F.badge;

      const btnRoot = scene.add.container(x, y);

      const colorKey = def.iconTexture;
      const mutedKey = ensureMutedPowerIcon(
        scene,
        colorKey,
        F.disabled.desaturate,
        F.disabled.darken
      );
      const icon = scene.add
        .image(0, -1, colorKey)
        .setDisplaySize(F.iconSize, F.iconSize);

      const { cx: badgeX, cy: badgeY } = this.badgeCenter();
      const badgeBg = scene.add.graphics();
      const badgeText = scene.add
        .bitmapText(badgeX, badgeY, BALOO_BITMAP_KEY, "x1", B.fontSize)
        .setOrigin(0.5)
        .setTint(0xffffff);

      const bodyHit = scene.add
        .rectangle(0, 0, w, h, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true });

      bodyHit.on("pointerdown", () => {
        GameAudio.current?.onUiTap();
        this.handlers?.onPowerTap(def.id);
      });

      btnRoot.add([icon, badgeBg, badgeText, bodyHit]);
      this.root.add(btnRoot);

      const btn: ButtonViews = {
        id: def.id,
        def,
        root: btnRoot,
        icon,
        colorKey,
        mutedKey,
        badgeBg,
        badgeText,
        bodyHit,
        pulsing: false
      };
      this.buttons.push(btn);
      this.hitRects.push({
        id: def.id,
        x: x - w / 2,
        y: y - h / 2,
        w,
        h
      });
    }

    this.refresh("IDLE", null, null);
  }

  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  hitTest(worldX: number, worldY: number): PowerId | "cancel-zone" | null {
    for (let i = 0; i < this.hitRects.length; i++) {
      const r = this.hitRects[i];
      if (
        worldX >= r.x &&
        worldX <= r.x + r.w &&
        worldY >= r.y &&
        worldY <= r.y + r.h
      ) {
        return r.id;
      }
    }
    return null;
  }

  setDebugState(id: PowerId, state: DebugPowerState | null): void {
    if (state == null) this.debugOverride.delete(id);
    else this.debugOverride.set(id, state);
    this.refresh("IDLE", null, null);
  }

  clearDebugStates(): void {
    this.debugOverride.clear();
  }

  tick(delta: number): void {
    this.pulseMs += delta;
    const base = HUD_LAYOUT.fila2.selectedScale;
    const t = this.pulseMs / 1000;
    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i];
      if (!btn.pulsing) continue;
      // Zoom estable + micro-vibración (escala y rotación).
      const scale = base + Math.sin(t * Math.PI * 5) * 0.045;
      const rot = Math.sin(t * Math.PI * 11) * 0.07;
      btn.root.setScale(scale);
      btn.root.setRotation(rot);
    }
  }

  refresh(
    state: PowerManagerState,
    selectedId: PowerId | null,
    armedId: PowerId | null,
    disabled = false,
    boardEmpty = false,
    noMergeableTiers = false,
    inDangerZone = false,
    watersActive = false,
    boardPieceCount = 0
  ): void {
    const ravenOn = state === "SELECTING" && selectedId === "raven";
    const doubleOn = state === "ARMED" && armedId === "two-by-two";
    this.cancelHint.setVisible(ravenOn || doubleOn);
    if (ravenOn) {
      this.cancelHint.setText(
        t({
          es: "El cuervo se lleva el animal que quieras",
          en: "Tap an animal to let the raven take it up",
          pt: "Toque um animal para que o corvo o leve para cima"
        })
      );
    } else if (doubleOn) {
      this.cancelHint.setText(
        t({
          es: "Suelta dos animales iguales",
          en: "Drop two equal animals",
          pt: "Solte dois animais iguais"
        })
      );
    }

    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i];
      const def = btn.def;
      const uses = this.economy.getUses(def.id);

      const debug = this.debugOverride.get(def.id);
      let visual: PowerButtonVisual = "available";
      // Armado ya consumió un uso: mostrar los que quedan.
      let usesLabel = `x${uses}`;

      if (debug) {
        visual = this.normalizeDebug(debug);
        if (visual === "available" || visual === "armed") usesLabel = "x1";
      } else {
        const hardOff =
          disabled ||
          state === "APPLYING" ||
          (def.targeting === "pick-piece" &&
            boardEmpty &&
            armedId !== def.id) ||
          (def.targeting === "pick-tier" &&
            noMergeableTiers &&
            armedId !== def.id) ||
          (def.blockedInDanger &&
            (inDangerZone || watersActive) &&
            armedId !== def.id) ||
          (def.minBoardPieces != null &&
            boardPieceCount < def.minBoardPieces &&
            armedId !== def.id);

        if (hardOff) {
          visual = "disabled";
        } else if (armedId === def.id) {
          visual = "armed";
        } else if (selectedId === def.id && state === "SELECTING") {
          visual = "selected";
        } else if (uses > 0) {
          visual = "available";
        } else {
          visual = "reload";
        }
      }

      this.applyVisual(btn, visual, usesLabel);
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private normalizeDebug(state: DebugPowerState): PowerButtonVisual {
    if (state === "olives" || state === "rewarded") return "reload";
    return state;
  }

  private applyVisual(
    btn: ButtonViews,
    visual: PowerButtonVisual,
    usesLabel: string
  ): void {
    const pulsing = visual === "armed" || visual === "selected";
    btn.pulsing = pulsing;
    if (!pulsing) {
      btn.root.setScale(1);
      btn.root.setRotation(0);
    }

    switch (visual) {
      case "available":
        this.setIconStyle(btn, "full");
        this.setBadgeMode(btn, "uses", usesLabel, true);
        btn.root.setAlpha(1);
        break;
      case "reload":
        this.setIconStyle(btn, "muted");
        btn.root.setAlpha(1);
        this.setBadgeMode(btn, "empty", usesLabel, true);
        break;
      case "selected":
      case "armed":
        this.setIconStyle(btn, "full");
        this.setBadgeMode(btn, "uses", usesLabel, true);
        btn.root.setAlpha(1);
        break;
      case "disabled":
        this.setIconStyle(btn, "muted");
        if (this.economy.getUses(btn.def.id) > 0) {
          this.setBadgeMode(btn, "uses", usesLabel, false);
        } else {
          this.setBadgeMode(btn, "empty", usesLabel, false);
        }
        btn.root.setAlpha(1);
        break;
    }
  }

  private setIconStyle(btn: ButtonViews, style: "full" | "muted"): void {
    const key = style === "full" ? btn.colorKey : btn.mutedKey;
    if (btn.icon.texture.key !== key) {
      btn.icon.setTexture(key);
      const size = HUD_LAYOUT.fila2.iconSize;
      btn.icon.setDisplaySize(size, size);
    }
    btn.icon.clearTint().setAlpha(1);
  }

  private setBadgeMode(
    btn: ButtonViews,
    mode: BadgeMode,
    usesLabel: string,
    interactive: boolean
  ): void {
    const showUses = mode === "uses";
    btn.badgeBg.setVisible(showUses);
    btn.badgeText.setVisible(showUses).setText(usesLabel);
    if (showUses) this.paintBadge(btn, interactive);
  }

  private paintBadge(btn: ButtonViews, interactive: boolean): void {
    const B = HUD_LAYOUT.fila2.badge;
    const { cx, cy } = this.badgeCenter();
    const x = cx - B.w / 2;
    const y = cy - B.h / 2;
    const g = btn.badgeBg;
    g.clear();
    const fill = interactive
      ? btn.def.footerColor
      : mutedPowerColor(btn.def.footerColor, 0.4);
    g.fillStyle(fill, 0.95);
    g.fillRoundedRect(x, y, B.w, B.h, B.radius);
    g.lineStyle(1, 0xffffff, 0.3);
    g.strokeRoundedRect(x, y, B.w, B.h, B.radius);
  }

  /** Centro de la pastilla xN: pegada al icono pero asomando arriba-derecha. */
  private badgeCenter(): { cx: number; cy: number } {
    const F = HUD_LAYOUT.fila2;
    const B = F.badge;
    const half = F.iconSize / 2;
    return {
      cx: half - B.w * 0.15 + B.outsetX,
      cy: -half + B.h * 0.15 - B.outsetY
    };
  }
}

/** Reexport para imports legacy. */
export { POWER_HUD_LAYOUT } from "../hud/hudLayout";
