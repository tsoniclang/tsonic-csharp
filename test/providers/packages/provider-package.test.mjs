import assert from "node:assert/strict";
import test from "node:test";
import { TstsSourceProviderContractVersion } from "@tsonic/tsts";
import {
  createCsharpProviderPackage,
  csharpProviderPolicyContribution,
} from "../../../dist/public/provider.js";

const providerIdentity = {
  id: "fixture.measurements",
  version: "7.2.1",
  extensionContractVersion: TstsSourceProviderContractVersion,
  displayName: "Measurement declarations",
  diagnosticRange: { start: 9380001, end: 9380099 },
  configHash: "measurements-v1",
};

function definition() {
  return {
    id: "@fixture/measurements",
    displayName: "Measurement capability",
    providerIdentity: structuredClone(providerIdentity),
    modules: [{
      moduleSpecifier: "measurements/core",
      providerModuleId: "core-model-v3",
      getExports: () => [{ id: "measurement", name: "Measurement", kind: "interface" }],
    }],
    moduleSpecifiers: [
      { moduleSpecifier: "measurements/core", canonicalModuleSpecifier: "measurements/core" },
      { moduleSpecifier: "measure", canonicalModuleSpecifier: "measurements/core", message: "Install measurement support." },
    ],
    virtualDeclarationFileName: (specifier) => `tsts-provider://measurements/${encodeURIComponent(specifier)}.d.ts`,
    moduleDiagnostic: (kind, specifier) => ({
      extensionId: providerIdentity.id,
      extensionCode: `MEASUREMENTS_${kind.toUpperCase()}`,
      numericCode: kind === "unowned" ? 9380001 : 9380002,
      category: "error",
      message: `${kind}: ${specifier}`,
    }),
    resolutionEvidence: [{ message: "measurement resolution", details: { origin: "catalog" } }],
    declarationEvidence: [{ message: "measurement declarations" }],
    policy: structuredClone(csharpProviderPolicyContribution(providerIdentity.id, providerIdentity.version, [], [])),
    runtime: { references: [{ kind: "assembly", include: "Measurement.Runtime", attributes: { HintPath: "/measurement/runtime.dll" } }] },
  };
}

function extension(plugin, selectedSurfaceIds = []) {
  const contributions = plugin.sourceCompilerContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    projectDirectory: process.cwd(),
    target: { id: "csharp" },
    selectedCapabilityIds: [plugin.id],
    selectedSurfaceIds,
    capability: plugin,
  });
  assert.equal(contributions.extensions.length, 1);
  return contributions.extensions[0];
}

function registeredProvider(sourceExtension) {
  const providers = [];
  sourceExtension.initialize({ registerSourceDeclarationProvider: (provider) => providers.push(provider) });
  assert.equal(providers.length, 1);
  return providers[0];
}

function declarationModel(provider, specifier) {
  const resolution = provider.resolveModule(specifier, {});
  assert.equal(resolution.kind, "virtual");
  const model = provider.getDeclarationModel(resolution, { context: {}, materialization: { kind: "complete" } });
  assert.equal(model.moduleSpecifier, specifier);
  return model;
}

test("C# package SDK composes a non-Node complete provider without materializing declarations", () => {
  const input = definition();
  let queries = 0;
  input.modules[0].getExports = (selectedSurfaceIds) => {
    queries++;
    assert.deepEqual(selectedSurfaceIds, ["measurement-units"]);
    return [{ id: "measurement", name: "Measurement", kind: "interface" }];
  };
  input.modules.push({
    moduleSpecifier: "measurements/unused",
    providerModuleId: "unused-model",
    getExports() { throw new Error("unrequested module materialized"); },
  });
  input.moduleSpecifiers.push({ moduleSpecifier: "measurements/unused", canonicalModuleSpecifier: "measurements/unused" });
  const plugin = createCsharpProviderPackage(input);
  assert.equal(plugin.kind, "target-capability");
  assert.equal(plugin.targetId, "csharp");
  assert.equal(plugin.id, input.id);
  assert.equal(plugin.displayName, input.displayName);
  assert.deepEqual(plugin.moduleOwnership, input.moduleSpecifiers.map((entry) => ({
    specifierPrefix: entry.moduleSpecifier,
    ...(entry.message === undefined ? {} : { message: entry.message }),
  })));
  const sourceExtension = extension(plugin, ["measurement-units"]);
  assert.deepEqual(sourceExtension.identity, { id: providerIdentity.id, version: providerIdentity.version });
  const provider = registeredProvider(sourceExtension);
  assert.deepEqual(provider.identity, providerIdentity);
  assert.equal(provider.declarationMaterialization, "complete");
  assert.deepEqual(provider.ownsModule("measure", {}), { kind: "owned" });
  assert.deepEqual(provider.resolveModule("measure", {}), {
    kind: "virtual",
    moduleSpecifier: "measure",
    providerModuleId: "core-model-v3",
    virtualFileName: "tsts-provider://measurements/measure.d.ts",
    evidence: input.resolutionEvidence,
  });
  assert.equal(queries, 0);
  assert.deepEqual(declarationModel(provider, "measure"), {
    moduleSpecifier: "measure",
    providerModuleId: "core-model-v3",
    imports: [],
    exports: [{ id: "measurement", name: "Measurement", kind: "interface" }],
    evidence: input.declarationEvidence,
  });
  assert.equal(queries, 1);
});

