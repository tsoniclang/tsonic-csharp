import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  dotnetModuleToProviderDeclarationModel,
  dotnetNativeArrayTypeId,
  validateDotnetModuleModelContract,
  validateDotnetProviderDeclarationModelContract,
} from "../dist/index.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const testAssemblyId = "Provider.Contract.Tests, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null";
const supportedPassingModes = new Set([
  "by-value",
  "byref-readonly",
  "byref-readwrite",
  "byref-writeonly-must-init",
]);

test(".NET provider model contract rejects legacy and incomplete provider refs", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Derived",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.Derived"),
        metadataName: "ProviderContractFixtures.Derived",
        baseType: {
          kind: "named",
          targetId: testTargetId("ProviderContractFixtures.Base"),
          metadataName: "ProviderContractFixtures.Base",
          sourceShape: {
            kind: "provider-ref",
            name: "Base",
          },
        },
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].baseType.sourceShape.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].baseType.sourceShape.moduleSpecifier"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].baseType.sourceShape.exportName"), true);
});

test(".NET provider model contract rejects malformed identities and type refs before conversion", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Box",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.Box"),
        metadataName: "ProviderContractFixtures.Box",
        members: [
          {
            kind: "method",
            sourceName: "broken",
            targetName: "Broken",
            targetId: testTargetId("ProviderContractFixtures.Box.Broken"),
            metadataName: "ProviderContractFixtures.Box.Broken",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.Box.Broken(System.Int32,System.String)"),
                parameters: [
                  {
                    name: "values",
                    type: { kind: "array", rank: 0, elementType: { kind: "source-primitive" } },
                    passingMode: "by-value",
                    rest: true,
                  },
                  {
                    name: "tail",
                    type: { kind: "type-parameter" },
                    passingMode: "not-a-mode",
                    optional: true,
                    defaultValue: { kind: "source-primitive", name: "int32", value: {} },
                  },
                ],
                returnType: { kind: "source-primitive", name: "bool" },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].rest"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].type.rank"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].type.elementType.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].passingMode"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].type.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].defaultValue.value"), true);
});

test(".NET provider model contract rejects metadata-name fallback identities and unsupported evidence holes", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    assembly: { name: "" },
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "EventSource",
        namespaceName: "ProviderContractFixtures",
        targetId: "ProviderContractFixtures.EventSource",
        metadataName: "ProviderContractFixtures.EventSource",
        assembly: { name: "" },
        typeParameters: [
          {
            name: "T",
            variance: "sideways",
          },
        ],
        members: [
          {
            kind: "event",
            sourceName: "changed",
            targetName: "Changed",
            targetId: testTargetId("ProviderContractFixtures.EventSource.Changed"),
            metadataName: "ProviderContractFixtures.EventSource.Changed",
            type: { kind: "string" },
          },
        ],
      },
    ],
    unsupportedExports: [
      {
        kind: "unsupported-type-family",
        sourceName: "Collision",
        reason: "",
        metadataNames: ["ProviderContractFixtures.Collision"],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.assembly.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].targetId"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].assembly.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].typeParameters[0].variance"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].targetId"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.unsupportedExports[0].reason"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.unsupportedExports[0].targetIds"), true);
});

test(".NET provider model contract rejects assembly identity drift", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    assembly: { name: "Acme.Contracts" },
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Widget",
        namespaceName: "ProviderContractFixtures",
        targetId: "Contoso.Contracts, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null::ProviderContractFixtures.Widget",
        metadataName: "ProviderContractFixtures.Widget",
        assembly: { name: "Acme.Contracts" },
      },
    ],
    unsupportedExports: [
      {
        kind: "unsupported-type-family",
        sourceName: "Collision",
        reason: "Duplicate source-visible CLR type family.",
        targetIds: [
          "Contoso.Contracts, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null::ProviderContractFixtures.Collision",
        ],
        metadataNames: ["ProviderContractFixtures.Collision"],
        assemblies: [{ name: "Acme.Contracts" }],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].targetId"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.unsupportedExports[0].targetIds[0]"), true);
});

test(".NET provider model contract rejects unsupported discriminants and conversion operator drift", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "record",
        sourceName: "Broken",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.Broken"),
        metadataName: "ProviderContractFixtures.Broken",
        renderShape: { kind: "qualified-name", name: "" },
        members: [
          {
            kind: "accessor",
            sourceName: "value",
            targetName: "Value",
            targetId: testTargetId("ProviderContractFixtures.Broken.Value"),
            metadataName: "ProviderContractFixtures.Broken.Value",
          },
        ],
        conversionOperators: [
          {
            id: testTargetId("ProviderContractFixtures.Broken.op_Implicit(System.Double)"),
            targetName: "op_Implicit",
            metadataName: "ProviderContractFixtures.Broken.op_Implicit(System.Double)",
            conversionKind: "explicit",
            sourceType: { kind: "source-primitive", name: "float64" },
            targetType: {
              kind: "named",
              targetId: testTargetId("ProviderContractFixtures.Broken"),
              metadataName: "ProviderContractFixtures.Broken",
            },
          },
          {
            id: testTargetId("ProviderContractFixtures.Broken.op_CheckedExplicit(System.Double)"),
            targetName: "op_CheckedExplicit",
            metadataName: "ProviderContractFixtures.Broken.op_CheckedExplicit(System.Double)",
            conversionKind: "checked-explicit",
            sourceType: { kind: "source-primitive", name: "float64" },
            targetType: {
              kind: "named",
              targetId: testTargetId("ProviderContractFixtures.Broken"),
              metadataName: "ProviderContractFixtures.Broken",
            },
          },
        ],
      },
      {
        kind: "alias",
        sourceName: "Alias",
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].typeKind"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].renderShape.kind"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].renderShape.name"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].kind"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].conversionOperators[0].conversionKind"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].conversionOperators[1].targetName"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].conversionOperators[1].conversionKind"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[1].kind"), true);
});

