import {
  assert,
  createDotnetTargetBindingProvider,
  dotnetModuleToProviderDeclarationModel,
  namedDotnetTypeRef,
  test,
  testTargetId,
} from "./dotnet-provider.helpers.mjs";

test(".NET provider preserves exact synthetic export slices used by provider heritage", () => {
  const observedContexts = [];
  const provider = {
    identity: {
      id: "acme.dotnet.synthetic-slice",
      version: "1.0.0",
      target: "csharp",
      displayName: "Synthetic slice fixture",
    },
    ownsModule(_specifier, context) {
      observedContexts.push({ phase: "ownership", context });
      return { kind: "owned" };
    },
    getModule(specifier, context) {
      observedContexts.push({ phase: "declaration", context });
      return {
        moduleSpecifier: specifier,
        namespaceName: "Acme",
        exports: [{
          kind: "type",
          typeKind: "class",
          sourceName: "Base",
          namespaceName: "Acme",
          targetId: testTargetId("Acme.Base"),
          metadataName: "Acme.Base",
        }],
      };
    },
  };
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/Acme.js", {
    importSlice: {
      moduleSpecifier: "@tsonic/dotnet/Acme.js",
      kind: "synthetic",
      requestedExports: [{ exportedName: "Base", kind: "value" }],
      typeOnly: false,
    },
  });
  assert.deepEqual(resolution, {
    kind: "virtual",
    moduleSpecifier: "@tsonic/dotnet/Acme.js",
    virtualFileName: "tsts-provider://acme.dotnet.synthetic-slice/%40tsonic%2Fdotnet%2FAcme.js.d.ts",
    providerModuleId: "@tsonic/dotnet/Acme.js",
    requestedExports: ["Base"],
    packageName: "@tsonic/dotnet",
    evidence: [{ message: ".NET native pass-through provider supplied virtual module." }],
  });
  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in model, true, JSON.stringify(model));
  assert.deepEqual(model.exports.map((declaration) => declaration.name), ["Base"]);
  assert.deepEqual(observedContexts.map(({ phase, context }) => ({
    phase,
    broadImport: context.broadImport,
    requestedExports: context.requestedExports,
  })), [
    { phase: "ownership", broadImport: undefined, requestedExports: ["Base"] },
    { phase: "declaration", broadImport: undefined, requestedExports: ["Base"] },
  ]);
});

test(".NET provider imports external class heritage as values without widening type-only refs", () => {
  const externalType = (metadataName, moduleSpecifier, exportName) => namedDotnetTypeRef(metadataName, {
    sourceShape: {
      kind: "provider-ref",
      moduleSpecifier,
      exportName,
    },
  });
  const property = (sourceName, type) => ({
    kind: "property",
    sourceName,
    targetName: sourceName,
    targetId: testTargetId(`Acme.Derived.${sourceName}`),
    metadataName: `Acme.Derived.${sourceName}`,
    readable: true,
    type,
  });
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@acme/derived.js",
    namespaceName: "Acme",
    exports: [{
      kind: "type",
      typeKind: "class",
      sourceName: "Derived",
      namespaceName: "Acme",
      targetId: testTargetId("Acme.Derived"),
      metadataName: "Acme.Derived",
      baseType: externalType("Acme.Base", "@acme/base.js", "Base"),
      members: [
        property("Metadata", externalType("Acme.BaseMetadata", "@acme/base.js", "BaseMetadata")),
        property("Contract", externalType("Acme.Contract", "@acme/contracts.js", "Contract")),
      ],
    }],
  });

  assert.deepEqual(model.imports, [
    {
      moduleSpecifier: "@acme/base.js",
      typeOnly: false,
      namedImports: [{
        exportedName: "Base",
        localName: "__TsonicDotnet_Base_ic7zq4",
        kind: "value",
      }],
    },
    {
      moduleSpecifier: "@acme/base.js",
      typeOnly: true,
      namedImports: [{
        exportedName: "BaseMetadata",
        localName: "__TsonicDotnet_BaseMetadata_ic7zq4",
        kind: "type",
      }],
    },
    {
      moduleSpecifier: "@acme/contracts.js",
      typeOnly: true,
      namedImports: [{
        exportedName: "Contract",
        localName: "__TsonicDotnet_Contract_rewl0e",
        kind: "type",
      }],
    },
  ]);
});

test(".NET provider promotes a repeated external ref to one value-capable heritage import", () => {
  const baseType = namedDotnetTypeRef("Acme.Base", {
    sourceShape: {
      kind: "provider-ref",
      moduleSpecifier: "@acme/base.js",
      exportName: "Base",
    },
  });
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@acme/derived.js",
    namespaceName: "Acme",
    exports: [{
      kind: "type",
      typeKind: "class",
      sourceName: "Derived",
      namespaceName: "Acme",
      targetId: testTargetId("Acme.Derived"),
      metadataName: "Acme.Derived",
      baseType,
      members: [{
        kind: "property",
        sourceName: "Parent",
        targetName: "Parent",
        targetId: testTargetId("Acme.Derived.Parent"),
        metadataName: "Acme.Derived.Parent",
        readable: true,
        type: baseType,
      }],
    }],
  });

  assert.deepEqual(model.imports, [{
    moduleSpecifier: "@acme/base.js",
    typeOnly: false,
    namedImports: [{
      exportedName: "Base",
      localName: "__TsonicDotnet_Base_ic7zq4",
      kind: "value",
    }],
  }]);
});
