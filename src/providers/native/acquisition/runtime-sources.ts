import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { ExtensionDiagnostic } from "@tsonic/tsts";
import type { CsharpProviderRuntimePreparation } from "../../model/relation-resolver.js";
import type { CsharpProviderBindingResolution } from "../../../target-model/metadata/provider-metadata.js";
import type { CsharpRuntimeProjectInstance } from "../../../target-model/project/runtime.js";
import { dotnetExtensionDiagnostic } from "../model/diagnostics.js";
import { dotnetReflectionProviderIdentity } from "./provider-identity.js";
import type { DotnetProviderToolchain } from "./toolchain.js";

type NativeResult<Value> =
  | { readonly kind: "resolved"; readonly value: Value }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic };

interface NativeProjectFacts {
  readonly Properties: Readonly<Record<string, string>>;
  readonly Items: Readonly<Record<string, readonly Readonly<Record<string, string>>[]>>;
  readonly TargetResults?: Readonly<Record<string, { readonly Result: string; readonly Items: readonly Readonly<Record<string, string>>[] }>>;
}

interface NativeFileHash {
  readonly path: string;
  readonly sha256: string;
}

interface RuntimeBuildProof {
  readonly inputFingerprint: string;
  readonly outputs: readonly NativeFileHash[];
  readonly references: readonly NativeFileHash[];
}

const projectProperties = "TargetPath,TargetRefPath,AssemblyName,TargetFramework,DirectoryBuildPropsPath,Configuration,DefineConstants,MSBuildProjectFullPath,NETCoreSdkVersion,MSBuildSDKsPath";
const projectItems = "Compile,EmbeddedResource,AdditionalFiles,Analyzer,EditorConfigFiles,ReferencePath,ProjectReference";

export function acquireCsharpRuntimeSources(
  preparation: CsharpProviderRuntimePreparation,
  toolchain: DotnetProviderToolchain,
  visit: (references: readonly string[]) => CsharpProviderBindingResolution,
): CsharpProviderBindingResolution {
  if (preparation.project.kind === "user-owned") {
    const acquired = acquireUserReferences(preparation.project.projectFile, preparation, toolchain);
    return acquired.kind === "rejected" ? acquired : visit(acquired.value);
  }
  const references = new Set<string>();
  for (const project of preparation.projects) {
    const acquired = acquireGeneratedProject(project, preparation, toolchain);
    if (acquired.kind === "rejected") return acquired;
    for (const reference of acquired.value) references.add(reference);
    const selected = visit(Object.freeze([...references]));
    if (selected.kind !== "missing") return selected;
  }
  return Object.freeze({ kind: "missing" });
}

