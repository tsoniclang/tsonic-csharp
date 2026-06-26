import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

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
      mtimeMs: Math.trunc(stat.mtimeMs),
    };
  });
}