test(".NET provider model contract rejects supported rows with unsupported CLR source shapes", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "UnsupportedShapeTarget",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget"),
        metadataName: "ProviderContractFixtures.UnsupportedShapeTarget",
        members: [
          {
            kind: "property",
            sourceName: "pointer",
            targetName: "Pointer",
            targetId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.Pointer"),
            metadataName: "ProviderContractFixtures.UnsupportedShapeTarget.Pointer",
            readable: true,
            type: {
              kind: "pointer",
              pointee: { kind: "source-primitive", name: "int32" },
            },
          },
          {
            kind: "method",
            sourceName: "acceptMatrix",
            targetName: "AcceptMatrix",
            targetId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.AcceptMatrix"),
            metadataName: "ProviderContractFixtures.UnsupportedShapeTarget.AcceptMatrix",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.AcceptMatrix(System.Int32[,])"),
                parameters: [
                  {
                    name: "matrix",
                    type: {
                      kind: "array",
                      rank: 2,
                      elementType: { kind: "source-primitive", name: "int32" },
                    },
                    passingMode: "by-value",
                  },
                ],
                returnType: { kind: "void" },
              },
            ],
          },
          {
            kind: "method",
            sourceName: "choose",
            targetName: "Choose",
            targetId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.Choose"),
            metadataName: "ProviderContractFixtures.UnsupportedShapeTarget.Choose",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.Choose(System.Object)"),
                parameters: [
                  {
                    name: "value",
                    type: {
                      kind: "union",
                      types: [
                        { kind: "string" },
                        { kind: "source-primitive", name: "int32" },
                      ],
                    },
                    passingMode: "by-value",
                  },
                ],
                returnType: { kind: "void" },
              },
            ],
          },
        ],
        conversionOperators: [
          {
            id: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.op_Explicit(System.Int32*)"),
            targetName: "op_Explicit",
            metadataName: "ProviderContractFixtures.UnsupportedShapeTarget.op_Explicit(System.Int32*)",
            conversionKind: "explicit",
            sourceType: {
              kind: "pointer",
              pointee: { kind: "source-primitive", name: "int32" },
            },
            targetType: {
              kind: "named",
              targetId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget"),
              metadataName: "ProviderContractFixtures.UnsupportedShapeTarget",
            },
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].type"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[1].signatures[0].parameters[0].type"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[2].signatures[0].parameters[0].type"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].conversionOperators[0].sourceType"), true);
});

test(".NET provider declaration contract rejects provider refs missing public TSTS identity", () => {
  const diagnostic = validateDotnetProviderDeclarationModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    providerModuleId: "@tsonic/dotnet/ProviderContractFixtures.js",
    exports: [
      {
        id: testTargetId("ProviderContractFixtures.Derived"),
        name: "Derived",
        kind: "class",
        heritage: [
          {
            kind: "extends",
            type: {
              kind: "provider-ref",
              exportName: "Base",
            },
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].targetIdentity"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].heritage[0].type.moduleSpecifier"), true);
});

test(".NET provider declaration contract rejects invalid provider parameter passing and rest facts", () => {
  const diagnostic = validateDotnetProviderDeclarationModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    providerModuleId: "@tsonic/dotnet/ProviderContractFixtures.js",
    exports: [
      {
        id: testTargetId("ProviderContractFixtures.Target"),
        name: "Target",
        kind: "class",
        targetIdentity: {
          target: "csharp",
          id: testTargetId("ProviderContractFixtures.Target"),
        },
        members: [
          {
            id: testTargetId("ProviderContractFixtures.Target.Invalid"),
            name: "invalid",
            kind: "method",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.Target.Invalid(System.Int32[],System.String)"),
                parameters: [
                  {
                    name: "values",
                    type: { kind: "array", elementType: { kind: "source-primitive", name: "int32" } },
                    rest: true,
                    passingMode: "byref-readonly",
                  },
                  {
                    name: "mode",
                    type: { kind: "string" },
                    passingMode: "not-a-mode",
                  },
                ],
                returnType: { kind: "void" },
              },
            ],
          },
          {
            id: testTargetId("ProviderContractFixtures.Target.InvalidRestType"),
            name: "invalidRestType",
            kind: "method",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.Target.InvalidRestType(System.String)"),
                parameters: [
                  {
                    name: "value",
                    type: { kind: "string" },
                    rest: true,
                  },
                ],
                returnType: { kind: "void" },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].rest"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].passingMode"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].passingMode"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[1].signatures[0].parameters[0].type"), true);
});