function acquireGeneratedProject(
  project: CsharpRuntimeProjectInstance,
  preparation: CsharpProviderRuntimePreparation,
  toolchain: DotnetProviderToolchain,
): NativeResult<readonly string[]> {
  publishText(project.path, project.text);
  const lock = acquireBuildLock(`${project.path}.metadata.lock`);
  if (lock.kind === "rejected") return lock;
  try {
    const directory = join(preparation.cacheRoot, "csharp", "runtime-metadata", hash(project.path));
    mkdirSync(directory, { recursive: true });
    const preprocessedPath = join(directory, "imports.xml");
    const arguments_ = nativeProperties(preparation, toolchain);
    const evaluated = evaluateProject(project.path, arguments_, preprocessedPath, toolchain);
    if (evaluated.kind === "rejected") return evaluated;
    const inputFingerprint = projectFingerprint(evaluated.value, preprocessedPath, preparation, toolchain);
    const proofPath = join(directory, "proof.json");
    const cached = readBuildProof(proofPath);
    if (cached !== undefined && cached.inputFingerprint === inputFingerprint &&
      validFileHashes(cached.outputs) && validFileHashes(cached.references)) {
      return { kind: "resolved", value: cached.references.map(reference => reference.path) };
    }
    const built = runNative([
      "build", project.path, "--nologo", "--verbosity", "quiet", "--no-incremental", `--maxcpucount:${nativeChildren()}`,
      "-p:BuildProjectReferences=false", "-p:UseSharedCompilation=false", ...arguments_,
    ], toolchain);
    if (built.kind === "rejected") return built;
    const after = evaluateProject(project.path, arguments_, preprocessedPath, toolchain);
    if (after.kind === "rejected") return after;
    if (projectFingerprint(after.value, preprocessedPath, preparation, toolchain) !== inputFingerprint) {
      return rejected("DOTNET_RUNTIME_METADATA_INPUTS_CHANGED", "Runtime MSBuild inputs changed while native metadata was being acquired.", { project: project.path });
    }
    const target = after.value.TargetResults?.GetTargetPath;
    if (target?.Result !== "Success" || target.Items.length !== 1) {
      return rejected("DOTNET_RUNTIME_METADATA_TARGET_MISSING", "The native runtime project did not publish one exact GetTargetPath result.", { project: project.path });
    }
    const output = target.Items[0]!;
    const reference = output.ReferenceAssembly === undefined || output.ReferenceAssembly.length === 0
      ? output.FullPath ?? output.Identity : output.ReferenceAssembly;
    const implementation = output.FullPath ?? output.Identity;
    if (reference === undefined || implementation === undefined || !isAbsolute(reference) ||
      !existsSync(reference) || !existsSync(implementation)) {
      return rejected("DOTNET_RUNTIME_METADATA_OUTPUT_MISSING", "The actual native runtime reference output is unavailable.", { project: project.path, reference, implementation });
    }
    const references = uniqueFiles([reference, ...referencePaths(after.value)]);
    const proof: RuntimeBuildProof = Object.freeze({
      inputFingerprint,
      outputs: Object.freeze(uniqueFiles([reference, implementation]).map(fileHash)),
      references: Object.freeze(references.map(fileHash)),
    });
    publishText(proofPath, JSON.stringify(proof));
    return { kind: "resolved", value: Object.freeze(references) };
  } finally {
    rmdirSync(`${project.path}.metadata.lock`);
  }
}

function acquireUserReferences(
  projectPath: string,
  preparation: CsharpProviderRuntimePreparation,
  toolchain: DotnetProviderToolchain,
): NativeResult<readonly string[]> {
  const result = runNative([
    "msbuild", projectPath, "-nologo", "-verbosity:quiet", `-maxcpucount:${nativeChildren()}`, "-restore", "-t:ResolveReferences",
    `-getProperty:${projectProperties}`, `-getItem:${projectItems}`, ...nativeProperties(preparation, toolchain),
  ], toolchain);
  if (result.kind === "rejected") return result;
  const facts = parseProjectFacts(result.value, projectPath);
  if (facts.kind === "rejected") return facts;
  const selected = validateSelectedSdk(facts.value, toolchain, projectPath);
  if (selected !== undefined) return selected;
  const references = referencePaths(facts.value);
  if (references.some(path => !existsSync(path))) {
    return rejected("DOTNET_RUNTIME_METADATA_OUTPUT_MISSING", "The user-owned native project resolved an unavailable reference assembly.", { project: projectPath, references });
  }
  const directory = join(preparation.cacheRoot, "csharp", "runtime-metadata", hash(projectPath));
  mkdirSync(directory, { recursive: true });
  const preprocessedPath = join(directory, "imports.xml");
  const preprocessed = runNative([
    "msbuild", projectPath, "-nologo", "-verbosity:quiet", `-maxcpucount:${nativeChildren()}`,
    `-preprocess:${preprocessedPath}`, ...nativeProperties(preparation, toolchain),
  ], toolchain);
  if (preprocessed.kind === "rejected") return preprocessed;
  const proof: RuntimeBuildProof = Object.freeze({
    inputFingerprint: projectFingerprint(facts.value, preprocessedPath, preparation, toolchain),
    outputs: Object.freeze(uniqueFiles((facts.value.Items.ReferencePath ?? []).filter(item =>
      item.ReferenceSourceTarget === "ProjectReference").map(item => item.ReferenceAssembly || item.FullPath || item.Identity || "")).map(fileHash)),
    references: Object.freeze(uniqueFiles(references).map(fileHash)),
  });
  publishText(join(directory, "proof.json"), JSON.stringify(proof));
  return { kind: "resolved", value: Object.freeze(uniqueFiles(references)) };
}

