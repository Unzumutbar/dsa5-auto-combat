/**
 * Starts the Foundry VTT server headless for local testing, using the Node runtime bundled with the
 * Electron app (ELECTRON_RUN_AS_NODE) so no separate Node 24 installation is required.
 *
 * Environment overrides: FOUNDRY_APP_DIR, FOUNDRY_DATA_PATH, FOUNDRY_WORLD, FOUNDRY_PORT
 */
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";

const appDir = process.env.FOUNDRY_APP_DIR ?? "C:/Program Files/Foundry Virtual Tabletop";
const dataPath = process.env.FOUNDRY_DATA_PATH ?? path.join(process.env.LOCALAPPDATA ?? "", "FoundryVTT");
const world = process.env.FOUNDRY_WORLD ?? "dsa5-test";
const port = process.env.FOUNDRY_PORT ?? "30000";

const exe = path.join(appDir, "Foundry Virtual Tabletop.exe");
const main = path.join(appDir, "resources", "app", "main.mjs");
const bootstrap = path.join(import.meta.dirname, "foundry-bootstrap.mjs");
for (const file of [exe, main, bootstrap]) {
  if (!existsSync(file)) {
    console.error(`Nicht gefunden: ${file}`);
    process.exit(1);
  }
}

const child = spawn(exe, [bootstrap, main, `--dataPath=${dataPath}`, `--world=${world}`, `--port=${port}`, "--noupnp"], {
  stdio: "inherit",
  env: {...process.env, ELECTRON_RUN_AS_NODE: "1"}
});
child.on("exit", code => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