test(".NET reflection provider emits contract-valid SDK metadata slices", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {
    requestedExports: ["Console", "CLSCompliantAttribute"],
  });
  const collectionsModule = provider.getModule("@tsonic/dotnet/System.Collections.Generic.js", {
    requestedExports: ["List", "Dictionary"],
  });

  assert.equal("exports" in systemModule, true, JSON.stringify(systemModule));
  assert.equal("exports" in collectionsModule, true, JSON.stringify(collectionsModule));
  assert.equal(validateDotnetModuleModelContract(systemModule), undefined);
  assert.equal(validateDotnetModuleModelContract(collectionsModule), undefined);

  const console = rawType(systemModule, "Console");
  const rawWriteLineString = rawMethod(console, "writeLine", "System.Console.WriteLine(System.String)");
  const rawWriteLineChar = rawMethod(console, "writeLine", "System.Console.WriteLine(System.Char)");
  assert.ok(rawWriteLineString);
  assert.ok(rawWriteLineChar);
  assert.equal(rawMethod(console, "writeLine", "System.Console.WriteLine(System.String)").static, true);
  const systemSourceModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const sourceConsole = sourceType(systemSourceModel, "Console");
  const sourceWriteLine = sourceMember(sourceConsole, "writeLine");
  const sourceStringWriteLineSignatures = (sourceWriteLine.signatures ?? []).filter((signature) =>
    signature.parameters.length === 1 &&
    signature.parameters[0]?.type.kind === "string"
  );
  assert.equal(sourceStringWriteLineSignatures.length, 1);
  assert.notEqual(sourceStringWriteLineSignatures[0]?.id, rawWriteLineString.signatures[0].id);
  assert.notEqual(sourceStringWriteLineSignatures[0]?.id, rawWriteLineChar.signatures[0].id);

  const clsCompliantAttribute = rawType(systemModule, "CLSCompliantAttribute");
  assert.deepEqual(clsCompliantAttribute.baseType.sourceShape, {
    kind: "provider-ref",
    moduleSpecifier: "@tsonic/dotnet/System.js",
    exportName: "Attribute",
  });
  assert.ok(rawConstructor(clsCompliantAttribute, "System.CLSCompliantAttribute..ctor(System.Boolean)"));

  const list = rawType(collectionsModule, "List");
  assert.deepEqual(list.typeParameters.map((parameter) => parameter.name), ["T"]);
  assert.ok(rawConstructor(list, "System.Collections.Generic.List`1..ctor()"));
  assert.ok(rawMethod(list, "add", "System.Collections.Generic.List`1.Add(T)"));

  const dictionary = rawType(collectionsModule, "Dictionary");
  assert.deepEqual(dictionary.typeParameters.map((parameter) => parameter.name), ["TKey", "TValue"]);
  assert.ok(rawMethod(dictionary, "add", "System.Collections.Generic.Dictionary`2.Add(TKey,TValue)"));
  assert.ok(rawIndexer(dictionary, "System.Collections.Generic.Dictionary`2.Item(TKey)"));
});

test(".NET target binding provider emits contract-valid virtual declaration models", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetTargetBindingProvider({ provider });
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", {
    containingFile: "provider-contract.ts",
    requestedExports: ["Console", "CLSCompliantAttribute"],
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal("exports" in model, true, JSON.stringify(model));
  assert.equal(validateDotnetProviderDeclarationModelContract(model), undefined);
});

test(".NET provider invariant scan closes reflected models, virtual declarations, and target bindings", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [
      buildConstraintFixture(),
      buildSignatureIdentityFixture(),
      buildUnsupportedMemberFixture(),
    ],
  });
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {
    requestedExports: ["Array", "Console", "CLSCompliantAttribute", "ArgumentException"],
  });
  const signatureModule = provider.getModule("@tsonic/dotnet/ProviderSignatureFixtures.js", {});
  const constraintModule = provider.getModule("@tsonic/dotnet/ProviderConstraintFixtures.js", {});
  const unsupportedModule = provider.getModule("@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js", {});
  const modules = [systemModule, signatureModule, constraintModule, unsupportedModule];

  for (const module of modules) {
    assert.equal("exports" in module, true, JSON.stringify(module));
    assert.equal(validateDotnetModuleModelContract(module), undefined);
    assertRawModuleContractInvariants(module);
    const declarationModel = dotnetModuleToProviderDeclarationModel(module);
    assert.equal(validateDotnetProviderDeclarationModelContract(declarationModel), undefined);
    assertProviderDeclarationContractInvariants(declarationModel);
    assertTargetBindingContractInvariants(provider, module);
  }

  const nativeArray = rawType(systemModule, "Array");
  assert.equal(nativeArray.targetType.kind, "array");
  assert.equal(nativeArray.targetType.rank, undefined);
  assert.deepEqual(
    rawMethod(nativeArray, "create", "tsonic.dotnet.System.Array`1.create(System.Int32)").signatures[0].returnType,
    {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.js",
      exportName: "Array",
      typeArguments: [{ kind: "type-parameter", name: "T" }],
    },
  );

  const parameterModeTarget = rawType(signatureModule, "ParameterModeTarget");
  const byRefModes = rawMethod(parameterModeTarget, "byRefModes", "ProviderSignatureFixtures.ParameterModeTarget.ByRefModes(ref System.Int32,out System.Boolean,in System.Int64)").signatures[0];
  assert.deepEqual(byRefModes.parameters.map((parameter) => parameter.passingMode), [
    "byref-readwrite",
    "byref-writeonly-must-init",
    "byref-readonly",
  ]);
  const paramsRest = rawMethod(parameterModeTarget, "paramsRest", "ProviderSignatureFixtures.ParameterModeTarget.ParamsRest(System.String,System.Int32[])").signatures[0];
  assert.equal(paramsRest.parameters[1].rest, true);
  assert.equal(paramsRest.parameters[1].type.kind, "array");

  const constrained = rawType(constraintModule, "ReferenceNewTarget");
  assert.ok(constrained.typeParameters[0].constraints.length > 0);
  const constrainedBinding = provider.findTargetBindingByTargetId(constrained.targetId);
  assert.ok(constrainedBinding);
  assert.equal(constrainedBinding.typeParameters[0].constraints.length >= constrained.typeParameters[0].constraints.length, true);

  const pointerSignatures = rawType(unsupportedModule, "PointerSignatures");
  assert.equal(pointerSignatures.members?.some((member) => member.targetName === "PointerReturn") ?? false, false);
  assert.ok(pointerSignatures.unsupportedMembers?.some((member) =>
    member.memberKind === "method" &&
    member.targetName === "PointerReturn" &&
    /System\.Int32\*/u.test(member.reason)
  ));
});

