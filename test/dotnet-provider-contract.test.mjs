import { assert, mkdirSync, writeFileSync, dirname, join, test, fileURLToPath, createDotnetReflectionTypeDataProvider, createDotnetSourceDeclarationProvider, dotnetModuleToProviderDeclarationModel, dotnetNativeArrayTypeId, validateDotnetModuleModelContract, validateDotnetProviderDeclarationModelContract, buildDotnetFixture, repoRoot, testAssemblyId, supportedPassingModes, testTargetId, hasEvidencePath, assertRawModuleContractInvariants, assertProviderDeclarationContractInvariants, assertTargetBindingContractInvariants, assertRawSignatureInvariant, assertTypeParameterInvariant, assertDotnetTypeRefInvariant, assertProviderTypeExpressionInvariant, assertAssemblyReference, assertTargetIdentity, walkDotnetTypeDeclarationRefs, walkDotnetTypeRef, walkProviderExportRefs, walkProviderTypeExpression, rawType, rawMethod, sourceType, sourceMember, rawConstructor, rawIndexer, idHasShape, stripAssemblyQualifiers, escapeRegExp, buildConstraintFixture, buildSignatureIdentityFixture, buildUnsupportedMemberFixture, buildAttributeFixture, buildUnsupportedDefaultParameterFixture } from "./dotnet-provider-contract.helpers.mjs";
import { completeProviderDeclarationRequest, getCompleteDotnetModule } from "./dotnet-provider.helpers.mjs";

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
test(".NET provider model requires an explicit source identity for every target signature", () => {
  const model = {
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [{
      kind: "type",
      typeKind: "class",
      sourceName: "Derived",
      namespaceName: "ProviderContractFixtures",
      targetId: testTargetId("ProviderContractFixtures.Derived"),
      metadataName: "ProviderContractFixtures.Derived",
      members: [{
        kind: "method",
        sourceName: "run",
        targetName: "Run",
        targetId: testTargetId("ProviderContractFixtures.Derived.Run"),
        metadataName: "ProviderContractFixtures.Derived.Run",
        signatures: [{
          id: testTargetId("ProviderContractFixtures.Derived.Run()"),
          parameters: [],
          returnType: { kind: "void" },
        }],
      }],
    }],
  };
  const diagnostic = validateDotnetModuleModelContract(model);

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(
    hasEvidencePath(
      diagnostic,
      "$.exports[0].members[0].signatures[0].sourceId",
    ),
    true,
  );
  const signature = model.exports[0].members[0].signatures[0];
  signature.sourceId = testTargetId("ProviderContractFixtures.Base.Run()");
  signature.providerSourceSignatureId = signature.sourceId;
  const legacyDiagnostic = validateDotnetModuleModelContract(model);
  assert.equal(legacyDiagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(
    hasEvidencePath(
      legacyDiagnostic,
      "$.exports[0].members[0].signatures[0].providerSourceSignatureId",
    ),
    true,
  );
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
                sourceId: testTargetId("ProviderContractFixtures.Box.Broken(System.Int32,System.String)"),
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
test(".NET provider model contract rejects extra fields on type-ref variants", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "BadShapes",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.BadShapes"),
        metadataName: "ProviderContractFixtures.BadShapes",
        members: [
          {
            kind: "method",
            sourceName: "bad",
            targetName: "Bad",
            targetId: testTargetId("ProviderContractFixtures.BadShapes.Bad"),
            metadataName: "ProviderContractFixtures.BadShapes.Bad",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.BadShapes.Bad(System.String,System.Int32[])"),
                sourceId: testTargetId("ProviderContractFixtures.BadShapes.Bad(System.String,System.Int32[])"),
                parameters: [
                  {
                    name: "text",
                    type: { kind: "string", sourceShape: { kind: "string" } },
                    passingMode: "by-value",
                  },
                  {
                    name: "values",
                    type: {
                      kind: "array",
                      elementType: { kind: "source-primitive", name: "int32", width: 32 },
                      sourceShape: {
                        kind: "provider-ref",
                        moduleSpecifier: "@tsonic/dotnet/System.js",
                        exportName: "Array",
                      },
                    },
                    passingMode: "by-value",
                  },
                  {
                    name: "nullable",
                    type: {
                      kind: "nullable-reference",
                      elementType: { kind: "string" },
                      sourceShape: { kind: "string" },
                    },
                    passingMode: "by-value",
                  },
                ],
                returnType: { kind: "void", targetId: "System.Void" },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].type.sourceShape"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].type.sourceShape"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[1].type.elementType.width"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[2].type.sourceShape"), true);
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].returnType.targetId"), true);
});
test(".NET provider model accepts native-array input only as exact named-type evidence", () => {
  const diagnostic = validateDotnetModuleModelContract({
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [{
      kind: "type",
      typeKind: "class",
      sourceName: "ArrayInputs",
      namespaceName: "ProviderContractFixtures",
      targetId: testTargetId("ProviderContractFixtures.ArrayInputs"),
      metadataName: "ProviderContractFixtures.ArrayInputs",
      members: [{
        kind: "method",
        sourceName: "accept",
        targetName: "Accept",
        targetId: testTargetId("ProviderContractFixtures.ArrayInputs.Accept"),
        metadataName: "ProviderContractFixtures.ArrayInputs.Accept",
        signatures: [{
          id: testTargetId("ProviderContractFixtures.ArrayInputs.Accept(System.Object,System.Object)"),
          sourceId: testTargetId("ProviderContractFixtures.ArrayInputs.Accept(System.Object,System.Object)"),
          parameters: [{
            name: "notProven",
            passingMode: "by-value",
            type: {
              kind: "named",
              targetId: testTargetId("ProviderContractFixtures.Sequence"),
              metadataName: "ProviderContractFixtures.Sequence",
              sourceShape: {
                kind: "array",
                elementType: { kind: "string" },
              },
              implicitArrayInput: false,
            },
          }, {
            name: "wrongShape",
            passingMode: "by-value",
            type: {
              kind: "named",
              targetId: testTargetId("ProviderContractFixtures.Text"),
              metadataName: "ProviderContractFixtures.Text",
              sourceShape: { kind: "string" },
              implicitArrayInput: true,
            },
          }],
          returnType: { kind: "void" },
        }],
      }],
    }],
  });

  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(
    hasEvidencePath(
      diagnostic,
      "$.exports[0].members[0].signatures[0].parameters[0].type.implicitArrayInput",
    ),
    true,
  );
  assert.equal(
    hasEvidencePath(
      diagnostic,
      "$.exports[0].members[0].signatures[0].parameters[1].type.implicitArrayInput",
    ),
    true,
  );
});
test(".NET provider model contract accepts nullable CLR params-array targets without weakening rest shape validation", () => {
  const model = {
    moduleSpecifier: "@tsonic/dotnet/ProviderContractFixtures.js",
    namespaceName: "ProviderContractFixtures",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "ParamsTarget",
        namespaceName: "ProviderContractFixtures",
        targetId: testTargetId("ProviderContractFixtures.ParamsTarget"),
        metadataName: "ProviderContractFixtures.ParamsTarget",
        members: [
          {
            kind: "method",
            sourceName: "Values",
            targetName: "Values",
            targetId: testTargetId("ProviderContractFixtures.ParamsTarget.Values"),
            metadataName: "ProviderContractFixtures.ParamsTarget.Values(System.Object[])",
            signatures: [
              {
                id: testTargetId("ProviderContractFixtures.ParamsTarget.Values(System.Object[])"),
                sourceId: testTargetId("ProviderContractFixtures.ParamsTarget.Values(System.Object[])"),
                parameters: [
                  {
                    name: "values",
                    type: {
                      kind: "nullable-reference",
                      elementType: {
                        kind: "array",
                        elementType: { kind: "object" },
                      },
                    },
                    passingMode: "by-value",
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
  };

  assert.equal(validateDotnetModuleModelContract(model), undefined);
  model.exports[0].members[0].signatures[0].parameters[0].type = {
    kind: "nullable-reference",
    elementType: { kind: "object" },
  };
  const diagnostic = validateDotnetModuleModelContract(model);
  assert.equal(diagnostic?.code, "DOTNET_PROVIDER_MODEL_CONTRACT_INVALID");
  assert.equal(hasEvidencePath(diagnostic, "$.exports[0].members[0].signatures[0].parameters[0].type"), true);
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
                sourceId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.AcceptMatrix(System.Int32[,])"),
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
                sourceId: testTargetId("ProviderContractFixtures.UnsupportedShapeTarget.Choose(System.Object)"),
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
test(".NET provider declaration contract rejects provider refs missing public module identity", () => {
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
  const systemModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {
    requestedExports: ["Console", "CLSCompliantAttribute"],
  });
  const collectionsModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Collections.Generic.js", {
    requestedExports: ["List", "Dictionary"],
  });

  assert.equal("exports" in systemModule, true, JSON.stringify(systemModule));
  assert.equal("exports" in collectionsModule, true, JSON.stringify(collectionsModule));
  assert.equal(validateDotnetModuleModelContract(systemModule), undefined);
  assert.equal(validateDotnetModuleModelContract(collectionsModule), undefined);

  const console = rawType(systemModule, "Console");
  const rawWriteLineString = rawMethod(console, "WriteLine", "System.Console.WriteLine(System.String)");
  const rawWriteLineChar = rawMethod(console, "WriteLine", "System.Console.WriteLine(System.Char)");
  assert.ok(rawWriteLineString);
  assert.ok(rawWriteLineChar);
  assert.equal(rawMethod(console, "WriteLine", "System.Console.WriteLine(System.String)").static, true);
  const systemSourceModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const sourceConsole = sourceType(systemSourceModel, "Console");
  const sourceWriteLine = sourceMember(sourceConsole, "WriteLine");
  const sourceStringWriteLineSignatures = (sourceWriteLine.signatures ?? []).filter((signature) =>
    signature.parameters.length === 1 &&
    JSON.stringify(signature.parameters[0]?.type) === JSON.stringify({
      kind: "union",
      types: [{ kind: "string" }, { kind: "undefined" }],
    })
  );
  assert.equal(sourceStringWriteLineSignatures.length, 1);
  assert.deepEqual(sourceStringWriteLineSignatures[0]?.parameters[0]?.type, {
    kind: "union",
    types: [{ kind: "string" }, { kind: "undefined" }],
  });
  const rawStringSignature = rawWriteLineString.signatures.find((signature) =>
    idHasShape(signature.id, "System.Console.WriteLine(System.String)"));
  const rawCharSignature = rawWriteLineChar.signatures.find((signature) =>
    idHasShape(signature.id, "System.Console.WriteLine(System.Char)"));
  assert.ok(rawStringSignature);
  assert.ok(rawCharSignature);
  assert.notEqual(sourceStringWriteLineSignatures[0]?.id, rawStringSignature.id);
  assert.notEqual(sourceStringWriteLineSignatures[0]?.id, rawCharSignature.id);
  assert.equal(new Set(sourceWriteLine.signatures?.map((signature) => signature.id)).size, sourceWriteLine.signatures?.length);
  const consoleBinding = provider.findTargetBindingByTargetId(console.targetId);
  assert.ok(consoleBinding);
  const targetStringWriteLine = consoleBinding.members?.find((member) => member.id === rawStringSignature.id);
  const targetCharWriteLine = consoleBinding.members?.find((member) => member.id === rawCharSignature.id);
  assert.ok(targetStringWriteLine);
  assert.ok(targetCharWriteLine);
  const consoleRelations = provider.resolveTargetRelations({
    moduleSpecifier: "@tsonic/dotnet/System.js",
    providerModuleId: "@tsonic/dotnet/System.js",
    artifactFileName: "tsts-provider://contract/System.Console.d.ts",
    exportName: "Console",
  });
  assert.equal(
    Array.isArray(consoleRelations),
    true,
    Array.isArray(consoleRelations) ? undefined : JSON.stringify(consoleRelations),
  );
  assert.deepEqual(
    consoleRelations
      .filter((relation) =>
        relation.kind === "signature" &&
        relation.signatureId === sourceStringWriteLineSignatures[0]?.id &&
        (relation.targetMember.id === targetStringWriteLine.id ||
          relation.targetMember.id === targetCharWriteLine.id)
      )
      .map((relation) => relation.targetMember.id)
      .sort(),
    [targetCharWriteLine.id, targetStringWriteLine.id].sort(),
  );

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
  assert.ok(rawMethod(list, "Add", "System.Collections.Generic.List`1.Add(T)"));

  const dictionary = rawType(collectionsModule, "Dictionary");
  assert.deepEqual(dictionary.typeParameters.map((parameter) => parameter.name), ["TKey", "TValue"]);
  assert.ok(rawMethod(dictionary, "Add", "System.Collections.Generic.Dictionary`2.Add(TKey,TValue)"));
  assert.ok(rawIndexer(dictionary, "System.Collections.Generic.Dictionary`2.Item(TKey)"));
});
test(".NET target binding provider emits contract-valid virtual declaration models", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const bindingProvider = createDotnetSourceDeclarationProvider({ provider });
  const requestContext = {
    containingFile: "provider-contract.ts",
    requestedExports: ["Console", "CLSCompliantAttribute"],
  };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/System.js", requestContext);
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
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
  const systemModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", {
    requestedExports: ["Array", "Console", "CLSCompliantAttribute", "ArgumentException"],
  });
  const signatureModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderSignatureFixtures.js", {});
  const constraintModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderConstraintFixtures.js", {});
  const unsupportedModule = getCompleteDotnetModule(provider, "@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js", {});
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
    rawMethod(nativeArray, "Create", "tsonic.dotnet.System.Array`1.Create(System.Int32)").signatures[0].returnType,
    {
      kind: "provider-ref",
      moduleSpecifier: "@tsonic/dotnet/System.js",
      exportName: "Array",
      typeArguments: [{ kind: "type-parameter", name: "T" }],
    },
  );

  const parameterModeTarget = rawType(signatureModule, "ParameterModeTarget");
  const byRefModes = rawMethod(parameterModeTarget, "ByRefModes", "ProviderSignatureFixtures.ParameterModeTarget.ByRefModes(ref System.Int32,out System.Boolean,in System.Int64)").signatures[0];
  assert.deepEqual(byRefModes.parameters.map((parameter) => parameter.passingMode), [
    "byref-readwrite",
    "byref-writeonly-must-init",
    "byref-readonly",
  ]);
  const paramsRest = rawMethod(parameterModeTarget, "ParamsRest", "ProviderSignatureFixtures.ParameterModeTarget.ParamsRest(System.String,System.Int32[])").signatures[0];
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
  const bindingProvider = createDotnetSourceDeclarationProvider({
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

  const requestContext = {
    containingFile: "provider-unsupported.ts",
    requestedExports: ["PointerDelegate"],
  };
  const resolution = bindingProvider.resolveModule("@tsonic/dotnet/ProviderUnsupportedFixtures.js", requestContext);
  assert.equal(resolution.kind, "virtual", JSON.stringify(resolution));
  const model = bindingProvider.getDeclarationModel(
    resolution,
    completeProviderDeclarationRequest(requestContext),
  );
  assert.equal(model.extensionCode, "DOTNET_PROVIDER_REQUESTED_EXPORT_UNSUPPORTED");
  assert.match(model.message, /PointerDelegate/u);
  assert.match(JSON.stringify(model.evidence), /pointer parameter/u);
  assert.match(JSON.stringify(model.evidence), /ProviderUnsupportedFixtures\.PointerDelegate/u);
  assert.match(JSON.stringify(model.evidence), new RegExp(escapeRegExp(testTargetId("ProviderUnsupportedFixtures.PointerDelegate")), "u"));
});
