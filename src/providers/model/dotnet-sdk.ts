import { resolve } from "node:path";

export interface DotnetCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DotnetSdkQueryHost {
  runDotnet(args: readonly string[], cwd: string): DotnetCommandResult;
}

const dotnetSdkVersionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

export interface DotnetSdkInstallation {
  readonly version: string;
  readonly root: string;
}

export function resolveActiveDotnetSdk(
  projectDirectory: string,
  host: DotnetSdkQueryHost,
): DotnetSdkInstallation {
  return selectActiveDotnetSdk(
    readActiveDotnetSdkVersion(projectDirectory, host),
    readDotnetSdkInstallations(projectDirectory, host),
  );
}

function readActiveDotnetSdkVersion(
  projectDirectory: string,
  host: DotnetSdkQueryHost,
): string {
  const output = runDotnetSdkQuery(
    ["--version"],
    projectDirectory,
    host,
    "resolve the active .NET SDK",
  ).stdout.trim();
  if (!dotnetSdkVersionPattern.test(output)) {
    throw new Error(`dotnet --version returned an unsupported SDK version '${output}'.`);
  }
  return output;
}

function readDotnetSdkInstallations(
  projectDirectory: string,
  host: DotnetSdkQueryHost,
): readonly DotnetSdkInstallation[] {
  const output = runDotnetSdkQuery(
    ["--list-sdks"],
    projectDirectory,
    host,
    "locate the active .NET SDK installation",
  ).stdout;
  const installations = output
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = /^(?<version>\S+)\s+\[(?<root>.+)\]$/u.exec(line.trim());
      const version = match?.groups?.version;
      const root = match?.groups?.root;
      if (version === undefined || root === undefined || !dotnetSdkVersionPattern.test(version)) {
        throw new Error(`dotnet --list-sdks returned an unsupported entry '${line}'.`);
      }
      return {
        version,
        root: resolve(root),
      };
    });
  if (installations.length === 0) {
    throw new Error("dotnet --list-sdks returned no installed .NET SDKs.");
  }
  return installations;
}

function selectActiveDotnetSdk(
  activeVersion: string,
  installations: readonly DotnetSdkInstallation[],
): DotnetSdkInstallation {
  const matches = installations.filter((installation) => installation.version === activeVersion);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `The active .NET SDK '${activeVersion}' is not present in dotnet --list-sdks.`
        : `The active .NET SDK '${activeVersion}' has more than one installation root.`,
    );
  }
  return matches[0]!;
}

export function runDotnetSdkQuery(
  args: readonly string[],
  cwd: string,
  host: DotnetSdkQueryHost,
  purpose: string,
): DotnetCommandResult {
  const result = host.runDotnet(args, cwd);
  if (result.status !== 0) {
    throw new Error(
      `Unable to ${purpose}: dotnet ${args.join(" ")} exited with ${result.status ?? "no status"}.\n${result.stderr}`,
    );
  }
  return result;
}

