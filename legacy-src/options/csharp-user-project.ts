import { realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type {
  CsharpProjectConfiguration,
} from "../target-model/configuration/model.js";

export function resolveCsharpProjectConfiguration(
  configured: string | undefined,
  projectDirectory: string,
  targetOutputRoot: string,
): CsharpProjectConfiguration {
  if (configured === undefined) {
    return Object.freeze({ kind: "generated" });
  }
  const candidate = isAbsolute(configured)
    ? resolve(configured)
    : resolve(projectDirectory, configured);
  if (extname(candidate) !== ".csproj") {
    throw new Error(
      `C# target option 'projectFile' must point to a .csproj file: ${candidate}`,
    );
  }
  let projectFile: string;
  try {
    projectFile = realpathSync(candidate);
  } catch {
    throw new Error(`C# target option 'projectFile' does not exist: ${candidate}`);
  }
  let isFile: boolean;
  try {
    isFile = statSync(projectFile).isFile();
  } catch {
    throw new Error(`C# target option 'projectFile' cannot be read: ${projectFile}`);
  }
  if (!isFile) {
    throw new Error(`C# target option 'projectFile' must point to a file: ${projectFile}`);
  }
  const outputRoot = canonicalExistingPath(targetOutputRoot);
  const relativeToOutput = normalizePath(relative(outputRoot, projectFile));
  if (
    relativeToOutput.length === 0 ||
    relativeToOutput === "." ||
    (!relativeToOutput.startsWith("../") && relativeToOutput !== "..")
  ) {
    throw new Error(
      `C# target option 'projectFile' must not point inside generated target output root '${targetOutputRoot}': ${projectFile}`,
    );
  }
  return Object.freeze({ kind: "user-owned", projectFile });
}

function canonicalExistingPath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}
