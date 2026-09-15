# Arca Merge

Juego merge (estilo Suika) con temática del Arca de Noé.  
Publicado en Android como app nativa (`com.arcamerge.app`).

| Capa | Stack |
|---|---|
| Juego | Phaser 3 + TypeScript + Vite (`src/`) |
| Shell | Expo SDK 54 + React Native WebView (`arca-shell/`) |
| Ads | AdMob (banner, intersticial, rewarded) |
| IAP | RevenueCat (“Quitar anuncios”, olivos) |

Versión actual del shell: **1.0.7** (`versionCode` 8).

## Estructura

```
arca-merge/
├── src/                 # Juego Phaser (lógica, HUD, poderes, audio)
├── public/              # Assets del juego
├── arca-shell/          # App Expo que empaqueta y sirve el dist
│   ├── assets/game-dist.zip
│   └── src/config.ts    # IS_PRODUCTION, ads, store URLs
└── README.md
```

El shell extrae `game-dist.zip` a un servidor estático local y lo carga en el WebView.  
El puente juego ↔ nativo vive en `src/bridge.ts` y `arca-shell/src/bridge.ts`.

## Desarrollo (navegador)

```bash
npm install
npm run dev
```

Abre la URL de Vite (p. ej. `http://localhost:5173`). Útil para iterar gameplay sin el shell.

## Desarrollo (dispositivo)

1. En `arca-shell/src/config.ts` y `src/buildFlags.ts`: `IS_PRODUCTION = false` (TestIds de AdMob).
2. Empaquetar y sincronizar el juego:

```bash
npm run build
cd arca-shell && npm run sync-game
npx expo run:android   # o run:ios
```

Para iterar el JS del juego por LAN (sin sync en cada cambio):

- `IS_PRODUCTION = false`
- `DEV_VITE = true` y `viteDevUrl` = IP LAN del Mac
- En la raíz: `npm run dev -- --host`
- En `arca-shell`: `npx expo run:android`

## Producción / Play Store

1. `IS_PRODUCTION = true` en `arca-shell/src/config.ts` **y** `src/buildFlags.ts`
2. Subir `version` / `versionCode` en `arca-shell/app.json` (y `android/app/build.gradle` si aplica)
3. Rebuild + sync:

```bash
npm run build
cd arca-shell && npm run sync-game
eas build --platform android --profile production
eas submit --platform android --latest
```

Con `IS_PRODUCTION = true`: ads reales, banner activo, sin Vite LAN, dist empaquetado.

## Gameplay (resumen)

- Posicioná y soltá animales; dos iguales se fusionan en el siguiente de la cadena.
- Si el montón se queda sobre la línea de peligro, game over.
- 1ª muerte: modal para continuar con rewarded, o **TERMINAR** (sin intersticial).
- 2ª muerte: countdown + intersticial → modal de resultado.
- Poderes (olivos / rewarded), recompensa diaria, compartir por olivos, tienda IAP.

## Dónde tocar cosas

| Qué | Dónde |
|---|---|
| Balance / cadena de animales | `src/chain.ts` |
| Física, mid-run ad, continue / GO | `src/GameScene.ts` |
| Interruptor prod / ads / URLs | `arca-shell/src/config.ts` |
| Flags de debug del juego | `src/buildFlags.ts` |
| Layout HUD / modales | `src/hud/hudLayout.ts` |
| Puente nativo | `src/bridge.ts`, `arca-shell/src/GameWebView.tsx` |

## Nota legal

No usar “Suika” ni trade dress de frutas del original en nombre, ícono o capturas.  
La mecánica de merge no es protegible; el aspecto comercial del original sí.
