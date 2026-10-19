import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { TargetRuntimeContributions, TargetRuntimeReference } from "@tsonic/target-api/artifacts";
import type { CsharpRuntimeProjectSource } from "../../target-model/project/runtime.js";

export const csharpCoreRuntimeSource: CsharpRuntimeProjectSource = Object.freeze({
  projectPath: fileURLToPath(import.meta.resolve("@tsonic/csharp-runtime/runtime.csproj")),
  propertiesPath: fileURLToPath(import.meta.resolve("@tsonic/csharp-runtime/runtime.props")),
});

export const csharpJsRuntimeSource: CsharpRuntimeProjectSource = Object.freeze({
  projectPath: fileURLToPath(import.meta.resolve("@tsonic/csharp-js/runtime.csproj")),
  propertiesPath: fileURLToPath(import.meta.resolve("@tsonic/csharp-js/runtime.props")),
  dependencies: Object.freeze({ TsonicCsharpRuntimeProject: csharpCoreRuntimeSource }),
});

export function csharpRuntimeSourceContributions(source: CsharpRuntimeProjectSource): TargetRuntimeContributions {
  const active = new Set<CsharpRuntimeProjectSource>();
  const visited = new Set<CsharpRuntimeProjectSource>();
  const references: TargetRuntimeReference[] = [];
  const visit = (entry: CsharpRuntimeProjectSource): void => {
    if (visited.has(entry)) return;
    if (active.has(entry)) throw new Error("C# runtime source project dependencies contain a cycle.");
    validatePath(entry.projectPath, ".csproj");
    validatePath(entry.propertiesPath, ".props");
    active.add(entry);
    const attributes: Record<string, string> = { DirectoryBuildPropsPath: entry.propertiesPath };
    for (const [name, dependency] of Object.entries(entry.dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      if (!/^Tsonic[A-Za-z0-9_]+Project$/u.test(name)) throw new Error(`Invalid C# runtime dependency property '${name}'.`);
      visit(dependency);
      attributes[name] = dependency.projectPath;
    }
    references.push(Object.freeze({ kind: "csharp-source-project", include: entry.projectPath, attributes: Object.freeze(attributes) }));
    active.delete(entry);
    visited.add(entry);
  };
  visit(source);
  return Object.freeze({ references: Object.freeze(references) });
}

function validatePath(path: string, extension: string): void {
  if (!isAbsolute(path) || !path.endsWith(extension) || /[\r\n\0]/u.test(path)) {
    throw new Error(`C# runtime source must be an absolute '${extension}' path: '${path}'.`);
  }
}
