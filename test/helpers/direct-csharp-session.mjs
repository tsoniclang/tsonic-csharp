import assert from "node:assert/strict";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  collectTargetSourceProfileContributions,
} from "../../../tsonic/packages/host/dist/index.js";
import {
  captureTargetCapabilityContributions,
  createTargetSourceCompilerComposition,
  getTargetRequiredProviderModules,
} from "../../../tsonic/packages/host/dist/target/extensions.js";
import {
  collectTargetSourcePackageGraph,
} from "../../../tsonic/packages/host/dist/source-package-inputs.js";
import {
  createTargetSourceProgram,
} from "../../../tsonic/packages/target-api/dist/public/source.js";
import {
  createCsharpTargetPack,
} from "../../dist/public/index.js";

function createCheckedCsharpSource(options) {
  const projectRoot = options.projectRoot ?? "/project";
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
  if (selectedSurfaces.some((surface) => surface === undefined)) {
    throw new Error("C# target pack does not expose the requested JavaScript surface.");
  }
  const selectedCapabilities = options.capabilities ?? [];
  const paths = {
    projectFilePath: `${projectRoot}/tsonic.json`,
    projectRoot,
    outputRoot: "/output",
    targetOutputRoot: "/output/csharp",
    cacheRoot: `${projectRoot}/.tsonic/cache`,
  };
  const sessionContext = {
    project,
    projectDirectory: projectRoot,
    target,
    paths,
    selectedSurfaceIds: selectedSurfaces.map((surface) => surface.id),
    capabilities: captureTargetCapabilityContributions({
      project,
      projectDirectory: projectRoot,
      target,
      selectedCapabilities,
      selectedSurfaces,
    }),
  };
  const targetSession = targetPack.createCompilationSession(sessionContext);
  const sourceProfile = collectTargetSourceProfileContributions({
    project,
    projectRoot,
    projectDirectory: projectRoot,
    target,
    targetPackId: targetPack.id,
    selectedCapabilities,
    selectedSurfaces,
    targetContributions: targetSession.sourceProfileContributions(),
  });
  if (sourceProfile.diagnostics.length !== 0) {
    targetSession.close();
    throw new Error(sourceProfile.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  const projectFiles = new Map([
    [`${projectRoot}/index.ts`, options.sourceText],
    ...normalizeAdditionalFiles(options.files, projectRoot),
  ]);
  const sourcePackages = collectTargetSourcePackageGraph(
    projectRoot,
    projectRoot,
    projectFiles,
  );
  const files = new Map([
    ...projectFiles,
    ...sourceProfile.files.map((file) => [file.path, file.text]),
  ]);
  const composition = createTargetSourceCompilerComposition({
    project,
    projectDirectory: projectRoot,
    target,
    targetPack,
    selectedCapabilities,
    selectedSurfaces,
    targetContributions: targetSession.sourceCompilerContributions(),
  });
  const compiler = createCompilerSessionFromFiles({
    currentDirectory: projectRoot,
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
        target,
        targetPack.provider,
        selectedCapabilities,
      ),
    },
  });
  const source = compiler.checkSource();
  return {
    compiler,
    source,
    sourcePackages,
    targetPack,
    targetSession,
    project,
    target,
    paths,
    sourceDiagnosticsText: formatDiagnostics(source.diagnostics),
    extensionDiagnostics: source.extensionDiagnostics,
  };
}

export function checkCsharpSource(options) {
  const checked = createCheckedCsharpSource(options);
  checked.targetSession.close();
  return checked;
}

export function compileCsharpSource(options) {
  const projectRoot = options.projectRoot ?? "/project";
  const checked = createCheckedCsharpSource(options);
  const runtime = checked.targetSession.runtimeContributions();
  let compiled;
  try {
    compiled = checked.targetSession.compile({
      source: createTargetSourceProgram(checked.source),
      sourcePackages: checked.sourcePackages,
      project: checked.project,
      target: checked.target,
      runtimeReferences: [
        ...(runtime.references ?? []),
        ...(options.runtimeReferences ?? []),
      ],
      paths: checked.paths,
    });
  } finally {
    checked.targetSession.close();
  }
  const result = {
    artifacts: compiled.kind === "resolved" ? compiled.value.artifacts : [],
    diagnostics: compiled.diagnostics,
  };
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

export function assertCsharpCompilationSucceeded(compiled) {
  assertCsharpCheckingSucceeded(compiled);
  assertEmptyDiagnosticCollection(
    "C# target compilation",
    compiled.result.diagnostics,
  );
}

export function assertCsharpCheckingSucceeded(compiled) {
  if (compiled.sourceDiagnosticsText !== "") {
    assert.fail(
      `C# source checking produced diagnostics:\n${truncateDiagnosticText(compiled.sourceDiagnosticsText)}`,
    );
  }
  assertEmptyDiagnosticCollection(
    "C# extension checking",
    compiled.extensionDiagnostics,
  );
}

function assertEmptyDiagnosticCollection(label, diagnostics) {
  if (!Array.isArray(diagnostics)) {
    assert.fail(`${label} returned a non-array diagnostic collection.`);
  }
  if (diagnostics.length === 0) {
    return;
  }
  const maximumDiagnostics = 8;
  const summary = diagnostics
    .slice(0, maximumDiagnostics)
    .map((diagnostic, index) => boundedDiagnosticSummary(diagnostic, index))
    .join("\n");
  const omitted = diagnostics.length > maximumDiagnostics
    ? `\n... ${diagnostics.length - maximumDiagnostics} additional diagnostic(s) omitted.`
    : "";
  assert.fail(
    `${label} produced ${diagnostics.length} diagnostic(s):\n${summary}${omitted}`,
  );
}

function boundedDiagnosticSummary(diagnostic, index) {
  if (diagnostic === null || typeof diagnostic !== "object") {
    return `${index + 1}. <invalid diagnostic>`;
  }
  const code = scalarDiagnosticCode(diagnostic);
  const message = typeof diagnostic.message === "string"
    ? truncateDiagnosticText(diagnostic.message)
    : "<missing message>";
  return `${index + 1}. ${code}: ${message}`;
}

function scalarDiagnosticCode(diagnostic) {
  for (const key of ["code", "extensionCode", "numericCode"]) {
    const value = diagnostic[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return "<missing code>";
}

function truncateDiagnosticText(text) {
  const maximumCodeUnits = 512;
  return text.length <= maximumCodeUnits
    ? text
    : `${text.slice(0, maximumCodeUnits)}... <truncated>`;
}

function normalizeAdditionalFiles(files, projectRoot) {
  if (files === undefined) {
    return [];
  }
  const entries = files instanceof Map ? [...files] : Object.entries(files);
  return entries.map(([path, text]) => [
    path.startsWith("/") ? path : `${projectRoot}/${path}`,
    text,
  ]);
}
