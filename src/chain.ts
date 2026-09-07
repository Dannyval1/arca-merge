// ============================================================
// CADENA DE FUSIÓN — el corazón del diseño del juego.
// Ajusta radios, colores y pesos aquí sin tocar la lógica.
// ============================================================

export interface AnimalDef {
  level: number;
  name: string;
  emoji: string; // placeholder hasta tener sprites con IA
  radius: number; // px en canvas de 390 de ancho
  color: number; // color del círculo placeholder
}

// Factor de crecimiento ~1.18x por nivel.
// Nivel 10 (Elefante, Ø 202) ocupa ~58% del ancho interno (350 px): estándar del género.
export const CHAIN: AnimalDef[] = [
  { level: 1, name: "Paloma", emoji: "🕊️", radius: 23, color: 0xf5f0e6 },
  { level: 2, name: "Rana", emoji: "🐸", radius: 27, color: 0x8fce5a },
  { level: 3, name: "Gallina", emoji: "🐔", radius: 32, color: 0xf2c14e },
  { level: 4, name: "Conejo", emoji: "🐰", radius: 38, color: 0xd9c8f0 },
  { level: 5, name: "Oveja", emoji: "🐑", radius: 45, color: 0xe8e4da },
  { level: 6, name: "Cabra", emoji: "🐐", radius: 53, color: 0xc9a97a },
  { level: 7, name: "Burro", emoji: "🫏", radius: 62, color: 0xa08c7d },
  { level: 8, name: "Vaca", emoji: "🐄", radius: 73, color: 0xf0e6d8 },
  { level: 9, name: "León", emoji: "🦁", radius: 86, color: 0xe0a13e },
  { level: 10, name: "Elefante", emoji: "🐘", radius: 101, color: 0xb0b7c3 }
];

// El jugador solo puede soltar niveles 1 a 5.
// Pesos de probabilidad: los pequeños caen más seguido.
export const DROPPABLE_LEVELS = [1, 2, 3, 4, 5];
export const DROP_WEIGHTS = [30, 25, 20, 15, 10];

// Puntos por fusión = nivel resultante * 10.
export const MERGE_SCORE_MULT = 10;

/**
 * Fusionar dos Elefantes = clímax del Arca.
 * 1500 ≈ 20–25% de una partida buena (récords ~3k–7k); el logro más difícil
 * debe sentirse como un tramo entero de fusiones altas, no un tip.
 */
export const ARK_BONUS = 1500;

/**
 * Clímax del Arca. Junto a la cadena (2+3+5) una partida perfecta da 15:
 * un DOS EN DOS extra, no un stock para varias partidas.
 */
export const ARK_OLIVE_REWARD = 5;

export function pickDropLevel(): number {
  const total = DROP_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < DROPPABLE_LEVELS.length; i++) {
    r -= DROP_WEIGHTS[i];
    if (r <= 0) return DROPPABLE_LEVELS[i];
  }
  return DROPPABLE_LEVELS[0];
}

export function getAnimal(level: number): AnimalDef {
  const def = CHAIN.find((a) => a.level === level);
  if (!def) throw new Error(`Nivel inválido: ${level}`);
  return def;
}