test(".NET target binding provider reports unsupported requested exports with provider evidence", () => {
  const bindingProvider = createDotnetTargetBindingProvider({
    provider: {
      identity: {
        id: "test.dotnet",
        version: "0.0.0",
        displayName: "Test .NET provider",
      },
      ownsModule() {
        return { kind: "owned" };
      },
      getModule() {
        return {
          moduleSpecifier: "@tsonic/dotnet/ProviderUnsupportedFixtures.js",
          namespaceName: "ProviderUnsupportedFixtures",
          exports: [],
          unsupportedExports: [
            {
              kind: "unsupported-type-export",
              sourceName: "PointerDelegate",
              targetId: testTargetId("ProviderUnsupportedFixtures.PointerDelegate"),
              metadataName: "ProviderUnsupportedFixtures.PointerDelegate",
              reason: "Delegate invoke signature contains pointer parameter System.Int32*.",
            },
          ],
        };
      },
    },
  });

  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/ProviderUnsupportedFixtures.js", {
    containingFile: "provider-unsupported.ts",
    requestedExports: ["PointerDelegate"],
  });
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(resolution);
  assert.equal(model.extensionCode, "DOTNET_PROVIDER_REQUESTED_EXPORT_UNSUPPORTED");
  assert.match(model.message, /PointerDelegate/u);
  assert.match(JSON.stringify(model.evidence), /pointer parameter/u);
  assert.match(JSON.stringify(model.evidence), /ProviderUnsupportedFixtures\.PointerDelegate/u);
  assert.match(JSON.stringify(model.evidence), new RegExp(escapeRegExp(testTargetId("ProviderUnsupportedFixtures.PointerDelegate")), "u"));
});

