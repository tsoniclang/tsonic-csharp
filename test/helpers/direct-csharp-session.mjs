import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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
import { collectTstsDiagnostics } from "../../../tsonic/packages/host/dist/diagnostics.js";
import {
  createTargetSourceProgram,
} from "../../../tsonic/packages/target-api/dist/public/source.js";
import {
  createCsharpTargetPack,
} from "../../dist/public/index.js";
import { createCsharpCompilationSession } from "../../dist/compilation/session.js";
import {
  resolvedTargetStage,
  runTargetCompilationStages,
} from "../../../tsonic/packages/target-api/dist/public/artifacts.js";
import { analyzeCsharpAnalysisProgram, sealCsharpAnalysisProgram } from "../../dist/analysis/program/index.js";
import { planCsharpOutput } from "../../dist/backend/planner/program/planning.js";
import { createCsharpPlanningContext } from "../../dist/backend/planner/context.js";
import { materializeCsharpOutputPlan } from "../../dist/backend/emission/materialize.js";
import { compileWithCsharpReferenceValidation } from "../../dist/backend/compile.js";

// The stages of compileCsharpTarget, with the observer receiving the complete analysis program (records plus the
// analysis catalogs) so analysis tests can read the catalogs. The planner receives the sealed program exactly as
// analyzeCsharpTargetProgram produces it.
export function compileCsharpAnalysisTarget(request, observer) {
  let analysis;
  return compileWithCsharpReferenceValidation(request, () => runTargetCompilationStages({
    analyze: () => {
      const analyzed = analyzeCsharpAnalysisProgram(request);
      if (analyzed.kind === "rejected") return analyzed;
      analysis = analyzed.value;
      return resolvedTargetStage(sealCsharpAnalysisProgram(analyzed.value), analyzed.diagnostics);
    },
    plan: program => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  }, { analyzed: () => observer?.analyzed?.(analysis), planned: value => observer?.planned?.(value) }));
}

function createCheckedCsharpSource(options) {
  const projectRoot = options.projectRoot ?? "/project";
  const cacheRoot = options.cacheRoot ?? fileURLToPath(
    new URL("../../.temp/direct-csharp-session-cache/", import.meta.url),
  );
  const targetPack = createCsharpTargetPack();
  const target = {
    id: "csharp",
    ...(options.surface === "js" ? { surfaces: ["js"] } : {}),
    options: { outputType: "Library", ...options.targetOptions },
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
    cacheRoot,
  };
  const sessionContext = {
    project,
    projectDirectory: options.projectDirectory ?? fileURLToPath(new URL("../../", import.meta.url)),
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
  const targetSession = options.compileTarget === undefined
    ? targetPack.createCompilationSession(sessionContext)
    : createCsharpCompilationSession(sessionContext, options.compileTarget);
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
  const sourcePackages = options.sourcePackages ?? collectTargetSourcePackageGraph(
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
      // Real projects compile with module nodenext under a type-module package, so every project file is a module.
      // esnext with the default detection would treat import-free fixtures as scripts and reject top-level await.
      moduleDetection: "force",
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

// Analysis only, through the session's real provider acquisition and relation resolver (the analysis acquires runtime
// metadata and native inheritance before it seals). Returns the complete analysis result and the request's source.
export function analyzeCsharpSource(options) {
  let analysis;
  let source;
  let providers;
  const checked = createCheckedCsharpSource({ ...options, compileTarget: request => {
    source = request.input.source;
    providers = request.providers;
    analysis = analyzeCsharpAnalysisProgram(request);
    return analysis.kind === "rejected" ? analysis : { kind: "resolved", diagnostics: analysis.diagnostics, value: { artifacts: [] } };
  } });
  try {
    const runtime = checked.targetSession.runtimeContributions();
    checked.targetSession.compile({
      source: createTargetSourceProgram(checked.source),
      sourcePackages: checked.sourcePackages,
      project: checked.project,
      target: checked.target,
      runtimeActivatedCapabilityIds: [],
      runtimeReferences: [...(runtime.references ?? []), ...(options.runtimeReferences ?? [])],
      paths: checked.paths,
    });
  } finally {
    checked.targetSession.close();
  }
  assert.notEqual(analysis, undefined, "the session ran the C# analysis");
  return { ...checked, source, analysis, providers };
}

// Runs `use` with the complete analysis request of a real compilation session (its live providers, classified
// project and runtime acquisition), then finishes that compilation. C# member naming reads the native System.Object
// and System.ValueType member inventories, so analysis cannot run against an empty provider resolver.
export function withCsharpSessionRequest(options, use) {
  let reached = false;
  let value;
  const compiled = compileCsharpSource({ ...options, compileTarget(request, observer) {
    reached = true;
    value = use(request);
    return compileCsharpAnalysisTarget(request, observer);
  } });
  assert.equal(reached, true, `the checked source reaches the C# target: ${compiled.sourceDiagnosticsText}`);
  return { compiled, value };
}

export function compileCsharpSource(options) {
  const projectRoot = options.projectRoot ?? "/project";
  let program;
  let plan;
  const compileTarget = options.compileTarget ?? compileCsharpAnalysisTarget;
  const checked = createCheckedCsharpSource({ ...options, compileTarget: request => compileTarget(request, {
    analyzed(value) { program = value; },
    planned(value) { plan = value; },
  }) });
  const sourceDiagnostics = collectTstsDiagnostics(checked.source, projectRoot);
  let compiled;
  try {
    if (sourceDiagnostics.some(diagnostic => diagnostic.category === "error")) {
      compiled = { kind: "rejected", diagnostics: sourceDiagnostics };
    } else {
      const runtime = checked.targetSession.runtimeContributions();
      compiled = checked.targetSession.compile({
        source: createTargetSourceProgram(checked.source),
        sourcePackages: checked.sourcePackages,
        project: checked.project,
        target: checked.target,
        runtimeActivatedCapabilityIds: [],
        runtimeReferences: [
          ...(runtime.references ?? []),
          ...(options.runtimeReferences ?? []),
        ],
        paths: checked.paths,
      });
    }
  } finally {
    checked.targetSession.close();
  }
  const result = {
    artifacts: compiled.kind === "resolved" ? compiled.value.artifacts : [],
    diagnostics: compiled.diagnostics,
    program,
    plan,
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
