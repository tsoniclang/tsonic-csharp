import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { buildDotnetProject, restoreDotnetProject } from "./dotnet-execution.mjs";
import { testWorkspaceRoot } from "../../../tsonic/test/scripts/workspace-layout.mjs";

export function nativeRuntimeLayout(workspaceRoot = testWorkspaceRoot) {
  if (!isAbsolute(workspaceRoot)) throw new Error("Native runtime preparation requires an absolute checkout root.");
  const csharp = join(workspaceRoot, "tsonic-csharp");
  const output = join(csharp, ".temp", "native-runtime");
  return Object.freeze({
    workspaceRoot: resolve(workspaceRoot),
    runtimeProject: join(workspaceRoot, "csharp-runtime", "src", "Tsonic.CSharp.Runtime", "Tsonic.CSharp.Runtime.csproj"),
    jsProject: join(workspaceRoot, "csharp-js", "src", "Tsonic.CSharp.Js", "Tsonic.CSharp.Js.csproj"),
    nodeProject: join(workspaceRoot, "csharp-nodejs", "csharp", "src", "Tsonic.CSharp.Node", "Tsonic.CSharp.Node.csproj"),
    proofProject: join(csharp, "test", "fixtures", "native-construction", "NativeConstruction.csproj"),
    output,
    manifest: join(output, "manifest.json"),
  });
}

