import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveActiveDotnetSdk } from "../../../model/dotnet-sdk.js";
import { parseCsharpTargetFramework } from "../../../../target-model/configuration/framework.js";

export interface DotnetProviderToolchain {
  readonly projectDirectory: string;
  readonly sdkRoot: string;
  readonly sdkVersion: string;
  readonly toolTargetFramework: string;
  readonly targetFramework: string;
  readonly platformDirectory: string;
}

export function resolveDotnetProviderToolchain(
  projectDirectory: string,
  targetFramework: string,
): DotnetProviderToolchain {
  const requested = parseCsharpTargetFramework(targetFramework);
  const sdk = resolveActiveDotnetSdk(projectDirectory, {
    runDotnet(args, cwd) {
      const result = spawnSync("dotnet", args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
      return { status: result.status, stdout: result.stdout ?? "", stderr: result.error?.message ?? result.stderr ?? "" };
    },
  });
  const bundled = join(sdk.root, sdk.version, "Microsoft.NETCoreSdk.BundledVersions.props");
  const contract: unknown = JSON.parse(runDotnet([
    "msbuild", bundled, "-nologo",
    "-getProperty:BundledNETCoreAppTargetFrameworkVersion",
    "-getItem:KnownFrameworkReference",
  ], projectDirectory));
  if (!isRecord(contract) || !isRecord(contract.Properties) || !isRecord(contract.Items) ||
      typeof contract.Properties.BundledNETCoreAppTargetFrameworkVersion !== "string" ||
      !Array.isArray(contract.Items.KnownFrameworkReference)) {
    throw new Error(`The active .NET SDK '${sdk.version}' returned an invalid framework contract.`);
  }
  const toolTargetFramework = `net${contract.Properties.BundledNETCoreAppTargetFrameworkVersion}`;
  parseCsharpTargetFramework(toolTargetFramework);
  if (!contract.Items.KnownFrameworkReference.some((entry: unknown) => isRecord(entry) &&
      entry.Identity === "Microsoft.NETCore.App" && entry.TargetFramework === `net${requested.runtimeVersion}`)) {
    throw new Error(`The active .NET SDK '${sdk.version}' does not support '${targetFramework}'. Install and select a suitable SDK.`);
  }
  const platformDirectory = selectDotnetPlatformDirectory(
    runDotnet(["--list-runtimes"], projectDirectory), targetFramework,
  );
  if (!existsSync(join(platformDirectory, "System.Private.CoreLib.dll"))) {
    throw new Error(`The selected .NET runtime is incomplete: '${platformDirectory}'.`);
  }
  return Object.freeze({
    projectDirectory: resolve(projectDirectory),
    sdkRoot: sdk.root,
    sdkVersion: sdk.version,
    toolTargetFramework,
    targetFramework,
    platformDirectory,
  });
}

export function selectDotnetPlatformDirectory(output: string, targetFramework: string): string {
  const requested = parseCsharpTargetFramework(targetFramework);
  const entries: { readonly version: string; readonly directory: string }[] = [];
  for (const line of output.split(/\r?\n/u).filter((entry) => entry.startsWith("Microsoft.NETCore.App "))) {
    const match = /^Microsoft\.NETCore\.App ([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?) \[(.+)\]$/u.exec(line.trim());
    if (match === null) {
      throw new Error(`dotnet --list-runtimes returned an invalid runtime: '${line}'.`);
    }
    const version = match[1]!;
    if (version.startsWith(`${requested.runtimeVersion}.`)) {
      entries.push({ version, directory: resolve(match[2]!, version) });
    }
  }
  entries.sort((left, right) => {
    const leftParts = left.version.split("-");
    const rightParts = right.version.split("-");
    const numeric = rightParts[0]!.localeCompare(leftParts[0]!, "en", { numeric: true });
    if (numeric !== 0) return numeric;
    if (leftParts.length === 1 && rightParts.length !== 1) return -1;
    if (rightParts.length === 1 && leftParts.length !== 1) return 1;
    return right.version.localeCompare(left.version, "en", { numeric: true });
  });
  const selected = entries[0];
  if (selected === undefined) {
    throw new Error(`No .NET ${requested.runtimeVersion} runtime is installed for '${targetFramework}'. Install its SDK/runtime; another framework is not substituted.`);
  }
  if (entries.some((entry) => entry.version === selected.version && entry.directory !== selected.directory)) {
    throw new Error(`The .NET runtime '${selected.version}' has ambiguous installation roots.`);
  }
  return selected.directory;
}

function runDotnet(args: readonly string[], cwd: string): string {
  const result = spawnSync("dotnet", args, {
    cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to resolve the selected .NET toolchain: dotnet ${args.join(" ")}\n${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.trim();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
