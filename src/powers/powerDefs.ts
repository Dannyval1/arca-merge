/**
 * Registro declarativo de poderes.
 * Agregar un poder nuevo = una entrada aquí + su handler. Nada más.
 */

export type TargetingMode = "instant" | "pick-piece" | "pick-tier";

export type PowerManagerState = "IDLE" | "SELECTING" | "APPLYING" | "ARMED";

export type PowerId = "two-by-two" | "raven" | "lightning" | "waters";

/** Snapshot visual tras claimPieceForRemoval (el cuerpo ya no existe). */
export interface PowerPieceSnapshot {
  id: number;
  x: number;
  y: number;
  tier: number;
  textureKey: string;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface TierSlotInfo {
  tier: number;
  count: number;
  selectable: boolean;
}

/** Contexto que el host (GameScene) expone a los handlers. */
export interface PowerPieceRef {
  /** Identidad estable mientras la pieza viva. */
  id: number;
  x: number;
  y: number;
  tier: number;
  /** Factor de resaltado de selección (composición de escala). */
  selectHighlight: number;
  /** Dispara un flash visual breve en la pieza (vía juice / tint). */
  flash: () => void;
}

export interface PowerHandlerContext {
  /** Pieza elegida (solo en pick-piece). */
  piece?: PowerPieceRef;
  /** Nivel elegido (solo en pick-tier). */
  tier?: number;
  /**
   * Presente si def.removesTarget: el host ya validó, destruyó vía
   * destroyAnimal y devolvió el snapshot para el VFX. Sin puntos.
   */
  removalSnapshot?: PowerPieceSnapshot;
  host: PowerHost;
}

export interface PowerHost {
  isGameOver(): boolean;
  isArkCompleteAnimating(): boolean;
  /** Piezas seleccionables (no merging, vivas). */
  listPieces(): PowerPieceRef[];
  hasSelectablePieces(): boolean;
  findPieceAt(worldX: number, worldY: number): PowerPieceRef | null;
  isPieceSelectable(pieceId: number): boolean;
  /**
   * Atómico: si la pieza sigue siendo seleccionable, la destruye con
   * destroyAnimal() y devuelve snapshot para VFX. Si ya no existe / merging,
   * null — el caller NO debe consumir el uso.
   */
  claimPieceForRemoval(pieceId: number): PowerPieceSnapshot | null;
  /** VFX del cuervo; resuelve cuando termina la animación (~500ms). */
  playRavenCapture(snapshot: PowerPieceSnapshot): Promise<void>;
  /** Conteos por nivel para el selector pick-tier. */
  listTierSlots(): TierSlotInfo[];
  /** True si hay al menos un nivel 1–9 con ≥2 piezas fusionables. */
  hasMergeableTiers(): boolean;
  isTierSelectable(tier: number): boolean;
  /**
   * Cascada del Rayo: empareja, fusiona escalonado, juice.
   * Bloquea hasta terminar (o abort por game over / ark).
   */
  playLightning(tier: number): Promise<void>;
  /**
   * Las Aguas. Según juiceConfig.waters.releaseInputOnDrain puede
   * resolverse al empezar el drenaje mientras la física sigue.
   */
  playWaters(): Promise<void>;
  /** Pieza asentada por encima de la línea de peligro (bloquea Las Aguas). */
  isInDangerZone(): boolean;
  /** Agua aún activa (subida/hold/drenaje), aunque APPLYING haya terminado. */
  isWatersActive(): boolean;
  flashPiece(pieceId: number): void;
  setPieceHighlight(pieceId: number, highlight: number): void;
  clearPieceHighlights(): void;
  /** Miras pick-piece sobre cada pieza seleccionable. `hoveredId` agranda la del dedo. */
  setPickReticles(
    targets: readonly { id: number; x: number; y: number }[],
    hoveredId: number | null
  ): void;
  clearPickReticles(): void;
  setDropArmed(powerId: PowerId | null): void;
  /** Pausa Matter mientras un modal está abierto. */
  pausePhysics(): void;
  resumePhysics(): void;
  /** Hojas volando al contador (compra en tienda). */
  playOliveFly(fromX: number, fromY: number, amount: number): void;
}

export interface PowerDef {
  id: PowerId;
  name: { es: string; en: string; pt?: string };
  /** Frase corta para el modal de poder. */
  blurb: { es: string; en: string; pt?: string };
  shortLabel: string;
  /** Clave de textura Phaser (preload). */
  iconTexture: string;
  /** Color de fondo del botón HUD (RGB). */
  buttonColor: number;
  /** Color del glow al armar / seleccionar. */
  glowColor: number;
  /** Color de la franja inferior del botón. */
  footerColor: number;
  targeting: TargetingMode;
  armNextDrop?: boolean;
  /**
   * pick-piece que elimina el objetivo: claim atómico ANTES de consumir el uso.
   */
  removesTarget?: boolean;
  /** No usable si hay pieza en zona de peligro. */
  blockedInDanger?: boolean;
  /** Mínimo de piezas en el arca para poder usarlo (p. ej. Las Aguas = 5). */
  minBoardPieces?: number;
  oliveCost: number;
  rewardedEligible: boolean;
  handler: (ctx: PowerHandlerContext) => void | Promise<void>;
}

const ravenHandler = async (ctx: PowerHandlerContext): Promise<void> => {
  const snap = ctx.removalSnapshot;
  if (!snap) return;
  await ctx.host.playRavenCapture(snap);
};

const lightningHandler = async (ctx: PowerHandlerContext): Promise<void> => {
  if (ctx.tier == null) return;
  await ctx.host.playLightning(ctx.tier);
};

const watersHandler = async (ctx: PowerHandlerContext): Promise<void> => {
  await ctx.host.playWaters();
};

export const POWER_DEFS: readonly PowerDef[] = [
  {
    id: "two-by-two",
    name: {
      es: "DOS EN DOS",
      en: "TWO BY TWO",
      pt: "DOIS EM DOIS"
    },
    blurb: {
      es: "Suelta dos animales iguales. Entran de dos en dos.",
      en: "Drop two matching animals. They come in two by two.",
      pt: "Solte dois animais iguais. Eles entram de dois em dois."
    },
    shortLabel: "2×2",
    iconTexture: "icon_de_dos",
    buttonColor: 0xc5de6a,
    glowColor: 0x8fbf3a,
    footerColor: 0x4e6b24,
    targeting: "instant",
    armNextDrop: true,
    oliveCost: 15,
    rewardedEligible: true,
    handler: () => undefined
  },
  {
    id: "raven",
    name: { es: "CUERVO", en: "RAVEN", pt: "CORVO" },
    blurb: {
      es: "CUERVO se lleva un animal. No regresa.",
      en: "RAVEN takes one animal. It does not return.",
      pt: "CORVO leva um animal. Ele não volta."
    },
    shortLabel: "CUERVO",
    iconTexture: "icon_cuervo",
    buttonColor: 0xc9a8e0,
    glowColor: 0x9b72c4,
    footerColor: 0x5a3d72,
    targeting: "pick-piece",
    removesTarget: true,
    oliveCost: 20,
    rewardedEligible: true,
    handler: ravenHandler
  },
  {
    id: "lightning",
    name: { es: "RAYO", en: "LIGHTNING", pt: "RAIO" },
    blurb: {
      es: "RAYO fusiona todos los animales de un tipo.",
      en: "LIGHTNING merges all animals of one type.",
      pt: "RAIO funde todos os animais de um tipo."
    },
    shortLabel: "RAYO",
    iconTexture: "icon_rayo",
    buttonColor: 0xf0c050,
    glowColor: 0xe0a020,
    footerColor: 0x8a5a18,
    targeting: "pick-tier",
    oliveCost: 25,
    rewardedEligible: true,
    handler: lightningHandler
  },
  {
    id: "waters",
    name: { es: "AGUAS", en: "WATERS", pt: "ÁGUAS" },
    blurb: {
      es: "AGUAS suben y mueven a los animales.",
      en: "WATERS rise and shift the animals.",
      pt: "ÁGUAS sobem e movem os animais."
    },
    shortLabel: "AGUAS",
    iconTexture: "icon_agua",
    buttonColor: 0x7ec8e8,
    glowColor: 0x4aa8d0,
    footerColor: 0x2a6288,
    targeting: "instant",
    blockedInDanger: true,
    minBoardPieces: 5,
    oliveCost: 30,
    rewardedEligible: true,
    handler: watersHandler
  }
];

export function getPowerDef(id: PowerId): PowerDef | undefined {
  return POWER_DEFS.find((d) => d.id === id);
}

/** Separación centro-a-centro al spawnear la pareja (> diámetro). */
export function twoByTwoStackGap(radius: number): number {
  return radius * 2 + 6;
}
