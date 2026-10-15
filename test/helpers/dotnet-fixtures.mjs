import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const ignoredDirectories = new Set(["bin", "obj", ".temp"]);
const trackedExtensions = new Set([".cs", ".csproj", ".props", ".targets"]);

export function buildDotnetFixture(options) {
  const outputAssembly = join(options.outputDirectory, options.outputAssemblyName);
  const stamp = join(options.outputDirectory, ".tsonic-fixture-build.stamp");
  const sourceHash = hashProjectSources(options.projectDirectory);

  if (existsSync(outputAssembly) && existsSync(stamp) && readFileSync(stamp, "utf8") === sourceHash) {
    return outputAssembly;
  }

  mkdirSync(options.outputDirectory, { recursive: true });
  mkdirSync(options.intermediateDirectory, { recursive: true });
  const intermediateOutputPath = options.intermediateDirectory.endsWith(sep)
    ? options.intermediateDirectory
    : `${options.intermediateDirectory}${sep}`;

  const result = spawnSync("dotnet", [
    "build",
    options.project,
    "--nologo",
    "--verbosity",
    "quiet",
    "--output",
    options.outputDirectory,
    `-p:IntermediateOutputPath=${intermediateOutputPath}`,
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  writeFileSync(stamp, sourceHash);
  return outputAssembly;
}

function hashProjectSources(projectDirectory) {
  const hash = createHash("sha256");
  for (const file of listTrackedFiles(projectDirectory)) {
    hash.update(relative(projectDirectory, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listTrackedFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...listTrackedFiles(path));
      }
      continue;
    }
    if (entry.isFile() && trackedExtensions.has(extension(entry.name))) {
      statSync(path);
      files.push(path);
    }
  }
  return files;
}

function extension(fileName) {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? basename(fileName) : fileName.slice(index);
}
