import Server from "@dr.pogodin/react-native-static-server";
import { SHELL_CONFIG } from "./config";

let server: Server | null = null;

/**
 * Arranca Lighttpd local. puerto 0 = dinámico.
 * NO usar stopInBackground: el WebView perdería el origen y la partida.
 */
export async function startGameServer(fileDir: string): Promise<string> {
  await stopGameServer();

  const t0 = Date.now();
  server = new Server({
    fileDir,
    port: SHELL_CONFIG.staticServerPort,
    stopInBackground: SHELL_CONFIG.stopServerInBackground,
    hostname: "127.0.0.1"
  });

  const origin = await server.start();
  const ms = Date.now() - t0;
  console.log(`[arca-shell] static server ${origin} en ${ms}ms`);
  return origin;
}

export async function stopGameServer(): Promise<void> {
  if (!server) return;
  try {
    await server.stop();
  } catch (e) {
    console.warn("[arca-shell] stop server", e);
  }
  server = null;
}

/** Si iOS mató el proceso en background, rearrancar (mismo fileDir). */
export async function ensureServerRunning(fileDir: string): Promise<string> {
  if (server) {
    try {
      const origin = await server.start();
      return origin;
    } catch {
      // cae a recreate
    }
  }
  return startGameServer(fileDir);
}
