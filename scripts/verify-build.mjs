import {readFile, stat} from "node:fs/promises";
import {resolve} from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "dist/module.json",
  "dist/dsa5-auto-combat.mjs",
  "dist/styles/auto-combat.css",
  "dist/lang/de.json",
  "dist/lang/en.json"
];

for (const path of required) await stat(resolve(root, path));
const manifest = JSON.parse(await readFile(resolve(root, "dist/module.json"), "utf8"));
if (manifest.id !== "dsa5-auto-combat") throw new Error("Falsche Modul-ID im Build.");
for (const script of manifest.esmodules) await stat(resolve(root, "dist", script));
for (const style of manifest.styles) await stat(resolve(root, "dist", typeof style === "string" ? style : style.src));
for (const language of manifest.languages) await stat(resolve(root, "dist", language.path));
console.log("Build vollständig.");