export function prepareNativeRuntime(layout = nativeRuntimeLayout()) {
  mkdirSync(layout.output, { recursive: true });
  const options = { cwd: join(layout.workspaceRoot, "tsonic-csharp"), encoding: "utf8", timeout: 240_000, maxBuffer: 8_388_608 };
  const argumentsList = ["-c", "Release", "--verbosity", "quiet",
    `-p:TsonicRuntimeArtifactsPath=${join(layout.output, "artifacts")}${sep}`,
    "-target:Build", "-getProperty:TargetPath,TargetFramework,RuntimeIdentifier,ProjectAssetsFile",
    "-getItem:ReferenceCopyLocalPaths,FrameworkReference,RuntimeCopyLocalItems,NativeCopyLocalItems,ResourceCopyLocalItems,RuntimeTargetsCopyLocalItems"];
  const js = nativeOutput(buildDotnetProject(layout.jsProject, argumentsList, options), "Runtime and JS build");
  const native = nativeOutput(buildDotnetProject(layout.nodeProject,
    [...argumentsList, "-p:BuildProjectReferences=false"], options), "Node build using its prebuilt native references");
  const paths = [js.Properties?.TargetPath, native.Properties?.TargetPath,
    ...(js.Items?.ReferenceCopyLocalPaths ?? []).map(item => item.FullPath ?? item.Identity),
    ...(native.Items?.ReferenceCopyLocalPaths ?? []).map(item => item.FullPath ?? item.Identity)];
  if (paths.some(path => typeof path !== "string" || !isAbsolute(path) || !existsSync(path))) {
    throw new Error("Native runtime build did not publish existing absolute assembly paths.");
  }
  const assemblies = Object.fromEntries(["Tsonic.CSharp.Runtime", "Tsonic.CSharp.Js", "Tsonic.CSharp.Node"].map(name => {
    const matches = [...new Set(paths)].filter(path => basename(path) === `${name}.dll`);
    if (matches.length !== 1) throw new Error(`Native runtime build must identify exactly one ${name} assembly.`);
    return [name, matches[0]];
  }));
  const restored = nativeOutput(restoreDotnetProject(layout.proofProject,
    ["-verbosity:quiet", "-p:Configuration=Release", "-getProperty:ProjectAssetsFile,TargetFramework,RuntimeIdentifier"], options),
    "Generated native proof graph restore");
  const assets = restored.Properties?.ProjectAssetsFile;
  const framework = restored.Properties?.TargetFramework;
  if (typeof assets !== "string" || !isAbsolute(assets) || !existsSync(assets) ||
      typeof framework !== "string" || framework.length === 0 || native.Properties?.TargetFramework !== framework) {
    throw new Error("Native restore did not publish its exact assets and target framework.");
  }
  const graph = JSON.parse(readFileSync(assets, "utf8"));
  if (resolve(graph.project?.restore?.projectPath ?? "") !== layout.proofProject ||
      graph.project?.frameworks?.[framework] === undefined ||
      Object.keys(graph.libraries ?? {}).length !== 0 ||
      Object.keys(graph.project.frameworks[framework].dependencies ?? {}).length !== 0) {
    throw new Error("Shared native proof restore must retain its own pinned framework-only project graph.");
  }
  const manifest = {
    workspaceRoot: layout.workspaceRoot,
    nodeProject: layout.nodeProject,
    proofProject: layout.proofProject,
    assemblies,
    nativeReferences: [...new Set(paths)],
    nativeFrameworks: native.Items?.FrameworkReference ?? [],
    nativeAssets: native.Properties?.ProjectAssetsFile,
    proofAssets: assets,
    framework,
    runtimeIdentifier: restored.Properties?.RuntimeIdentifier ?? "",
    sharedRestore: ["RuntimeCopyLocalItems", "NativeCopyLocalItems", "ResourceCopyLocalItems", "RuntimeTargetsCopyLocalItems"]
      .every(name => (js.Items?.[name] ?? []).length === 0) &&
      (js.Items?.FrameworkReference ?? []).every(item => item.IsImplicitlyDefined === "true") &&
      (js.Properties?.RuntimeIdentifier ?? "") === "",
  };
  const pending = `${layout.manifest}.${process.pid}`;
  writeFileSync(pending, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(pending, layout.manifest);
  return Object.freeze(manifest);
}

export function nativeConstructionProject(layout = nativeRuntimeLayout()) {
  const manifest = preparedRuntime(layout);
  return manifest.proofProject;
}

export function nativeRuntimeReferences(additionalReferences = [], layout = nativeRuntimeLayout()) {
  const manifest = preparedRuntime(layout);
  const runtimeProjects = new Set([layout.runtimeProject, layout.jsProject, layout.nodeProject]);
  const projects = additionalReferences.filter(path => !runtimeProjects.has(resolve(path)));
  const node = additionalReferences.some(path => resolve(path) === layout.nodeProject);
  const assemblies = [manifest.assemblies["Tsonic.CSharp.Runtime"], manifest.assemblies["Tsonic.CSharp.Js"],
    ...(node ? [manifest.assemblies["Tsonic.CSharp.Node"]] : [])];
  const references = assemblies.map(path =>
    `<Reference Include="${escapeXml(basename(path, ".dll"))}"><HintPath>${escapeXml(path)}</HintPath><Private>true</Private></Reference>`).join("");
  const graphReferences = [layout.runtimeProject, layout.jsProject, ...(node ? [layout.nodeProject] : [])]
    .map(path => `<ProjectReference Include="${escapeXml(path)}" BuildReference="false" />`).join("");
  return Object.freeze({ references, graphReferences, projects,
    sharedRestore: manifest.sharedRestore === true && !node && projects.length === 0 });
}

function preparedRuntime(layout) {
  if (!existsSync(layout.manifest)) throw new Error("Run the guarded C# native-runtime prerun before native construction tests.");
  const manifest = JSON.parse(readFileSync(layout.manifest, "utf8"));
  if (manifest.workspaceRoot !== layout.workspaceRoot || manifest.nodeProject !== layout.nodeProject ||
      manifest.proofProject !== layout.proofProject || !existsSync(manifest.proofProject) ||
      typeof manifest.proofAssets !== "string" || !existsSync(manifest.proofAssets) ||
      ["Tsonic.CSharp.Runtime", "Tsonic.CSharp.Js", "Tsonic.CSharp.Node"].some(name =>
        typeof manifest.assemblies?.[name] !== "string" || !isAbsolute(manifest.assemblies[name]) ||
        !existsSync(manifest.assemblies[name])) ||
      !Array.isArray(manifest.nativeReferences) ||
      manifest.nativeReferences.some(path => typeof path !== "string" || !isAbsolute(path) || !existsSync(path)) ||
      !Array.isArray(manifest.nativeFrameworks) ||
      manifest.nativeFrameworks.some(item => typeof item.Identity !== "string" || item.Identity.length === 0)) {
    throw new Error("Prepared native assemblies and restore graph do not belong to this checkout.");
  }
  return manifest;
}

function nativeOutput(result, operation) {
  if (result.status !== 0) {
    throw new Error(`${operation} failed: ${result.error ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return JSON.parse(result.stdout);
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
