import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetProviderTelemetry,
  createDotnetSourceDeclarationProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../../../../dist/public/provider-dotnet.js";
import {
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../../../../dist/source/profiles/source-profile-declarations.js";

const systemCollectionsGenericModule = "@tsonic/dotnet/System.Collections.Generic.js";
const systemTasksModule = "@tsonic/dotnet/System.Threading.Tasks.js";

test(".NET reflection emits identity headers until the exact export is materialized", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const header = requireModule(provider.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([]),
  }));
  const listHeader = requireType(header, "List");

  assert.equal(listHeader.members, undefined);
  assert.equal(header.exports.every((declaration) => declaration.kind !== "type" || declaration.members === undefined), true);

  const completed = requireModule(provider.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([{
      exportName: "List",
      exportId: listHeader.targetId,
    }]),
  }));
  const list = requireType(completed, "List");
  const dependencyHeaders = completed.exports.filter((declaration) =>
    declaration.kind === "type" && declaration.targetId !== list.targetId);
  const listInterface = requireType(completed, "IList");

  assert.equal(list.members?.some((member) => member.sourceName === "Add"), true);
  assert.equal(listInterface.members, undefined);
  assert.equal(dependencyHeaders.every((declaration) => declaration.members === undefined), true);
});

test(".NET reflection preserves provider-family variants while completing required base heritage", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const header = requireModule(provider.getModule(systemTasksModule, {
    requestedExports: ["Task"],
    materialization: incremental([]),
  }));
  const variants = taskVariants(header);
  const generic = variants.find((declaration) => declaration.sourceTypeFamily.typeArgumentCount === 1);
  const nongeneric = variants.find((declaration) => declaration.sourceTypeFamily.typeArgumentCount === 0);
  assert.ok(generic);
  assert.ok(nongeneric);
  assert.equal(generic.members, undefined);
  assert.equal(nongeneric.members, undefined);

  const completed = requireModule(provider.getModule(systemTasksModule, {
    requestedExports: ["Task"],
    materialization: incremental([{
      exportName: "Task",
      exportId: generic.targetId,
    }]),
  }));
  const completedVariants = taskVariants(completed);
  const completedGeneric = completedVariants.find((declaration) => declaration.targetId === generic.targetId);
  const completedNongenericBase = completedVariants.find((declaration) => declaration.targetId === nongeneric.targetId);

  assert.equal(completedGeneric?.members?.some((member) => member.sourceName === "Result"), true);
  assert.equal(completedNongenericBase?.members?.some((member) => member.sourceName === "CompletedTask"), true);
  assert.equal(completedNongenericBase?.members?.some((member) => member.sourceName === "Result") ?? false, false);
});

test("header-only target bindings cannot satisfy a complete target lookup", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    telemetry,
  });
  const header = requireModule(provider.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([]),
  }));
  const listHeader = requireType(header, "List");

  const binding = provider.findTargetBindingByTargetId(listHeader.targetId);

  assert.ok(binding);
  assert.equal(binding.members?.some((member) => member.sourceName === "Add"), true);
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.moduleCompleteMaterializationRequests, 0);
  assert.equal(snapshot.moduleMaterializedExports, 1);
});

