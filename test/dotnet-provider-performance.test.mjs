import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  augmentDotnetModuleWithNativeArray,
  completeDotnetProviderContext,
  createDotnetProviderTelemetry,
  createDotnetReflectionProviderBroker,
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProvider,
  dotnetProviderTelemetryCounters,
  emptyIncrementalDotnetProviderMaterialization,
  formatDotnetProviderTelemetrySnapshot,
} from "../dist/providers/dotnet/index.js";
import { completeProviderDeclarationRequest, getCompleteDotnetModule } from "./dotnet-provider.helpers.mjs";
import {
  createDotnetProviderToolRunner,
} from "../dist/providers/dotnet/reflection/tool.js";
import {
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../dist/source/csharp-source-semantics/source-profile-declarations.js";

function providerRefExportNames(value, moduleSpecifier, refs = new Set()) {
  if (value === null || typeof value !== "object") {
    return refs;
  }
  if (value.kind === "provider-ref" && value.moduleSpecifier === moduleSpecifier) {
    refs.add(value.exportName);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      providerRefExportNames(item, moduleSpecifier, refs);
    }
    return refs;
  }
  for (const nested of Object.values(value)) {
    providerRefExportNames(nested, moduleSpecifier, refs);
  }
  return refs;
}

test(".NET provider telemetry exposes required performance counters", () => {
  const telemetry = createDotnetProviderTelemetry();
  telemetry.providerInstance();
  telemetry.request("module");
  telemetry.moduleRequest({ requestedExports: ["Convert"], requestedMetadataNames: ["System.Convert"] });
  telemetry.moduleRequest({ broadImport: true });
  telemetry.memoryCacheHit();
  telemetry.memoryCacheMiss();
  telemetry.diskCacheHit();
  telemetry.diskCacheMiss();
  telemetry.toolBuild(3.5);
  telemetry.toolProcessStart("cli");
  telemetry.toolProcessStart("server");
  telemetry.toolInvocation("cli", 4.25);
  telemetry.toolInvocation("server", 8.5);
  telemetry.modelBytes(128);
  telemetry.virtualDeclarations(2, 256, 1.25);
  telemetry.tstsProviderVirtualParse(5.75);
  telemetry.tstsProviderVirtualCheck(6.5);
  telemetry.generatedDotnetBuild(7.25);

  const snapshot = telemetry.snapshot();
  const counters = dotnetProviderTelemetryCounters(snapshot);

  assert.equal(counters["provider.instances"], 1);
  assert.equal(counters["provider.requests.total"], 1);
  assert.equal(counters["provider.requests.module.broad"], 1);
  assert.equal(counters["provider.requests.module.sliced"], 1);
  assert.equal(counters["provider.requests.module.requestedExports"], 1);
  assert.equal(counters["provider.requests.module.requestedTargetIds"], 0);
  assert.equal(counters["provider.requests.module.requestedMetadataNames"], 1);
  assert.equal(counters["provider.cache.memory.hit"], 1);
  assert.equal(counters["provider.cache.memory.miss"], 1);
  assert.equal(counters["provider.cache.disk.hit"], 1);
  assert.equal(counters["provider.cache.disk.miss"], 1);
  assert.equal(counters["provider.tool.builds"], 1);
  assert.equal(counters["provider.tool.processStarts"], 2);
  assert.equal(counters["provider.tool.processStarts.cli"], 1);
  assert.equal(counters["provider.tool.processStarts.server"], 1);
  assert.equal(counters["provider.tool.invocations"], 2);
  assert.equal(counters["provider.tool.mode.cli"], 1);
  assert.equal(counters["provider.tool.mode.server"], 1);
  assert.equal(counters["provider.model.bytes"], 128);
  assert.equal(counters["provider.virtualSource.bytes"], 256);
  assert.equal(counters["provider.virtualDeclarations.count"], 2);
  assert.equal(counters["tsts.providerVirtual.parseMs"], 5.75);
  assert.equal(counters["tsts.providerVirtual.checkMs"], 6.5);
  assert.equal(counters["generatedProject.dotnetBuild.elapsedMs"], 7.25);
  assert.match(formatDotnetProviderTelemetrySnapshot(snapshot), /provider\.requests\.byKind\.module=1/u);
  assert.match(formatDotnetProviderTelemetrySnapshot(snapshot), /provider\.requests\.module\.sliced=1/u);
});

