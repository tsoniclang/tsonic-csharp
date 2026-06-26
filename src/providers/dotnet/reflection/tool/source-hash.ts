import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export function hashProviderToolSources(projectPath: string): string {
  const root = dirname(projectPath);
  const hash = createHash("sha256");
  for (const file of providerToolSourceFiles(root)) {
    hash.update(relative(root, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 32);
}

function providerToolSourceFiles(root: string): readonly string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "bin" || entry.name === "obj" || entry.name === ".temp") {
      continue;
    }
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...providerToolSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".cs") || entry.name.endsWith(".csproj"))) {
      results.push(fullPath);
    }
  }
  return results.sort();
}
