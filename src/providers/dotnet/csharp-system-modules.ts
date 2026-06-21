import type {
  DotnetModuleModel,
} from "./model.js";
import {
  collectionsGenericDotnetModule,
} from "./csharp-system-module-collections.js";
import {
  systemIoDotnetModule,
} from "./csharp-system-module-io.js";
import {
  systemDotnetModule,
} from "./csharp-system-module-system.js";

export const csharpSystemModules = [
  systemDotnetModule(),
  systemIoDotnetModule(),
  collectionsGenericDotnetModule(),
] as const;

const csharpSystemModuleBySpecifier = new Map<string, DotnetModuleModel>(
  csharpSystemModules.map((module) => [module.moduleSpecifier, module]),
);

export function getCsharpSystemModule(specifier: string): DotnetModuleModel | undefined {
  return csharpSystemModuleBySpecifier.get(specifier);
}

export function hasCsharpSystemModule(specifier: string): boolean {
  return csharpSystemModuleBySpecifier.has(specifier);
}