test(".NET provider unsupported diagnostics preserve attribute and default-value omission facts", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    disablePersistentCache: true,
    references: [
      buildAttributeFixture(),
      buildUnsupportedDefaultParameterFixture(),
    ],
  });

  const attributeModule = provider.getModule("@tsonic/dotnet/ProviderAttributeFixtures.js", {});
  assert.equal("exports" in attributeModule, true, JSON.stringify(attributeModule));
  assert.equal(validateDotnetModuleModelContract(attributeModule), undefined);
  const unsupportedAttributeTarget = rawType(attributeModule, "UnsupportedAttributeTarget");
  const unsupportedAttribute = unsupportedAttributeTarget.unsupportedAttributes?.find((attribute) =>
    /Type attribute value 'System\.Int32\*' cannot be represented/u.test(attribute.reason)
  );
  assert.ok(unsupportedAttribute);
  assert.equal(unsupportedAttribute.target, "type");
  const attributeBinding = provider.findTargetBindingByTargetId(unsupportedAttributeTarget.targetId);
  assert.ok(attributeBinding);
  assert.ok(attributeBinding.unsupportedAttributes?.some((attribute) =>
    attribute.id === unsupportedAttribute.id &&
    attribute.reason === unsupportedAttribute.reason
  ));

  const defaultModule = provider.getModule("@tsonic/dotnet/ProviderUnsupportedDefaultFixtures.js", {});
  assert.equal("exports" in defaultModule, true, JSON.stringify(defaultModule));
  assert.equal(validateDotnetModuleModelContract(defaultModule), undefined);
  const unsupportedDefaultSource = rawType(defaultModule, "UnsupportedDefaultParameterSource");
  const rawSignature = rawMethod(
    unsupportedDefaultSource,
    "unsupportedDateTimeDefault",
    "ProviderUnsupportedDefaultFixtures.UnsupportedDefaultParameterSource.UnsupportedDateTimeDefault(System.DateTime)",
  ).signatures[0];
  const rawParameter = rawSignature.parameters[0];
  assert.equal(rawParameter.optional, true);
  assert.equal(rawParameter.defaultValue, undefined);
  assert.equal(rawParameter.unsupportedDefaultValue.kind, "unsupported-default-value");
  assert.equal(rawParameter.unsupportedDefaultValue.parameterName, "value");
  assert.match(rawParameter.unsupportedDefaultValue.reason, /System\.DateTime/u);

  const sourceModel = dotnetModuleToProviderDeclarationModel(defaultModule);
  assert.equal(validateDotnetProviderDeclarationModelContract(sourceModel), undefined);
  const sourceDefaultType = sourceModel.exports.find((declaration) => declaration.name === "UnsupportedDefaultParameterSource");
  const sourceSignature = sourceDefaultType?.members?.find((member) => member.name === "unsupportedDateTimeDefault")?.signatures?.[0];
  assert.ok(sourceSignature);
  assert.equal(sourceSignature.parameters[0].optional, true);
  assert.equal("defaultValue" in sourceSignature.parameters[0], false);
  assert.equal("unsupportedDefaultValue" in sourceSignature.parameters[0], false);

  const defaultBinding = provider.findTargetBindingByTargetId(unsupportedDefaultSource.targetId);
  assert.ok(defaultBinding);
  const targetSignature = defaultBinding.members
    ?.find((member) => idHasShape(member.id, "ProviderUnsupportedDefaultFixtures.UnsupportedDefaultParameterSource.UnsupportedDateTimeDefault(System.DateTime)"));
  assert.ok(targetSignature);
  assert.deepEqual(targetSignature.parameters[0].unsupportedDefaultValue, rawParameter.unsupportedDefaultValue);
});

test(".NET synthetic native array target binding is discoverable by provider target id", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const binding = provider.findTargetBindingByTargetId(dotnetNativeArrayTypeId);
  assert.ok(binding);
  assert.equal(binding.id, dotnetNativeArrayTypeId);
  assert.equal(binding.sourceName, "Array");
});

function testTargetId(metadataName) {
  return `${testAssemblyId}::${metadataName}`;
}

function hasEvidencePath(diagnostic, path) {
  return diagnostic?.evidence?.some((entry) => entry.path === path) === true;
}

function assertRawModuleContractInvariants(module) {
  assert.equal(typeof module.moduleSpecifier, "string");
  assert.equal(typeof module.namespaceName, "string");
  if (module.assembly !== undefined) {
    assertAssemblyReference(module.assembly, "$.assembly");
  }
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind !== "type") {
      continue;
    }
    assertTargetIdentity(declaration.targetId, declaration.metadataName, `${declaration.sourceName}.targetId`, declaration.assembly);
    if (declaration.assembly !== undefined) {
      assertAssemblyReference(declaration.assembly, `${declaration.sourceName}.assembly`);
    }
    walkDotnetTypeDeclarationRefs(declaration, (type, path) => assertDotnetTypeRefInvariant(type, `${declaration.sourceName}.${path}`));
    for (const parameter of declaration.typeParameters ?? []) {
      assertTypeParameterInvariant(parameter, `${declaration.sourceName}<${parameter.name}>`);
    }
    for (const member of declaration.members ?? []) {
      assertTargetIdentity(member.targetId, member.metadataName, `${declaration.sourceName}.${member.targetName}.targetId`);
      for (const signature of member.signatures ?? []) {
        assertRawSignatureInvariant(signature, `${declaration.sourceName}.${member.targetName}`);
      }
      if (member.kind === "event") {
        assert.ok(
          declaration.unsupportedMembers?.some((unsupported) =>
            unsupported.memberKind === "event" &&
            unsupported.targetId === member.targetId &&
            typeof unsupported.reason === "string" &&
            unsupported.reason.length > 0
          ),
          `Source-visible event '${declaration.sourceName}.${member.targetName}' must carry unsupported source-event evidence.`,
        );
      }
    }
    for (const unsupportedMember of declaration.unsupportedMembers ?? []) {
      assertTargetIdentity(unsupportedMember.targetId, unsupportedMember.metadataName, `${declaration.sourceName}.${unsupportedMember.targetName}.unsupportedTargetId`);
      assert.equal(typeof unsupportedMember.reason, "string");
      assert.notEqual(unsupportedMember.reason.length, 0);
    }
  }
  for (const unsupportedExport of module.unsupportedExports ?? []) {
    assert.equal(typeof unsupportedExport.reason, "string");
    assert.notEqual(unsupportedExport.reason.length, 0);
    if (unsupportedExport.kind === "unsupported-type-export") {
      assertTargetIdentity(unsupportedExport.targetId, unsupportedExport.metadataName, `${unsupportedExport.sourceName}.unsupportedTargetId`, unsupportedExport.assembly);
      continue;
    }
    assert.ok(Array.isArray(unsupportedExport.targetIds));
    assert.ok(Array.isArray(unsupportedExport.metadataNames));
    assert.equal(unsupportedExport.targetIds.length, unsupportedExport.metadataNames.length);
    for (const [index, targetId] of unsupportedExport.targetIds.entries()) {
      assertTargetIdentity(targetId, unsupportedExport.metadataNames[index], `${unsupportedExport.sourceName}.unsupportedTargetIds[${index}]`, unsupportedExport.assemblies?.[index]);
    }
  }
}

