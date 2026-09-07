export type JuiceQuality = "high" | "low";

export interface JuiceConfig {
  enabled: boolean;
  quality: JuiceQuality;
  depths: {
    root: number;
  };
  runtimeTextures: {
    particleSize: number;
    ringSize: number;
    ringStroke: number;
    scoreFontSize: number;
    comboFontSize: number;
    textPadding: number;
    textStroke: number;
  };
  particles: {
    globalCap: number;
    highBaseCount: number;
    highTierStep: number;
    highMaxCount: number;
    lowBaseCount: number;
    lowTierStep: number;
    lowMaxCount: number;
    speedMin: number;
    speedMax: number;
    gravityY: number;
    lifespanMin: number;
    lifespanMax: number;
    scaleMin: number;
    scaleMax: number;
    alphaStart: number;
    smallMaxTier: number;
    mediumMaxTier: number;
  };
  mergeSquash: {
    start: number;
    overshoot: number;
    riseMs: number;
    settleMs: number;
    ease: string;
    settleEase: string;
  };
  mergeFlash: {
    durationMs: number;
    color: number;
  };
  ring: {
    poolSizeHigh: number;
    poolSizeLow: number;
    durationMs: number;
    radiusMultiplier: number;
    startScale: number;
    ease: string;
  };
  floatingScore: {
    poolSizeHigh: number;
    poolSizeLow: number;
    risePx: number;
    baseScale: number;
    tierScaleStep: number;
    /** Perfil legible: aparece con overshoot, se mantiene quieto y luego sube. */
    popScale: number;
    popMs: number;
    holdMs: number;
    fadeMs: number;
    popEase: string;
    fadeEase: string;
  };
  land: {
    minImpactSpeed: number;
    maxImpactSpeed: number;
    squashAmount: number;
    squashDurationMs: number;
    squashEase: string;
  };
  dust: {
    minIntensity: number;
    minCount: number;
    maxCount: number;
    speedMin: number;
    speedMax: number;
    angleMin: number;
    angleMax: number;
    gravityY: number;
    lifespanMs: number;
    scaleStart: number;
    alphaStart: number;
    color: number;
    contactOffsetRadius: number;
  };
  shake: {
    minTier: number;
    maxTier: number;
    durationMs: number;
    minIntensity: number;
    maxIntensity: number;
  };
  combo: {
    windowMs: number;
    minDisplayed: number;
    maxDisplayed: number;
    hapticMinCount: number;
    detunePerStep: number;
    offsetY: number;
    minY: number;
    risePx: number;
    baseScale: number;
    scaleStep: number;
    /** Pool propio: el texto de combo nunca compite con el de puntaje. */
    poolSize: number;
    popScale: number;
    popMs: number;
    holdMs: number;
    fadeMs: number;
    popEase: string;
    fadeEase: string;
    /** Desde este xN el grito va al centro (con palabra). Un solo texto: se reemplaza, no se apila. */
    shoutFrom: number;
    shoutY: number;
  };
  breathing: {
    /** Desviación sobre 1.0 (0.015 → oscila entre 1.0 y 1.015). */
    amplitude: number;
    periodMs: number;
  };
  blink: {
    minDelayMs: number;
    maxDelayMs: number;
    squashY: number;
    /** Ida + vuelta: cada mitad dura durationMs. */
    durationMs: number;
  };
  preview: {
    /** Bobbing ±bobPx alrededor de DROP_Y. */
    bobPx: number;
    bobPeriodMs: number;
    alpha: number;
    glowSize: number;
    glowAlpha: number;
    /** Escala del glow relativa al diámetro visual de la pieza. */
    glowScale: number;
    glowColor: number;
    /**
     * Fantasma 2×2: offset diagonal (fracción del diámetro) abajo-derecha.
     * La física sigue apilando en vertical al soltar.
     */
    ghostOffsetFrac: number;
    ghostAlpha: number;
  };
  dropGuide: {
    dashPx: number;
    gapPx: number;
    scrollPxPerSec: number;
    widthPx: number;
    alpha: number;
    color: number;
  };
  /**
   * Mira de poderes pick-piece (Cuervo y cualquier otro).
   * Affordance de gameplay: se muestra aunque juice esté off.
   */
  pickReticle: {
    textureSize: number;
    stroke: number;
    displaySize: number;
    hoveredScale: number;
    spinDegPerSec: number;
    alpha: number;
    hoveredAlpha: number;
    color: number;
    poolSize: number;
  };
  raven: {
    /** Duración total aproximada del vuelo. */
    totalMs: number;
    diveMs: number;
    carryMs: number;
    /** Y de salida (fuera de pantalla lógica). */
    exitY: number;
    birdTextureSize: number;
    birdDisplaySize: number;
    birdTint: number;
    shrinkTo: number;
    featherCount: number;
    featherColor: number;
    featherSpeedMin: number;
    featherSpeedMax: number;
    featherLifespanMs: number;
    featherScale: number;
    featherGravityY: number;
  };
  lightning: {
    /** Pausa entre parejas (combo window = 700ms → cabe con holgura). */
    staggerMs: number;
    hopMs: number;
    flashAlpha: number;
    flashMs: number;
    boltColor: number;
    boltGlowColor: number;
    boltWidth: number;
    boltGlowWidth: number;
    boltAlpha: number;
    /** Cap temporal: base + pairs * perPair, tope maxCap. */
    particleCapBase: number;
    particleCapPerPair: number;
    particleCapMax: number;
    shakeDurationMs: number;
    shakeMinIntensity: number;
    shakeMaxIntensity: number;
  };
  arkComplete: {
    /** Cap temporal del clímax (≥ Rayo). */
    particleCap: number;
    /** Depth por encima del Rayo / tier picker. */
    depth: number;
    /** Colores del arcoíris (rojo → violeta). */
    rainbowColors: readonly number[];
    rainbowStroke: number;
    rainbowGap: number;
    /** Orígenes del arco relativos al merge / arca. */
    arcRadiusMin: number;
    arcRadiusMax: number;
    firstTime: {
      freezeMs: number;
      particleBoostMs: number;
      rainbowMs: number;
      bannerHoldMs: number;
      bannerFadeMs: number;
      bannerFontSize: number;
      bonusFontSize: number;
      cameraFlashAlpha: number;
    };
    repeat: {
      freezeMs: number;
      particleBoostMs: number;
      rainbowMs: number;
      bannerHoldMs: number;
      bannerFadeMs: number;
      bannerFontSize: number;
      bonusFontSize: number;
      cameraFlashAlpha: number;
    };
  };
  waters: {
    riseMs: number;
    holdMs: number;
    drainMs: number;
    /**
     * true: APPLYING termina al empezar el drenaje (drop libre mientras baja).
     * false: bloquea hasta que el agua desaparece.
     */
    releaseInputOnDrain: boolean;
    /** Piso de llenado respecto al span jugable (FLOOR−DANGER). */
    fillRatioMin: number;
    /** Agua por encima del top del montón. */
    pileMarginPx: number;
    /** No subir la superficie por encima de DANGER − esto (negativo = por debajo). */
    maxAboveDangerPx: number;
    /**
     * Multiplicador de la gravedad Matter (mass×g×scale).
     * 1 ≈ neutro con tierFactor 1; ~4 da flotación visible y suave.
     * (Body.update integra force/mass × Δt² ≈ ×278 a 60Hz.)
     */
    buoyancyStrength: number;
    /**
     * Amortiguación: drag = dragY × mass × vy × submerged.
     * Orden ~0.0004–0.0008 frena el bob sin congelar.
     */
    dragY: number;
    /**
     * Multiplicador por tier (índice = level).
     * Producto strength×tier ≫ 1 flota; ≪ 1 o ≤0 hunde.
     */
    buoyancyByTier: readonly number[];
    /**
     * Distancia bajo DANGER_Y donde el lift hacia ARRIBA se atenúa a 0
     * (smoothstep). No bloquea movimiento por colisión.
     */
    ceilingDampPx: number;
    particleCap: number;
    surfaceColor: number;
    fillColor: number;
    fillAlpha: number;
    tintColor: number;
    tintStrength: number;
    bobAmpPx: number;
    bobPeriodMs: number;
    bubbleCount: number;
    bubbleSpeedMin: number;
    bubbleSpeedMax: number;
    bubbleLifespanMs: number;
    dripCount: number;
    waveAmpPx: number;
    wavePeriodMs: number;
  };
  /**
   * Feedback al tocar el tablero (pointerdown).
   * Anillo expand+fade + partículas suaves; ~300ms.
   */
  tap: {
    durationMs: number;
    ringStartScale: number;
    ringEndScale: number;
    ringColor: number;
    ringAlpha: number;
    particleCountHigh: number;
    particleCountLow: number;
    speedMin: number;
    speedMax: number;
    gravityY: number;
    lifespanMs: number;
    scaleStart: number;
    scaleEnd: number;
    alphaStart: number;
    color: number;
    ease: string;
  };
  danger: {
    hysteresis: number;
  };
  debug: {
    /** Traza cada fusión con el tiempo transcurrido desde la anterior. */
    logMerges: boolean;
    /** Muestras de separación entre fusiones que se conservan para estadística. */
    mergeGapSamples: number;
    /** Ventanas candidatas que se evalúan en arcaDebug.mergeGaps(). */
    candidateWindowsMs: readonly number[];
  };
  tierColors: readonly number[];
}

