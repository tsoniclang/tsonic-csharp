import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpRuntimeProjectInstance } from "../../artifact-model/project/runtime.js";

export function planCsharpRuntimeProjects(input: CsharpPlanningContext): readonly CsharpRuntimeProjectInstance[] {
  const sources = new Map(input.program.project.runtimeSources.map((source) => [source.projectPath, source]));
  const planned = new Map<string, CsharpRuntimeProjectInstance>();
  const framework = input.program.configuration.targetFramework;
  const visit = (sourcePath: string): CsharpRuntimeProjectInstance => {
    const cached = planned.get(sourcePath);
    if (cached !== undefined) return cached;
    const source = sources.get(sourcePath);
    if (source === undefined) throw new Error(`Missing classified runtime project '${sourcePath}'.`);
    const dependencies = Object.freeze(Object.fromEntries(Object.entries(source.dependencies).map(([name, path]) => [name, visit(path).path])));
    const identity = createHash("sha256").update(JSON.stringify([source.projectPath, source.propertiesPath, framework, dependencies])).digest("hex");
    const project = Object.freeze({
      path: join(input.host.paths.cacheRoot, "csharp", "runtime", framework, identity, basename(source.projectPath)),
      sourceProject: source.projectPath,
      sourceProperties: source.propertiesPath,
      framework,
      dependencies,
    });
    planned.set(sourcePath, project);
    return project;
  };
  for (const path of sources.keys()) visit(path);
  return Object.freeze([...planned.values()]);
}
