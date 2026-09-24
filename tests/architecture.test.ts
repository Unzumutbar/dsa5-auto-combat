import {readdirSync, readFileSync, statSync} from "node:fs";
import {join, relative} from "node:path";
import {describe, expect, it} from "vitest";

const root = join(import.meta.dirname, "..", "src");
const pureDirs = ["rules", "types"];
const forbidden = [/\bgame\./, /\bcanvas\./, /\bHooks\./, /\bui\./, /\bCONFIG\./, /\bfoundry\./, /\bChatMessage\b/];

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? collect(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("architecture", () => {
  const files = pureDirs.flatMap(dir => collect(join(root, dir)));

  it("finds pure rule files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("keeps rules and types free of Foundry globals", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(content, `${relative(root, file)} uses ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("only imports from rules and types inside the pure layer", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(/from\s+"([^"]+)"/g)) {
        const target = match[1]!;
        expect(target.startsWith("."), `${relative(root, file)} imports package ${target}`).toBe(true);
        expect(target, `${relative(root, file)} imports ${target}`).not.toMatch(/\/(adapters|orchestration|ui|settings)\//);
        expect(target, `${relative(root, file)} imports ${target}`).not.toMatch(/\.\.\/(config|log|main)$/);
      }
    }
  });
});
