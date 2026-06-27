import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  augmentDotnetModuleWithNativeArray,
  createDotnetProviderTelemetry,
  createDotnetReflectionProviderBroker,
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  dotnetProviderTelemetryCounters,
  formatDotnetProviderTelemetrySnapshot,
} from "../dist/providers/dotnet/index.js";
import {
  createDotnetProviderToolRunner,
} from "../dist/providers/dotnet/reflection/tool.js";
import {
  createDotnetProviderDependencyModuleSpecifier,
} from "../dist/providers/dotnet/module-specifier.js";

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
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", { broadImport: true });
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));

  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.virtualDeclarationCount, 3);
  assert.equal(snapshot.virtualDeclarationBytes > 0, true);
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
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", { requestedExports: ["Widget"] });
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(resolution);
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
  }, { requestedExports: ["IFormatProvider"] });

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
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");
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
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
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
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const declarationModel = bindingProvider.getDeclarationModel({
    kind: "virtual",
    moduleSpecifier: "@tsonic/dotnet/Example.js",
    virtualFileName: "tsts-provider://test.dotnet-provider-unsliced-model/%40tsonic%2Fdotnet%2FExample.js/unsliced.d.ts",
    providerModuleId: "@tsonic/dotnet/Example.js",
  });

  assert.equal(declarationModel.extensionCode, "DOTNET_PROVIDER_REQUEST_SLICE_REQUIRED", JSON.stringify(declarationModel));
  assert.equal(getModuleCalled, false);
});

test(".NET target binding provider resolves dependency slices only from provider virtual files", () => {
  const observedContexts = new Map();
  const modules = new Map([
    ["@tsonic/dotnet/Example.js", {
      moduleSpecifier: "@tsonic/dotnet/Example.js",
      namespaceName: "Example",
      exports: [{
        kind: "type",
        typeKind: "class",
        sourceName: "Widget",
        namespaceName: "Example",
        targetId: "Example.Assembly::Example.Widget",
        metadataName: "Example.Widget",
        baseType: {
          kind: "named",
          targetId: "Example.Assembly::External.ExternalBase",
          metadataName: "External.ExternalBase",
          sourceShape: {
            kind: "provider-ref",
            name: "ExternalBase",
            moduleSpecifier: "@tsonic/dotnet/External.js",
          },
        },
        members: [],
      }],
    }],
    ["@tsonic/dotnet/External.js", {
      moduleSpecifier: "@tsonic/dotnet/External.js",
      namespaceName: "External",
      exports: [{
        kind: "type",
        typeKind: "class",
        sourceName: "ExternalBase",
        namespaceName: "External",
        targetId: "Example.Assembly::External.ExternalBase",
        metadataName: "External.ExternalBase",
        members: [],
      }, {
        kind: "type",
        typeKind: "class",
        sourceName: "Unrequested",
        namespaceName: "External",
        targetId: "Example.Assembly::External.Unrequested",
        metadataName: "External.Unrequested",
        members: [],
      }],
    }],
  ]);
  const provider = {
    identity: {
      id: "test.dotnet-provider-dependency-slices",
      version: "1.0.0",
      target: "csharp",
      displayName: "Dependency slice test provider",
    },
    ownsModule(specifier) {
      return modules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    getModule(specifier, context) {
      observedContexts.set(specifier, context);
      const module = modules.get(specifier);
      assert.ok(module, `Unexpected module request '${specifier}'.`);
      assert.notEqual(context.broadImport, true, `Unexpected broad dependency request for '${specifier}'.`);
      if (context.requestedExports === undefined) {
        throw new Error(`Expected requested export slice for '${specifier}'.`);
      }
      return {
        ...module,
        exports: module.exports.filter((declaration) => context.requestedExports.includes(declaration.sourceName)),
      };
    },
  };
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", { requestedExports: ["Widget"] });
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));
  const widget = declarationModel.exports.find((declaration) => declaration.name === "Widget");
  assert.ok(widget);
  const dependencySpecifier = widget.extends?.[0]?.moduleSpecifier;
  assert.match(dependencySpecifier, /^tsts-provider:\/\/tsonic-dotnet-dependency\//u);

  assert.equal(bindingProvider.ownsModule(dependencySpecifier, {}).kind, "unowned");
  const userResolution = bindingProvider.resolveModule(dependencySpecifier, {});
  assert.equal(userResolution.extensionCode, "DOTNET_MODULE_SPECIFIER_INVALID", JSON.stringify(userResolution));

  const dependencyResolution = bindingProvider.resolveModule(dependencySpecifier, { containingFile: resolution.virtualFileName });
  assert.equal(dependencyResolution.kind, "virtual");
  const canonicalizedDependencyResolution = bindingProvider.resolveModule(dependencySpecifier, {
    containingFile: resolution.virtualFileName.replace("tsts-provider://", "tsts-provider:/"),
  });
  assert.equal(canonicalizedDependencyResolution.kind, "virtual");
  assert.equal(dependencyResolution.providerModuleId, "@tsonic/dotnet/External.js");
  assert.equal(dependencyResolution.packageName, undefined);
  assert.deepEqual(dependencyResolution.requestedExports, ["ExternalBase"]);

  const dependencyModel = bindingProvider.getDeclarationModel(dependencyResolution);
  assert.equal("exports" in dependencyModel, true, JSON.stringify(dependencyModel));
  assert.deepEqual(dependencyModel.exports.map((declaration) => declaration.name), ["ExternalBase"]);
  assert.deepEqual(observedContexts.get("@tsonic/dotnet/External.js").requestedExports, ["ExternalBase"]);
});

