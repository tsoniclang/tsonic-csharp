import {
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  join,
  resolve,
} from "node:path";
import {
  spawnSync,
} from "node:child_process";

export interface DotnetCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DotnetFrameworkReferencePackHost {
  runDotnet(args: readonly string[], cwd: string): DotnetCommandResult;
  isFile(path: string): boolean;
  readAssemblyDirectory(path: string): readonly string[] | undefined;
}

interface DotnetSdkInstallation {
  readonly version: string;
  readonly root: string;
}

interface KnownFrameworkReference {
  readonly identity: string;
  readonly targetFramework: string;
  readonly targetingPackName: string;
  readonly targetingPackVersion: string;
}

const dotnetSdkVersionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

export function resolveDotnetFrameworkReferenceAssemblies(
  frameworkReferences: readonly string[],
  targetFramework: string,
  projectDirectory: string,
  host: DotnetFrameworkReferencePackHost = defaultDotnetFrameworkReferencePackHost,
): readonly string[] {
  if (frameworkReferences.length === 0) {
    return [];
  }
  const duplicateFramework = findDuplicate(frameworkReferences);
  if (duplicateFramework !== undefined) {
    throw new Error(`C# framework references contain duplicate '${duplicateFramework}'.`);
  }

  const activeSdkVersion = readActiveDotnetSdkVersion(projectDirectory, host);
  const activeSdk = selectActiveDotnetSdk(
    activeSdkVersion,
    readDotnetSdkInstallations(projectDirectory, host),
  );
  const bundledVersionsPath = join(
    activeSdk.root,
    activeSdk.version,
    "Microsoft.NETCoreSdk.BundledVersions.props",
  );
  if (!host.isFile(bundledVersionsPath)) {
    throw new Error(
      `The active .NET SDK '${activeSdk.version}' does not contain '${bundledVersionsPath}'.`,
    );
  }

  const query = runDotnet(
    [
      "msbuild",
      bundledVersionsPath,
      "-nologo",
      "-getProperty:NetCoreTargetingPackRoot",
      "-getItem:KnownFrameworkReference",
    ],
    projectDirectory,
    host,
    "query the active .NET SDK framework reference contract",
  );
  const contract = parseFrameworkReferenceContract(query.stdout, activeSdk.version);
  const directories = frameworkReferences.map((frameworkReference) => {
    const matches = contract.references.filter((reference) =>
      reference.identity === frameworkReference && reference.targetFramework === targetFramework
    );
    if (matches.length !== 1) {
      const reason = matches.length === 0 ? "does not define" : "defines more than one contract for";
      throw new Error(
        `The active .NET SDK '${activeSdk.version}' ${reason} framework reference '${frameworkReference}' for target framework '${targetFramework}'.`,
      );
    }
    const reference = matches[0]!;
    return join(
      contract.targetingPackRoot,
      reference.targetingPackName,
      reference.targetingPackVersion,
      "ref",
      reference.targetFramework,
    );
  });

  const assemblies: string[] = [];
  const seenDirectories = new Set<string>();
  for (const directory of directories) {
    const canonicalDirectory = resolve(directory);
    if (seenDirectories.has(canonicalDirectory)) {
      continue;
    }
    seenDirectories.add(canonicalDirectory);
    const directoryAssemblies = host.readAssemblyDirectory(canonicalDirectory);
    if (directoryAssemblies === undefined || directoryAssemblies.length === 0) {
      throw new Error(
        `The .NET targeting pack reference directory for '${targetFramework}' is missing or contains no assemblies: ${canonicalDirectory}`,
      );
    }
    assemblies.push(...directoryAssemblies
      .map((assembly) => resolve(assembly))
      .sort((left, right) => left.localeCompare(right)));
  }
  return assemblies;
}

function readActiveDotnetSdkVersion(
  projectDirectory: string,
  host: DotnetFrameworkReferencePackHost,
): string {
  const output = runDotnet(
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
  host: DotnetFrameworkReferencePackHost,
): readonly DotnetSdkInstallation[] {
  const output = runDotnet(
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

function parseFrameworkReferenceContract(
  source: string,
  sdkVersion: string,
): {
  readonly targetingPackRoot: string;
  readonly references: readonly KnownFrameworkReference[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `The active .NET SDK '${sdkVersion}' returned invalid framework reference JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const root = asRecord(parsed, "MSBuild framework reference query");
  const properties = asRecord(root.Properties, "MSBuild framework reference query Properties");
  const items = asRecord(root.Items, "MSBuild framework reference query Items");
  const targetingPackRoot = requiredString(
    properties.NetCoreTargetingPackRoot,
    "MSBuild framework reference query NetCoreTargetingPackRoot",
  );
  if (!Array.isArray(items.KnownFrameworkReference)) {
    throw new Error("MSBuild framework reference query did not return KnownFrameworkReference items.");
  }
  return {
    targetingPackRoot: resolve(targetingPackRoot),
    references: items.KnownFrameworkReference.map((entry, index) => {
      const item = asRecord(entry, `KnownFrameworkReference[${index}]`);
      return {
        identity: requiredString(item.Identity, `KnownFrameworkReference[${index}].Identity`),
        targetFramework: requiredString(item.TargetFramework, `KnownFrameworkReference[${index}].TargetFramework`),
        targetingPackName: requiredString(item.TargetingPackName, `KnownFrameworkReference[${index}].TargetingPackName`),
        targetingPackVersion: requiredString(item.TargetingPackVersion, `KnownFrameworkReference[${index}].TargetingPackVersion`),
      };
    }),
  };
}

function runDotnet(
  args: readonly string[],
  cwd: string,
  host: DotnetFrameworkReferencePackHost,
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

function asRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value;
}

function findDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return undefined;
}

const defaultDotnetFrameworkReferencePackHost: DotnetFrameworkReferencePackHost = {
  runDotnet(args, cwd) {
    const result = spawnSync("dotnet", args, {
      cwd,
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? result.error?.message ?? "",
    };
  },
  isFile(path) {
    return existsSync(path) && statSync(path).isFile();
  },
  readAssemblyDirectory(path) {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      return undefined;
    }
    return readdirSync(path)
      .filter((entry) => entry.endsWith(".dll"))
      .sort((left, right) => left.localeCompare(right))
      .map((entry) => join(path, entry));
  },
};