test("package metadata and surface selection are snapshots, not live definition or context references", () => {
  const input = definition();
  const capturedSelections = [];
  input.modules[0].getExports = (selectedSurfaceIds) => {
    capturedSelections.push(selectedSurfaceIds);
    return [{ id: "measurement", name: selectedSurfaceIds.includes("units") ? "WithUnits" : "Native", kind: "interface" }];
  };
  const plugin = createCsharpProviderPackage(input);
  const surfaces = ["units"];
  const sourceExtension = extension(plugin, surfaces);
  surfaces.splice(0);
  const provider = registeredProvider(sourceExtension);
  input.id = "changed";
  input.providerIdentity.id = "changed";
  input.providerIdentity.diagnosticRange.start = 1;
  input.modules[0].getExports = () => { throw new Error("replaced callback"); };
  input.modules[0].providerModuleId = "changed";
  input.modules.splice(0);
  input.moduleSpecifiers[1].message = "changed";
  input.moduleSpecifiers[1].canonicalModuleSpecifier = "changed";
  input.moduleSpecifiers.push({ moduleSpecifier: "injected", canonicalModuleSpecifier: "measurements/core" });
  input.virtualDeclarationFileName = () => "changed";
  input.moduleDiagnostic = () => { throw new Error("replaced diagnostic callback"); };
  input.resolutionEvidence[0].details.origin = "changed";
  input.declarationEvidence[0].message = "changed";
  input.policy.providerVersion = "changed";
  input.runtime.references[0].attributes.HintPath = "changed";
  assert.deepEqual(provider.identity, providerIdentity);
  assert.equal(Object.isFrozen(provider.identity.diagnosticRange), true);
  assert.equal(plugin.moduleOwnership[1].message, "Install measurement support.");
  assert.deepEqual(provider.ownsModule("injected", {}), { kind: "unowned" });
  assert.equal(provider.resolveModule("measure", {}).evidence[0].details.origin, "catalog");
  assert.equal(provider.resolveModule("measure", {}).virtualFileName, "tsts-provider://measurements/measure.d.ts");
  assert.equal(provider.resolveModule("unknown", {}).extensionCode, "MEASUREMENTS_UNOWNED");
  assert.equal(declarationModel(provider, "measure").exports[0].name, "WithUnits");
  assert.equal(declarationModel(provider, "measurements/core").exports[0].name, "WithUnits");
  const nativeProvider = registeredProvider(extension(plugin));
  assert.equal(declarationModel(nativeProvider, "measure").exports[0].name, "Native");
  assert.equal(declarationModel(provider, "measure").exports[0].name, "WithUnits");
  assert.equal(capturedSelections.every(Object.isFrozen), true);
  assert.equal(plugin.createTargetContributions({})[0].providerVersion, providerIdentity.version);
  assert.equal(plugin.runtimeContributions({}).references[0].attributes.HintPath, "/measurement/runtime.dll");
  assert.equal(Object.isFrozen(plugin.moduleOwnership[1]), true);
  assert.equal(Object.isFrozen(plugin.runtimeContributions({}).references[0].attributes), true);
});