test(".NET target binding provider records virtual declaration model metrics", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = {
    identity: {
      id: "test.dotnet-provider-performance",
      version: "1.0.0",
      target: "csharp",
      displayName: "Performance test provider",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(_specifier, context) {
      assert.equal(context.broadImport, true);
      return {
        moduleSpecifier: "@tsonic/dotnet/Example.js",
        namespaceName: "Example",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Widget",
          namespaceName: "Example",
          targetId: "Example.Assembly::Example.Widget",
          metadataName: "Example.Widget",
          members: [{
            kind: "method",
            sourceName: "create",
            targetName: "Create",
            targetId: "Example.Assembly::Example.Widget.Create",
            metadataName: "Example.Widget.Create()",
            static: true,
            signatures: [{
              id: "Example.Assembly::Example.Widget.Create()",
              sourceId: "Example.Assembly::Example.Widget.Create()",
              targetName: "Create",
              parameters: [],
              returnType: { kind: "void" },
            }],
          }],
        }],
      };
    },
    recordVirtualDeclarationModel(model, elapsedMs) {
      telemetry.virtualDeclarations(3, JSON.stringify(model).length, elapsedMs);
    },
  };
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = { broadImport: true };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", requestContext);
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));

  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.virtualDeclarationCount, 3);
  assert.equal(snapshot.virtualDeclarationBytes, JSON.stringify(declarationModel).length);
  assert.equal(snapshot.virtualDeclarationRenderMs >= 0, true);
});

test(".NET target binding provider preserves requested export slices for virtual declaration models", () => {
  const observedContexts = [];
  const provider = {
    identity: {
      id: "test.dotnet-provider-slicing",
      version: "1.0.0",
      target: "csharp",
      displayName: "Slicing test provider",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(_specifier, context) {
      observedContexts.push(context);
      return {
        moduleSpecifier: "@tsonic/dotnet/Example.js",
        namespaceName: "Example",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Widget",
          namespaceName: "Example",
          targetId: "Example.Assembly::Example.Widget",
          metadataName: "Example.Widget",
          members: [],
        }],
      };
    },
  };
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = { requestedExports: ["Widget"] };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", requestContext);
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));

  assert.equal(observedContexts.length, 1);
  assert.deepEqual(observedContexts[0].requestedExports, ["Widget"]);
  assert.equal(observedContexts[0].broadImport, undefined);
});

test(".NET native Array augmentation stays out of unrelated System export slices", () => {
  const module = augmentDotnetModuleWithNativeArray({
    moduleSpecifier: "@tsonic/dotnet/System.js",
    namespaceName: "System",
    exports: [{
      kind: "type",
      typeKind: "interface",
      sourceName: "IFormatProvider",
      namespaceName: "System",
      targetId: "Test.Assembly::System.IFormatProvider",
      metadataName: "System.IFormatProvider",
      members: [],
    }],
  }, {
    materialization: emptyIncrementalDotnetProviderMaterialization,
    requestedExports: ["IFormatProvider"],
  });

  assert.deepEqual(module.exports.map((declaration) => declaration.sourceName).sort(), ["IFormatProvider"]);
});

