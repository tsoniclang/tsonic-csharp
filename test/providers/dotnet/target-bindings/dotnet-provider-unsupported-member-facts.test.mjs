import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
  dotnetModuleToProviderDeclarationModel,
} from "../../../../dist/public/provider-dotnet.js";
import {
  buildUnsupportedMemberFixture,
  getCompleteDotnetModule,
  idEndsWith,
  namedDotnetTypeRef,
  testTargetId,
} from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";
import {
  dotnetExportToTargetBinding,
} from "../../../../dist/providers/dotnet/model/index.js";

const moduleSpecifier =
  "@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js";

test(".NET reflection provider exposes every representable advanced native member through exact source and target facts", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    references: [buildUnsupportedMemberFixture()],
  });
  const module = getCompleteDotnetModule(provider, moduleSpecifier, {});
  assert.equal("exports" in module, true);

  const staticInterface = requireType(module, "IStaticInterfaceMember");
  const genericHolder = requireType(module, "GenericHolder");
  const multiIndexer = requireType(module, "MultiIndexer");
  const pointerSignatures = requireType(module, "PointerSignatures");
  const rankedArrays = requireType(module, "RankedArraySignatures");
  const byRefReturns = requireType(module, "ByRefReturnSignatures");
  const genericNumber = requireType(module, "GenericNumber");
  const pointerConversion = requireType(module, "PointerConversion");
  const pointerDelegate = requireType(module, "PointerDelegate");
  const refReturnDelegate = requireType(module, "RefReturnDelegate");
  const functionPointers = requireType(
    module,
    "FunctionPointerSignatures",
  );
  const events = requireType(module, "EventSignatures");

  assert.deepEqual(
    unsupportedMetadataNames(module),
    [],
    "Every declaration in this fixture has an exact source representation.",
  );

  const staticCreate = requireFunction(module, staticInterface.targetId, "Create");
  assert.deepEqual(staticCreate.signatures[0].sourceTypeParameterRoles, {
    binding: [],
    method: [],
    invocation: [0],
  });
  assert.deepEqual(staticCreate.signatures[0].targetInvocation, {
    kind: "static-member",
    operation: "call",
    receiver: { kind: "invocation-type-argument", index: 0 },
  });
  assert.equal(
    staticCreate.signatures[0].sourceTypeParameters[0].constraints[0].kind,
    "implements",
  );

  const staticCount = requireFunction(
    module,
    staticInterface.targetId,
    "StaticCount",
  );
  assert.deepEqual(staticCount.signatures[0].targetInvocation, {
    kind: "static-member",
    operation: "property-get",
    receiver: { kind: "invocation-type-argument", index: 0 },
  });

  const genericEcho = requireFunction(module, genericHolder.targetId, "Echo");
  assert.deepEqual(genericEcho.signatures[0].sourceTypeParameterRoles, {
    binding: [0],
    method: [],
    invocation: [],
  });
  assert.deepEqual(genericEcho.signatures[0].targetInvocation, {
    kind: "static-member",
    operation: "call",
    receiver: { kind: "declaring-type" },
  });
  const genericValue = requireFunction(
    module,
    genericHolder.targetId,
    "StaticValue",
  );
  assert.deepEqual(genericValue.signatures[0].sourceTypeParameterRoles, {
    binding: [0],
    method: [],
    invocation: [],
  });

  const indexerGet = requireMember(multiIndexer, "method", "get", "Item");
  assert.deepEqual(indexerGet.signatures[0].targetInvocation, {
    kind: "native-indexer-get",
    indexParameterIndexes: [0, 1],
  });
  assert.deepEqual(
    indexerGet.signatures[0].parameters.map((parameter) =>
      parameter.type.kind === "source-primitive"
        ? parameter.type.name
        : parameter.type.kind),
    ["int32", "int32"],
  );

  const pointerConstructor = requireMember(
    pointerSignatures,
    "constructor",
    "constructor",
    ".ctor",
  );
  assertPointer(pointerConstructor.signatures[0].parameters[0].type);
  assertPointer(requireMember(
    pointerSignatures,
    "field",
    "PointerField",
  ).type);
  assertPointer(requireMember(
    pointerSignatures,
    "property",
    "PointerProperty",
  ).type);
  assertPointer(requireMember(
    pointerSignatures,
    "indexer",
    "Item",
  ).signatures[0].parameters[0].type);
  assertPointer(requireMember(
    pointerSignatures,
    "method",
    "PointerReturn",
  ).signatures[0].returnType);
  assertPointer(requireMember(
    pointerSignatures,
    "method",
    "ReadPointer",
  ).signatures[0].parameters[0].type);

  assertRankedArray(requireMember(
    rankedArrays,
    "field",
    "MatrixField",
  ).type, 2);
  assertRankedArray(requireMember(
    rankedArrays,
    "property",
    "MatrixProperty",
  ).type, 2);
  assertRankedArray(requireMember(
    rankedArrays,
    "method",
    "MatrixReturn",
  ).signatures[0].returnType, 2);
  assertRankedArray(requireMember(
    rankedArrays,
    "method",
    "AcceptMatrix",
  ).signatures[0].parameters[0].type, 2);

  const valueProperty = requireMember(
    byRefReturns,
    "property",
    "ValueProperty",
  );
  assert.equal(valueProperty.returnPassing, "byref-readwrite");
  assertPointerLocation(valueProperty.sourceType, "int32");
  const byRefIndexer = requireMember(byRefReturns, "indexer", "Item");
  assert.equal(
    byRefIndexer.signatures[0].returnPassing,
    "byref-readwrite",
  );
  assertPointerLocation(
    byRefIndexer.signatures[0].returnType,
    "int32",
  );
  const mutableRef = requireMember(
    byRefReturns,
    "method",
    "ValueRef",
  ).signatures[0];
  assert.equal(mutableRef.returnPassing, "byref-readwrite");
  assertPointerLocation(mutableRef.returnType, "int32");
  const readonlyRef = requireMember(
    byRefReturns,
    "method",
    "ReadonlyValueRef",
  ).signatures[0];
  assert.equal(readonlyRef.returnPassing, "byref-readonly");
  assertPointerLocation(readonlyRef.returnType, "int32");

  const addition = requireMember(
    genericNumber,
    "operator",
    "operatorAdd",
    "op_Addition",
  );
  assert.equal(addition.sourceProjection, "operator-adapter");
  assert.equal(addition.receiverPassing, "target-parameter");
  assert.deepEqual(addition.signatures[0].targetInvocation, {
    kind: "native-operator",
    form: "binary",
    operator: "addition",
    operandParameterIndexes: [0, 1],
  });

  assert.equal(pointerConversion.conversionOperators.length, 1);
  assert.equal(
    pointerConversion.conversionOperators[0].conversionKind,
    "explicit",
  );
  assertPointer(pointerConversion.conversionOperators[0].targetType);

  assert.equal(pointerDelegate.typeKind, "delegate");
  assert.equal(pointerDelegate.sourceShape.kind, "function");
  assertPointer(pointerDelegate.sourceShape.parameters[0].type);
  assert.equal(refReturnDelegate.typeKind, "delegate");
  assert.equal(refReturnDelegate.sourceShape.kind, "function");
  assert.equal(
    refReturnDelegate.sourceShape.returnPassing,
    "byref-readwrite",
  );
  assertPointerLocation(
    refReturnDelegate.sourceShape.returnType,
    "int32",
  );
  assert.equal(refReturnDelegate.sourceShape.targetReturnType.kind, "source-primitive");

  const functionPointerConstructor = requireMember(
    functionPointers,
    "constructor",
    "constructor",
    ".ctor",
  );
  assertFunctionPointer(
    functionPointerConstructor.signatures[0].parameters[0].type,
  );
  assertFunctionPointer(requireMember(
    functionPointers,
    "field",
    "CallbackField",
  ).type);
  assertFunctionPointer(requireMember(
    functionPointers,
    "property",
    "CallbackProperty",
  ).type);
  const functionPointerEcho = requireMember(
    functionPointers,
    "method",
    "Echo",
  ).signatures[0];
  assertFunctionPointer(functionPointerEcho.parameters[0].type);
  assertFunctionPointer(functionPointerEcho.returnType);

  const addChanged = requireMember(
    events,
    "method",
    "addChanged",
    "Changed",
  );
  assert.deepEqual(addChanged.signatures[0].targetInvocation, {
    kind: "native-event-add",
    handlerParameterIndex: 0,
  });
  const removeChanged = requireMember(
    events,
    "method",
    "removeChanged",
    "Changed",
  );
  assert.deepEqual(removeChanged.signatures[0].targetInvocation, {
    kind: "native-event-remove",
    handlerParameterIndex: 0,
  });

  const sourceModel = dotnetModuleToProviderDeclarationModel(module);
  assert.ok(sourceModel.exports.some((declaration) =>
    declaration.kind === "type" &&
    declaration.name === "PointerDelegate"));
  assert.ok(sourceModel.exports.some((declaration) =>
    declaration.kind === "type" &&
    declaration.name === "RefReturnDelegate"));

  const pointerBinding = provider.findTargetBindingByTargetId(
    pointerSignatures.targetId,
  );
  assert.ok(pointerBinding);
  assert.equal(
    pointerBinding.members.some((member) =>
      member.returnType?.kind === "pointer"),
    true,
  );
  const refBinding = provider.findTargetBindingByTargetId(
    byRefReturns.targetId,
  );
  assert.ok(refBinding);
  assert.deepEqual(
    new Set(refBinding.members.flatMap((member) =>
      member.csharpReturnPassing === undefined
        ? []
        : [member.csharpReturnPassing])),
    new Set(["byref-readwrite", "byref-readonly"]),
  );
});