test("target relations materialize the exact selected provider export", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    telemetry,
  });
  const header = requireModule(provider.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([]),
  }));
  const listHeader = requireType(header, "List");

  const request = {
    moduleSpecifier: systemCollectionsGenericModule,
    providerModuleId: systemCollectionsGenericModule,
    artifactFileName: "tsts-provider://test/System.Collections.Generic.List.d.ts",
    exportName: "List",
    exportId: listHeader.targetId,
  };
  const relations = provider.resolveTargetRelations(request);

  assert.equal(Array.isArray(relations), true, JSON.stringify(relations));
  assert.equal(relations.some((relation) => relation.exportId === listHeader.targetId), true);
  const initialSnapshot = telemetry.snapshot();
  assert.equal(initialSnapshot.moduleCompleteMaterializationRequests, 0);
  assert.equal(initialSnapshot.moduleMaterializedExports, 1);

  let repeated;
  for (let index = 0; index < 250; index += 1) {
    repeated = provider.resolveTargetRelations({
      ...request,
      artifactFileName:
        `tsts-provider://test/physical-slice-${index}.d.ts`,
    });
    assert.strictEqual(repeated, relations);
  }
  const repeatedSnapshot = telemetry.snapshot();

  assert.equal(repeatedSnapshot.requestsTotal, initialSnapshot.requestsTotal);
  assert.equal(
    repeatedSnapshot.moduleIncrementalMaterializationRequests,
    initialSnapshot.moduleIncrementalMaterializationRequests,
  );
  assert.equal(
    repeatedSnapshot.virtualDeclarationCount,
    initialSnapshot.virtualDeclarationCount,
  );
  assert.equal(
    repeatedSnapshot.referenceSnapshotVerifications,
    initialSnapshot.referenceSnapshotVerifications + 250,
  );
});

test("cross-module inherited members materialize only the exact base export", () => {
  const baseModuleSpecifier = "@acme/dotnet/Base.js";
  const baseTargetId = "Acme::Example.Base";
  const observed = [];
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@acme/dotnet/Derived.js",
    namespaceName: "Example",
    exports: [{
      kind: "type",
      typeKind: "class",
      sourceName: "Derived",
      namespaceName: "Example",
      targetId: "Acme::Example.Derived",
      metadataName: "Example.Derived",
      baseType: {
        kind: "named",
        targetId: baseTargetId,
        metadataName: "Example.Base",
        sourceShape: {
          kind: "provider-ref",
          moduleSpecifier: baseModuleSpecifier,
          exportName: "Base",
        },
      },
      members: [method("Acme::Example.Derived.Read(System.Int32)", {
        kind: "source-primitive",
        name: "int32",
      })],
    }],
  }, {
    resolveModule(specifier, requestedExports, materialization) {
      observed.push({ specifier, requestedExports, materialization });
      const baseComplete = materialization.kind === "complete" ||
        materialization.completeExports.some((request) => request.exportId === baseTargetId);
      return {
        moduleSpecifier: baseModuleSpecifier,
        namespaceName: "Example",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Base",
          namespaceName: "Example",
          targetId: baseTargetId,
          metadataName: "Example.Base",
          ...(baseComplete ? {
            members: [method("Acme::Example.Base.Read(System.String)", { kind: "string" })],
          } : {}),
        }, {
          kind: "type",
          typeKind: "class",
          sourceName: "Unrelated",
          namespaceName: "Example",
          targetId: "Acme::Example.Unrelated",
          metadataName: "Example.Unrelated",
          ...(materialization.kind === "complete" ? {
            members: [method("Acme::Example.Unrelated.Read(System.String)", { kind: "string" })],
          } : {}),
        }],
      };
    },
  });

  assert.deepEqual(observed, [{
    specifier: baseModuleSpecifier,
    requestedExports: ["Base"],
    materialization: incremental([{
      exportName: "Base",
      exportId: baseTargetId,
    }]),
  }]);
  const derived = model.exports.find((declaration) => declaration.name === "Derived");
  const read = derived?.members?.find((member) => member.kind === "method" && member.name === "Read");
  assert.deepEqual(read?.signatures?.map((signature) => signature.id), [
    "Acme::Example.Base.Read(System.String)",
    "Acme::Example.Derived.Read(System.Int32)",
  ]);
  assert.deepEqual(model.imports?.flatMap((declaration) =>
    declaration.namedImports?.map((namedImport) => namedImport.exportedName) ?? []), ["Base"]);
});

