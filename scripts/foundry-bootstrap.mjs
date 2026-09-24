/**
 * Runs inside the Electron binary with ELECTRON_RUN_AS_NODE=1. Foundry decides between the desktop
 * window and the headless server by looking at process.versions.electron, so we drop that marker
 * before handing over to Foundry's own entry point.
 */
delete process.versions.electron;
const main = process.argv.splice(2, 1)[0];
await import(`file:///${main.replace(/\\/g, "/")}`);