function assertProviderDeclarationContractInvariants(model) {
  assert.equal(typeof model.moduleSpecifier, "string");
  assert.equal(typeof model.providerModuleId, "string");
  for (const declaration of model.exports) {
    if (declaration.kind !== "namespace") {
      assert.equal(declaration.targetIdentity?.target, "csharp");
      assert.equal(typeof declaration.targetIdentity?.id, "string");
      assert.notEqual(declaration.targetIdentity.id.length, 0);
    }
    walkProviderExportRefs(declaration, (type, path) => assertProviderTypeExpressionInvariant(type, `${declaration.name}.${path}`));
  }
}

function assertTargetBindingContractInvariants(provider, module) {
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind !== "type") {
      continue;
    }
    const binding = provider.findTargetBindingByTargetId(declaration.targetId);
    assert.ok(binding, `Missing target binding for ${declaration.targetId}`);
    assert.equal(binding.id, declaration.targetId);
    assert.equal(binding.target, "csharp");
    if ((declaration.unsupportedMembers?.length ?? 0) > 0) {
      assert.equal(binding.unsupportedMembers?.length >= declaration.unsupportedMembers.length, true);
    }
    if ((declaration.unsupportedImplementedContracts?.length ?? 0) > 0) {
      assert.equal(binding.unsupportedImplementedContracts?.length >= declaration.unsupportedImplementedContracts.length, true);
    }
  }
}

