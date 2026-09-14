const fs = require("fs");
const path = require("path");
const { withFinalizedMod } = require("expo/config-plugins");

/**
 * Expo escribe values-b+* aunque el JSON de locales solo tenga bloque `ios`
 * (objeto Android vacío → strings.xml vacío). Esos dirs sobran y no deben
 * existir en release. Corre en finalized (después de withLocales).
 *
 * @param {import("expo/config-plugins").ExportedConfig} config
 */
function withStripEmptyAndroidLocales(config) {
  return withFinalizedMod(config, [
    "android",
    async (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res"
      );
      if (!fs.existsSync(resDir)) return cfg;

      for (const name of fs.readdirSync(resDir)) {
        if (!name.startsWith("values-b+")) continue;
        const dir = path.join(resDir, name);
        if (!fs.statSync(dir).isDirectory()) continue;

        const stringsPath = path.join(dir, "strings.xml");
        if (!fs.existsSync(stringsPath)) {
          fs.rmSync(dir, { recursive: true, force: true });
          continue;
        }

        const xml = fs.readFileSync(stringsPath, "utf8");
        const hasString = /<string[\s>]/.test(xml);
        if (!hasString) {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(
            `[arca-shell] stripped empty Android locale dir: ${name}`
          );
        }
      }
      return cfg;
    }
  ]);
}

module.exports = withStripEmptyAndroidLocales;