test(".NET target binding provider derives declaration slices from encoded dependency modules", () => {
  const identity = {
    id: "test.dotnet-provider-encoded-dependency-slice",
    version: "1.0.0",
    target: "csharp",
    displayName: "Encoded dependency slice test provider",
  };
  const observedContexts = [];
  const provider = {
    identity,
    ownsModule() {
      return { kind: "owned" };
    },
    getModule(specifier, context) {
      observedContexts.push({ specifier, context });
      assert.equal(specifier, "@tsonic/dotnet/External.js");
      assert.deepEqual(context.requestedExports, ["ExternalBase"]);
      assert.notEqual(context.broadImport, true);
      return {
        moduleSpecifier: specifier,
        namespaceName: "External",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "ExternalBase",
          namespaceName: "External",
          targetId: "Example.Assembly::External.ExternalBase",
          metadataName: "External.ExternalBase",
          members: [],
        }, {
          kind: "type",
          typeKind: "class",
          sourceName: "Unrequested",
          namespaceName: "External",
          targetId: "Example.Assembly::External.Unrequested",
          metadataName: "External.Unrequested",
          members: [],
        }],
      };
    },
  };
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const dependencySpecifier = createDotnetProviderDependencyModuleSpecifier(
    identity.id,
    "@tsonic/dotnet/External.js",
    ["ExternalBase"],
  );
  const declarationModel = bindingProvider.getDeclarationModel({
    kind: "virtual",
    moduleSpecifier: dependencySpecifier,
    virtualFileName: "tsts-provider://test.dotnet-provider-encoded-dependency-slice/dependency.d.ts",
    providerModuleId: "@tsonic/dotnet/External.js",
  });

  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));
  assert.deepEqual(declarationModel.exports.map((declaration) => declaration.name), ["ExternalBase"]);
  assert.equal(observedContexts.length, 1);
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
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Example.js", { requestedExports: ["Widget"] });
  assert.equal(resolution.kind, "virtual");

  const declarationModel = bindingProvider.getDeclarationModel(resolution);
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
  const firstModule = firstProvider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in firstModule, true, JSON.stringify(firstModule));
  assert.equal(firstModule.exports.some((declaration) => declaration.sourceName === "Convert"), true);
  assert.equal(firstProvider.getTelemetrySnapshot().toolInvocations, 1);

  const secondTelemetry = createDotnetProviderTelemetry();
  const secondProvider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    providerBroker: broker,
    telemetry: secondTelemetry,
  });
  const secondModule = secondProvider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal("exports" in secondModule, true, JSON.stringify(secondModule));
  assert.deepEqual(secondModule.exports.map((declaration) => declaration.sourceName), firstModule.exports.map((declaration) => declaration.sourceName));

  const secondSnapshot = secondProvider.getTelemetrySnapshot();
  assert.equal(secondSnapshot.toolInvocations, 0);
  assert.equal(secondSnapshot.memoryCacheHits, 1);
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
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", { requestedExports: ["Convert"] });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));

  const declarationModel = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in declarationModel, true, JSON.stringify(declarationModel));
  assert.deepEqual(declarationModel.exports.map((declaration) => declaration.name), ["Convert"]);
  const serializedModel = JSON.stringify(declarationModel);
  assert.equal(serializedModel.includes("System.Xml"), false);
  assert.equal(serializedModel.includes("System.ComponentModel"), false);

  const snapshot = provider.getTelemetrySnapshot();
  assert.equal(snapshot.moduleBroadRequests, 0);
  assert.equal(snapshot.moduleSlicedRequests >= 1, true);
  assert.equal(snapshot.moduleRequestedExports >= 1, true);
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
  ]);
  assert.equal(byMetadata.status, 0, byMetadata.stderr);
  const metadataModel = JSON.parse(byMetadata.stdout);
  const metadataSourceNames = metadataModel.exports.map((declaration) => declaration.sourceName);
  assert.equal(metadataSourceNames.includes("Convert"), true);
  assert.equal(metadataSourceNames.includes("Console"), false);
  assert.equal(metadataSourceNames.includes("Environment"), false);
  assert.equal(metadataSourceNames.length < 40, true);
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
      context.registerTargetBindingProvider(createDotnetTargetBindingProvider({ provider }));
    },
  };
}
