import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  csharpApplyExternAliasToTargetBinding,
  createDotnetModuleSpecifierPolicy,
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  parseDotnetModuleSpecifier,
  printCsharpType,
} from "../dist/index.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test(".NET reflection provider does not first-win duplicate source names from different assemblies", () => {
  const { acmeDll, contosoDll } = buildAssemblyIdentityFixtures();
  const provider = createDotnetReflectionTypeDataProvider({ references: [acmeDll, contosoDll] });
  const module = provider.getModule("@tsonic/dotnet/Shared.js", {});
  assert.equal("exports" in module, true, JSON.stringify(module));

  const widgetExports = module.exports.filter(isSharedWidgetDeclaration);
  assert.notEqual(
    widgetExports.length,
    1,
    "Shared.Widget from Acme.Contracts and Contoso.Contracts must not collapse into one normal source export.",
  );
  assert.equal(
    provider.findTargetBindingByTargetId("Shared.Widget"),
    undefined,
    "Metadata-name-only target id Shared.Widget must not resolve by first-wins behavior across assemblies.",
  );

  if (widgetExports.length === 0) {
    const unsupportedWidget = module.unsupportedExports?.find((declaration) => declaration.sourceName === "Widget");
    assert.ok(unsupportedWidget, "Duplicate Shared.Widget exports must leave explicit unsupported export evidence.");
    assertAssemblyCollisionEvidence(unsupportedWidget);
    return;
  }

  assert.equal(widgetExports.length, 2, "Distinct assembly-qualified handling must expose exactly both Widget identities.");
  assertDistinctAssemblyQualifiedIdentities(widgetExports);
});

test(".NET reflection provider records assembly reference facts on supported modules and types", () => {
  const acmeDll = buildAssemblyIdentityFixture("Acme.Contracts", "acme");
  const provider = createDotnetReflectionTypeDataProvider({ references: [acmeDll] });
  const module = provider.getModule("@tsonic/dotnet/Shared.js", {});
  assert.equal("exports" in module, true, JSON.stringify(module));

  assertAssemblyReference(module.assembly, "Acme.Contracts");
  assert.equal(module.assembly.path.endsWith("Acme.Contracts.dll"), true);

  const widget = module.exports.find(isSharedWidgetDeclaration);
  assert.ok(widget, "Expected Shared.Widget to be a normal supported export with one referenced assembly.");
  assertAssemblyReference(widget.assembly, "Acme.Contracts");
  assert.equal(widget.assembly.path.endsWith("Acme.Contracts.dll"), true);
  assert.equal(module.unsupportedExports, undefined);
});

test("installed .NET provider packages separate same-namespace same-name types by explicit assembly ownership", () => {
  const { acmeDll, contosoDll } = buildAssemblyIdentityFixtures();
  const sourcePackages = [
    { assemblyName: "Acme.Contracts", packageName: "@acme/native" },
    { assemblyName: "Contoso.Contracts", packageName: "@contoso/native" },
  ];
  const acmePolicy = createDotnetModuleSpecifierPolicy("@acme/native");
  const contosoPolicy = createDotnetModuleSpecifierPolicy("@contoso/native");
  const acmeProvider = createDotnetReflectionTypeDataProvider({
    providerIdentity: providerIdentity("acme"),
    moduleSpecifierPolicy: acmePolicy,
    assemblySourcePackages: sourcePackages,
    references: [acmeDll, contosoDll],
    disablePersistentCache: true,
  });
  const contosoProvider = createDotnetReflectionTypeDataProvider({
    providerIdentity: providerIdentity("contoso"),
    moduleSpecifierPolicy: contosoPolicy,
    assemblySourcePackages: sourcePackages,
    references: [acmeDll, contosoDll],
    disablePersistentCache: true,
  });

  const acmeModule = acmeProvider.getModule("@acme/native/Shared.js", { requestedExports: ["Widget"] });
  const contosoModule = contosoProvider.getModule("@contoso/native/Shared.js", { requestedExports: ["Widget"] });
  assert.equal("exports" in acmeModule, true, JSON.stringify(acmeModule));
  assert.equal("exports" in contosoModule, true, JSON.stringify(contosoModule));
  assert.deepEqual(acmeModule.exports.filter(isSharedWidgetDeclaration).map((declaration) => assemblySimpleNameFromTargetId(declaration.targetId)), ["Acme.Contracts"]);
  assert.deepEqual(contosoModule.exports.filter(isSharedWidgetDeclaration).map((declaration) => assemblySimpleNameFromTargetId(declaration.targetId)), ["Contoso.Contracts"]);

  const acmeBindingProvider = createDotnetTargetBindingProvider({ provider: acmeProvider, moduleSpecifierPolicy: acmePolicy });
  const acmeResolution = acmeBindingProvider.resolveModule("@acme/native/Shared.js", { requestedExports: ["Widget"] });
  assert.equal(acmeResolution.kind, "virtual", JSON.stringify(acmeResolution));
  assert.equal(acmeResolution.packageName, "@acme/native");
  assert.equal(acmeBindingProvider.ownsModule("@contoso/native/Shared.js", {}).kind, "unowned");
});