/** Flag global para desactivar todo el feedback sin alterar el juego. */
export let juiceEnabled = true;

export function setJuiceEnabled(enabled: boolean): void {
  juiceEnabled = enabled;
}

export const juiceConfig: JuiceConfig = {
  enabled: true,
  quality: "high",
  depths: {
    root: 20
  },
  runtimeTextures: {
    particleSize: 32,
    ringSize: 64,
    ringStroke: 4,
    scoreFontSize: 34,
    comboFontSize: 38,
    textPadding: 8,
    textStroke: 5
  },
  particles: {
    globalCap: 100,
    // El conteo arranca en el tier 2 porque es la fusión más baja posible.
    highBaseCount: 10,
    highTierStep: 0.7,
    highMaxCount: 14,
    lowBaseCount: 6,
    lowTierStep: 0.35,
    lowMaxCount: 8,
    speedMin: 90,
    speedMax: 150,
    gravityY: 70,
    lifespanMin: 350,
    lifespanMax: 350,
    scaleMin: 0.22,
    scaleMax: 0.48,
    alphaStart: 0.95,
    smallMaxTier: 3,
    mediumMaxTier: 7
  },
  mergeSquash: {
    start: 0.6,
    overshoot: 1.15,
    riseMs: 145,
    settleMs: 105,
    ease: "Back.easeOut",
    settleEase: "Sine.easeOut"
  },
  mergeFlash: {
    durationMs: 90,
    color: 0xffffff
  },
  ring: {
    poolSizeHigh: 8,
    poolSizeLow: 4,
    durationMs: 200,
    radiusMultiplier: 1.6,
    startScale: 0.04,
    ease: "Cubic.easeOut"
  },
  floatingScore: {
    poolSizeHigh: 12,
    poolSizeLow: 6,
    risePx: 40,
    baseScale: 0.72,
    tierScaleStep: 0.045,
    // 120 + 400 + 380 = 900 ms totales.
    popScale: 1.2,
    popMs: 120,
    holdMs: 400,
    fadeMs: 380,
    popEase: "Back.easeOut",
    fadeEase: "Cubic.easeOut"
  },
  land: {
    minImpactSpeed: 2.2,
    maxImpactSpeed: 9,
    squashAmount: 0.1,
    squashDurationMs: 120,
    squashEase: "Quad.easeOut"
  },
  dust: {
    minIntensity: 0.55,
    minCount: 3,
    maxCount: 6,
    speedMin: 28,
    speedMax: 72,
    angleMin: 205,
    angleMax: 335,
    gravityY: 95,
    lifespanMs: 250,
    scaleStart: 0.3,
    alphaStart: 0.28,
    color: 0xe8dcc8,
    contactOffsetRadius: 0.82
  },
  shake: {
    minTier: 5,
    maxTier: 10,
    durationMs: 150,
    minIntensity: 0.004,
    maxIntensity: 0.012
  },
  combo: {
    windowMs: 700,
    minDisplayed: 2,
    maxDisplayed: 8,
    hapticMinCount: 3,
    detunePerStep: 90,
    offsetY: 72,
    minY: 130,
    risePx: 28,
    baseScale: 0.8,
    scaleStep: 0.06,
    poolSize: 4,
    // Mismo perfil legible que el puntaje: 110 + 380 + 360 = 850 ms.
    popScale: 1.35,
    popMs: 110,
    holdMs: 380,
    fadeMs: 360,
    popEase: "Back.easeOut",
    fadeEase: "Cubic.easeOut",
    shoutFrom: 3,
    shoutY: 400
  },
  breathing: {
    // Conservador a propósito: en tablero lleno un 2% se lee como más.
    amplitude: 0.015,
    periodMs: 2000
  },
  blink: {
    minDelayMs: 3000,
    maxDelayMs: 6000,
    squashY: 0.92,
    durationMs: 90
  },
  preview: {
    bobPx: 4,
    bobPeriodMs: 1500,
    alpha: 0.85,
    glowSize: 64,
    glowAlpha: 0.35,
    glowScale: 1.55,
    glowColor: 0xfff2c8,
    ghostOffsetFrac: 0.3,
    ghostAlpha: 0.42
  },
  dropGuide: {
    dashPx: 8,
    gapPx: 8,
    scrollPxPerSec: 28,
    widthPx: 2,
    alpha: 0.22,
    color: 0xffffff
  },
  pickReticle: {
    textureSize: 64,
    stroke: 5,
    displaySize: 38,
    hoveredScale: 1.28,
    spinDegPerSec: 32,
    alpha: 0.84,
    hoveredAlpha: 1,
    color: 0xfff6d8,
    poolSize: 24
  },
  raven: {
    totalMs: 700,
    diveMs: 180,
    carryMs: 320,
    exitY: -60,
    birdTextureSize: 48,
    birdDisplaySize: 42,
    birdTint: 0x1a1a22,
    shrinkTo: 0.12,
    featherCount: 8,
    featherColor: 0x2c2c36,
    featherSpeedMin: 40,
    featherSpeedMax: 110,
    featherLifespanMs: 380,
    featherScale: 0.35,
    featherGravityY: 40
  },
  lightning: {
    staggerMs: 120,
    hopMs: 90,
    flashAlpha: 0.55,
    flashMs: 140,
    boltColor: 0xf5f7ff,
    boltGlowColor: 0x7ec8ff,
    boltWidth: 2.5,
    boltGlowWidth: 8,
    boltAlpha: 0.95,
    // 6 fusiones × ~14 partículas ≈ 84; land dust suma. Subimos el techo.
    particleCapBase: 140,
    particleCapPerPair: 12,
    particleCapMax: 200,
    shakeDurationMs: 110,
    shakeMinIntensity: 0.003,
    shakeMaxIntensity: 0.014
  },
  arkComplete: {
    particleCap: 220,
    // Por encima de tierPicker (45) y juice root+bolt (~26).
    depth: 55,
    rainbowColors: [
      0xff3b3b, 0xff8a1a, 0xffe14a, 0x4adf6a, 0x3aa0ff, 0x6a5cff, 0xc45cff
    ],
    rainbowStroke: 7,
    rainbowGap: 8,
    arcRadiusMin: 120,
    arcRadiusMax: 280,
    firstTime: {
      freezeMs: 900,
      particleBoostMs: 2600,
      rainbowMs: 2400,
      bannerHoldMs: 2000,
      bannerFadeMs: 700,
      bannerFontSize: 28,
      bonusFontSize: 22,
      cameraFlashAlpha: 0.55
    },
    repeat: {
      freezeMs: 600,
      particleBoostMs: 1400,
      rainbowMs: 1400,
      bannerHoldMs: 1100,
      bannerFadeMs: 500,
      bannerFontSize: 22,
      bonusFontSize: 18,
      cameraFlashAlpha: 0.35
    }
  },
  waters: {
    riseMs: 1000,
    holdMs: 2000,
    drainMs: 1000,
    releaseInputOnDrain: true,
    fillRatioMin: 0.55,
    pileMarginPx: 28,
    // Negativo: superficie se queda ≥60px bajo DANGER_Y (antes +12 la cruzaba).
    maxAboveDangerPx: -60,
    // Múltiplo de gravedad Matter. 1=neutro; ~4 ≈ +1.3px/frame en tier 1.25.
    // (0.001 era casi invisible; 0.042 era erupción ~16px/frame.)
    buoyancyStrength: 4.2,
    dragY: 0.00055,
    // idx 0 unused; 1..10 — producto strength×tier define flotar vs hundir.
    buoyancyByTier: [
      0, 1.25, 1.15, 1.05, 0.82, 0.5, 0.22, 0.0, -0.2, -0.35, -0.5
    ],
    ceilingDampPx: 100,
    particleCap: 200,
    surfaceColor: 0xb8e4ff,
    fillColor: 0x2a6a9a,
    fillAlpha: 0.38,
    tintColor: 0x4a9fd4,
    tintStrength: 0.45,
    bobAmpPx: 2.2,
    bobPeriodMs: 900,
    bubbleCount: 5,
    bubbleSpeedMin: 30,
    bubbleSpeedMax: 70,
    bubbleLifespanMs: 700,
    dripCount: 10,
    waveAmpPx: 4,
    wavePeriodMs: 1400
  },
  tap: {
    durationMs: 300,
    ringStartScale: 0.08,
    ringEndScale: 0.55,
    ringColor: 0xfff6e0,
    ringAlpha: 0.55,
    particleCountHigh: 5,
    particleCountLow: 3,
    speedMin: 40,
    speedMax: 95,
    gravityY: 40,
    lifespanMs: 280,
    scaleStart: 0.28,
    scaleEnd: 0,
    alphaStart: 0.55,
    color: 0xffe8c0,
    ease: "Cubic.easeOut"
  },
  danger: {
    hysteresis: 0.08
  },
  debug: {
    logMerges: false,
    mergeGapSamples: 200,
    candidateWindowsMs: [700, 900, 1100, 1300, 1600, 2000]
  },
  // Paleta tomada del asset sheet, independiente de chain.color.
  tierColors: [
    0x000000,
    0xdcecff, // 1 Paloma: blanco azulado
    0x9ee83f, // 2 Rana: verde lima
    0xf5c542, // 3 Gallina: amarillo dorado
    0xf4b7c7, // 4 Conejo: rosa claro
    0xf2e4c7, // 5 Oveja: crema
    0xc99a6b, // 6 Cabra: café claro
    0x9b7182, // 7 Burro: mauve
    0x242424, // 8 Vaca: negro de las manchas
    0xf09a2b, // 9 León: naranja dorado
    0x81758f // 10 Elefante: gris violáceo
  ]
};
