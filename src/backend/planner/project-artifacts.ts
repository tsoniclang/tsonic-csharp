import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpProjectFile } from "./project-artifact-types.js";
import {
  readAssemblyName,
  readCsharpProjectProperties,
  readReferencesOption,
} from "./project-options.js";

export type {
  CsharpProjectFile,
  CsharpProjectProperty,
  CsharpProjectReference,
} from "./project-artifact-types.js";
export { readNamespace } from "./project-options.js";

export function planCsharpProjectFile(
  input: TargetCompileInput,
  options: { readonly allowUnsafeBlocks?: boolean } = {},
): CsharpProjectFile {
  return {
    sdk: "Microsoft.NET.Sdk",
    path: `${readAssemblyName(input)}.csproj`,
    properties: readCsharpProjectProperties(input, options),
    references: readReferencesOption(input),
  };
}