function nestedDeclaration(moduleSpecifier) {
  const self = { kind: "provider-ref", moduleSpecifier, exportName: "Measurement", localName: "LocalMeasurement" };
  const parameter = { name: "input", optional: true, type: { kind: "array", elementType: self }, defaultType: self };
  const typeParameter = { name: "Item", constraints: [self], defaultType: self };
  const signature = { id: "stable.signature", parameters: [parameter], returnType: self, typeParameters: [typeParameter] };
  return {
    id: "stable.default", name: "MeasurementModule", exportKind: "default", kind: "class", documentation: "Default module",
    typeParameters: [typeParameter],
    heritage: [{ kind: "implements", type: self }],
    signatures: [signature],
    members: [{
      id: "stable.member", name: { kind: "property-key", name: "value" }, kind: "property", static: true, readonly: true,
      signatures: [signature],
      type: {
        kind: "function", id: "stable.callback", parameters: [parameter], typeParameters: [typeParameter],
        returnType: {
          kind: "tuple",
          elementTypes: [
            { kind: "union", types: [self, { kind: "undefined" }] },
            { kind: "intersection", types: [self, { kind: "object" }] },
            { kind: "source-global", name: "Promise", typeArguments: [self] },
            { kind: "provider-ref", moduleSpecifier: "foreign/catalog", exportName: "Box", typeArguments: [self] },
          ],
        },
      },
    }],
    type: self,
  };
}

test("alias rebasing preserves exact default, member and signature identities throughout declarations", () => {
  const input = definition();
  const original = nestedDeclaration("measurements/core");
  input.modules[0].getExports = () => [original];
  const provider = registeredProvider(extension(createCsharpProviderPackage(input)));
  assert.deepEqual(declarationModel(provider, "measure").exports, [nestedDeclaration("measure")]);
  assert.deepEqual(declarationModel(provider, "measurements/core").exports, [nestedDeclaration("measurements/core")]);
  assert.deepEqual(original, nestedDeclaration("measurements/core"));
});

test("package imports are deterministic, de-duplicated and promote only class extends to values", () => {
  const input = definition();
  const reference = (moduleSpecifier, exportName, localName) => ({
    kind: "provider-ref", moduleSpecifier, exportName,
    ...(localName === undefined ? {} : { localName }),
  });
  for (const name of ["alpha", "zeta"]) {
    input.modules.push({ moduleSpecifier: `measurements/${name}`, providerModuleId: `${name}-model`, getExports: () => [] });
    input.moduleSpecifiers.push({ moduleSpecifier: `measurements/${name}`, canonicalModuleSpecifier: `measurements/${name}` });
  }
  const declarations = [{
    id: "consumer", name: "Consumer", kind: "class",
    heritage: [
      { kind: "extends", type: reference("measurements/alpha", "Base", "BaseValue") },
      { kind: "implements", type: reference("measurements/alpha", "Contract") },
    ],
    typeParameters: [{ name: "Item", constraints: [reference("measurements/zeta", "Zed")], defaultType: reference("measurements/zeta", "Alpha") }],
    members: [{
      id: "consumer.member", name: "items", kind: "property",
      type: { kind: "tuple", elementTypes: [
        reference("measurements/alpha", "Base", "BaseValue"),
        reference("measurements/alpha", "Base", "BaseType"),
        reference("measurements/core", "Measurement"),
        reference("outside/package", "Foreign"),
      ] },
    }],
  }, {
    id: "interface", name: "Interface", kind: "interface",
    heritage: [{ kind: "extends", type: reference("measurements/alpha", "Contract") }],
  }];
  input.modules[0].getExports = () => declarations;
  const provider = registeredProvider(extension(createCsharpProviderPackage(input)));
  const imports = declarationModel(provider, "measure").imports;
  assert.deepEqual(imports, [
    { moduleSpecifier: "measurements/alpha", namedImports: [
      { exportedName: "Base", localName: "BaseType", kind: "type" },
      { exportedName: "Base", localName: "BaseValue", kind: "value" },
      { exportedName: "Contract", kind: "type" },
    ], typeOnly: false },
    { moduleSpecifier: "measurements/zeta", namedImports: [
      { exportedName: "Alpha", kind: "type" },
      { exportedName: "Zed", kind: "type" },
    ], typeOnly: true },
    { moduleSpecifier: "outside/package", namedImports: [
      { exportedName: "Foreign", kind: "type" },
    ], typeOnly: true },
  ]);
  assert.deepEqual(declarationModel(provider, "measurements/core").imports, imports);
});

