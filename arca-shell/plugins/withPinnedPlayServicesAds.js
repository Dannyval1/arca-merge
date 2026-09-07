const { withProjectBuildGradle } = require("expo/config-plugins");

/** Last play-services-ads compiled with Kotlin 2.1. Do not bump to 25.3.0+. */
const PLAY_SERVICES_ADS = "25.2.0";
const START = "// arca-shell:play-services-ads-pin:start";
const END = "// arca-shell:play-services-ads-pin:end";

const INNER = `${START}
  configurations.configureEach {
    resolutionStrategy {
      force "com.google.android.gms:play-services-ads:${PLAY_SERVICES_ADS}"
      force "com.google.android.gms:play-services-ads-lite:${PLAY_SERVICES_ADS}"
    }
  }
  ${END}`;

/**
 * Pins Google Mobile Ads native SDK so Expo SDK 54 (Kotlin 2.1.20) can compile.
 * Survives `expo prebuild`. See README: "AdMob / Kotlin en Android".
 *
 * @param {import("expo/config-plugins").ExportedConfig} config
 */
function withPinnedPlayServicesAds(config) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (contents.includes(START) && contents.includes(END)) {
      contents = contents.replace(
        new RegExp(`${escapeRegex(START)}[\\s\\S]*?${escapeRegex(END)}`),
        INNER
      );
    } else {
      contents = `${contents.trimEnd()}\n\nallprojects {\n  ${INNER}\n}\n`;
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = withPinnedPlayServicesAds;
module.exports.PLAY_SERVICES_ADS = PLAY_SERVICES_ADS;
