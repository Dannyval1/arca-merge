# arca-shell

Shell Expo (SDK 54) de **Arca Merge**: WebView a pantalla completa + AdMob + RevenueCat + servidor estático del dist del juego.

Package: `com.arcamerge.app` · Versión app: ver `app.json`.

## Comandos útiles

```bash
# Empaquetar el juego (desde la raíz del monorepo) y meterlo en el shell
cd .. && npm run build && cd arca-shell && npm run sync-game

# Dev client en dispositivo
npx expo run:android
npx expo run:ios

# AAB producción
eas build --platform android --profile production
```

## Config

Todo centralizado en `src/config.ts`:

- `IS_PRODUCTION` — ads reales vs TestIds, banner, sin Vite LAN
- `gameBuildId` — lo actualiza `npm run sync-game` (fuerza re-extraer el zip en el teléfono)
- IDs AdMob, RevenueCat, URLs de tienda / privacidad

Alineá también `../src/buildFlags.ts` (`IS_PRODUCTION`).

## Notas

- `android/` e `ios/` se regeneran con prebuild; están en `.gitignore` del monorepo.
- Detalle del pin de Play Services Ads / Kotlin: si Android deja de compilar tras subir GMA, revisá `plugins/` y la versión fijada `react-native-google-mobile-ads@16.3.4`.
- Documentación de producto y arranque completo: [README raíz](../README.md).