test(".NET target binding facts preserve unsupported target-only constraint evidence", () => {
  const declaration = {
    kind: "type",
    typeKind: "class",
    sourceName: "Constrained",
    namespaceName: "ProviderModelFixtures",
    targetId: testTargetId("ProviderModelFixtures.Constrained`1"),
    metadataName: "ProviderModelFixtures.Constrained`1",
    typeParameters: [
      {
        name: "T",
        constraints: [{ kind: "reference-type" }],
        unsupportedConstraints: [
          {
            targetId: testTargetId(
              "ProviderModelFixtures.PointerContract",
            ),
            metadataName: "ProviderModelFixtures.PointerContract",
            reason:
              "Constraint uses a provider type-ref that is not representable.",
          },
        ],
      },
    ],
    implementedContracts: [{
      kind: "implements",
      contract: namedDotnetTypeRef(
        "ProviderModelFixtures.IRepresentable",
      ),
    }],
    unsupportedImplementedContracts: [
      {
        targetId: testTargetId(
          "ProviderModelFixtures.IUnrepresentable",
        ),
        metadataName: "ProviderModelFixtures.IUnrepresentable",
        reason:
          "Implemented contract uses a provider type-ref that is not representable.",
      },
    ],
  };

  const binding = dotnetExportToTargetBinding(declaration);

  assert.deepEqual(
    binding.typeParameters[0].constraints.map((constraint) =>
      constraint.kind),
    ["reference-type", "target-specific"],
  );
  assert.equal(
    binding.typeParameters[0].constraints[1].name,
    "unsupported-constraint",
  );
  assert.equal(
    binding.typeParameters[0].constraints[1].payloadId,
    [
      testTargetId("ProviderModelFixtures.PointerContract"),
      "ProviderModelFixtures.PointerContract",
      "Constraint uses a provider type-ref that is not representable.",
    ].map((value) => encodeURIComponent(value)).join("|"),
  );
  assert.deepEqual(
    binding.typeParameters[0].unsupportedConstraints,
    declaration.typeParameters[0].unsupportedConstraints,
  );
  assert.equal(binding.implementedContracts[0].kind, "implements");
  assert.deepEqual(
    binding.unsupportedImplementedContracts,
    declaration.unsupportedImplementedContracts,
  );
});

