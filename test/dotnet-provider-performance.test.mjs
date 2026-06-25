import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
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

test(".NET provider telemetry exposes required performance counters", () => {
  const telemetry = createDotnetProviderTelemetry();
  telemetry.providerInstance();
  telemetry.request("module");
  telemetry.memoryCacheHit();
  telemetry.memoryCacheMiss();
  telemetry.diskCacheHit();
  telemetry.diskCacheMiss();
  telemetry.toolBuild(3.5);
  telemetry.toolInvocation("cli", 4.25);
  telemetry.modelBytes(128);
  telemetry.virtualDeclarations(2, 256, 1.25);
  telemetry.tstsProviderVirtualParse(5.75);
  telemetry.tstsProviderVirtualCheck(6.5);
  telemetry.generatedDotnetBuild(7.25);

  const snapshot = telemetry.snapshot();
  const counters = dotnetProviderTelemetryCounters(snapshot);

  assert.equal(counters["provider.instances"], 1);
  assert.equal(counters["provider.requests.total"], 1);
  assert.equal(counters["provider.cache.memory.hit"], 1);
  assert.equal(counters["provider.cache.memory.miss"], 1);
  assert.equal(counters["provider.cache.disk.hit"], 1);
  assert.equal(counters["provider.cache.disk.miss"], 1);
  assert.equal(counters["provider.tool.builds"], 1);
  assert.equal(counters["provider.tool.invocations"], 1);
  assert.equal(counters["provider.tool.mode.cli"], 1);
  assert.equal(counters["provider.tool.mode.server"], 0);
  assert.equal(counters["provider.model.bytes"], 128);
  assert.equal(counters["provider.virtualSource.bytes"], 256);
  assert.equal(counters["provider.virtualDeclarations.count"], 2);
  assert.equal(counters["tsts.providerVirtual.parseMs"], 5.75);
  assert.equal(counters["tsts.providerVirtual.checkMs"], 6.5);
  assert.equal(counters["generatedProject.dotnetBuild.elapsedMs"], 7.25);
  assert.match(formatDotnetProviderTelemetrySnapshot(snapshot), /provider\.requests\.byKind\.module=1/u);
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
  assert.equal(snapshot.toolCliInvocations, 2);
});
