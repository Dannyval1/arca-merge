/**
 * Layout del HUD en coordenadas lógicas 390×844.
 * Mueve números aquí; no hardcodees posiciones en TopHud / PowerHUD / ChainBar.
 *
 * BANNER (shell RN):
 * El AdMob banner vive DEBAJO del WebView (adaptativo anclado ≈ 50 dp
 * en teléfono, ~90 en tablet). Eso acorta el alto disponible; el canvas
 * lógico no cambia. No pegues UI al borde inferior (`bottomCushionPx`).
 */
import { LOGICAL_WIDTH } from "../layout";
import { POWER_DEFS, type PowerId } from "../powers/powerDefs";

/** Altura típica del banner adaptativo anclado en teléfono (dp). */
export const BANNER_RESERVE_PX = 50;

export const HUD_LAYOUT = {
  marginX: 12,
  depth: {
    top: 30,
    powers: 35,
    chain: 28,
    /** Dim + selector del Rayo por encima del HUD. */
    tierPicker: 45,
    /** Overlay de Game Over, bajo la tienda (65). */
    gameOver: 50,
    /** ¿Salvar el arca? Encima del Game Over. */
    continue: 52,
    home: 5
  },

  /** Colchón bajo el canvas lógico (nada del HUD debe entrar aquí). */
  bottomCushionPx: 24,

  fila1: {
    centerY: 44,
    height: 44,
    /** Fondo: button.png (cuadrado 128×128). Icono dentro del pergamino. */
    settings: { cx: 30, size: 38, iconSize: 18 },
    noAds: { cx: 72, size: 38, iconSize: 20 },
    /**
     * Margen ≥6px tras no-ads (right 91) y ≥5px antes del score (left ~148).
     * w compacto: con 5 dígitos en score no cabe un panel ancho.
     */
    olives: {
      cx: 120,
      /** olivo_container.png 242×131 */
      w: 46,
      h: 26,
      iconSize: 15,
      iconX: -10,
      textX: 8,
      textFont: 10,
      textColor: "#fff6d8",
      /** A partir de este saldo se abrevia (1200 → 1.2k). */
      abbreviateFrom: 1000
    },
    score: {
      cx: 205,
      /** score_container.png 520×234 — cabe récord 5 dígitos. */
      w: 114,
      h: 52,
      /** Puntaje arriba, récord debajo. */
      scoreY: 34,
      bestY: 51,
      bestFont: 10,
      scoreFont: 20,
      scoreColor: "#5a4030",
      bestColor: "#6a5038",
      triumphSize: 12,
      triumphGap: 3
    },
    next: {
      right: 378,
      /** Cuadrado: mismo button.png, un poco más grande que ajustes. */
      size: 64,
      /** Miniatura fija (px); no usa el radio real del tier. */
      thumbSize: 30,
      labelFont: 9,
      /** Desfase vertical respecto al centro del botón. */
      labelY: -16,
      iconY: 6
    }
  },

  /**
   * Pastilla bajo los poderes tras Continuar (1ª muerte ya usada).
   * Usa continue_badge; avisa que la próxima pérdida es definitiva.
   */
  secondChance: {
    y: 152,
    w: 200,
    h: 40,
    font: 12,
    color: "#fff8f0",
    textY: 5
  },

  fila2: {
    /** Centro vertical de cada botón 52×52. */
    centerY:115,
    /** EXACTO en todos los estados (armado no escala). */
    buttonW: 52,
    buttonH: 52,
    cornerRadius: 12,
    iconSize: 55,
    /** Centros X fijos — orden = POWER_DEFS. */
    centersX: [58, 149, 241, 332] as const,
    /** Pastilla de usos: esquina superior derecha, sobresale del icono. */
    badge: {
      w: 22,
      h: 15,
      /** px hacia afuera del borde del icono (derecha / arriba). */
      outsetX: -2,
      outsetY: -3,
      radius: 7,
      fontSize: 9
    },
    /** Dos chips de recarga (costo | ad) en la esquina inferior. */
    reload: {
      chipW: 20,
      chipH: 14,
      gap: 2,
      offsetX: 3,
      offsetY: 3,
      radius: 6,
      fontSize: 8,
      adColor: 0x3a6a9a,
      adStroke: 0x8eb8e0
    },
    /** Escala base al armar / seleccionar (tick añade vibración). */
    selectedScale: 1.18,
    /**
     * Estado “apagado” (no usable): textura gris bakeada (Canvas no aplica setTint).
     * Ajustar desaturate/darken aquí; se regenera al reiniciar partida.
     */
    disabled: {
      /** 0 = color pleno, 1 = gris total. */
      desaturate: 0.92,
      /** 0 = sin oscurecer, 1 = muy oscuro. */
      darken: 0.38
    },
    usesFont: 9,
    costFont: 8,
    get top(): number {
      return this.centerY - this.buttonH / 2;
    },
    get bottom(): number {
      return this.centerY + this.buttonH / 2;
    }
  },

  cancelHint: {
    /** Justo encima de DANGER_Y (330). */
    y: 298,
    fontSize: 18,
    color: "#ffffff",
    stroke: "#1a0c08",
    strokeThickness: 6
  },

  /**
   * Modal de Ajustes: modal_frame + modal_header + toggles.
   * Coordenadas relativas al centro del panel (195, panelY).
   * contentW = ancho útil dentro del pergamino (padding lateral generoso).
   */
  settingsModal: {
    depth: 70,
    panelY: 422,
    /** Alto del pergamino. Subí/bajá ESTE número para el modal en partida. */
    frame: { w: 318, h: 546 },
    header: { y: -273, w: 248, h: 62 },
    title: {
      y: -275,
      fontSize: 18,
      color: "#fff8f0",
      stroke: "#3a2010",
      strokeThickness: 5,
      shadowOffsetY: 3,
      shadowColor: "#1a0c08"
    },
    close: { x: 138, y: -263, size: 44 },
    /** Mitad del ancho de contenido (desde el centro). Más aire vs el marco. */
    contentHalfW: 112,
    contentTop: -220,
    /** Lista de poderes (panel Ayuda). Más positivo = más abajo / centrado. */
    helpFirstY: -98,
    helpRowH: 70,
    langSeg: { h: 32, fontSize: 13, widthRatio: 0.8, radius: 8 },
    toggle: { w: 64, h: 32, rowH: 36, radius: 8, gap: 8 },
    divider: { h: 1.5, margin: 20 },
    rowBtn: { h: 44, gap: 14 },
    /** Reiniciar / Inicio: mismo ancho útil que Quitar anuncios / Ayuda (contentHalfW*2). */
    gameActions: { y: 160, w: 106, h: 36, gap: 12, font: 12 },
    /**
     * Textos bajo Reiniciar/Inicio:
     *   fila 1 = Restaurar compras | Privacidad
     *   fila 2 = Cambiar consentimiento de anuncios  (fy + 16)
     *   fila 3 = status  (fy + 32)
     * Home: footerY. En partida: footerYInGame (el contenedor se desplaza).
     * Más CHICO = más ARRIBA.
     */
    footerY: 200,
    footerYInGame: 210,
    colors: {
      label: "#5a4030",
      labelMuted: "#8a7058",
      parchment: 0xf6ebe0,
      rowFill: 0xe7c99f,
      rowStroke: 0xc4a06a,
      divider: 0xc4a06a,
      langIdle: 0xf0e6d8,
      langActive: 0xf0a020,
      langActiveText: "#ffffff",
      adsFill: 0xf8e0b0,
      adsStroke: 0xe0a040,
    helpFill: 0xe7c99f,
    helpStroke: 0xc4a06a
    }
  },

  /**
   * Tienda. Coordenadas relativas al centro del panel (195, panelY).
   * `slices` están en píxeles de la textura fuente (no del display).
   * Ajustar aquí si el marco/cinta/botón se deforma.
   */
  shopModal: {
    depth: 65,
    panelY: 422,
    frame: { w: 336, h: 472 },
    header: { y: -194, w: 262, h: 58 },
    title: {
      y: -196,
      fontSize: 18,
      color: "#fff8f0",
      stroke: "#3a2010",
      strokeThickness: 5,
      shadowOffsetY: 3,
      shadowColor: "#1a0c08"
    },
    close: { x: 146, y: -182, size: 42 },
    contentHalfW: 118,
    contentTop: -156,
    /**
     * Títulos de sección. Edita aquí los márgenes del modal de tienda:
     * - firstMarginTop: aire bajo el header → “PAQUETES…”
     * - packsGapAfter: espacio título → cards. Más chico = cards más arriba
     *   (y todo lo de abajo sube: anuncios, saldo). Debe ser ≥ ribbonH/2 + ribbonLift
     *   para que las cintas no pisen el título.
     * - adsMarginTop: margin-top de “QUITAR ANUNCIOS” (después de las cards)
     * - saldoMarginTop: margin-top de “TU SALDO” (después de quitar anuncios).
     *   Más grande = título más abajo.
     * - gapAfter: aire bajo el título hasta el contenido de esa sección
     */
    section: {
      fontSize: 12,
      leaf: 13,
      leafGap: 4,
      gapAfter: 10,
      firstMarginTop: 10,
      packsGapAfter: 16,
      adsMarginTop: 25,
      saldoMarginTop: 25
    },
    /**
     * Márgenes 9-slice en px de la PNG. El helper escala luego al display.
     * Reemplazar cuando lleguen los cortes exactos del arte.
     */
    slices: {
      frame: { left: 96, right: 96, top: 102, bottom: 102 },
      header: { left: 108, right: 108, top: 38, bottom: 30 },
      ribbon: { left: 58, right: 58, top: 20, bottom: 24 },
      buy: { left: 65, right: 65, top: 24, bottom: 24 }
    },
    card: {
      w: 78,
      h: 150,
      gap: 6,
      radius: 10,
      fill: 0xf1ca8c,
      stroke: 0xb8894a,
      strokeWidth: 2,
      art: 78,
      artPad: 8,
      amountFont: 12,
      amountGap: 4,
      buyW: 70,
      buyH: 28,
      buyPad: 8,
      buyFont: 11,
      ribbonW: 92,
      ribbonH: 22,
      /**
       * Cintas “MÁS POPULAR” / “MEJOR VALOR” (imagen + texto).
       * - ribbonLift: mueve la CINTA ENTERA (PNG + letrero). Mayor = más arriba
       *   del borde de la card; 0 = mitad encima / mitad sobre el marco.
       * - ribbonTextOffsetY: solo el TEXTO respecto a la imagen.
       *   0 = centrado en la cinta. Negativo = letras más arriba (se salen).
       */
      ribbonLift: -5,
      ribbonTextOffsetY: -3,
      ribbonFont: 7
    },
    ads: { h: 50, icon: 28, radius: 10, btnW: 78, btnH: 26 },
    balance: {
      h: 34,
      icon: 16,
      pillW: 128,
      radius: 16,
      fontSize: 13,
      /** Margin-top del pill + “Restaurar compras”. Negativo = más arriba. */
      rowOffsetY: -8
    },
    divider: { h: 1.25, margin: 8, inset: 22, leaf: 12 },
    footerY: 216,
    colors: {
      label: "#5a4030",
      labelMuted: "#8a7058",
      cardFill: 0xf1ca8c,
      cardStroke: 0xb8894a,
      adsFill: 0xf1ca8c,
      adsStroke: 0xb8894a,
      pillFill: 0xf6e6c8,
      pillStroke: 0xc4a06a,
      buyText: "#5a3010",
      ribbonText: "#ffffff"
    }
  },

  /**
   * Modal de poder sobre fondo_modal.png (1024×1536).
   * Coordenadas relativas al centro del panel. Calibrar mirando el asset.
   */
  powerModal: {
    depth: 60,
    panelW: 320,
    get panelH(): number {
      return Math.round(this.panelW * (1536 / 1024));
    },
    panelY: 410,
    /** Título DENTRO de la placa naranja (texto claro como la referencia). */
    title: {
      y: -187,
      fontSize: 17,
      color: "#fff8ee",
      stroke: "#5a3010",
      strokeThickness: 3,
      maxWidth: 180
    },
    /** Zona sobre el ✕ rojo del asset (Zone, no alpha bajo). */
    close: { x: 110, y: -172, hitW: 48, hitH: 48 },
    /** Suma a icono, blurb, razón y botones. Más negativo = más arriba. */
    contentOffsetY: 14,
    icon: { y: -88, size: 92 },
    blurb: { y: -22, fontSize: 14, color: "#5a4030", maxWidth: 220 },
    reason: { y: 28, fontSize: 12, color: "#a04030" },
    /** Fila de acciones (lado a lado) con boton1.png / boton2.png. */
    actionsY: 88,
    actionsGap: 10,
    buy: {
      texture: "boton1",
      w: 124,
      h: 44,
      fontSize: 18,
      /** Texto oscuro sobre boton1 (crema); el de VER ANUNCIO sigue blanco. */
      labelColor: "#5a4030"
    },
    ad: {
      texture: "boton2",
      w: 124,
      h: 44,
      fontSize: 14,
      labelColor: "#ffffff"
    },
    use: {
      texture: "boton2",
      w: 200,
      h: 48,
      fontSize: 16,
      labelColor: "#ffffff"
    },
    /** Texto de hojas DENTRO del cajón inferior del asset. */
    olives: { y: 178, fontSize: 14, color: "#3d5a20" },
    status: { y: 48, fontSize: 11, color: "#8a5030" }
  },

  /**
   * Barra de cadena SOBRE la base del casco, POR DEBAJO del piso jugable
   * (FLOOR_Y = 770). No mueve Matter: solo HUD.
   * Más alta para que olivo + 5/10/15 se lean sin pisa al thumb.
   */
  chain: {
    centerY: 810,
    /** Alto del marco (cadena_evolutiva). Subí 5px: 78 → 83. */
    height: 83,
    /** Ancho del contenedor. 390 = borde a borde del canvas lógico. */
    width: LOGICAL_WIDTH,
    /** 9-slice en px de la PNG (780×96): tapas de madera fijas, pergamino se estira. */
    imageSlice: { left: 88, right: 88, top: 16, bottom: 16 },
    slotW: 27,
    /** Aire entre thumbs. Subilo si el | se pega al animal. */
    gap: 8,
    iconScale: 0.38,
    thumbSize: 28,
    /**
     * Palito a todo el alto del contenedor, entre thumbs.
     * pad > 0 recorta arriba/abajo (si pisa la madera del 9-slice).
     */
    divider: { w: 1.5, pad: 0, color: 0xa08060, alpha: 0.55 },
    /**
     * Silueta = tint multiplicativo (conserva forma/detalle del PNG).
     * tintFill sólido aplastaba a “bultos” en thumbs chicos.
     */
    silhouetteColor: 0x3a322c,
    silhouetteAlpha: 0.88,
    /** Línea + nodos bajo cada animal (coords relativas al centerY). */
    lineY: 24,
    nodeRadius: 3.4,
    lineColor: 0x3d8a3a,
    nodeReached: 0x3dcc4a,
    nodePending: 0x8bb56a,
    rewardTiers: [8, 9, 10] as const,
    /**
     * Premios 1× por partida. Deben ser jugo, no sueldo:
     * una Arca completa ≈ 1 poder barato (2+3+5+ARK 5 = 15), no un stock.
     */
    rewardOlives: { 8: 2, 9: 3, 10: 5 } as Record<number, number>,
    /** Olivo + cantidad encima de vaca / león / elefante. */
    oliveY: -24,
    oliveSize: 15,
    oliveNumOffsetX: 10,
    oliveNumFont: 12,
    oliveNumColor: "#5a4030",
    /** Contador de arcas completadas en esta partida (derecha de la barra). */
    arkCount: {
      x: 368,
      fontSize: 11,
      color: 0x5a4030,
      iconSize: 16
    },
    get startX(): number {
      const n = 10;
      const total = n * this.slotW + (n - 1) * this.gap;
      return (LOGICAL_WIDTH - total) / 2 + this.slotW / 2;
    }
  },

  /**
   * Selector pick-tier (Rayo): encima de la cadena / HUD, con dim de foco.
   * Iconos a thumbSize fijo (no radio real) para que el burro no pise al cordero.
   */
  tierPicker: {
    y: 700,
    slotW: 34,
    slotH: 56,
    gap: 2,
    thumbSize: 26,
    dimColor: 0x0a1018,
    dimAlpha: 0.82,
    titleY: 620,
    titleFontSize: 16,
    titleMarginBottom: 2,
    hintFontSize: 12,
    panelPadY: 10,
    panelColor: 0x0d1626,
    panelAlpha: 0.96
  },

  /**
   * Game Over. Coordenadas del panel relativas al centro (195, panelY).
   * El marco es gameover-frame.png (700×1147); h se deriva del ancho.
   */
  gameOver: {
    panelY: 428,
    frame: { w: 356, h: 583 },
    /** Cartel sobre el listón, justo bajo los animales. */
    banner: { y: -90, w: 210, h: 80 },
    /** Título “El arca se desbordó”. lineSpacing negativo = más junto. */
    titleFont: 20,
    titleLineSpacing: -3,
    titleColor: "#5a3010",
    titlePad: 12,
    /** Recuadro de puntaje (código). El número grande ~56–62px. */
    scoreBox: {
      y: 0,
      w: 168,
      h: 68,
      radius: 14,
      fill: 0xf4e4c4,
      stroke: 0x8a5a28,
      strokeWidth: 2.5,
      glow: 0xf5c84a,
      glowWidth: 5
    },
    scoreFont: 56,
    /** Desfase vertical del número dentro del recuadro (0 = centrado). */
    scoreOffsetY: 0,
    scoreColor: "#5a3010",
    /** rot en radianes. +0.84 ≈ 48° (lado derecho, sentido horario). */
    ribbon: { w: 108, h: 36, ox: 0, oy: -38, rot: 0, font: 8 },
    stats: {
      /** Centro Y de la primera fila. */
      firstY: 68,
      w: 226,
      rowH: 30,
      dividerH: 1.25,
      dividerColor: 0xc4a06a,
      dividerAlpha: 0.9,
      icon: 22,
      labelFont: 11,
      valueFont: 13
    },
    play: { y: 195, w: 176, h: 38, font: 12, color: "#fff8f0" },
    secondary: { y: 233, w: 84, h: 28, gap: 12, font: 10 }
  },

  /**
   * Modal “¿Salvar el arca?”. Coordenadas relativas al centro del panel
   * (195, panelY). Marco = continue_frame1.png (740×1472).
   * Badge, timer y botones se superponen al área beige inferior.
   */
  continue: {
    panelY: 422,
    seconds: 9,
    frame: { w: 348, h: 692 },
    /** Título sobre la placa de madera (bajo la paloma). */
    title: { y: -210, font: 28, lineSpacing: -2, color: "#5a3010" },
    /**
     * Copy entre la ilustración y el anillo.
     * y = borde superior del recuadro. El anillo puede pisarlo ~4px.
     */
    blurb: {
      y: 2,
      font: 14,
      color: "#000000",
      wrap: 232,
      lineSpacing: 0,
      boxW: 264,
      padX: 16,
      padY: 10,
      radius: 10,
      boxFill: 0xe6b674,
      boxStroke: 0x915416,
      boxStrokeWidth: 3
    },
    /** Anillo 220×220. El arco verde va por el borde interior. */
    timer: {
      y: 108,
      size: 86,
      font: 36,
      color: "#5a3010",
      /** Radio del trazo verde (px, relativo al centro del anillo). */
      fillRadius: 33,
      fillWidth: 8,
      fillColor: 0x738600
    },
    ad: {
      y: 185,
      w: 228,
      h: 76,
      font: 16,
      lineSpacing: -4,
      color: "#fff8f0",
      icon: 16,
      iconGap: 6
    },
    /** Centro: debajo del verde con ≥5px de hueco. */
    end: { y: 279, w: 188, h: 63, font: 13, color: "#5a3010" },
    badge: {
      y: 355,
      w: 252,
      h: 79,
      font: 19,
      color: "#ffffff",
      /**
       * Desfase del texto respecto al centro del badge.
       * Más POSITIVO = más abajo (las cuerdas ocupan la parte de arriba).
       */
      textY: 13
    },
    statusY: 318
  },

  /**
   * Pantalla de Inicio. Coordenadas absolutas 390×844.
   * El récord del mock aún no está: se añade cuando llegue el asset.
   */
  home: {
    logo: { y: 118, size: 220 },
    /** Arca + animales. Origin abajo: se pega encima de JUGAR. */
    ark: { w: 340, gapAbovePlay: 6 },
    play: { y: 512, w: 202, h: 70, font: 28 },
    icons: {
      y: 604,
      size: 68,
      gap: 16,
      get startX(): number {
        const n = 3;
        const total = n * this.size + (n - 1) * this.gap;
        return (LOGICAL_WIDTH - total) / 2 + this.size / 2;
      }
    },
    other: { y: 772, w: 214, h: 50, font: 16 },
    toastY: 430,
    toastFont: 14,
    /** Pastilla de olivos (mismo art que el HUD de partida, +5px para números largos). */
    olives: {
      cx: 348,
      y: 38,
      w: 59,
      h: 35,
      iconSize: 17,
      iconX: -13,
      textX: 11,
      textFont: 13,
      textColor: "#fff6d8",
      abbreviateFrom: 1000
    }
  },

  /**
   * Recompensa diaria. Marco = modal_frame / header de Ajustes.
   * Botones = continue (verde video + beige recoger).
   *
   * Espaciados (Y relativo al centro del panel). Más negativo = más arriba.
   * Copy del blurb / botones: src/hud/DailyRewardModal.ts → paintStrings().
   * Color del +N: DailyRewardModal constructor (amountText.setTint).
   */
  dailyReward: {
    depth: 72,
    panelY: 422,
    frame: { w: 318, h: 448 },
    header: { y: -204, w: 248, h: 62 },
    title: { y: -206, fontSize: 14 },
    close: { x: 138, y: -194, size: 44 },
    amountY: -112,
    amountFont: 44,
    /** Color CSS del +N. BitmapText no tintea en Canvas. */
    amountColor: "#000000",
    oliveSize: 48,
    oliveGap: 10,
    blurbY: -60,
    blurbFont: 14,
    blurbWrap: 240,
    ad: { y: 30, w: 228, h: 72, font: 15, lineSpacing: -4, icon: 16, iconGap: 6 },
    collect: { y: 110, w: 188, h: 52, font: 14 },
    /** Entre RECOGER y el borde inferior del marco — debe leerse siempre. */
    statusY: 158
  },

  /**
   * Modal “otros juegos”.
   * Lista de títulos: src/hud/otherGamesConfig.ts → OTHER_GAMES.
   * Chrome = mismo marco que Ajustes (settingsModal.frame / header).
   */
  otherGames: {
    depth: 68,
    /**
     * Centro Y de la primera tarjeta (relativo al centro del panel).
     * Más POSITIVO = más abajo = más margen bajo el título.
     * Más NEGATIVO = más arriba, más pegado al header.
     */
    rowY: -138,
    /** Alto de cada tarjeta (cabe título + blurb 2 líneas + ABRIR). */
    rowH: 102,
    nameFont: 15,
    blurbFont: 11,
    /** Offset desde el borde superior de la tarjeta. */
    nameY: 14,
    blurbY: 26,
    playW: 92,
    playH: 32,
    playFont: 12,
    playPad: 8
  },

  /** Overlay de carga (timón + agua). */
  loader: {
    depth: 95,
    size: 176,
    waterColor: 0x3aa8d8
  },

  /**
   * Modal único: comparte el juego → olivos.
   * Mismo chrome que diaria (modal_frame + header). Encima del Game Over.
   */
  shareReward: {
    depth: 55,
    panelY: 400,
    frame: { w: 318, h: 420 },
    header: { y: -190, w: 248, h: 62 },
    title: { y: -192, fontSize: 18 },
    close: { x: 138, y: -180, size: 44 },
    bodyY: -100,
    bodyFont: 15,
    bodyWrap: 240,
    shareY: 20,
    shareW: 228,
    shareH: 64,
    laterY: 100,
    laterW: 188,
    laterH: 52,
    btnFont: 15,
    statusY: 160
  },

  /**
   * Pre-prompt reseña: ¿Te gusta? Sí → StoreKit / Play In-App Review.
   * Encima del Game Over / share (depth > shareReward).
   */
  reviewPrompt: {
    depth: 56,
    panelY: 400,
    frame: { w: 318, h: 380 },
    header: { y: -170, w: 248, h: 62 },
    title: { y: -172, fontSize: 18 },
    bodyY: -80,
    bodyFont: 16,
    bodyWrap: 240,
    yesY: 20,
    noY: 100,
    btnW: 200,
    btnH: 56,
    btnFont: 18
  },

  /** Stub de rewarded ad (3-2-1) hasta AdMob. */
  adCountdown: {
    depth: 98,
    fontSize: 148,
    dimAlpha: 0.82
  }
} as const;

/** Orden de botones = POWER_DEFS (two-by-two → raven → lightning → waters). */
export function powerCenterX(id: PowerId): number {
  const i = POWER_DEFS.findIndex((d) => d.id === id);
  return HUD_LAYOUT.fila2.centersX[i] ?? HUD_LAYOUT.fila2.centersX[0];
}

/** @deprecated Usa HUD_LAYOUT.fila2. Reexport para no romper imports viejos. */
export const POWER_HUD_LAYOUT = {
  get y() {
    return HUD_LAYOUT.fila2.centerY;
  },
  get buttonW() {
    return HUD_LAYOUT.fila2.buttonW;
  },
  get buttonH() {
    return HUD_LAYOUT.fila2.buttonH;
  },
  gap: 0,
  get depth() {
    return HUD_LAYOUT.depth.powers;
  },
  get fontSize() {
    return HUD_LAYOUT.fila2.usesFont;
  },
  get startX() {
    return HUD_LAYOUT.fila2.centersX[0];
  }
};
