# Arca Shell (Fase 1)

Shell Expo nativo que carga el juego Phaser en un WebView a pantalla completa.

**Validación de rendimiento en Android: ABIERTA.** iOS cubre carga, servidor local, safe areas y ciclo de vida. El FPS con tablero lleno en Android de gama media sigue pendiente hasta tener dispositivo.

## Stack fijado (`src/config.ts`)

| Paquete | Versión |
|---|---|
| Expo SDK | 54 |
| expo | ~54.0.36 |
| react-native | 0.81.5 |
| react-native-webview | 13.15.0 |
| @dr.pogodin/react-native-static-server | 0.27.1 |
| react-native-google-mobile-ads (Fase 3) | 16.3.4 |
| react-native-purchases (Fase 4) | 10.7.0 |

## Qué instalar (iOS)

En el Mac:

- Xcode 16.1+ (App Store) y Command Line Tools: `xcode-select --install`
- CocoaPods: `sudo gem install cocoapods` (o `brew install cocoapods`)
- Cuenta Apple Developer (gratis basta para dispositivo propio; pago para TestFlight)
- En Xcode → Settings → Accounts: inicia sesión
- Conecta el iPhone, confía en el equipo, activa Developer Mode (Ajustes → Privacidad → Modo desarrollador)

Una sola vez en el proyecto:

```bash
cd arca-shell
npx expo prebuild --platform ios
cd ios && pod install && cd ..
```

Apple requiere un **bundle id** único. Hoy es `com.arcamerge.app` en `app.json`. Cámbialo antes del primer build si no es tuyo.

## Arranque iOS (development build)

```bash
# 1) Juego en LAN (misma Wi‑Fi que el iPhone)
cd arca-merge && npm run dev -- --host

# 2) En arca-shell/src/config.ts
#    useViteDevServer: true
#    viteDevUrl: "http://TU_IP:5173"   # p. ej. 192.168.1.42

# 3) Shell nativo (NO Expo Go)
cd arca-shell
npx expo run:ios --device
```

La primera vez Xcode pedirá firmar el target. Elige tu Team personal. En el iPhone: Ajustes → General → Administración de VPN y dispositivos → confiar en el certificado.

Checklist de Fase 1 en iPhone (sí se puede cerrar):

- [ ] El juego carga a pantalla completa, fondo `#1b2a41` (sin flash blanco)
- [ ] Notch / Dynamic Island: HUD no se mete debajo; barra de gestos no tapa la cadena
- [ ] Vertical bloqueado
- [ ] Sin zoom, sin selección de texto, sin bounce al arrastrar
- [ ] Home → volver: la partida no se recarga; al volver, el tablero sigue (ciclo `app_background` / `app_foreground`)
- [ ] Dev: Vite LAN (`useViteDevServer: true`)
- [ ] Offline: `useViteDevServer: false` + `npm run sync-game` + rebuild

Checklist **abierto** (Android gama media, tablero lleno):

- [ ] FPS estable (~60 o al menos jugable) con el tablero lleno
- [ ] Sin jank evidente en fusiones / juice

## Arranque Android (cuando haya dispositivo)

El WebView **no puede usar localhost**: en el teléfono eso es el propio Android.
`ERR_ADDRESS_UNREACHABLE` = `viteDevUrl` apunta a una IP que ya no existe.

```bash
# IP actual del Mac
ipconfig getifaddr en0

# 1) Juego escuchando en LAN
cd arca-merge && npm run dev

# 2) arca-shell/src/config.ts → viteDevUrl = http://ESA_IP:5173
#    y useViteDevServer: true

# 3) Misma Wi‑Fi (no datos móviles / invitados aislados)
cd arca-shell && npx expo run:android --device
```

Si el teléfono va por USB y el Wi‑Fi falla:

```bash
adb reverse tcp:5173 tcp:5173
# y en config.ts: viteDevUrl: "http://127.0.0.1:5173"
```

## Offline (dist empaquetado)

```bash
cd arca-merge && npm run build
cd ../arca-shell && npm run sync-game
# config: useViteDevServer: false
npx expo run:ios --device   # o run:android
```

`sync-game` comprime PNG **antes** de zippear. Ver salida `PNG … → …` en consola.

## AdMob / Kotlin en Android (no flotar)

Expo SDK 54 compila con **Kotlin 2.1.20**. Google Mobile Ads nativo **25.3.0+** (incluido 25.4.0) se publica con metadata **Kotlin 2.3.0**, y Gradle falla así:

```
:react-native-google-mobile-ads:compileDebugKotlin FAILED
Module was compiled with an incompatible version of Kotlin.
The binary version of its metadata is 2.3.0, expected version is 2.1.0.
play-services-ads-25.4.0-api.jar
```

Bajar solo el paquete JS no basta: `react-native-google-mobile-ads` 16.4.0 y 16.5.0 piden `play-services-ads:25.4.0` en su `package.json`.

Versiones **fijadas** (explícitas, sin `^` / sin rango):

| Pieza | Versión | Por qué |
|---|---|---|
| `react-native-google-mobile-ads` | **16.3.4** | Última que no llama APIs de AdMob 25.3 (`setAgeRestrictedTreatment`). 16.4.0+ **no** compila contra 25.2.0. |
| `com.google.android.gms:play-services-ads` | **25.2.0** | Última compilada con Kotlin 2.1. 25.3.0 ya es Kotlin 2.3. |
| Kotlin del proyecto | 2.1.20 (Expo 54) | No subir a 2.3: el KSP de Expo 54 solo llega a 2.2.20. |

El pin nativo vive en `android/build.gradle` (`resolutionStrategy.force`) y se reinyecta en cada prebuild con `plugins/withPinnedPlayServicesAds.js`. Tras `npm install` o `expo prebuild`, comprueba que Gradle no haya vuelto a 25.3+/25.4.0:

```bash
cd arca-shell/android
./gradlew :react-native-google-mobile-ads:dependencies --configuration debugCompileClasspath | grep play-services-ads
```

No subas GMA a 16.4.0/16.5.0 ni quites el `force` hasta que Expo traiga Kotlin **y** KSP 2.3. Si el pin queda flotando, el próximo `npm install` puede romper el build de Android justo antes de publicar.

## Firebase Test Lab / dispositivo remoto

Si tardas en conseguir Android físico, ver [docs/TEST_LAB.md](./docs/TEST_LAB.md).

## Contrato remove_ads

Ver [docs/REMOVE_ADS_CONTRACT.md](./docs/REMOVE_ADS_CONTRACT.md). Ya implementado en el juego.
