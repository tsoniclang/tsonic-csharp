import { isAbsolute } from "node:path";
import type { TargetRuntimeReference } from "@tsonic/target-api/artifacts";
import type { CsharpRuntimeSourceProject } from "../../target-model/project/runtime.js";

export function classifyCsharpRuntimeSource(reference: TargetRuntimeReference): CsharpRuntimeSourceProject {
  validatePath(reference.include, ".csproj");
  const attributes = reference.attributes;
  if (attributes === undefined || attributes === null || typeof attributes !== "object" || Array.isArray(attributes) || reference.version !== undefined) {
    throw new Error("A C# runtime source project requires exact build properties and no package version.");
  }
  const propertiesPath = attributes.DirectoryBuildPropsPath;
  validatePath(propertiesPath, ".props");
  const dependencies: Record<string, string> = {};
  for (const [name, path] of Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right))) {
    if (name === "DirectoryBuildPropsPath") continue;
    if (!/^Tsonic[A-Za-z0-9_]+Project$/u.test(name)) throw new Error(`Invalid C# runtime dependency property '${name}'.`);
    validatePath(path, ".csproj");
    dependencies[name] = path;
  }
  return Object.freeze({ projectPath: reference.include, propertiesPath, dependencies: Object.freeze(dependencies) });
}

export function validateCsharpRuntimeSources(sources: readonly CsharpRuntimeSourceProject[]): readonly CsharpRuntimeSourceProject[] {
  const byPath = new Map<string, CsharpRuntimeSourceProject>();
  for (const source of sources) {
    const prior = byPath.get(source.projectPath);
    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(source)) {
      throw new Error(`Conflicting C# runtime source project '${source.projectPath}'.`);
    }
    byPath.set(source.projectPath, source);
  }
  const active = new Set<string>();
  const visited = new Set<string>();
  const visit = (path: string): void => {
    if (visited.has(path)) return;
    if (active.has(path)) throw new Error(`Cyclic C# runtime project dependency '${path}'.`);
    const source = byPath.get(path);
    if (source === undefined) throw new Error(`Missing C# runtime project dependency '${path}'.`);
    active.add(path);
    for (const dependency of Object.values(source.dependencies)) visit(dependency);
    active.delete(path);
    visited.add(path);
  };
  for (const path of byPath.keys()) visit(path);
  return Object.freeze([...byPath.values()].sort((left, right) => left.projectPath.localeCompare(right.projectPath)));
}

function validatePath(value: unknown, extension: string): asserts value is string {
  if (typeof value !== "string" || !isAbsolute(value) || !value.endsWith(extension) || /[\r\n\0]/u.test(value)) {
    throw new Error(`C# runtime source requires an absolute ${extension} path.`);
  }
}
