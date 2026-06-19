import { relative, basename, dirname, extname } from "node:path";
import type { TargetCompileInput } from "@tsonic/target-api";
import { sanitizePathSegment, toPascalCase } from "./identifiers.js";

export function sourceFileClassName(input: TargetCompileInput, fileName: string): string {
  const relativeName = projectRelativeSourcePath(input, fileName);
  const withoutExtension = relativeName.slice(0, relativeName.length - extname(relativeName).length);
  const text = withoutExtension.length === 0 ? "Module" : withoutExtension;
  return toPascalCase(text);
}

export function sourceFileArtifactPath(input: TargetCompileInput, fileName: string, className: string): string {
  const relativeName = projectRelativeSourcePath(input, fileName);
  const directory = dirname(relativeName).split(/[\\/]+/).filter((part) => part.length > 0 && part !== ".");
  return ["src", ...directory.map(sanitizePathSegment), `${className}.cs`].join("/");
}

function projectRelativeSourcePath(input: TargetCompileInput, fileName: string): string {
  const relativeName = relative(input.paths.projectRoot, fileName);
  if (relativeName.length === 0 || relativeName.startsWith("..")) {
    return basename(fileName);
  }
  return relativeName;
}
