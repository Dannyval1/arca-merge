import { defineConfig } from "vite";

// base: "./" es clave: permite que el build funcione con rutas relativas
// cuando lo empaquetes dentro de la app Expo (WebView con archivos locales).
export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: "es2020",
    assetsInlineLimit: 0
  }
});
