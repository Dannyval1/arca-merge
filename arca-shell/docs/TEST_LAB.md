# Dispositivos remotos (Android) mientras no hay hardware

La **validación de FPS con tablero lleno en Android de gama media sigue abierta**. Esto no la sustituye: un lab de granja da señales, no el veredicto final en el teléfono que te importa.

## Opción A — Firebase Test Lab (recomendado)

1. Proyecto en [Firebase Console](https://console.firebase.google.com/) → App Android `com.arcamerge.app`.
2. Instala `gcloud` y entra:
   ```bash
   gcloud auth login
   gcloud config set project TU_PROJECT_ID
   ```
3. APK de development/preview:
   ```bash
   cd arca-shell
   npx eas-cli login
   npx eas-cli build --platform android --profile preview
   ```
   Descarga el `.apk` del dashboard de EAS.
4. Robo test (humo: abre la app, no juega una partida completa):
   ```bash
   gcloud firebase test android run \
     --type robo \
     --app /ruta/al/app.apk \
     --device model=redfin,version=30,locale=es,orientation=portrait \
     --timeout 8m
   ```
   `redfin` = Pixel 5 (gama media razonable). Cambia el modelo en el catálogo:
   ```bash
   gcloud firebase test android models list
   ```
5. Game loop (mejor para FPS):
   - En una build de debug, deja que `arcaDebug.forceArkComplete` / drops automáticos llenen el tablero, o un scenario que spawnee 20+ piezas.
   - Empaqueta un test loop nativo más adelante (Fase 5). Hoy el Robo solo confirma que el WebView arranca.

Informes: Firebase Console → Test Lab → vídeo + logs. El vídeo sirve para ver stutter; no da un contador de FPS fiable. Para números, el dispositivo real.

## Opción B — BrowserStack App Live / App Automate

Sube el mismo APK. Elige un Samsung A-series o Pixel 4a/5. Sesión interactiva: juega hasta llenar el tablero y mira si va a tirones. De pago; más cercano a “tengo un Android” que Robo.

## Opción C — EAS Build + Internal distribution

```bash
npx eas-cli build --platform android --profile preview
```

Comparte el QR con quien tenga un Android de gama media. Sigue siendo verificación humana; no cierra sola la fase.

## Qué no usar para el veredicto de FPS

- Emulador de Android Studio (GPU distinta; suele ir mejor o peor que el hardware).
- Expo Go (este proyecto no corre ahí).
- iPhone como proxy de rendimiento Android.
