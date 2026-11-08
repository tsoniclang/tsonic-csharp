import assert from "node:assert/strict";
import test from "node:test";
import { TstsSourceProviderContractVersion } from "@tsonic/tsts";
import {
  createCsharpProviderPackage,
  csharpProviderPolicyContribution,
} from "../../../dist/public/provider.js";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";

function fixtureCapability(includeForeign = false) {
  const reference = (exportName, binding) => ({ kind: "provider-ref", moduleSpecifier: "basics", exportName, ...binding });
  const namedBase = reference("Base", { localName: "BaseValue" });
  const defaultBase = reference("default", { localName: "DefaultValue" });
  const namespaceBase = reference("Base", { namespaceImport: "NamespacedBase" });
  const declarations = [
    ...[
      ["NamedChild", namedBase],
      ["DefaultChild", defaultBase],
      ["NamespaceChild", namespaceBase],
    ].map(([name, type]) => ({ id: `consumer.${name}`, name, kind: "class", heritage: [{ kind: "extends", type }] })),
    {
      id: "consumer.Contract", name: "Contract", kind: "interface",
      heritage: [{ kind: "extends", type: reference("default", { localName: "DefaultType" }) }],
      members: [
        ["named", reference("Base", { localName: "BaseType" })],
        ["default", reference("default", { localName: "DefaultType" })],
        ["namespace", reference("Base", { namespaceImport: "Types" })],
        ["namespaceDefault", reference("default", { namespaceImport: "Types" })],
        ["promotedDefault", defaultBase],
        ["promotedNamespace", namespaceBase],
      ].map(([name, type]) => ({ id: `consumer.Contract.${name}`, name, kind: "property", type })),
    },
  ];
  if (includeForeign) {
    const foreignReference = { kind: "provider-ref", moduleSpecifier: "outside/package", exportName: "Foreign" };
    declarations.push({
      id: "consumer.ForeignChild", name: "ForeignChild", kind: "class",
      heritage: [{ kind: "extends", type: foreignReference }],
      members: [{ id: "consumer.ForeignChild.peer", name: "peer", kind: "property", type: foreignReference }],
    });
  }
  const identity = { id: "fixture.measurements", version: "1.0.0", extensionContractVersion: TstsSourceProviderContractVersion };
  const plugin = createCsharpProviderPackage({
    id: "@fixture/measurements", displayName: "Measurement package", providerIdentity: identity,
    modules: [
      {
        moduleSpecifier: "measurements/base", providerModuleId: "base-model",
        getExports: () => [
          { id: "base.Named", name: "Base", kind: "class" },
          { id: "base.Default", name: "DefaultBase", kind: "class", exportKind: "default" },
        ],
      },
      { moduleSpecifier: "measurements/consumer", providerModuleId: "consumer-model", getExports: () => declarations },
    ],
    moduleSpecifiers: [
      { moduleSpecifier: "measurements/base", canonicalModuleSpecifier: "measurements/base" },
      { moduleSpecifier: "basics", canonicalModuleSpecifier: "measurements/base" },
      { moduleSpecifier: "measurements/consumer", canonicalModuleSpecifier: "measurements/consumer" },
      { moduleSpecifier: "consumer", canonicalModuleSpecifier: "measurements/consumer" },
    ],
    virtualDeclarationFileName: (specifier) => `tsts-provider://measurements/${encodeURIComponent(specifier)}.d.ts`,
    moduleDiagnostic: (kind, specifier) => ({ extensionId: identity.id, extensionCode: kind, numericCode: 9380001, category: "error", message: specifier }),
    createPolicy: () => csharpProviderPolicyContribution({ providerId: identity.id, providerVersion: identity.version, targetBindings: [], relations: [], rejections: [] }),
    runtime: {},
  });
  return plugin;
}