function requireType(module, sourceName) {
  const matches = [
    ...module.exports,
    ...(module.targetOnlyTypes ?? []),
  ].filter((declaration) =>
    declaration.kind === "type" && declaration.sourceName === sourceName);
  assert.equal(matches.length, 1, `Missing exact type '${sourceName}'.`);
  return matches[0];
}

function requireFunction(module, targetBindingId, targetName) {
  const matches = module.exports.filter((declaration) =>
    declaration.kind === "function" &&
    declaration.targetBindingId === targetBindingId &&
    declaration.targetName === targetName);
  assert.equal(
    matches.length,
    1,
    `Missing exact static source adapter '${targetName}'.`,
  );
  return matches[0];
}

function requireMember(
  declaration,
  kind,
  sourceName,
  targetName = sourceName,
) {
  const matches = declaration.members?.filter((member) =>
    member.kind === kind &&
    member.sourceName === sourceName &&
    member.targetName === targetName) ?? [];
  assert.equal(
    matches.length,
    1,
    `Missing exact ${kind} '${sourceName}' -> '${targetName}'.`,
  );
  return matches[0];
}

function unsupportedMetadataNames(module) {
  return [
    ...(module.unsupportedExports ?? []).map((entry) => entry.metadataName),
    ...[
      ...module.exports,
      ...(module.targetOnlyTypes ?? []),
    ].flatMap((declaration) =>
      declaration.kind === "type"
        ? (declaration.unsupportedMembers ?? []).map((member) =>
            member.metadataName)
        : []),
  ].sort();
}

function assertPointer(type) {
  assert.equal(type?.kind, "pointer");
  assert.equal(type.pointee.kind, "source-primitive");
  assert.equal(type.pointee.name, "int32");
}

function assertRankedArray(type, rank) {
  assert.equal(type?.kind, "array");
  assert.equal(type.rank, rank);
  assert.equal(type.elementType.kind, "source-primitive");
  assert.equal(type.elementType.name, "int32");
}

function assertPointerLocation(type, pointeeName) {
  assert.equal(type?.kind, "provider-ref");
  assert.equal(type.moduleSpecifier, "@tsonic/core/types.js");
  assert.equal(type.exportName, "Pointer");
  assert.equal(type.typeArguments.length, 1);
  assert.equal(type.typeArguments[0].kind, "source-primitive");
  assert.equal(type.typeArguments[0].name, pointeeName);
}

function assertFunctionPointer(type) {
  assert.equal(type?.kind, "function-pointer");
  assert.equal(type.args.length, 1);
  assert.equal(type.args[0].kind, "source-primitive");
  assert.equal(type.args[0].name, "int32");
  assert.equal(type.result.kind, "void");
  assert.deepEqual(type.abi, ["unmanaged", "Cdecl"]);
}