test(".NET target binding provider receives requested export slices from TSTS named imports end to end", () => {
  const observedContexts = [];
  const provider = {
    identity: {
      id: "test.dotnet-provider-tsts-import-slicing",
      version: "1.0.0",
      target: "csharp",
      displayName: "TSTS import slicing test provider",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(specifier, context) {
      observedContexts.push(context);
      assert.equal(specifier, "@tsonic/dotnet/System.js");
      assert.deepEqual(context.requestedExports, ["Convert"]);
      assert.notEqual(context.broadImport, true);
      return {
        moduleSpecifier: specifier,
        namespaceName: "System",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Convert",
          namespaceName: "System",
          targetId: "Test.Assembly::System.Convert",
          metadataName: "System.Convert",
          members: [],
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
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", `
        import { Convert as DotnetConvert } from "@tsonic/dotnet/System.js";
        export const convert = DotnetConvert;
      `],
      ["/src/node_modules/@tsonic/dotnet/package.json", JSON.stringify({
        name: "@tsonic/dotnet",
        version: "1.0.0",
        type: "module",
        exports: {
          "./System.js": {
            types: "./System.d.ts",
            default: "./System.js",
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
      extensions: [createDotnetBindingTestExtension(provider)],
    },
  });
  const checked = session.checkSource();
  const sourceFile = checked.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);

  assert.equal(formatDiagnostics(checked.diagnostics), "");
  assert.equal(observedContexts.length, 1);
});

test(".NET target binding provider rejects implicit broad virtual module requests", () => {
  let getModuleCalled = false;
  const provider = {
    identity: {
      id: "test.dotnet-provider-no-implicit-broad",
      version: "1.0.0",
      target: "csharp",
      displayName: "No implicit broad test provider",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule() {
      getModuleCalled = true;
      throw new Error("getModule must not run for an unsliced virtual module request.");
    },
  };
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", {});

  assert.equal(resolution.extensionCode, "DOTNET_PROVIDER_REQUEST_SLICE_REQUIRED", JSON.stringify(resolution));
  assert.equal(getModuleCalled, false);
});

test(".NET target binding provider rejects unsliced declaration model requests", () => {
  let getModuleCalled = false;
  const provider = {
    identity: {
      id: "test.dotnet-provider-unsliced-model",
      version: "1.0.0",
      target: "csharp",
      displayName: "Unsliced model test provider",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule() {
      getModuleCalled = true;
      throw new Error("getModule must not run for an unsliced declaration model request.");
    },
  };
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const declarationModel = bindingProvider.getDeclarationModel(
    {
      kind: "virtual",
      moduleSpecifier: "@tsonic/dotnet/Example.js",
      virtualFileName: "tsts-provider://test.dotnet-provider-unsliced-model/%40tsonic%2Fdotnet%2FExample.js/unsliced.d.ts",
      providerModuleId: "@tsonic/dotnet/Example.js",
    },
    completeProviderDeclarationRequest(),
  );

  assert.equal(declarationModel.extensionCode, "DOTNET_PROVIDER_REQUEST_SLICE_REQUIRED", JSON.stringify(declarationModel));
  assert.equal(getModuleCalled, false);
});

test(".NET target binding provider fails closed when a requested export is unproven", () => {
  const provider = {
    identity: {
      id: "test.dotnet-provider-missing-slice-export",
      version: "1.0.0",
      target: "csharp",
      displayName: "Missing sliced export test provider",
    },
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(specifier, context) {
      assert.equal(specifier, "@tsonic/dotnet/Example.js");
      assert.deepEqual(context.requestedExports, ["Widget"]);
      assert.notEqual(context.broadImport, true);
      return {
        moduleSpecifier: specifier,
        namespaceName: "Example",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Other",
          namespaceName: "Example",
          targetId: "Example.Assembly::Example.Other",
          metadataName: "Example.Other",
          members: [],
        }],
      };
    },
  };
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = { requestedExports: ["Widget"] };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", requestContext);
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal(declarationModel.extensionCode, "DOTNET_PROVIDER_REQUESTED_EXPORT_MISSING", JSON.stringify(declarationModel));
});

test(".NET reflection provider broker reuses module cache across provider instances", () => {
  const broker = createDotnetReflectionProviderBroker();
  const firstTelemetry = createDotnetProviderTelemetry();
  const firstProvider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    providerBroker: broker,
    telemetry: firstTelemetry,
  });
  const firstModule = getCompleteDotnetModule(firstProvider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in firstModule, true, JSON.stringify(firstModule));
  assert.equal(firstModule.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(firstProvider.getTelemetrySnapshot().toolInvocations, 2);

  const secondTelemetry = createDotnetProviderTelemetry();
  const secondProvider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    providerBroker: broker,
    telemetry: secondTelemetry,
  });
  const secondModule = getCompleteDotnetModule(secondProvider, "@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in secondModule, true, JSON.stringify(secondModule));
  assert.deepEqual(secondModule.exports.map((declaration) => declaration.sourceName), firstModule.exports.map((declaration) => declaration.sourceName));

  const secondSnapshot = secondProvider.getTelemetrySnapshot();
  assert.equal(secondSnapshot.toolInvocations, 0);
  assert.equal(secondSnapshot.memoryCacheHits, 2);
  assert.equal(secondSnapshot.memoryCacheMisses, 0);
  assert.equal(secondSnapshot.diskCacheHits, 0);
  assert.equal(secondSnapshot.diskCacheMisses, 0);
});

test(".NET reflection provider records metadata target-binding lookups as sliced module requests", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    telemetry,
  });

  const binding = provider.findTargetBindingByMetadataName("System.Convert");
  assert.ok(binding);
  assert.equal(binding.id.endsWith("::System.Convert"), true);

  const snapshot = provider.getTelemetrySnapshot();
  assert.equal(snapshot.toolInvocations, 1);
  assert.equal(snapshot.moduleBroadRequests, 0);
  assert.equal(snapshot.moduleSlicedRequests, 1);
  assert.equal(snapshot.moduleRequestedExports, 0);
  assert.equal(snapshot.moduleRequestedTargetIds, 0);
  assert.equal(snapshot.moduleRequestedMetadataNames, 1);
  assert.equal(snapshot.requestsByKind.targetBindingByMetadataName, 1);
  assert.equal(snapshot.requestsByKind.module, 1);
});

test(".NET reflection declaration slices avoid broad unrelated namespace surfaces", () => {
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    telemetry,
  });
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = { requestedExports: ["Convert"] };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", requestContext);
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));

  const declarationModel = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));
  assert.deepEqual(declarationModel.exports.map((declaration) => declaration.name), [
    "Convert",
    "Range",
    "SpanSplitEnumerator",
    "TryWriteInterpolatedStringHandler",
    "Base64FormattingOptions",
    "DateOnly",
    "DateTime",
    "DateTimeKind",
    "DateTimeOffset",
    "DayOfWeek",
    "Guid",
    "IComparable",
    "IComparable_1",
    "IEquatable",
    "IFormatProvider",
    "Index",
    "ModuleHandle",
    "ReadOnlySpan",
    "ReadOnlySpan_Enumerator",
    "RuntimeFieldHandle",
    "RuntimeMethodHandle",
    "RuntimeTypeHandle",
    "Span",
    "Span_Enumerator",
    "StringComparison",
    "StringSplitOptions",
    "TimeOnly",
    "TimeSpan",
    "Type",
    "TypeCode",
  ]);
  const convert = declarationModel.exports.find((declaration) => declaration.name === "Convert");
  assert.ok(convert);
  assert.deepEqual([...providerRefExportNames(convert, "@tsonic/dotnet/System.js")].sort(), [
    "Base64FormattingOptions",
    "DateTime",
    "IFormatProvider",
    "ReadOnlySpan",
    "Span",
    "Type",
    "TypeCode",
  ]);
  const serializedModel = JSON.stringify(declarationModel);
  assert.equal(serializedModel.includes("System.Xml"), false);
  assert.equal(serializedModel.includes("System.ComponentModel"), false);

  const snapshot = provider.getTelemetrySnapshot();
  assert.equal(snapshot.moduleBroadRequests, 0);
  assert.equal(snapshot.moduleSlicedRequests, 4);
  assert.equal(snapshot.moduleRequestedExports, 8);
});

test(".NET reflection provider tool filters target-binding lookups without broad namespace exports", () => {
  const telemetry = createDotnetProviderTelemetry();
  const runner = createDotnetProviderToolRunner({
    toolProjectPath: resolve("tools/dotnet-type-provider/DotnetTypeProvider.csproj"),
    toolBuildRoot: resolve(".temp/test-dotnet-type-provider-tool"),
    telemetry,
  });
  const byMetadata = runner.run([
    "--namespace",
    "System",
    "--module-specifier",
    "@tsonic/dotnet/System.js",
    "--metadata-name",
    "System.Convert",
    "--complete-all-exports",
  ]);
  assert.equal(byMetadata.status, 0, byMetadata.stderr);
  const metadataModel = JSON.parse(byMetadata.stdout);
  const metadataSourceNames = metadataModel.exports.map((declaration) => declaration.sourceName);
  assert.deepEqual(metadataSourceNames, [
    "Convert",
    "ArraySegment",
    "ArraySegment_Enumerator",
    "AsyncCallback",
    "Base64FormattingOptions",
    "Boolean",
    "Byte",
    "Char",
    "CharEnumerator",
    "DateOnly",
    "DateTime",
    "DateTimeKind",
    "DateTimeOffset",
    "DayOfWeek",
    "Decimal",
    "Delegate",
    "InvocationListEnumerator",
    "Double",
    "Enum",
    "Func_1",
    "Func_10",
    "Func_11",
    "Func_12",
    "Func_13",
    "Func_14",
    "Func_15",
    "Func_16",
    "Func_17",
    "Func_2",
    "Func_3",
    "Func_4",
    "Func_5",
    "Func_6",
    "Func_7",
    "Func_8",
    "Func_9",
    "Guid",
    "Half",
    "IAsyncResult",
    "ICloneable",
    "IComparable",
    "IComparable_1",
    "IConvertible",
    "IDisposable",
    "IEquatable",
    "IFormatProvider",
    "IFormattable",
    "IParsable",
    "ISpanFormattable",
    "ISpanParsable",
    "IUtf8SpanFormattable",
    "IUtf8SpanParsable",
    "Int128",
    "Int16",
    "Int32",
    "Int64",
    "IntPtr",
    "MidpointRounding",
    "ModuleHandle",
    "MulticastDelegate",
    "Object",
    "ReadOnlySpan",
    "ReadOnlySpan_Enumerator",
    "RuntimeFieldHandle",
    "RuntimeMethodHandle",
    "RuntimeTypeHandle",
    "SByte",
    "Single",
    "Span",
    "Span_Enumerator",
    "String",
    "StringComparison",
    "StringSplitOptions",
    "TimeOnly",
    "TimeSpan",
    "Type",
    "TypeCode",
    "UInt128",
    "UInt16",
    "UInt32",
    "UInt64",
    "UIntPtr",
    "ValueTuple",
    "ValueTuple_1",
    "ValueTuple_2",
    "ValueTuple_3",
    "ValueTuple_4",
    "ValueTuple_5",
    "ValueTuple_6",
    "ValueTuple_7",
    "ValueTuple_8",
    "ValueType",
  ]);
  assert.equal(metadataModel.targetOnlyTypes, undefined);
  assert.equal(metadataModel.unsupportedExports, undefined);

  const targetId = metadataModel.exports[0].targetId;
  assert.equal(typeof targetId, "string");
  const byTargetId = runner.run([
    "--namespace",
    "System",
    "--module-specifier",
    "@tsonic/dotnet/System.js",
    "--target-id",
    targetId,
  ]);
  assert.equal(byTargetId.status, 0, byTargetId.stderr);
  const targetIdModel = JSON.parse(byTargetId.stdout);
  const targetIdExports = targetIdModel.exports.map((declaration) => declaration.targetId);
  assert.equal(targetIdExports.includes(targetId), true);
  assert.equal(targetIdModel.exports.map((declaration) => declaration.sourceName).includes("Environment"), false);
  assert.equal(targetIdModel.targetOnlyTypes, undefined);

  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.toolInvocations, 2);
  assert.equal(snapshot.toolCliInvocations, 0);
  assert.equal(snapshot.toolServerInvocations, 2);
  assert.equal(snapshot.toolProcessStarts, 1);
  assert.equal(snapshot.toolCliProcessStarts, 0);
  assert.equal(snapshot.toolServerProcessStarts, 1);
});

function createDotnetBindingTestExtension(provider) {
  return {
    identity: {
      id: `${provider.identity.id}-extension`,
      version: provider.identity.version,
      capabilityNamespace: provider.identity.id,
    },
    initialize(context) {
      context.registerSourceDeclarationProvider(createDotnetSourceDeclarationProvider({ provider }));
    },
  };
}