test(".NET target binding provider reports assembly-qualified unsupported export diagnostics", () => {
  const { acmeDll, contosoDll } = buildAssemblyIdentityFixtures();
  const provider = createDotnetReflectionTypeDataProvider({ references: [acmeDll, contosoDll] });
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Shared.js", {
    containingFile: "assembly-collision.ts",
    requestedExports: ["Widget"],
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));

  const model = bindingProvider.getDeclarationModel(resolution);

  assert.equal(model.extensionCode, "DOTNET_PROVIDER_REQUESTED_EXPORT_UNSUPPORTED");
  assert.match(model.message, /Widget/u);
  const diagnosticJson = JSON.stringify(model.evidence);
  assert.match(diagnosticJson, /unsupported-type-family/u);
  assert.match(diagnosticJson, /Acme\.Contracts, Version=\d+\.\d+\.\d+\.\d+/u);
  assert.match(diagnosticJson, /Contoso\.Contracts, Version=\d+\.\d+\.\d+\.\d+/u);
  assert.match(diagnosticJson, /::Shared\.Widget/u);
  assert.match(diagnosticJson, /"assemblies"/u);
});

test(".NET alias module specifiers select one assembly without source-name or declaration broadening", () => {
  const { acmeDll, contosoDll } = buildAssemblyIdentityFixtures();
  const provider = createDotnetReflectionTypeDataProvider({ references: [acmeDll, contosoDll] });
  const moduleSpecifier = "@tsonic/dotnet/aliases/acme/Acme.Contracts/Shared.js";
  const parsed = parseDotnetModuleSpecifier(moduleSpecifier);
  const module = provider.getModule(moduleSpecifier, { requestedExports: ["Widget"] });

  assert.deepEqual(parsed, {
    moduleSpecifier,
    namespaceName: "Shared",
    subpath: "aliases/acme/Acme.Contracts/Shared",
    externAlias: {
      alias: "acme",
      assemblyName: "Acme.Contracts",
    },
  });
  assert.equal("exports" in module, true, JSON.stringify(module));
  assert.equal(module.moduleSpecifier, moduleSpecifier);
  assertAssemblyReference(module.assembly, "Acme.Contracts");
  assert.equal(module.unsupportedExports, undefined);

  const widgetExports = module.exports.filter(isSharedWidgetDeclaration);
  assert.equal(widgetExports.length, 1);
  assert.equal(assemblySimpleNameFromTargetId(widgetExports[0].targetId), "Acme.Contracts");
});

test(".NET alias facts render C# extern-alias qualified target types", () => {
  const { acmeDll, contosoDll } = buildAssemblyIdentityFixtures();
  const provider = createDotnetReflectionTypeDataProvider({ references: [acmeDll, contosoDll] });
  const module = provider.getModule("@tsonic/dotnet/aliases/acme/Acme.Contracts/Shared.js", { requestedExports: ["Widget"] });
  assert.equal("exports" in module, true, JSON.stringify(module));
  const widget = module.exports.find(isSharedWidgetDeclaration);
  assert.ok(widget);

  const binding = provider.findTargetBindingByTargetId(widget.targetId);
  assert.ok(binding);
  const aliasedBinding = csharpApplyExternAliasToTargetBinding(binding, {
    alias: "acme",
    assemblyName: "Acme.Contracts",
  });

  assert.equal(aliasedBinding.csharpType?.csharpRender?.externAlias, "acme");
  assert.equal(aliasedBinding.members[0].declaringType?.csharpRender?.externAlias, "acme");
  assert.equal(printCsharpType({
    kind: "AliasQualifiedName",
    alias: "acme",
    name: {
      kind: "QualifiedName",
      left: { kind: "IdentifierName", name: "Shared" },
      name: "Widget",
    },
  }), "acme::Shared.Widget");
});

test(".NET reflection requests isolate equal assembly identities with different artifacts", () => {
  const { firstDll, secondDll } = buildLoadContextFixtures();
  const firstProvider = createDotnetReflectionTypeDataProvider({ references: [firstDll], disablePersistentCache: true });
  const secondProvider = createDotnetReflectionTypeDataProvider({ references: [secondDll], disablePersistentCache: true });

  const first = firstProvider.getModule("@tsonic/dotnet/Acme.First.js", { requestedExports: ["One"] });
  const second = secondProvider.getModule("@tsonic/dotnet/Acme.Second.js", { requestedExports: ["Two"] });

  assert.equal("exports" in first, true, JSON.stringify(first));
  assert.equal("exports" in second, true, JSON.stringify(second));
  assert.deepEqual(first.exports.map((entry) => entry.sourceName), ["One"]);
  assert.deepEqual(second.exports.map((entry) => entry.sourceName), ["Two"]);
});

