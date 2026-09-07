# Arca Merge — Prototipo FDS 1

Juego tipo merge (estilo Suika) con temática del Arca de Noé.
Phaser 3 + Matter.js + TypeScript + Vite. Listo para empaquetarse
después en un WebView de Expo/React Native.

## Correr en el navegador

```bash
npm install
npm run dev
```

Abre la URL que muestra Vite (http://localhost:5173). En Chrome,
activa el modo dispositivo (F12 → ícono de móvil) para probar con touch.

**Controles:** mueve el dedo/mouse para posicionar el animal, suelta para dejarlo caer.
Dos animales iguales se fusionan en el siguiente de la cadena.
Si el contenedor se desborda sobre la línea roja, pierdes.

## Dónde ajustar el diseño (sin tocar la lógica)

- `src/chain.ts` — la cadena de animales: radios, colores, probabilidades
  de aparición, puntajes. **Aquí vive el balance del juego.**
- `src/GameScene.ts` (arriba del archivo) — constantes de física:
  rebote (`RESTITUTION`), fricción, cooldown de soltado, tiempo de peligro.
- `src/main.ts` — gravedad (`gravity.y`). Sube a 1.3-1.5 si se siente lento.

## Qué falta (plan de fines de semana)

- **FDS 2:** reemplazar emojis por sprites generados con IA
  (10 PNGs circulares de 512x512, cuerpo dentro del círculo).
  Cargar en `preload()` y quitar los emojis sincronizados.
  Ajustar física hasta que se "sienta" bien.
- **FDS 3:** shell de Expo con `react-native-webview` cargando el
  build (`npm run build` → carpeta `dist/`). AdMob intersticial
  escuchando el evento `game_over` del puente (`src/bridge.ts`).
- **FDS 4:** RevenueCat ("sin anuncios"), sonidos, háptica
  (mensaje al shell → expo-haptics), íconos y capturas.

## Puente con React Native

`src/bridge.ts` ya emite eventos JSON vía `postMessage`:
`game_start`, `game_over` (con score), `ark_complete`.
En el navegador solo hace `console.log`, así que puedes desarrollar
todo sin la app.

## Nota legal

No usar "Suika" ni arte de frutas similar al original en nombre,
ícono o capturas. La mecánica no es protegible; el trade dress sí.
