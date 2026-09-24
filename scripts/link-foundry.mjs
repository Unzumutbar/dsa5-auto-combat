import {access, lstat, rm, symlink} from "node:fs/promises";
import path from "node:path";

const MODULE_ID = "dsa5-auto-combat";

async function resolveDataPath() {
  if (process.env.FOUNDRY_DATA_PATH) return process.env.FOUNDRY_DATA_PATH;
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const candidate = path.join(local, "FoundryVTT");
    try {
      await access(path.join(candidate, "Data", "modules"));
      return candidate;
    } catch {
      // fall through
    }
  }
  throw new Error("FOUNDRY_DATA_PATH muss auf das Foundry-User-Data-Verzeichnis zeigen (Ordner mit Data/, Config/, Logs/).");
}

const dataPath = await resolveDataPath();
const source = path.resolve("dist");
const target = path.join(dataPath, "Data", "modules", MODULE_ID);
try {
  const stat = await lstat(target);
  if (!stat.isSymbolicLink()) throw new Error(`Ziel existiert und ist keine Verknüpfung: ${target}`);
  await rm(target);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await symlink(source, target, "junction");
console.log(`Verknüpft: ${target} -> ${source}`);