function evaluateProject(
  projectPath: string,
  arguments_: readonly string[],
  preprocessedPath: string,
  toolchain: DotnetProviderToolchain,
): NativeResult<NativeProjectFacts> {
  const evaluated = runNative([
    "msbuild", projectPath, "-nologo", "-verbosity:quiet", `-maxcpucount:${nativeChildren()}`, "-restore", "-p:BuildProjectReferences=false",
    "-t:ResolveReferences,GetTargetPath", "-getTargetResult:GetTargetPath",
    `-getProperty:${projectProperties}`, `-getItem:${projectItems}`, ...arguments_,
  ], toolchain);
  if (evaluated.kind === "rejected") return evaluated;
  const facts = parseProjectFacts(evaluated.value, projectPath);
  if (facts.kind === "rejected") return facts;
  const preprocessed = runNative([
    "msbuild", projectPath, "-nologo", "-verbosity:quiet", `-maxcpucount:${nativeChildren()}`, `-preprocess:${preprocessedPath}`, ...arguments_,
  ], toolchain);
  if (preprocessed.kind === "rejected") return preprocessed;
  const failure = validateSelectedSdk(facts.value, toolchain, projectPath);
  return failure ?? facts;
}

function validateSelectedSdk(
  facts: NativeProjectFacts,
  toolchain: DotnetProviderToolchain,
  project: string,
): Extract<NativeResult<never>, { readonly kind: "rejected" }> | undefined {
  return facts.Properties.NETCoreSdkVersion === toolchain.sdkVersion &&
    resolve(facts.Properties.MSBuildSDKsPath ?? "") === resolve(toolchain.sdkRoot, toolchain.sdkVersion, "Sdks") &&
    facts.Properties.TargetFramework === toolchain.targetFramework
    ? undefined : rejected("DOTNET_RUNTIME_METADATA_TOOLCHAIN_MISMATCH", "Runtime metadata must use the actual selected compilation SDK and framework.", {
      project, selectedSdk: toolchain.sdkVersion, actualSdk: facts.Properties.NETCoreSdkVersion,
      selectedFramework: toolchain.targetFramework, actualFramework: facts.Properties.TargetFramework,
    });
}

function parseProjectFacts(stdout: string, project: string): NativeResult<NativeProjectFacts> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return rejected("DOTNET_RUNTIME_METADATA_INVALID_QUERY", "MSBuild returned invalid native runtime project metadata.", { project, stdout });
  }
  if (!isRecord(parsed) || !isRecord(parsed.Properties) || !isRecord(parsed.Items) ||
    !Object.values(parsed.Properties).every(value => typeof value === "string") ||
    !Object.values(parsed.Items).every(value => Array.isArray(value) && value.every(item =>
      isRecord(item) && Object.values(item).every(field => typeof field === "string")))) {
    return rejected("DOTNET_RUNTIME_METADATA_INVALID_QUERY", "MSBuild returned an invalid native runtime project metadata shape.", { project });
  }
  if (parsed.TargetResults !== undefined && (!isRecord(parsed.TargetResults) ||
    !Object.values(parsed.TargetResults).every(value => isRecord(value) && typeof value.Result === "string" &&
      Array.isArray(value.Items) && value.Items.every(item => isRecord(item) && Object.values(item).every(field => typeof field === "string"))))) {
    return rejected("DOTNET_RUNTIME_METADATA_INVALID_QUERY", "MSBuild returned invalid native target-path evidence.", { project });
  }
  return { kind: "resolved", value: parsed as unknown as NativeProjectFacts };
}