function packageProvider(plugin) {
  const contributions = plugin.sourceCompilerContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] }, projectDirectory: "/src", target: { id: "csharp" },
    selectedCapabilityIds: [plugin.id], selectedSurfaceIds: [], capability: plugin,
  });
  assert.equal("extensions" in contributions, false, "the current package contract has no raw initializer");
  assert.equal(contributions.declarationProviders.length, 1);
  return contributions.declarationProviders[0];
}

function foreignCapability() {
  const identity = { id: "fixture.outside", version: "2.0.0", extensionContractVersion: TstsSourceProviderContractVersion };
  return createCsharpProviderPackage({
    id: "@fixture/outside", displayName: "Foreign package", providerIdentity: identity,
    modules: [{
      moduleSpecifier: "outside/package", providerModuleId: "foreign-model",
      getExports: () => [{ id: "foreign.Foreign", name: "Foreign", kind: "class" }],
    }],
    moduleSpecifiers: [{ moduleSpecifier: "outside/package", canonicalModuleSpecifier: "outside/package" }],
    virtualDeclarationFileName: (specifier) => `tsts-provider://outside/${encodeURIComponent(specifier)}.d.ts`,
    moduleDiagnostic: (kind, specifier) => ({ extensionId: identity.id, extensionCode: kind, numericCode: 9380002, category: "error", message: specifier }),
    createPolicy: () => csharpProviderPolicyContribution({ providerId: identity.id, providerVersion: identity.version, targetBindings: [], relations: [], rejections: [] }), runtime: {},
  });
}

test("SDK imports preserve reference aliases and distinct named/default/namespace binding identities", () => {
  const provider = packageProvider(fixtureCapability());
  const expectedImports = [
    { moduleSpecifier: "basics", defaultImport: "DefaultType", typeOnly: true },
    { moduleSpecifier: "basics", defaultImport: "DefaultValue", typeOnly: false },
    { moduleSpecifier: "basics", namedImports: [
      { exportedName: "Base", localName: "BaseType", kind: "type" },
      { exportedName: "Base", localName: "BaseValue", kind: "value" },
    ], typeOnly: false },
    { moduleSpecifier: "basics", namespaceImport: "NamespacedBase", typeOnly: false },
    { moduleSpecifier: "basics", namespaceImport: "Types", typeOnly: true },
  ];
  for (const specifier of ["consumer", "measurements/consumer"]) {
    const model = provider.getDeclarationModel(provider.resolveModule(specifier, {}), { context: {}, materialization: { kind: "complete" } });
    assert.deepEqual(model.imports, expectedImports);
    assert.equal(model.providerModuleId, "consumer-model");
    assert.deepEqual(model.exports[1].heritage[0].type, { kind: "provider-ref", moduleSpecifier: "basics", exportName: "default", localName: "DefaultValue" });
  }
});

test("real TSTS accepts SDK alias imports and value-capable default/namespace heritage", () => {
  for (const specifier of ["consumer", "measurements/consumer"]) {
    const checked = check(fixtureCapability(), specifier);
    assert.equal(checked.sourceDiagnosticsText, "");
    assert.deepEqual(checked.sourceDiagnostics, []);
    assert.equal(checked.source !== undefined, true, "normal Host checking publishes the original Source program");
  }
});

test("foreign provider references produce imports without claiming ownership and satisfy real TSTS heritage", () => {
  const capability = fixtureCapability(true);
  const provider = packageProvider(capability);
  assert.deepEqual(provider.ownsModule("outside/package", {}), { kind: "unowned" });
  const model = provider.getDeclarationModel(provider.resolveModule("consumer", {}), { context: {}, materialization: { kind: "complete" } });
  assert.deepEqual(model.imports.find((entry) => entry.moduleSpecifier === "outside/package"), {
    moduleSpecifier: "outside/package", namedImports: [{ exportedName: "Foreign", kind: "value" }], typeOnly: false,
  });
  const checked = check([capability, foreignCapability()], "consumer", `
    import { ForeignChild } from "consumer";
    import type { Foreign } from "outside/package";
    export class ForeignDerived extends ForeignChild {}
    export function peer(value: ForeignChild): Foreign { return value.peer; }
  `);
  assert.equal(checked.sourceDiagnosticsText, "");
  assert.deepEqual(checked.sourceDiagnostics, []);
  assert.equal(checked.source !== undefined, true, "both actual declaration providers are registered before Source publication");
});

