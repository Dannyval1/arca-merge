import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { unzipSync } from "fflate";
import { SHELL_CONFIG } from "./config";

const MARKER = "game-build-id.txt";

function gameRoot(): string {
  return `${FileSystem.documentDirectory}arca-game/`;
}

/**
 * Asegura que documentDirectory/arca-game tiene el dist del juego
 * (extraído del zip embebido si el GAME_BUILD_ID cambió).
 */
export async function ensureGameFilesReady(): Promise<string> {
  const root = gameRoot();
  const markerPath = `${root}${MARKER}`;
  const info = await FileSystem.getInfoAsync(markerPath);
  if (info.exists) {
    const id = await FileSystem.readAsStringAsync(markerPath);
    if (id.trim() === SHELL_CONFIG.gameBuildId) {
      return root;
    }
  }

  await FileSystem.deleteAsync(root, { idempotent: true });
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });

  // Zip generado por scripts/sync-game.mjs → assets/game-dist.zip
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asset = Asset.fromModule(require("../assets/game-dist.zip"));
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error("No se pudo resolver assets/game-dist.zip");
  }

  const b64 = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: FileSystem.EncodingType.Base64
  });
  const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const files = unzipSync(binary);

  for (const [relPath, data] of Object.entries(files)) {
    if (relPath.endsWith("/")) continue;
    const dest = `${root}${relPath}`;
    const dir = dest.slice(0, dest.lastIndexOf("/"));
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    // write as base64
    let binaryStr = "";
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      binaryStr += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    const fileB64 = btoa(binaryStr);
    await FileSystem.writeAsStringAsync(dest, fileB64, {
      encoding: FileSystem.EncodingType.Base64
    });
  }

  await FileSystem.writeAsStringAsync(markerPath, SHELL_CONFIG.gameBuildId);
  return root;
}