function projectFingerprint(
  facts: NativeProjectFacts,
  preprocessedPath: string,
  preparation: CsharpProviderRuntimePreparation,
  toolchain: DotnetProviderToolchain,
): string {
  const inputs = uniqueFiles(Object.entries(facts.Items).flatMap(([kind, items]) =>
    kind === "ProjectReference" ? [] : items.map(item => item.ReferenceAssembly || item.FullPath || item.Identity || ""))
    .filter(path => isAbsolute(path) && existsSync(path)));
  return hash(JSON.stringify({
    importedProject: hash(readFileSync(preprocessedPath)),
    properties: facts.Properties,
    files: inputs.map(fileHash),
    sdk: toolchain,
    runtimeSources: preparation.sources,
    projects: preparation.projects,
    environment: hash(JSON.stringify(Object.entries(process.env).sort(([left], [right]) => left.localeCompare(right, "en")))),
  }));
}

function referencePaths(facts: NativeProjectFacts): readonly string[] {
  return (facts.Items.ReferencePath ?? []).map(item => item.ReferenceAssembly || item.FullPath || item.Identity || "")
    .filter(path => isAbsolute(path));
}

function nativeProperties(preparation: CsharpProviderRuntimePreparation, toolchain: DotnetProviderToolchain): readonly string[] {
  return Object.freeze([
    `-p:TargetFramework=${toolchain.targetFramework}`,
    ...preparation.properties.filter(property => property.name === "Configuration" || property.name === "Platform")
      .map(property => `-p:${property.name}=${property.value.replace(/%/gu, "%25").replace(/;/gu, "%3B")}`),
  ]);
}

function runNative(args: readonly string[], toolchain: DotnetProviderToolchain): NativeResult<string> {
  const result = spawnSync("dotnet", args, {
    cwd: toolchain.projectDirectory, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
  });
  return result.status === 0 ? { kind: "resolved", value: result.stdout } : rejected(
    "DOTNET_RUNTIME_METADATA_BUILD_FAILED", "The selected native runtime metadata acquisition failed.",
    { args, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.error?.message ?? result.stderr },
  );
}

function acquireBuildLock(path: string): NativeResult<true> {
  const started = performance.now();
  while (true) {
    try {
      mkdirSync(path);
      return { kind: "resolved", value: true };
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      if (performance.now() - started >= 120_000) {
        return rejected("DOTNET_RUNTIME_METADATA_BUILD_BUSY", "Timed out waiting for the actual runtime metadata build.", { path });
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

function readBuildProof(path: string): RuntimeBuildProof | undefined {
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.inputFingerprint !== "string" || !Array.isArray(parsed.outputs) ||
    !Array.isArray(parsed.references) || ![...parsed.outputs, ...parsed.references].every(entry =>
      isRecord(entry) && typeof entry.path === "string" && isAbsolute(entry.path) && typeof entry.sha256 === "string")) return undefined;
  return parsed as unknown as RuntimeBuildProof;
}

function validFileHashes(files: readonly NativeFileHash[]): boolean {
  return files.length > 0 && files.every(file => existsSync(file.path) && fileHash(file.path).sha256 === file.sha256);
}

function publishText(path: string, text: string): void {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `${randomUUID()}.tmp`);
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

function nativeChildren(): number {
  const children = Number(process.env.DOTNET_PROCESSOR_COUNT ?? "1");
  if (!Number.isSafeInteger(children) || children < 1) throw new TypeError("Native metadata builds require an explicit positive native child budget.");
  return children;
}

function uniqueFiles(files: readonly string[]): string[] {
  return [...new Set(files.map(path => resolve(path)))].sort();
}

function fileHash(path: string): NativeFileHash {
  return Object.freeze({ path, sha256: hash(readFileSync(path)) });
}

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejected(
  code: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): Extract<NativeResult<never>, { readonly kind: "rejected" }> {
  return Object.freeze({ kind: "rejected", diagnostic: dotnetExtensionDiagnostic(
    dotnetReflectionProviderIdentity.id, code, 9200000, message, [evidence],
  ) });
}