test("source declaration requests carry their own immutable slice and materialization", () => {
  const observed = [];
  const dataProvider = {
    identity: {
      id: "test.dotnet.lazy-context",
      version: "1.0.0",
      target: "csharp",
      displayName: "Lazy context fixture",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(specifier, context) {
      observed.push(context);
      const sourceName = context.requestedExports[0];
      const complete = context.materialization.kind === "complete" ||
        context.materialization.completeExports.some((request) => request.exportName === sourceName);
      return {
        moduleSpecifier: specifier,
        namespaceName: "Example",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName,
          namespaceName: "Example",
          targetId: `Example.Assembly::Example.${sourceName}`,
          metadataName: `Example.${sourceName}`,
          ...(complete ? {
            members: [{
              kind: "property",
              sourceName: "Value",
              targetName: "Value",
              targetId: `Example.Assembly::Example.${sourceName}.Value`,
              metadataName: `Example.${sourceName}.Value`,
              readable: true,
              writable: false,
              type: { kind: "source-primitive", name: "int32" },
            }],
          } : {}),
        }],
      };
    },
  };
  const provider = createDotnetSourceDeclarationProvider({ provider: dataProvider });
  const firstContext = importContext("First");
  const secondContext = importContext("Second");
  const firstResolution = requireResolution(provider.resolveModule("@tsonic/dotnet/Example.js", firstContext));
  const secondResolution = requireResolution(provider.resolveModule("@tsonic/dotnet/Example.js", secondContext));

  const second = requireModel(provider.getDeclarationModel(secondResolution, {
    context: secondContext,
    materialization: incremental([{ exportName: "Second" }]),
  }));
  const first = requireModel(provider.getDeclarationModel(firstResolution, {
    context: firstContext,
    materialization: incremental([]),
  }));

  assert.deepEqual(second.exports.map((declaration) => declaration.name), ["Second"]);
  assert.deepEqual(second.exports[0].members?.map((member) => member.name), ["Value"]);
  assert.deepEqual(first.exports.map((declaration) => declaration.name), ["First"]);
  assert.equal(first.exports[0].members, undefined);
  assert.deepEqual(observed.map((context) => ({
    requestedExports: context.requestedExports,
    materialization: context.materialization,
  })), [{
    requestedExports: ["Second"],
    materialization: incremental([{ exportName: "Second" }]),
  }, {
    requestedExports: ["First"],
    materialization: incremental([]),
  }]);
});

test("TSTS checking rebuilds the program after exact .NET export demand", () => {
  const observed = [];
  const targetId = "Example.Assembly::Example.Widget";
  const dataProvider = {
    identity: {
      id: "test.dotnet.lazy-session",
      version: "1.0.0",
      target: "csharp",
      displayName: "Lazy compiler-session fixture",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(specifier, context) {
      observed.push(context.materialization);
      const complete = context.materialization.kind === "complete" ||
        context.materialization.completeExports.some((request) => request.exportId === targetId);
      return {
        moduleSpecifier: specifier,
        namespaceName: "Example",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Widget",
          namespaceName: "Example",
          targetId,
          metadataName: "Example.Widget",
          ...(complete ? {
            members: [{
              kind: "property",
              sourceName: "Value",
              targetName: "Value",
              targetId: `${targetId}.Value`,
              metadataName: "Example.Widget.Value",
              static: true,
              readable: true,
              writable: false,
              type: { kind: "source-primitive", name: "int32" },
            }],
          } : {}),
        }],
      };
    },
  };
  const sourceProfileDeclarations = csharpSourceProfileContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    projectDirectory: "/src",
    target: { id: "csharp" },
    paths: {
      projectFilePath: "/src/tsonic.json",
      projectRoot: "/src",
      outputRoot: "/src/out",
      targetOutputRoot: "/src/out/csharp",
      cacheRoot: "/src/.tsonic/cache",
    },
    selectedSurfaceIds: [],
    capabilities: [],
  }).declarations ?? [];
  const extension = {
    identity: {
      id: "test.dotnet.lazy-session.extension",
      version: "1.0.0",
    },
    initialize(context) {
      context.registerSourceDeclarationProvider(createDotnetSourceDeclarationProvider({ provider: dataProvider }));
    },
  };
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", [
        'import { Widget } from "@tsonic/dotnet/Example.js";',
        "export const answer = Widget.Value;",
      ].join("\n")],
      ["/src/node_modules/@tsonic/dotnet/package.json", JSON.stringify({
        name: "@tsonic/dotnet",
        version: "1.0.0",
        type: "module",
        exports: {
          "./Example.js": {
            types: "./Example.d.ts",
            default: "./Example.js",
          },
        },
      })],
      ...sourceProfileDeclarations.map((declaration) => [
        `/src/.tsonic/source-profiles/${csharpSourceProfileOwnerId}/${declaration.fileName}`,
        declaration.text,
      ]),
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [extension],
    },
  });
  const initialProgram = session.program;

  const checked = session.checkSource();

  assert.equal(formatDiagnostics(checked.diagnostics), "");
  assert.notEqual(checked.program, initialProgram);
  assert.deepEqual(observed, [
    incremental([]),
    incremental([{ exportName: "Widget", exportId: targetId }]),
  ]);
});