function assertRawSignatureInvariant(signature, path) {
  for (const [index, parameter] of signature.parameters.entries()) {
    assert.equal(supportedPassingModes.has(parameter.passingMode), true, `${path}.parameters[${index}].passingMode`);
    walkDotnetTypeRef(parameter.type, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.parameters[${index}].type.${typePath}`));
    if (parameter.rest === true) {
      assert.equal(index, signature.parameters.length - 1, `${path}.parameters[${index}].rest`);
      assert.equal(parameter.passingMode, "by-value", `${path}.parameters[${index}].rest.passingMode`);
      assert.equal(parameter.type.kind, "array", `${path}.parameters[${index}].rest.type`);
    }
    if (parameter.defaultValue !== undefined || parameter.unsupportedDefaultValue !== undefined) {
      assert.equal(parameter.optional, true, `${path}.parameters[${index}].default.optional`);
      assert.equal(parameter.defaultValue === undefined || parameter.unsupportedDefaultValue === undefined, true, `${path}.parameters[${index}].default.exclusive`);
    }
    if (parameter.unsupportedDefaultValue !== undefined) {
      assert.equal(typeof parameter.unsupportedDefaultValue.reason, "string");
      assert.notEqual(parameter.unsupportedDefaultValue.reason.length, 0);
    }
  }
  if (signature.returnType !== undefined) {
    walkDotnetTypeRef(signature.returnType, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.returnType.${typePath}`));
  }
  if (signature.targetReturnType !== undefined) {
    walkDotnetTypeRef(signature.targetReturnType, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.targetReturnType.${typePath}`));
  }
  for (const parameter of signature.typeParameters ?? []) {
    assertTypeParameterInvariant(parameter, `${path}.${parameter.name}`);
  }
}

function assertTypeParameterInvariant(parameter, path) {
  assert.equal(typeof parameter.name, "string", path);
  assert.notEqual(parameter.name.length, 0, path);
  if (parameter.variance !== undefined) {
    assert.ok(["in", "out", "invariant", "target-defined"].includes(parameter.variance), `${path}.variance`);
  }
  for (const constraint of parameter.constraints ?? []) {
    if (constraint.kind === "implements") {
      walkDotnetTypeRef(constraint.contract, (type, typePath) => assertDotnetTypeRefInvariant(type, `${path}.constraint.${typePath}`));
    }
  }
}

function assertDotnetTypeRefInvariant(type, path) {
  if (type.kind === "provider-ref") {
    assert.equal(typeof type.moduleSpecifier, "string", `${path}.moduleSpecifier`);
    assert.notEqual(type.moduleSpecifier.length, 0, `${path}.moduleSpecifier`);
    assert.equal(typeof type.exportName, "string", `${path}.exportName`);
    assert.notEqual(type.exportName.length, 0, `${path}.exportName`);
    assert.equal("name" in type, false, `${path}.name`);
  }
  if (type.kind === "named") {
    assertTargetIdentity(type.targetId, type.metadataName, `${path}.targetId`);
  }
  if (type.kind === "array" && type.rank !== undefined) {
    assert.equal(Number.isInteger(type.rank) && type.rank >= 1, true, `${path}.rank`);
  }
}

function assertProviderTypeExpressionInvariant(type, path) {
  if (type.kind === "provider-ref") {
    assert.equal(typeof type.moduleSpecifier, "string", `${path}.moduleSpecifier`);
    assert.notEqual(type.moduleSpecifier.length, 0, `${path}.moduleSpecifier`);
    assert.equal(typeof type.exportName, "string", `${path}.exportName`);
    assert.notEqual(type.exportName.length, 0, `${path}.exportName`);
    assert.equal("name" in type, false, `${path}.name`);
  }
  if (type.kind === "target-named") {
    assert.equal(type.target, "csharp", `${path}.target`);
    assert.equal(typeof type.id, "string", `${path}.id`);
    assert.notEqual(type.id.length, 0, `${path}.id`);
  }
}

function assertAssemblyReference(reference, path) {
  assert.equal(typeof reference.name, "string", `${path}.name`);
  assert.notEqual(reference.name.length, 0, `${path}.name`);
  if (reference.version !== undefined) {
    assert.equal(typeof reference.version, "string", `${path}.version`);
    assert.notEqual(reference.version.length, 0, `${path}.version`);
  }
  if (reference.path !== undefined) {
    assert.equal(typeof reference.path, "string", `${path}.path`);
    assert.notEqual(reference.path.length, 0, `${path}.path`);
  }
}

function assertTargetIdentity(targetId, metadataName, path, assembly) {
  assert.equal(typeof targetId, "string", path);
  assert.notEqual(targetId.length, 0, path);
  assert.equal(typeof metadataName, "string", `${path}.metadataName`);
  assert.notEqual(metadataName.length, 0, `${path}.metadataName`);
  assert.notEqual(targetId, metadataName, `${path} must not fall back to metadataName`);
  if (assembly !== undefined) {
    assert.match(targetId, /::/u, `${path} must be assembly-qualified`);
  }
}

function walkDotnetTypeDeclarationRefs(declaration, visit) {
  for (const type of [
    declaration.baseType,
    declaration.sourceShape,
    declaration.targetType,
  ]) {
    if (type !== undefined) {
      walkDotnetTypeRef(type, visit);
    }
  }
  for (const constraint of declaration.implementedContracts ?? []) {
    if (constraint.kind === "implements") {
      walkDotnetTypeRef(constraint.contract, visit);
    }
  }
  for (const parameter of declaration.typeParameters ?? []) {
    if (parameter.defaultType !== undefined) {
      walkDotnetTypeRef(parameter.defaultType, visit);
    }
  }
  for (const member of declaration.members ?? []) {
    if (member.type !== undefined) {
      walkDotnetTypeRef(member.type, visit);
    }
    for (const signature of member.signatures ?? []) {
      for (const parameter of signature.parameters) {
        walkDotnetTypeRef(parameter.type, visit);
      }
      if (signature.returnType !== undefined) {
        walkDotnetTypeRef(signature.returnType, visit);
      }
      if (signature.targetReturnType !== undefined) {
        walkDotnetTypeRef(signature.targetReturnType, visit);
      }
    }
  }
}

function walkDotnetTypeRef(type, visit, path = "$") {
  visit(type, path);
  switch (type.kind) {
    case "provider-ref":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkDotnetTypeRef(argument, visit, `${path}.typeArguments[${index}]`);
      }
      return;
    case "named":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkDotnetTypeRef(argument, visit, `${path}.typeArguments[${index}]`);
      }
      if (type.sourceShape !== undefined) {
        walkDotnetTypeRef(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    case "array":
      walkDotnetTypeRef(type.elementType, visit, `${path}.elementType`);
      return;
    case "nullable":
      walkDotnetTypeRef(type.elementType, visit, `${path}.elementType`);
      return;
    case "tuple":
      for (const [index, element] of type.elements.entries()) {
        walkDotnetTypeRef(element, visit, `${path}.elements[${index}]`);
      }
      return;
    case "union":
      for (const [index, element] of type.types.entries()) {
        walkDotnetTypeRef(element, visit, `${path}.types[${index}]`);
      }
      return;
    case "function":
      for (const [index, parameter] of type.parameters.entries()) {
        walkDotnetTypeRef(parameter.type, visit, `${path}.parameters[${index}].type`);
      }
      walkDotnetTypeRef(type.returnType, visit, `${path}.returnType`);
      return;
    case "pointer":
      walkDotnetTypeRef(type.pointee, visit, `${path}.pointee`);
      return;
    case "function-pointer":
      for (const [index, argument] of type.args.entries()) {
        walkDotnetTypeRef(argument, visit, `${path}.args[${index}]`);
      }
      walkDotnetTypeRef(type.result, visit, `${path}.result`);
      return;
    case "opaque":
      if (type.sourceShape !== undefined) {
        walkDotnetTypeRef(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    default:
      return;
  }
}

function walkProviderExportRefs(declaration, visit) {
  if (declaration.type !== undefined) {
    walkProviderTypeExpression(declaration.type, visit);
  }
  for (const parameter of declaration.typeParameters ?? []) {
    for (const constraint of parameter.constraints ?? []) {
      walkProviderTypeExpression(constraint, visit);
    }
    if (parameter.defaultType !== undefined) {
      walkProviderTypeExpression(parameter.defaultType, visit);
    }
  }
  for (const heritage of declaration.heritage ?? []) {
    walkProviderTypeExpression(heritage.type, visit);
  }
  for (const member of declaration.members ?? []) {
    if (member.type !== undefined) {
      walkProviderTypeExpression(member.type, visit);
    }
    for (const signature of member.signatures ?? []) {
      for (const parameter of signature.parameters) {
        walkProviderTypeExpression(parameter.type, visit);
      }
      if (signature.returnType !== undefined) {
        walkProviderTypeExpression(signature.returnType, visit);
      }
    }
  }
  for (const signature of declaration.signatures ?? []) {
    for (const parameter of signature.parameters) {
      walkProviderTypeExpression(parameter.type, visit);
    }
    if (signature.returnType !== undefined) {
      walkProviderTypeExpression(signature.returnType, visit);
    }
  }
}

function walkProviderTypeExpression(type, visit, path = "$") {
  visit(type, path);
  switch (type.kind) {
    case "provider-ref":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkProviderTypeExpression(argument, visit, `${path}.typeArguments[${index}]`);
      }
      return;
    case "target-named":
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        walkProviderTypeExpression(argument, visit, `${path}.typeArguments[${index}]`);
      }
      if (type.sourceShape !== undefined) {
        walkProviderTypeExpression(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    case "array":
      walkProviderTypeExpression(type.elementType, visit, `${path}.elementType`);
      return;
    case "tuple":
      for (const [index, element] of type.elementTypes.entries()) {
        walkProviderTypeExpression(element, visit, `${path}.elementTypes[${index}]`);
      }
      return;
    case "union":
    case "intersection":
      for (const [index, element] of type.types.entries()) {
        walkProviderTypeExpression(element, visit, `${path}.types[${index}]`);
      }
      return;
    case "function":
      for (const [index, parameter] of type.parameters.entries()) {
        walkProviderTypeExpression(parameter.type, visit, `${path}.parameters[${index}].type`);
      }
      walkProviderTypeExpression(type.returnType, visit, `${path}.returnType`);
      return;
    case "opaque":
      if (type.sourceShape !== undefined) {
        walkProviderTypeExpression(type.sourceShape, visit, `${path}.sourceShape`);
      }
      return;
    default:
      return;
  }
}

function rawType(module, sourceName) {
  const declaration = module.exports.find((candidate) => candidate.kind === "type" && candidate.sourceName === sourceName);
  assert.ok(declaration, `Missing raw type ${sourceName}`);
  return declaration;
}

function rawMethod(type, sourceName, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "method" &&
    candidate.sourceName === sourceName &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing method ${type.sourceName}.${sourceName} with signature ${signatureShape}`);
  return member;
}