test("real TSTS rejects missing foreign imports even when the other provider is registered", () => {
  const capability = fixtureCapability(true);
  const checked = check([withImportMutation(capability, (imports) =>
    imports.filter((entry) => entry.moduleSpecifier !== "outside/package")
  ), foreignCapability()], "consumer");
  assert.ok(checked.sourceDiagnostics.some(diagnostic => diagnostic.code === "TS9000018" &&
    diagnostic.source === "tsts.extension-host"));
  assert.equal(checked.source === undefined, true, "an invalid declaration model cannot publish a resolved Source program");
});

test("real TSTS rejects canonicalized import aliases, wrong import kinds and type-only class heritage", () => {
  const mutations = [
    ["canonicalized alias", (imports) => imports.map((entry) => ({ ...entry, moduleSpecifier: "measurements/base" }))],
    ["default as named", (imports) => imports.map((entry) => entry.defaultImport === undefined ? entry : ({
      moduleSpecifier: entry.moduleSpecifier,
      namedImports: [{ exportedName: "default", localName: entry.defaultImport, kind: entry.typeOnly ? "type" : "value" }],
      typeOnly: entry.typeOnly,
    }))],
    ["namespace as named", (imports) => imports.map((entry) => entry.namespaceImport === undefined ? entry : ({
      moduleSpecifier: entry.moduleSpecifier,
      namedImports: [{ exportedName: "Base", localName: entry.namespaceImport, kind: entry.typeOnly ? "type" : "value" }],
      typeOnly: entry.typeOnly,
    }))],
    ["type-only heritage", (imports) => imports.map((entry) => ({
      ...entry,
      typeOnly: true,
      ...(entry.namedImports === undefined ? {} : { namedImports: entry.namedImports.map((named) => ({ ...named, kind: "type" })) }),
    }))],
  ];
  for (const [name, mutateImports] of mutations) {
    const checked = check(withImportMutation(fixtureCapability(), mutateImports), "consumer");
    assert.ok(checked.sourceDiagnostics.some(diagnostic => diagnostic.code === "TS9000018" &&
      diagnostic.source === "tsts.extension-host"), name);
    assert.equal(checked.source === undefined, true, `${name}: an invalid declaration model cannot publish Source`);
  }
});

function withImportMutation(capability, mutateImports) {
  return {
    ...capability,
    sourceCompilerContributions(context) {
      const contributions = capability.sourceCompilerContributions(context);
      return {
        ...contributions,
        declarationProviders: contributions.declarationProviders.map(provider => ({
          ...provider,
          getDeclarationModel(resolution, request) {
            const model = provider.getDeclarationModel(resolution, request);
            return model.providerModuleId === "consumer-model"
              ? { ...model, imports: mutateImports(model.imports) }
              : model;
          },
        })),
      };
    },
  };
}

function check(capabilities, specifier, additionalSource = "") {
  return checkCsharpSource({
    projectRoot: "/src",
    sourceText: `
        import { NamedChild, DefaultChild, NamespaceChild } from "${specifier}";
        import type { Contract } from "${specifier}";
        export class Named extends NamedChild {}
        export class Default extends DefaultChild {}
        export class Namespaced extends NamespaceChild {}
        export function identity(value: Contract): Contract { return value; }
        ${additionalSource}
    `,
    capabilities: Array.isArray(capabilities) ? capabilities : [capabilities],
    compilerOptions: { module: "esnext", moduleResolution: "bundler", noLib: true, strict: true, target: "esnext" },
  });
}