test("persistent reflection cache isolates identity headers from exact completed exports", () => {
  const cacheRoot = join(
    process.cwd(),
    ".temp/provider-cache/dotnet-reflection-lazy-materialization",
    `${Date.now()}-${process.pid}`,
  );
  const populate = createDotnetReflectionTypeDataProvider({ cacheRoot });
  const initialHeader = requireModule(populate.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([]),
  }));
  const listHeader = requireType(initialHeader, "List");
  const completion = incremental([{
    exportName: "List",
    exportId: listHeader.targetId,
  }]);
  const initialComplete = requireModule(populate.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: completion,
  }));
  assert.equal(requireType(initialHeader, "List").members, undefined);
  assert.equal(requireType(initialComplete, "List").members?.some((member) => member.sourceName === "Add"), true);

  const telemetry = createDotnetProviderTelemetry();
  const replay = createDotnetReflectionTypeDataProvider({ cacheRoot, telemetry });
  const cachedComplete = requireModule(replay.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: completion,
  }));
  const cachedHeader = requireModule(replay.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([]),
  }));

  assert.deepEqual(cachedComplete, initialComplete);
  assert.deepEqual(cachedHeader, initialHeader);
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.toolInvocations, 0);
  assert.equal(snapshot.diskCacheHits, 2);
  assert.equal(snapshot.moduleCompleteMaterializationRequests, 0);
  assert.equal(snapshot.moduleIncrementalMaterializationRequests, 2);
  assert.equal(snapshot.moduleMaterializedExports, 1);
});

function incremental(completeExports) {
  return {
    kind: "incremental",
    completeExports,
  };
}

function method(id, parameterType) {
  return {
    kind: "method",
    sourceName: "Read",
    targetName: "Read",
    targetId: id,
    metadataName: id,
    signatures: [{
      id,
      sourceId: id,
      targetName: "Read",
      parameters: [{
        name: "value",
        type: parameterType,
        passingMode: "by-value",
      }],
      returnType: { kind: "void" },
    }],
  };
}

function importContext(exportName) {
  return {
    containingFile: "/src/index.ts",
    resolutionMode: "import",
    importSlice: {
      moduleSpecifier: "@tsonic/dotnet/Example.js",
      kind: "named",
      requestedExports: [{ exportedName: exportName, kind: "type" }],
      typeOnly: true,
    },
  };
}

function requireModule(result) {
  assert.equal("exports" in result, true, JSON.stringify(result));
  return result;
}

function requireType(module, sourceName) {
  const declaration = module.exports.find((candidate) =>
    candidate.kind === "type" && candidate.sourceName === sourceName);
  assert.ok(declaration, `Missing ${sourceName}`);
  return declaration;
}

function taskVariants(module) {
  return module.exports.filter((declaration) =>
    declaration.kind === "type" && declaration.sourceTypeFamily?.exportName === "Task");
}

function requireResolution(result) {
  assert.equal(result.kind, "virtual", JSON.stringify(result));
  return result;
}

function requireModel(result) {
  assert.equal("exports" in result, true, JSON.stringify(result));
  return result;
}