function sourceType(model, sourceName) {
  const declaration = model.exports.find((candidate) => candidate.name === sourceName);
  assert.ok(declaration, `Missing source type ${sourceName}`);
  return declaration;
}

function sourceMember(type, sourceName) {
  const member = type.members?.find((candidate) => candidate.name === sourceName);
  assert.ok(member, `Missing source member ${type.name}.${sourceName}`);
  return member;
}

function rawConstructor(type, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "constructor" &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing constructor ${type.sourceName} with signature ${signatureShape}`);
  return member;
}

function rawIndexer(type, signatureShape) {
  const member = type.members?.find((candidate) =>
    candidate.kind === "indexer" &&
    candidate.signatures?.some((signature) => idHasShape(signature.id, signatureShape))
  );
  assert.ok(member, `Missing indexer ${type.sourceName} with signature ${signatureShape}`);
  return member;
}

function idHasShape(id, metadataShape) {
  return stripAssemblyQualifiers(id) === metadataShape;
}

function stripAssemblyQualifiers(id) {
  return id.replace(/(^|[<(,])(?:(out|ref|in) )?[^:<>()]+::/gu, (_match, delimiter, passingMode) =>
    `${delimiter}${passingMode === undefined ? "" : `${passingMode} `}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildConstraintFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constraints/ConstraintProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstraintProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constraints"),
  });
}

function buildSignatureIdentityFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/signature-identity/SignatureIdentityProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/signature-identity/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "SignatureIdentityProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/signature-identity"),
  });
}

function buildUnsupportedMemberFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members/UnsupportedMembersProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-members/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedMembersProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/unsupported-members"),
  });
}

function buildAttributeFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/attributes/AttributeProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/attributes/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "AttributeProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/attributes"),
  });
}

function buildUnsupportedDefaultParameterFixture() {
  const fixtureDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/unsupported-default-params");
  const project = join(fixtureDirectory, "UnsupportedDefaultParameterProviderFixture.csproj");
  const source = join(fixtureDirectory, "UnsupportedDefaultParameterSource.cs");
  const outputDirectory = join(fixtureDirectory, "bin");
  const intermediateDirectory = join(fixtureDirectory, "obj/");
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
`);
  writeFileSync(source, `using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace ProviderUnsupportedDefaultFixtures;

public sealed class UnsupportedDefaultParameterSource
{
    public void UnsupportedDateTimeDefault(
        [Optional, DateTimeConstant(638000000000000000L)] DateTime value)
    {
    }
}
`);
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "UnsupportedDefaultParameterProviderFixture.dll",
    projectDirectory: fixtureDirectory,
  });
}
