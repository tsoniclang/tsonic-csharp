import assert from "node:assert/strict";
import test from "node:test";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProvider,
} from "../dist/index.js";
import {
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../dist/source/csharp-source-semantics/source-profile-declarations.js";

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

  assert.equal((list.members?.length ?? 0) > 0, true);
  assert.equal(dependencyHeaders.length > 0, true);
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

  assert.equal((completedGeneric?.members?.length ?? 0) > 0, true);
  assert.equal((completedNongenericBase?.members?.length ?? 0) > 0, true);
  assert.equal(completedGeneric?.members?.some((member) => member.sourceName === "Result"), true);
  assert.equal(completedNongenericBase?.members?.some((member) => member.sourceName === "Result") ?? false, false);
});

test("header-only target bindings cannot satisfy a complete target lookup", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const header = requireModule(provider.getModule(systemCollectionsGenericModule, {
    requestedExports: ["List"],
    materialization: incremental([]),
  }));
  const listHeader = requireType(header, "List");

  const binding = provider.findTargetBindingByTargetId(listHeader.targetId);

  assert.ok(binding);
  assert.equal((binding.members?.length ?? 0) > 0, true);
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
  assert.equal((second.exports[0].members?.length ?? 0) > 0, true);
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
    target: { id: "csharp" },
    targetPack: { id: "csharp", displayName: "C#" },
    selectedCapabilities: [],
    selectedSurfaces: [],
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

function incremental(completeExports) {
  return {
    kind: "incremental",
    completeExports,
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
