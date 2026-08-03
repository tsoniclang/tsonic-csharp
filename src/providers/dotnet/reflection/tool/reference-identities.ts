import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export function referenceIdentities(references: readonly string[]): readonly Readonly<Record<string, unknown>>[] {
  return references.map((reference) => {
    const resolved = resolve(reference);
    if (!existsSync(resolved)) {
      return {
        path: resolved,
        exists: false,
      };
    }
    const stat = statSync(resolved);
    return {
      path: resolved,
      exists: true,
      size: stat.size,
      sha256: createHash("sha256").update(readFileSync(resolved)).digest("hex"),
    };
  });
}

export function referenceDirectoryIdentities(referenceDirectory: string | undefined): readonly Readonly<Record<string, unknown>>[] {
  if (referenceDirectory === undefined) {
    return [];
  }
  const resolved = resolve(referenceDirectory);
  if (!existsSync(resolved)) {
    return [{ path: resolved, exists: false }];
  }
  const stat = statSync(resolved);
  if (!stat.isDirectory()) {
    return [{ path: resolved, exists: true, directory: false }];
  }
  return referenceIdentities(readdirSync(resolved)
    .filter((name) => name.toLowerCase().endsWith(".dll"))
    .sort()
    .map((name) => join(resolved, name)));
}
