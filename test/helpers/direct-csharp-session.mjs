import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  collectTargetSourceProfileContributions,
  createTargetSourceCompilerComposition,
  getTargetRequiredProviderModules,
} from "../../../tsonic/packages/host/dist/index.js";
import {
  createTargetSourceProgram,
} from "../../../tsonic/packages/target-api/dist/index.js";
import {
  createCsharpTargetPack,
} from "../../dist/descriptor/csharp-target-pack.js";

export function checkCsharpSource(options) {
  const targetPack = createCsharpTargetPack();
  const target = {
    id: "csharp",
    ...(options.surface === "js" ? { surfaces: ["js"] } : {}),
    ...(options.targetOptions === undefined ? {} : { options: options.targetOptions }),
  };
  const project = options.project ?? {
    entryPoint: "index.ts",
    rootDir: ".",
    targets: [target],
  };
  const selectedSurfaces = options.surface === "js"
    ? [targetPack.surfaces.find((surface) => surface.id === "js")]
    : [];
  const selectedCapabilities = options.capabilities ?? [];
  const targetContext = {
    project,
    projectDirectory: "/project",
    target,
    targetPack,
    selectedCapabilities,
    selectedSurfaces,
  };
  const sourceProfile = collectTargetSourceProfileContributions({
    project,
    projectRoot: "/project",
    target,
    targetPack,
    selectedCapabilities,
    selectedSurfaces,
  });
  if (sourceProfile.diagnostics.length !== 0) {
    throw new Error(sourceProfile.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  const files = new Map([
    ["/project/index.ts", options.sourceText],
    ...normalizeAdditionalFiles(options.files),
    ...sourceProfile.files.map((file) => [file.path, file.text]),
  ]);
  const composition = createTargetSourceCompilerComposition(targetContext);
  const compiler = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files,
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
      ...(options.compilerOptions ?? {}),
    },
    extensionHostOptions: {
      extensions: composition.extensions,
      requiredProviderModules: getTargetRequiredProviderModules(
        targetPack,
        target,
        selectedCapabilities,
      ),
    },
  });
  const source = compiler.checkSource();
  return {
    compiler,
    source,
    targetContext,
    sourceDiagnosticsText: formatDiagnostics(source.diagnostics),
    extensionDiagnostics: source.extensionDiagnostics,
  };
}

export function compileCsharpSource(options) {
  const checked = checkCsharpSource(options);
  const result = checked.targetContext.targetPack
    .createBackend(checked.targetContext)
    .compile({
      source: createTargetSourceProgram(checked.source),
      project: checked.targetContext.project,
      target: checked.targetContext.target,
      runtimeReferences: options.runtimeReferences ?? [],
      paths: {
        projectFilePath: "/project/tsonic.json",
        projectRoot: "/project",
        outputRoot: "/output",
        targetOutputRoot: "/output/csharp",
      },
    });
  return {
    ...checked,
    result,
    targetDiagnostics: result.diagnostics.map(
      ({ code, category, message, source, sourceSpan, evidence }) => ({
        code,
        category,
        message,
        ...(source === undefined ? {} : { source }),
        ...(sourceSpan === undefined ? {} : { sourceSpan }),
        ...(evidence === undefined ? {} : { evidence }),
      }),
    ),
    artifacts: new Map(result.artifacts.map((artifact) => [artifact.path, artifact.text])),
  };
}

function normalizeAdditionalFiles(files) {
  if (files === undefined) {
    return [];
  }
  const entries = files instanceof Map ? [...files] : Object.entries(files);
  return entries.map(([path, text]) => [
    path.startsWith("/") ? path : `/project/${path}`,
    text,
  ]);
}