test(".NET reflection request rejects different artifacts for one exact assembly identity", () => {
  const { firstDll, secondDll } = buildLoadContextFixtures();
  const provider = createDotnetReflectionTypeDataProvider({
    references: [firstDll, secondDll],
    disablePersistentCache: true,
  });

  const result = provider.getModule("@tsonic/dotnet/Acme.First.js", { requestedExports: ["One"] });

  assert.equal("code" in result, true, JSON.stringify(result));
  assert.equal(result.code, "DOTNET_REFLECTION_PROVIDER_FAILED");
  assert.match(JSON.stringify(result.evidence), /resolves to multiple different explicit artifacts/u);
});

function isSharedWidgetDeclaration(declaration) {
  return declaration.kind === "type" &&
    declaration.sourceName === "Widget" &&
    declaration.namespaceName === "Shared";
}

function providerIdentity(id) {
  return {
    id: `acme.${id}.reflection-provider`,
    version: "1.0.0",
    target: "csharp",
    displayName: `${id} reflection provider`,
  };
}

function assertAssemblyReference(reference, name) {
  assert.ok(reference, "Expected assembly reference facts.");
  assert.equal(reference.name, name);
  assert.match(reference.version, /^\d+\.\d+\.\d+\.\d+$/u);
  assert.equal(reference.culture, undefined);
  assert.equal(typeof reference.path, "string");
}

function assertAssemblyCollisionEvidence(declaration) {
  assert.match(declaration.kind, /^unsupported-/u);
  assert.equal(declaration.sourceName, "Widget");
  assertAssemblyQualifiedIds(readStringArray(declaration, "targetIds"));
  assert.deepEqual(assemblyNamesFromReferences(declaration.assemblies), ["Acme.Contracts", "Contoso.Contracts"]);
  assert.equal(JSON.stringify(declaration).includes("Shared.Widget"), true);
}

function assertDistinctAssemblyQualifiedIdentities(declarations) {
  assertAssemblyQualifiedIds(declarations.map(assemblyQualifiedIdOf));
}

function assemblyQualifiedIdOf(declaration) {
  if (typeof declaration.targetId === "string") {
    return declaration.targetId;
  }
  assert.fail(`Widget declaration lacks an assembly-qualified target identity: ${JSON.stringify(declaration)}`);
}

function assertAssemblyQualifiedIds(targetIds) {
  assert.equal(targetIds.length, 2);
  assert.equal(new Set(targetIds).size, 2);
  for (const targetId of targetIds) {
    assert.notEqual(targetId, "Shared.Widget");
    assert.match(targetId, /::Shared\.Widget$/u);
  }
  assert.deepEqual(assemblyNamesFromTargetIds(targetIds), ["Acme.Contracts", "Contoso.Contracts"]);
}

function assemblySimpleNameFromTargetId(targetId) {
  const separator = targetId.indexOf("::");
  assert.notEqual(separator, -1, `Expected assembly-qualified target id: ${targetId}`);
  return targetId.slice(0, separator).split(",")[0];
}

function assemblyNamesFromTargetIds(targetIds) {
  return [...new Set(targetIds.map((targetId) => {
    const separator = targetId.indexOf("::");
    assert.notEqual(separator, -1, `Expected assembly-qualified target id: ${targetId}`);
    return targetId.slice(0, separator).split(",")[0];
  }))].sort();
}

function assemblyNamesFromReferences(references) {
  assert.ok(Array.isArray(references), "Expected assembly reference evidence.");
  return [...new Set(references.map((reference) => reference?.name))].sort();
}

function readStringArray(value, propertyName) {
  const raw = value[propertyName];
  assert.ok(Array.isArray(raw), `Expected ${propertyName} evidence.`);
  assert.equal(raw.every((entry) => typeof entry === "string"), true, `Expected ${propertyName} strings.`);
  return raw;
}

function buildAssemblyIdentityFixtures() {
  return {
    acmeDll: buildAssemblyIdentityFixture("Acme.Contracts", "acme"),
    contosoDll: buildAssemblyIdentityFixture("Contoso.Contracts", "contoso"),
  };
}

function buildLoadContextFixtures() {
  return {
    firstDll: buildLoadContextFixture("First", "first"),
    secondDll: buildLoadContextFixture("Second", "second"),
  };
}

function buildLoadContextFixture(projectName, outputName) {
  const projectDirectory = join(repoRoot, "test/fixtures/dotnet-provider/load-context", projectName);
  return buildDotnetFixture({
    project: join(projectDirectory, `${projectName}.csproj`),
    outputDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/load-context", outputName),
    intermediateDirectory: join(repoRoot, ".temp/dotnet-provider-fixtures/load-context", `${outputName}-obj/`),
    outputAssemblyName: "Acme.Shared.Provider.dll",
    projectDirectory,
  });
}

function buildAssemblyIdentityFixture(projectName, outputName) {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/assembly-identity", projectName, `${projectName}.csproj`);
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/assembly-identity", outputName);
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/assembly-identity", `${outputName}-obj/`);
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: `${projectName}.dll`,
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/assembly-identity", projectName),
  });
}