test("policy, rejections, execution driver and runtime data are retained once per package", () => {
  const input = definition();
  const source = {
    kind: "type", providerId: providerIdentity.id, providerVersion: providerIdentity.version,
    providerModuleId: "core-model-v3", moduleSpecifier: "measure", exportId: "measurement", exportName: "Measurement",
  };
  input.policy.relations.push({ kind: "type", source, targetBinding: { target: "csharp", id: "Measurement.Runtime.Measurement" } });
  input.policy.rejections.push({ source, diagnostic: input.moduleDiagnostic("missing", "unsupported") });
  input.policy.binaryExecutionDriver = {
    id: "measurement-driver", declaringType: { kind: "target-named", id: "Measurement.Runtime.Driver" },
    runMethodName: "Run", runWithEntrypointMethodName: "RunEntrypoint",
  };
  const plugin = createCsharpProviderPackage(input);
  const contributions = plugin.createTargetContributions({});
  const runtime = plugin.runtimeContributions({});
  assert.deepEqual(contributions, [input.policy]);
  assert.deepEqual(runtime, input.runtime);
  input.policy.relations[0].source.exportId = "changed";
  input.policy.rejections[0].diagnostic.message = "changed";
  input.policy.binaryExecutionDriver.runMethodName = "changed";
  const provider = registeredProvider(extension(plugin));
  declarationModel(provider, "measure");
  declarationModel(provider, "measurements/core");
  assert.equal(plugin.createTargetContributions({}), contributions);
  assert.equal(plugin.runtimeContributions({}), runtime);
  assert.equal(contributions[0].relations[0].source.exportId, "measurement");
  assert.equal(contributions[0].rejections[0].diagnostic.message, "missing: unsupported");
  assert.equal(contributions[0].binaryExecutionDriver.runMethodName, "Run");
  assert.equal(Object.isFrozen(contributions[0].relations[0].source), true);
});

test("unowned prefixes and forged module identities preserve package diagnostics without invoking exports", () => {
  const input = definition();
  input.modules[0].getExports = () => { throw new Error("invalid query reached exports"); };
  const provider = registeredProvider(extension(createCsharpProviderPackage(input)));
  for (const specifier of ["measure/child", "measurements/core-extra", "node:fs", "unknown"]) {
    assert.deepEqual(provider.ownsModule(specifier, {}), { kind: "unowned" });
    assert.deepEqual(provider.resolveModule(specifier, {}), input.moduleDiagnostic("unowned", specifier));
    assert.deepEqual(provider.getDeclarationModel({ kind: "virtual", moduleSpecifier: specifier, providerModuleId: "core-model-v3", virtualFileName: "ignored" }, {}), input.moduleDiagnostic("missing", specifier));
  }
  const resolution = provider.resolveModule("measure", {});
  assert.deepEqual(provider.getDeclarationModel({ ...resolution, providerModuleId: "measure" }, {}), input.moduleDiagnostic("missing", "measure"));
});

test("package construction rejects ambiguous mappings and invalid existing policy contracts without evaluating modules", () => {
  const cases = [
    ["duplicate canonical", (input) => input.modules.push({ ...input.modules[0] }), /duplicate canonical/u],
    ["duplicate module ID", (input) => input.modules.push({ ...input.modules[0], moduleSpecifier: "other" }), /provider module identity/u],
    ["missing callback", (input) => { input.modules[0].getExports = undefined; }, /export callback/u],
    ["duplicate alias", (input) => input.moduleSpecifiers.push({ ...input.moduleSpecifiers[1] }), /duplicate public/u],
    ["unknown destination", (input) => { input.moduleSpecifiers[1].canonicalModuleSpecifier = "unknown"; }, /unregistered canonical/u],
    ["missing canonical spelling", (input) => input.moduleSpecifiers.shift(), /requires its own public specifier/u],
    ["policy identity", (input) => { input.policy.providerId = "different"; }, /source provider identity/u],
    ["policy version", (input) => { input.policy.providerVersion = "different"; }, /source provider identity/u],
    ["policy kind", (input) => { input.policy.kind = "other"; }, /policy contribution/u],
    ["invalid rejection", (input) => input.policy.rejections.push({}), /invalid provider rejection/u],
  ];
  for (const [name, mutate, expected] of cases) {
    const input = definition();
    input.modules[0].getExports = () => { throw new Error("eager exports"); };
    mutate(input);
    assert.throws(() => createCsharpProviderPackage(input), expected, name);
  }
});

test("policy identities must match exact package modules, not prefix lookalikes", () => {
  for (const contributionKind of ["relations", "rejections"]) {
    for (const [moduleSpecifier, providerModuleId] of [
      ["measure", "wrong-model"],
      ["measure/unknown", "core-model-v3"],
    ]) {
      const input = definition();
      const source = {
        kind: "type", providerId: providerIdentity.id, providerVersion: providerIdentity.version,
        moduleSpecifier, providerModuleId, exportId: "measurement", exportName: "Measurement",
      };
      input.policy[contributionKind].push(contributionKind === "relations"
        ? { kind: "type", source, targetBinding: { target: "csharp", id: "Measurement.Runtime.Measurement" } }
        : { source, diagnostic: input.moduleDiagnostic("missing", "unsupported") });
      assert.throws(() => createCsharpProviderPackage(input), /registered provider module identity/u, contributionKind);
    }
  }
});
