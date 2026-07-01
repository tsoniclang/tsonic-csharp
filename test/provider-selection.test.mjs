import { test } from "node:test";
import assert from "node:assert/strict";
import {
  argumentPassingFactKey,
  attributeFactKey,
  defaultValueFactKey,
  deferObservation,
  fieldFactKey,
  flowStateFactKey,
  functionPointerFactKey,
  pointerFactKey,
  providerVirtualDeclarationFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
  structFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { createCsharpNativeOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";
import { selectTargetMember } from "../dist/source/csharp-source-semantics/target-member-selection.js";
import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveDotnetMetadataName,
} from "../dist/source/csharp-source-semantics/target-types.js";
import { resolveTargetTypeRefFromSubjectFacts } from "../dist/source/csharp-source-semantics/target-type-subject-facts.js";

test("C# provider rejects ambiguous target members instead of ranking candidates", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const literalArgument = { Kind: 1, Text: "1" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int32Alt)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [literalArgument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: literalArgument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("target member selection does not treat System.Object as an implicit wildcard", () => {
  const argument = {};
  const member = method("Example.Target.m(System.Object)", { kind: "target-named", id: "System.Object" });
  const context = {};
  const resolveTargetTypeRef = (subject) => subject === argument
    ? { kind: "source-primitive", name: "int32" }
    : undefined;

  assert.equal(
    selectTargetMember([member], { arguments: [argument] }, context, resolveTargetTypeRef),
    undefined,
  );
});

test("target member selection uses source marker target expression for byref parameters", () => {
  const key = {};
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => {
    if (subject === key) {
      return csharpStringType();
    }
    if (subject === value) {
      return int32;
    }
    return undefined;
  };

  assert.equal(
    selectTargetMember([member], { arguments: [key, outCall] }, context, resolveTargetTypeRef)?.id,
    member.id,
  );
});

test("target member selection rejects byref parameters without source marker facts", () => {
  const key = {};
  const outCall = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const resolveTargetTypeRef = (subject) => subject === key ? csharpStringType() : int32;

  assert.equal(
    selectTargetMember([member], { arguments: [key, outCall] }, fakeObservationContext({}), resolveTargetTypeRef),
    undefined,
  );
});

test("target member selection rejects byref parameter mode mismatches", () => {
  const key = {};
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-readwrite",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => subject === key ? csharpStringType() : int32;

  assert.equal(
    selectTargetMember([member], { arguments: [key, outCall] }, context, resolveTargetTypeRef),
    undefined,
  );
});

test("C# provider keeps source-core argument-passing facts canonical", () => {
  const provider = getNativeSemanticProvider();

  assert.equal(provider.resolveParameterPassing, undefined);
});

test("C# parameter-passing validation rejects selected byref members without source marker facts", () => {
  const provider = getNativeSemanticProvider();
  const argument = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const selectedDeclaration = {};
  const containerSymbol = {};
  const member = {
    id: "Example.Target.tryGetValue(System.String,out System.Int32)",
    sourceName: "tryGetValue",
    targetName: "TryGetValue",
    kind: "method",
    parameters: [
      targetParameter("key", csharpStringType()),
      targetParameter("value", int32, "byref-writeonly-must-init"),
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "tryGetValue",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [{ kind: "target-named", id: "System.String" }, argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "Example.Target",
      sourceName: "Target",
      targetName: "Target",
      target: "csharp",
      kind: "class",
      members: [member],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.tryGetValue", "tryGetValue"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("C# provider rejects missing or mutated target parameter-mode facts before recording selected operations", () => {
  const provider = getNativeSemanticProvider();
  const int32 = { kind: "source-primitive", name: "int32" };
  const outCall = {};
  const value = int32;
  const scenarios = [
    {
      name: "missing omitted optional passing mode",
      arguments: [],
      member: {
        ...method("Example.Target.missing(System.String)", csharpStringType(), {
          sourceName: "missing",
          targetName: "Missing",
          overloadGroup: "Example.Target.missing",
        }),
        parameters: [{
          name: "notNamedOptional",
          type: csharpStringType(),
          optional: true,
          defaultValue: { kind: "string", value: "proved" },
        }],
      },
    },
    {
      name: "mutated noncanonical passing mode",
      arguments: [outCall],
      context: {
        argumentPassingSubject: outCall,
        argumentPassing: {
          mode: "out",
          targetExpression: value,
        },
      },
      member: {
        ...method("Example.Target.mutated(out System.Int32)", int32, {
          sourceName: "mutated",
          targetName: "Mutated",
          overloadGroup: "Example.Target.mutated",
        }),
        parameters: [{
          name: "notNamedOut",
          type: int32,
          passingMode: "out",
        }],
      },
    },
  ];

  for (const scenario of scenarios) {
    const selectedDeclaration = {};
    const containerSymbol = {};
    const recordedFacts = [];
    const result = provider.mapCheckedCall({
      target: "csharp",
      call: {},
      callee: {},
      calleePropertyName: scenario.member.sourceName,
      sourceSelectedDeclaration: selectedDeclaration,
      sourceSelectedContainerSymbol: containerSymbol,
      arguments: scenario.arguments,
    }, fakeObservationContext({
      ...scenario.context,
      targetBindingSubject: containerSymbol,
      targetBinding: {
        id: "Example.Target",
        sourceName: "Target",
        targetName: "Target",
        target: "csharp",
        kind: "class",
        members: [scenario.member],
      },
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: {
        ...virtualMember(scenario.member.overloadGroup, scenario.member.sourceName),
        signatureId: scenario.member.id,
      },
      recordedFacts,
    }));

    assert.equal(result.kind, "reject", scenario.name);
    assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND", scenario.name);
    assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false, scenario.name);
  }
});

test("target member selection rejects source marker wrappers for by-value parameters", () => {
  const outCall = {};
  const value = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const member = method("Example.Target.m(System.Int32)", int32);
  const context = fakeObservationContext({
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
  });
  const resolveTargetTypeRef = (subject) => subject === value ? int32 : undefined;

  assert.equal(
    selectTargetMember([member], { arguments: [outCall] }, context, resolveTargetTypeRef),
    undefined,
  );
});

test("C# provider validates generic constraints only from finalized target facts", () => {
  const provider = getNativeSemanticProvider({
    bindings: [
      {
        id: "Example.Widget",
        sourceName: "Widget",
        targetName: "Widget",
        target: "csharp",
        kind: "class",
        implementedContracts: [{
          kind: "implements",
          contract: "Example.ITagged",
        }],
        members: [{
          id: "Example.Widget..ctor()",
          sourceName: "constructor",
          targetName: ".ctor",
          kind: "constructor",
          parameters: [],
          returnType: { kind: "target-named", id: "Example.Widget" },
        }],
      },
      {
        id: "Example.StructValue",
        sourceName: "StructValue",
        targetName: "StructValue",
        target: "csharp",
        kind: "struct",
      },
    ],
  });

  const widget = { kind: "target-named", id: "Example.Widget" };
  const structValue = { kind: "target-named", id: "Example.StructValue" };
  const widgetArray = { kind: "array", element: widget };

  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widgetArray,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: structValue,
    constraint: { kind: "value-type" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "constructible" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "implements", contract: "Example.ITagged" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "target-specific", target: "csharp", name: "notnull" },
  }, fakeObservationContext({})).kind, "accept");
  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: structValue,
    constraint: { kind: "target-specific", target: "csharp", name: "notnull" },
  }, fakeObservationContext({})).kind, "accept");
});

test("C# provider rejects generic constraints without finalized target proof", () => {
  const provider = getNativeSemanticProvider({
    bindings: [{
      id: "Example.Widget",
      sourceName: "Widget",
      targetName: "Widget",
      target: "csharp",
      kind: "class",
    }],
  });
  const widget = { kind: "target-named", id: "Example.Widget" };
  const unknown = { kind: "target-named", id: "Example.Unknown" };

  const missingContract = provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "implements", contract: "Example.ITagged" },
  }, fakeObservationContext({}));
  assert.equal(missingContract.kind, "reject");
  assert.equal(missingContract.diagnostic.extensionCode, "CSHARP_TARGET_CONSTRAINT_INVALID");

  const missingBinding = provider.validateTargetConstraint({
    target: "csharp",
    source: unknown,
    constraint: { kind: "reference-type" },
  }, fakeObservationContext({}));
  assert.equal(missingBinding.kind, "reject");

  const unsupportedConstraint = provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: { kind: "target-specific", target: "rust", name: "Send" },
  }, fakeObservationContext({}));
  assert.equal(unsupportedConstraint.kind, "reject");

  const unsupportedTargetConstraint = provider.validateTargetConstraint({
    target: "csharp",
    source: widget,
    constraint: {
      kind: "unsupported",
      target: "csharp",
      id: "Example.PointerContract",
      reason: "Constraint uses a provider type-ref that is not representable.",
    },
  }, fakeObservationContext({}));
  assert.equal(unsupportedTargetConstraint.kind, "reject");
  assert.match(unsupportedTargetConstraint.diagnostic.message, /not supported by the C# target provider/u);

  const nullableValue = provider.validateTargetConstraint({
    target: "csharp",
    source: csharpNullableValueTargetType({ kind: "source-primitive", name: "int32" }),
    constraint: { kind: "target-specific", target: "csharp", name: "notnull" },
  }, fakeObservationContext({}));
  assert.equal(nullableValue.kind, "reject");
  assert.equal(nullableValue.diagnostic.extensionCode, "CSHARP_TARGET_CONSTRAINT_INVALID");
});

test("C# provider validates source primitive generic constraints from reflected primitive contract facts", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const int64 = { kind: "source-primitive", name: "int64" };
  const int32Binding = {
    id: "System.Int32",
    sourceName: "Int32",
    targetName: "Int32",
    target: "csharp",
    kind: "struct",
    implementedContracts: [{
      kind: "implements",
      contract: "System.IEquatable`1",
      typeArguments: [int32],
    }],
  };
  const provider = getNativeSemanticProvider({
    bindings: [int32Binding],
    metadataBindings: [[csharpSourcePrimitiveDotnetMetadataName("int32"), int32Binding]],
  });

  assert.equal(provider.validateTargetConstraint({
    target: "csharp",
    source: int32,
    constraint: { kind: "implements", contract: "System.IEquatable`1", typeArguments: [int32] },
  }, fakeObservationContext({})).kind, "accept");

  const mismatchedArgument = provider.validateTargetConstraint({
    target: "csharp",
    source: int32,
    constraint: { kind: "implements", contract: "System.IEquatable`1", typeArguments: [int64] },
  }, fakeObservationContext({}));
  assert.equal(mismatchedArgument.kind, "reject");

  const missingArgument = provider.validateTargetConstraint({
    target: "csharp",
    source: int32,
    constraint: { kind: "implements", contract: "System.IEquatable`1" },
  }, fakeObservationContext({}));
  assert.equal(missingArgument.kind, "reject");
});

test("C# provider selects from a proven provider binding using checked source member and target argument facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("C# provider defers when no provider target binding proves ownership", () => {
  const provider = getNativeSemanticProvider();
  const containerSymbol = {};
  const argument = {};

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
  }));

  assert.equal(result.kind, "defer");
});

test("C# erased source marker rejects missing provider member identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "out",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [],
  }, fakeObservationContext({
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "@tsonic/core/lang.js",
      virtualFileName: "tsts-provider://test",
      exportName: "out",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_ERASED_SOURCE_MARKER_IDENTITY_NOT_PROVEN");
  assert.equal("value" in result, false);
});

test("C# source marker mapping ignores same-spelling non-core virtual declarations", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "out",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [],
  }, fakeObservationContext({
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "./local.js",
      moduleSpecifier: "./local.js",
      virtualFileName: "tsts-provider://local",
      exportName: "out",
      memberId: "./local.js::out",
    },
  }));

  assert.equal(result.kind, "defer");
});

test("C# erased source marker rejects missing finalized source facts", () => {
  const provider = getNativeSemanticProvider();
  const cases = [
    ["out", "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN"],
    ["ref", "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN"],
    ["inref", "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN"],
    ["borrow", "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN"],
    ["borrowMut", "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN"],
    ["move", "CSHARP_FLOW_MARKER_FACT_NOT_PROVEN"],
    ["field", "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN"],
    ["attribute", "CSHARP_ATTRIBUTE_MARKER_FACT_NOT_PROVEN"],
    ["defaultof", "CSHARP_DEFAULT_MARKER_FACT_NOT_PROVEN"],
    ["struct", "CSHARP_STRUCT_MARKER_FACT_NOT_PROVEN"],
  ];

  for (const [marker, code] of cases) {
    const call = {};
    const selectedDeclaration = {};
    const result = provider.mapCheckedCall({
      target: "csharp",
      call,
      callee: {},
      calleePropertyName: marker,
      sourceSelectedDeclaration: selectedDeclaration,
      arguments: [],
    }, fakeObservationContext({
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: coreLangMarker(marker),
    }));

    assert.equal(result.kind, "reject", marker);
    assert.equal(result.diagnostic.extensionCode, code);
  }
});

test("C# erased source marker rejects unsupported flow markers even with finalized source facts", () => {
  const provider = getNativeSemanticProvider();
  const cases = [
    ["borrow", "borrowed-shared"],
    ["borrowMut", "borrowed-mut"],
    ["move", "moved"],
  ];

  for (const [marker, state] of cases) {
    const call = {};
    const selectedDeclaration = {};
    const result = provider.mapCheckedCall({
      target: "csharp",
      call,
      callee: {},
      calleePropertyName: marker,
      sourceSelectedDeclaration: selectedDeclaration,
      arguments: [],
    }, fakeObservationContext({
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: coreLangMarker(marker),
      flowStateSubject: call,
      flowState: { state },
    }));

    assert.equal(result.kind, "reject", marker);
    assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");
    assert.match(result.diagnostic.message, new RegExp(marker, "u"));
  }
});

test("C# source markers validate finalized facts before selected signature reuse", () => {
  const provider = getNativeSemanticProvider();
  const selectedMember = {
    id: "Example.Identity.SourceMarker",
    sourceName: "out",
    targetName: "SourceMarker",
    kind: "method",
    parameters: [],
  };
  const targetExpression = { Kind: 1, Text: "value" };
  const outCall = {};
  const outDeclaration = {};
  const missingOut = provider.mapCheckedCall({
    target: "csharp",
    call: outCall,
    callee: {},
    calleePropertyName: "out",
    sourceSelectedDeclaration: outDeclaration,
    arguments: [targetExpression],
  }, fakeObservationContext({
    virtualDeclarationSubject: outDeclaration,
    virtualDeclaration: coreLangMarker("out"),
    selectedSignatureSubject: outCall,
    selectedSignature: { member: selectedMember },
  }));

  assert.equal(missingOut.kind, "reject");
  assert.equal(missingOut.diagnostic.extensionCode, "CSHARP_ARGUMENT_MARKER_FACT_NOT_PROVEN");

  const borrowCall = {};
  const borrowDeclaration = {};
  const unsupportedBorrow = provider.mapCheckedCall({
    target: "csharp",
    call: borrowCall,
    callee: {},
    calleePropertyName: "borrow",
    sourceSelectedDeclaration: borrowDeclaration,
    arguments: [targetExpression],
  }, fakeObservationContext({
    virtualDeclarationSubject: borrowDeclaration,
    virtualDeclaration: coreLangMarker("borrow"),
    selectedSignatureSubject: borrowCall,
    selectedSignature: { member: selectedMember },
    flowStateSubject: borrowCall,
    flowState: { state: "borrowed-shared" },
  }));

  assert.equal(unsupportedBorrow.kind, "reject");
  assert.equal(unsupportedBorrow.diagnostic.extensionCode, "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");

  const validOutCall = {};
  const validOutDeclaration = {};
  const validOut = provider.mapCheckedCall({
    target: "csharp",
    call: validOutCall,
    callee: {},
    calleePropertyName: "out",
    sourceSelectedDeclaration: validOutDeclaration,
    arguments: [targetExpression],
  }, fakeObservationContext({
    virtualDeclarationSubject: validOutDeclaration,
    virtualDeclaration: coreLangMarker("out"),
    selectedSignatureSubject: validOutCall,
    selectedSignature: { member: selectedMember },
    argumentPassingSubject: validOutCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression,
    },
  }));

  assert.equal(validOut.kind, "accept", validOut.kind === "reject" ? validOut.diagnostic.message : undefined);
  assert.equal(validOut.value.selectedSignature.member.id, "@tsonic/core/lang.js::out");
});

test("C# source markers reject malformed finalized facts", () => {
  const provider = getNativeSemanticProvider();
  const targetExpression = { Kind: 1, Text: "value" };
  const typeNode = { Kind: "KindTypeReference", Text: "int32" };
  const cases = [
    {
      marker: "out",
      code: "CSHARP_ARGUMENT_MARKER_MODE_NOT_PROVEN",
      options: {
        argumentPassing: {
          mode: "byref-readwrite",
          targetExpression,
        },
      },
    },
    {
      marker: "out",
      code: "CSHARP_ARGUMENT_MARKER_STORAGE_NOT_PROVEN",
      options: {
        argumentPassing: {
          mode: "byref-writeonly-must-init",
        },
      },
    },
    {
      marker: "field",
      code: "CSHARP_FIELD_MARKER_TYPE_NOT_PROVEN",
      options: {
        field: {
          name: "value",
        },
      },
    },
    {
      marker: "field",
      code: "CSHARP_FIELD_MARKER_NAME_NOT_PROVEN",
      options: {
        field: {
          type: typeNode,
        },
      },
    },
    {
      marker: "defaultof",
      code: "CSHARP_DEFAULT_MARKER_TYPE_NOT_PROVEN",
      options: {
        defaultValue: {},
      },
    },
    {
      marker: "struct",
      code: "CSHARP_STRUCT_MARKER_VALUE_TYPE_NOT_PROVEN",
      options: {
        structFact: {
          valueType: false,
          fields: [],
        },
      },
    },
    {
      marker: "struct",
      code: "CSHARP_STRUCT_MARKER_FIELDS_NOT_PROVEN",
      options: {
        structFact: {
          valueType: true,
        },
      },
    },
  ];

  for (const scenario of cases) {
    const call = {};
    const selectedDeclaration = {};
    const result = provider.mapCheckedCall({
      target: "csharp",
      call,
      callee: {},
      calleePropertyName: scenario.marker,
      sourceSelectedDeclaration: selectedDeclaration,
      arguments: [],
    }, fakeObservationContext({
      virtualDeclarationSubject: selectedDeclaration,
      virtualDeclaration: coreLangMarker(scenario.marker),
      argumentPassingSubject: call,
      fieldSubject: call,
      defaultValueSubject: call,
      structFactSubject: call,
      ...scenario.options,
    }));

    assert.equal(result.kind, "reject", scenario.marker);
    assert.equal(result.diagnostic.extensionCode, scenario.code);
    assert.ok(result.diagnostic.evidence?.length > 0);
  }
});

test("C# attribute builder marker rejects malformed finalized attribute facts", () => {
  const provider = getNativeSemanticProvider();
  const cases = [
    {
      code: "CSHARP_ATTRIBUTE_MARKER_TARGET_NOT_PROVEN",
      attribute: {
        attributeName: "RouteAttribute",
      },
    },
    {
      code: "CSHARP_ATTRIBUTE_MARKER_NAME_NOT_PROVEN",
      attribute: {
        target: {},
      },
    },
  ];

  for (const scenario of cases) {
    const call = {};
    const result = provider.mapCheckedCall({
      target: "csharp",
      call,
      callee: {},
      calleePropertyName: "add",
      arguments: [],
    }, fakeObservationContext({
      attributeSubject: call,
      attribute: scenario.attribute,
    }));

    assert.equal(result.kind, "reject", scenario.code);
    assert.equal(result.diagnostic.extensionCode, scenario.code);
    assert.ok(result.diagnostic.evidence?.length > 0);
  }
});

test("C# erased source marker accepts supported markers only with finalized source facts", () => {
  const provider = getNativeSemanticProvider();
  const outCall = {};
  const outDeclaration = {};
  const defaultCall = {};
  const defaultDeclaration = {};
  const fieldCall = {};
  const fieldDeclaration = {};
  const structCall = {};
  const structDeclaration = {};
  const targetExpression = { Kind: 1, Text: "value" };
  const typeNode = { Kind: "KindTypeReference", Text: "int32" };

  const outResult = provider.mapCheckedCall({
    target: "csharp",
    call: outCall,
    callee: {},
    calleePropertyName: "out",
    sourceSelectedDeclaration: outDeclaration,
    arguments: [targetExpression],
  }, fakeObservationContext({
    virtualDeclarationSubject: outDeclaration,
    virtualDeclaration: coreLangMarker("out"),
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression,
    },
  }));

  const refCall = {};
  const refDeclaration = {};
  const refResult = provider.mapCheckedCall({
    target: "csharp",
    call: refCall,
    callee: {},
    calleePropertyName: "ref",
    sourceSelectedDeclaration: refDeclaration,
    arguments: [targetExpression],
  }, fakeObservationContext({
    virtualDeclarationSubject: refDeclaration,
    virtualDeclaration: coreLangMarker("ref"),
    argumentPassingSubject: refCall,
    argumentPassing: {
      mode: "byref-readwrite",
      targetExpression,
    },
  }));

  const inrefCall = {};
  const inrefDeclaration = {};
  const inrefResult = provider.mapCheckedCall({
    target: "csharp",
    call: inrefCall,
    callee: {},
    calleePropertyName: "inref",
    sourceSelectedDeclaration: inrefDeclaration,
    arguments: [targetExpression],
  }, fakeObservationContext({
    virtualDeclarationSubject: inrefDeclaration,
    virtualDeclaration: coreLangMarker("inref"),
    argumentPassingSubject: inrefCall,
    argumentPassing: {
      mode: "byref-readonly",
      targetExpression,
    },
  }));

  const defaultResult = provider.mapCheckedCall({
    target: "csharp",
    call: defaultCall,
    callee: {},
    calleePropertyName: "defaultof",
    sourceSelectedDeclaration: defaultDeclaration,
    arguments: [],
  }, fakeObservationContext({
    virtualDeclarationSubject: defaultDeclaration,
    virtualDeclaration: coreLangMarker("defaultof"),
    defaultValueSubject: defaultCall,
    defaultValue: {
      type: typeNode,
    },
  }));

  const fieldResult = provider.mapCheckedCall({
    target: "csharp",
    call: fieldCall,
    callee: {},
    calleePropertyName: "field",
    sourceSelectedDeclaration: fieldDeclaration,
    arguments: [],
  }, fakeObservationContext({
    virtualDeclarationSubject: fieldDeclaration,
    virtualDeclaration: coreLangMarker("field"),
    fieldSubject: fieldCall,
    field: {
      name: "count",
      type: typeNode,
    },
  }));

  const structResult = provider.mapCheckedCall({
    target: "csharp",
    call: structCall,
    callee: {},
    calleePropertyName: "struct",
    sourceSelectedDeclaration: structDeclaration,
    arguments: [],
  }, fakeObservationContext({
    virtualDeclarationSubject: structDeclaration,
    virtualDeclaration: coreLangMarker("struct"),
    structFactSubject: structCall,
    structFact: {
      valueType: true,
      fields: [{
        name: "count",
        type: typeNode,
      }],
    },
  }));

  assert.equal(outResult.kind, "accept", outResult.kind === "reject" ? outResult.diagnostic.message : undefined);
  assert.equal(outResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::out");
  assert.equal(refResult.kind, "accept", refResult.kind === "reject" ? refResult.diagnostic.message : undefined);
  assert.equal(refResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::ref");
  assert.equal(inrefResult.kind, "accept", inrefResult.kind === "reject" ? inrefResult.diagnostic.message : undefined);
  assert.equal(inrefResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::inref");
  assert.equal(defaultResult.kind, "accept", defaultResult.kind === "reject" ? defaultResult.diagnostic.message : undefined);
  assert.equal(defaultResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::defaultof");
  assert.equal(fieldResult.kind, "accept", fieldResult.kind === "reject" ? fieldResult.diagnostic.message : undefined);
  assert.equal(fieldResult.value.selectedSignature.member.id, "source-semantics.field:count");
  assert.equal(structResult.kind, "accept", structResult.kind === "reject" ? structResult.diagnostic.message : undefined);
  assert.equal(structResult.value.selectedSignature.member.id, "@tsonic/core/lang.js::struct");
});

test("C# target resolves source-core ptr and fnptr facts to target type refs", () => {
  const pointerSubject = {};
  const functionPointerSubject = {};
  const int32Subject = {};
  const boolSubject = {};
  const unresolvedPointerSubject = {};
  const unresolvedFunctionPointerSubject = {};
  const facts = new Map();
  const setFact = (subject, key, value) => {
    const subjectFacts = facts.get(subject) ?? new Map();
    subjectFacts.set(key, value);
    facts.set(subject, subjectFacts);
  };
  setFact(int32Subject, sourcePrimitiveFactKey, {
    kind: "int32",
    runtimeBase: "number",
    signed: true,
    width: 32,
  });
  setFact(boolSubject, sourcePrimitiveFactKey, {
    kind: "bool",
    runtimeBase: "boolean",
  });
  setFact(pointerSubject, pointerFactKey, {
    pointee: int32Subject,
    mutability: "target-defined",
    unsafeRequired: true,
  });
  setFact(functionPointerSubject, functionPointerFactKey, {
    parameters: [pointerSubject, int32Subject],
    result: boolSubject,
    abi: ["target-default"],
  });
  setFact(unresolvedPointerSubject, pointerFactKey, {
    pointee: {},
    mutability: "target-defined",
    unsafeRequired: true,
  });
  setFact(unresolvedFunctionPointerSubject, functionPointerFactKey, {
    parameters: [int32Subject],
    result: {},
    abi: ["target-default"],
  });
  const context = {
    facts: {
      get(subject, key) {
        return facts.get(subject)?.get(key);
      },
    },
    factResolver: {
      resolve(subject, key) {
        return facts.get(subject)?.get(key);
      },
    },
  };
  const resolveSubject = (subject) => resolveTargetTypeRefFromSubjectFacts(subject, context, {}, resolveSubject);

  assert.deepEqual(resolveSubject(pointerSubject), {
    kind: "pointer",
    pointee: { kind: "source-primitive", name: "int32" },
    mutability: "target-defined",
  });
  assert.deepEqual(resolveSubject(functionPointerSubject), {
    kind: "function-pointer",
    args: [
      {
        kind: "pointer",
        pointee: { kind: "source-primitive", name: "int32" },
        mutability: "target-defined",
      },
      { kind: "source-primitive", name: "int32" },
    ],
    result: { kind: "source-primitive", name: "bool" },
    abi: ["target-default"],
  });
  assert.equal(resolveSubject(unresolvedPointerSubject), undefined);
  assert.equal(resolveSubject(unresolvedFunctionPointerSubject), undefined);
});

test("C# attribute builder marker identity comes from finalized attribute facts", () => {
  const provider = getNativeSemanticProvider();
  const call = {};

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleePropertyName: "add",
    arguments: [],
  }, fakeObservationContext({
    attributeSubject: call,
    attribute: {
      target: {},
      attributeName: "RouteAttribute",
      arguments: [],
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "source-semantics.attribute:RouteAttribute");
  assert.equal(result.value.selectedSignature.member.sourceName, "attribute");
});

test("C# provider rejects provider virtual declarations without member or signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("C# provider includes virtual declaration signature id as candidate evidence", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      { ...method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }), sourceName: "renamed" },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int64",
      runtimeBase: "number",
      signed: true,
      width: 64,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});

test("C# provider resolves selected calls from virtual target identity host bindings", () => {
  const selectedDeclaration = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    arguments: [argument],
  }, fakeObservationContext({
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : result.kind);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("C# provider maps calls from the exact selected signature identity before declaration identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const selectedSignature = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      { ...method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }), sourceName: "renamed" },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedSignature: selectedSignature,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int64",
      runtimeBase: "number",
      signed: true,
      width: 64,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.m"),
    virtualSignatureSubject: selectedSignature,
    virtualSignatureDeclaration: {
      ...virtualMember("Example.Target.m", "renamed"),
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});

test("C# provider preserves exact selected constructor signatures instead of refining to siblings", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const call = { Kind: "KindNewExpression" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      constructorMember("Example.Target..ctor(System.Int32)", { kind: "source-primitive", name: "int32" }),
      constructorMember("Example.Target..ctor(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId: "Example.Target..ctor(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target..ctor(System.Int64)");
});

test("C# provider selects provider constructors from a selected provider type identity", () => {
  const provider = getNativeSemanticProvider();
  const containerSymbol = {};
  const argument = csharpStringType();
  const binding = {
    id: "Example.Exception",
    sourceName: "Exception",
    targetName: "Exception",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Exception" },
    members: [
      {
        ...constructorMember("Example.Exception..ctor(System.String)", csharpStringType()),
        overloadGroup: "Example.Exception..ctor",
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    sourceCalleeSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Exception..ctor(System.String)");
});

test("C# provider selects constructor overloads only within the proven provider constructor group", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      constructorMember("Example.Target..ctor(System.Int32)", { kind: "source-primitive", name: "int32" }),
      constructorMember("Example.Target..ctor(System.Int64)", { kind: "source-primitive", name: "int64" }),
      {
        ...constructorMember("Example.Target.OtherConstructor(System.Int32)", { kind: "source-primitive", name: "int32" }),
        overloadGroup: "Example.Target.OtherConstructor",
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int64",
      runtimeBase: "number",
      signed: true,
      width: 64,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target..ctor", "constructor"),
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target..ctor(System.Int64)");
});

test("C# provider maps constructor byref parameters from source marker target expressions", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const outCall = {};
  const value = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      {
        ...constructorMember("Example.Target..ctor(out System.Int32)", { kind: "source-primitive", name: "int32" }),
        parameters: [
          targetParameter("value", { kind: "source-primitive", name: "int32" }, "byref-writeonly-must-init"),
        ],
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [outCall],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
    sourcePrimitiveSubject: value,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId: "Example.Target..ctor(out System.Int32)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target..ctor(out System.Int32)");
});

test("C# provider rejects constructor byref parameters without source marker facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Target" },
    members: [
      {
        ...constructorMember("Example.Target..ctor(out System.Int32)", { kind: "source-primitive", name: "int32" }),
        parameters: [
          targetParameter("value", { kind: "source-primitive", name: "int32" }, "byref-writeonly-must-init"),
        ],
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: { Kind: "KindNewExpression" },
    callee: {},
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId: "Example.Target..ctor(out System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("C# provider prefers selected generic signatures when target argument facts tie", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = { kind: "source-primitive", name: "int32" };
  const genericMember = {
    id: "Example.Target.identity``1(T)",
    sourceName: "identity",
    targetName: "Identity",
    kind: "method",
    typeParameters: [{ name: "T" }],
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "T" },
      passingMode: "by-value",
    }],
    returnType: { kind: "type-parameter", name: "T" },
    overloadGroup: "Example.Target.identity",
  };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      genericMember,
      method("Example.Target.identity(System.Int32)", argument, {
        sourceName: "identity",
        targetName: "Identity",
        overloadGroup: "Example.Target.identity",
      }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "identity",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.identity", "identity"),
      signatureId: genericMember.id,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, genericMember.id);
  assert.deepEqual(result.value.selectedSignature.member.parameters[0].type, argument);
  assert.deepEqual(result.value.selectedSignature.member.returnType, argument);
});

test("C# provider keeps inferred generic method arguments after selected binding enrichment", () => {
  const selectedDeclaration = {};
  const containerSymbol = {};
  const receiver = { Kind: "KindIdentifier", Text: "referenceNew" };
  const call = {};
  const markedType = {
    kind: "target-named",
    id: "Acme.Constraints.Marked",
    csharpRender: { kind: "named", namespace: ["Acme", "Constraints"], name: "Marked" },
  };
  const declaringOpenType = {
    kind: "target-named",
    id: "Acme.Constraints.ReferenceNewTarget`1",
    typeArguments: [{ kind: "type-parameter", name: "T" }],
    csharpRender: { kind: "named", namespace: ["Acme", "Constraints"], name: "ReferenceNewTarget" },
  };
  const declaringClosedType = {
    ...declaringOpenType,
    typeArguments: [markedType],
  };
  const genericMember = {
    id: "Acme.Constraints.ReferenceNewTarget`1.Copy``1(TMethod)",
    sourceName: "copy",
    targetName: "Copy",
    kind: "method",
    declaringType: declaringOpenType,
    typeParameters: [{ name: "TMethod" }],
    parameters: [{
      name: "value",
      type: { kind: "type-parameter", name: "TMethod" },
      passingMode: "by-value",
    }],
    returnType: csharpVoidType(),
    overloadGroup: "Acme.Constraints.ReferenceNewTarget`1.Copy",
  };
  const binding = {
    id: "Acme.Constraints.ReferenceNewTarget`1",
    sourceName: "ReferenceNewTarget",
    targetName: "ReferenceNewTarget",
    target: "csharp",
    kind: "class",
    typeParameters: [{ name: "T" }],
    csharpType: declaringOpenType,
    members: [genericMember],
  };
  const provider = getNativeSemanticProvider({
    bindings: [
      binding,
      {
        id: markedType.id,
        sourceName: "Marked",
        targetName: "Marked",
        target: "csharp",
        kind: "class",
        csharpType: markedType,
      },
    ],
  });
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "copy"),
    calleePropertyName: "copy",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [markedType],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember(genericMember.id, "copy", binding.id),
      signatureId: genericMember.id,
    },
    typesByNode: new Map([[receiver, declaringClosedType]]),
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, genericMember.id);
  assert.deepEqual(result.value.selectedSignature.member.parameters[0].type, markedType);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Void");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, genericMember.id);
  assert.deepEqual(operation?.selectedMember.parameters[0].type, markedType);
});

test("C# provider rejects exact selected generic signatures with contradictory target facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const string = csharpStringType();
  const genericMember = {
    id: "Example.Target.pair``1(T,T)",
    sourceName: "pair",
    targetName: "Pair",
    kind: "method",
    typeParameters: [{ name: "T" }],
    parameters: [
      {
        name: "left",
        type: { kind: "type-parameter", name: "T" },
        passingMode: "by-value",
      },
      {
        name: "right",
        type: { kind: "type-parameter", name: "T" },
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "type-parameter", name: "T" },
    overloadGroup: "Example.Target.pair",
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "pair",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [int32, string],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "Example.Target",
      sourceName: "Target",
      targetName: "Target",
      target: "csharp",
      kind: "class",
      members: [genericMember],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.pair", "pair"),
      signatureId: genericMember.id,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("C# provider resolves overloaded member selections from provider member identity and target facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int64",
      runtimeBase: "number",
      signed: true,
      width: 64,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});

test("C# provider preserves exact selected call signatures instead of refining to siblings", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      { ...method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }), sourceName: "renamed" },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});

test("C# provider selects within a proven overload group from target argument facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("C# provider maps calls from TSTS-selected callee symbol virtual declaration facts", () => {
  const provider = getNativeSemanticProvider();
  const calleeSymbol = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
      method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    sourceCalleeSymbol: calleeSymbol,
    calleePropertyName: "m",
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: calleeSymbol,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("C# provider refines exact selected signatures inside the selected overload group when target facts contradict the TS-selected signature", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Byte)", { kind: "source-primitive", name: "uint8" }),
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Byte)",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("C# provider selects within provider source-projection signature groups using target facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = csharpStringType();
  const sourceProjectionSignatureId = "Example.Target.m#source-signature:string";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Char)", { kind: "source-primitive", name: "char" }, { providerSourceSignatureId: sourceProjectionSignatureId }),
      method("Example.Target.m(System.String)", csharpStringType(), { providerSourceSignatureId: sourceProjectionSignatureId }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: sourceProjectionSignatureId,
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : result.kind);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.String)");
});

test("C# provider does not refine selected signatures outside the proven overload group", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Byte)", { kind: "source-primitive", name: "uint8" }),
      method("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "m", overloadGroup: "Example.Target.other" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Byte)",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("C# provider accepts literal arguments for exact selected target signatures", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const literalArgument = { Kind: 1, Text: "0" };
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.m(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [literalArgument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int32)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int32)");
});

test("C# provider does not search target members outside the selected provider overload group", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      { ...method("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }), sourceName: "m", overloadGroup: "Example.Target.other" },
      { ...method("Example.Target.m(System.Int64)", { kind: "source-primitive", name: "int64" }), sourceName: "renamed", overloadGroup: "Example.Target.m" },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      providerId: "test",
      providerVersion: "0",
      providerModuleId: "test",
      moduleSpecifier: "test",
      virtualFileName: "tsts-provider://test",
      memberName: "m",
      memberId: "Example.Target.m",
      signatureId: "Example.Target.m(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.Target.m(System.Int64)");
});

test("C# provider rejects same-spelling call members without selected provider identity membership", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "m", overloadGroup: "Example.Target.other" }),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "m",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.m", "renamed"),
      signatureId: "Example.Target.m(System.Int32)",
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("C# provider rejects provider-owned receiver calls without selected member identity", () => {
  const receiverType = {
    kind: "target-named",
    id: "Example.Exception",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Exception" },
  };
  const receiver = { Kind: "KindIdentifier", Text: "exception", ...receiverType };
  const binding = {
    id: "Example.Exception",
    sourceName: "Exception",
    targetName: "Exception",
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["Example"], name: "Exception" },
    members: [
      {
        id: "Example.Exception.ToString()",
        sourceName: "toString",
        targetName: "ToString",
        kind: "method",
        parameters: [],
        returnType: csharpStringType(),
        overloadGroup: "Example.Exception.ToString",
        declaringType: receiverType,
      },
    ],
  };
  const provider = getNativeSemanticProvider({ bindings: [binding] });

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: propertyAccessCallee(receiver, "toString"),
    sourceCalleeSymbol: receiverType,
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
  assert.equal(
    result.diagnostic.message,
    "C# provider could not map checked call 'toString' on target 'Example.Exception'.",
  );
});

test("C# provider maps property access from selected provider member identity instead of property text", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const expression = {};
  const receiver = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.unrelated", "m", "Unrelated"),
      property("Example.Target.actual", "renamed", "Actual"),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    sourceSelectedSymbol: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "m",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.actual", "renamed"),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Example.Target.actual");
});

test("C# provider maps field access from selected provider member identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const expression = {};
  const receiver = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      field("Example.Target.ActualField", "renamed", "ActualField"),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    sourceSelectedSymbol: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "m",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.ActualField", "renamed"),
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Example.Target.ActualField");
  assert.equal(result.value.operation.operationKind, "property");
});

test("C# provider rejects same-spelling property members without selected member identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const expression = {};
  const receiver = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.other", "m", "Other"),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression,
    receiver,
    sourceSelectedSymbol: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "m",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.missing"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_NOT_FOUND");
});

test("C# provider reports selected unsupported property identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.FallbackPointerProperty", "pointerProperty", "FallbackPointerProperty"),
    ],
    unsupportedMembers: [
      unsupportedMember("property", "Example.Target.PointerProperty", "pointerProperty", "PointerProperty", "Property type cannot be represented as closed .NET target type facts. System.Int32* is unsupported."),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    sourceSelectedSymbol: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "unrelated",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.PointerProperty", "pointerProperty"),
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Property type cannot be represented/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, "Example.Target.PointerProperty", "property");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("C# provider rejects events even when target facts exist until event source semantics exist", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const recordedFacts = [];
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      property("Example.Target.FallbackChanged", "changed", "FallbackChanged"),
      eventMember("Example.Target.Changed", "changed", "Changed"),
    ],
    unsupportedMembers: [
      unsupportedMember("event", "Example.Target.Changed", "changed", "Changed", "C# events require explicit add/remove subscription semantics; the provider records this event as unsupported until source event facts exist."),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    sourceSelectedSymbol: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "changed",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.Changed", "changed"),
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_EVENT_UNSUPPORTED");
  assert.match(result.diagnostic.message, /add\/remove subscription semantics/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, "Example.Target.Changed", "event");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("C# provider reports selected unsupported call identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const recordedFacts = [];
  const signatureId = "Example.Target.PointerReturn(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      method("Example.Target.FallbackPointerReturn(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "pointerReturn", targetName: "PointerReturn", overloadGroup: "Example.Target.FallbackPointerReturn" }),
    ],
    unsupportedMembers: [
      unsupportedMember("method", signatureId, "pointerReturn", "PointerReturn", "Method return type cannot be represented as closed .NET target type facts. System.Int32* is unsupported."),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    calleePropertyName: "notUsedForSelection",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.PointerReturn", "pointerReturn"),
      signatureId,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Method return type cannot be represented/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, signatureId, "method");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("C# provider reports selected unsupported constructor identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const argument = {};
  const recordedFacts = [];
  const signatureId = "Example.Target..ctor(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      constructorMember("Example.Target..ctor(System.Int32)", { kind: "source-primitive", name: "int32" }),
    ],
    unsupportedMembers: [
      unsupportedMember("constructor", signatureId, "constructor", ".ctor", "Constructor signature contains parameter 'pointer' with type 'System.Int32*' that cannot be represented as closed .NET target type facts."),
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: {},
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [argument],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target..ctor", "constructor"),
      signatureId,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Constructor signature contains parameter 'pointer'/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, signatureId, "constructor");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("C# provider reports selected unsupported indexer identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const recordedFacts = [];
  const signatureId = "Example.Target.Item(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.Target.FallbackItem(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "item", overloadGroup: "Example.Target.FallbackItem" }),
    ],
    unsupportedMembers: [
      unsupportedMember("indexer", signatureId, "item", "Item", "Indexer signature contains parameter 'pointer' with type 'System.Int32*' that cannot be represented as closed .NET target type facts."),
    ],
  };

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    sourceSelectedSymbol: selectedDeclaration,
    argument,
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.Item", "item"),
      signatureId,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Indexer signature contains parameter 'pointer'/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
  assertUnsupportedDiagnosticEvidence(result.diagnostic, signatureId, "indexer");
  assert.equal("value" in result, false);
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("C# provider does not infer unsupported identity from metadata-name-only matches", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const binding = {
    id: "Test.Assembly::Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    unsupportedMembers: [
      unsupportedMember("property", "Test.Assembly::Example.Target.PointerProperty", "pointerProperty", "PointerProperty", "Property type cannot be represented as closed .NET target type facts.", {
        metadataName: "Example.Target.PointerProperty",
      }),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    sourceSelectedSymbol: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "pointerProperty",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.PointerProperty", "pointerProperty"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_NOT_FOUND");
  assert.doesNotMatch(result.diagnostic.message, /Property type cannot be represented/u);
});

test("C# provider preserves exact selected indexer signatures instead of refining to siblings", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.Target.other(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "Item", overloadGroup: "Example.Target.other" }),
      indexer("Example.Target.Item(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "renamed" }),
      indexer("Example.Target.Item(System.Int64)", { kind: "source-primitive", name: "int64" }, { sourceName: "renamed" }),
    ],
  };

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    sourceSelectedSymbol: selectedDeclaration,
    argument,
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.Item", "renamed"),
      signatureId: "Example.Target.Item(System.Int64)",
    },
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "Example.Target.Item(System.Int64)");
});

test("C# provider maps selected string indexers from provider signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = csharpStringType();
  const binding = {
    id: "Example.Headers",
    sourceName: "Headers",
    targetName: "Headers",
    target: "csharp",
    kind: "class",
    members: [
      indexer("Example.Headers.Item(System.Int32)", { kind: "source-primitive", name: "int32" }, { sourceName: "item", overloadGroup: "Example.Headers.Item" }),
      indexer("Example.Headers.Item(System.String)", csharpStringType(), { sourceName: "item", overloadGroup: "Example.Headers.Item" }),
    ],
  };

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    sourceSelectedSymbol: selectedDeclaration,
    argument,
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Headers.Item", "item"),
      signatureId: "Example.Headers.Item(System.String)",
    },
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.operation.operationId, "Example.Headers.Item(System.String)");
});

test("C# provider maps selected byref indexers from source marker target expressions", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const outCall = {};
  const value = {};
  const recordedFacts = [];
  const int32 = { kind: "source-primitive", name: "int32" };
  const binding = {
    id: "Example.RefIndexer",
    sourceName: "RefIndexer",
    targetName: "RefIndexer",
    target: "csharp",
    kind: "class",
    members: [{
      id: "Example.RefIndexer.Item(out System.Int32)",
      sourceName: "item",
      targetName: "Item",
      kind: "indexer",
      parameters: [targetParameter("value", int32, "byref-writeonly-must-init")],
      returnType: csharpStringType(),
      overloadGroup: "Example.RefIndexer.Item",
    }],
  };

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    sourceSelectedSymbol: selectedDeclaration,
    argument: outCall,
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: value,
    },
    sourcePrimitiveSubject: value,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.RefIndexer.Item", "item"),
      signatureId: "Example.RefIndexer.Item(out System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.operation.operationId, "Example.RefIndexer.Item(out System.Int32)");
  const csharpOperation = recordedFacts.find((fact) => fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(csharpOperation?.selectedMember?.parameters[0]?.passingMode, "byref-writeonly-must-init");
});

test("C# provider rejects selected byref indexers without source marker facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const receiverType = {};
  const argument = {};
  const recordedFacts = [];
  const int32 = { kind: "source-primitive", name: "int32" };
  const binding = {
    id: "Example.RefIndexer",
    sourceName: "RefIndexer",
    targetName: "RefIndexer",
    target: "csharp",
    kind: "class",
    members: [{
      id: "Example.RefIndexer.Item(out System.Int32)",
      sourceName: "item",
      targetName: "Item",
      kind: "indexer",
      parameters: [targetParameter("value", int32, "byref-writeonly-must-init")],
      returnType: csharpStringType(),
      overloadGroup: "Example.RefIndexer.Item",
    }],
  };

  const result = provider.mapCheckedElementAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    receiverType,
    sourceSelectedSymbol: selectedDeclaration,
    argument,
  }, fakeObservationContext({
    targetBindingSubject: receiverType,
    targetBinding: binding,
    sourcePrimitiveSubject: argument,
    sourcePrimitive: {
      kind: "int32",
      runtimeBase: "number",
      signed: true,
      width: 32,
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.RefIndexer.Item", "item"),
      signatureId: "Example.RefIndexer.Item(out System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_INDEXER_NOT_FOUND");
  assert.equal(recordedFacts.some((fact) => fact.key === csharpTargetOperationFactKey), false);
});

test("target member selection binds first-argument receiver generics before explicit arguments", () => {
  const receiver = {};
  const validArgument = {};
  const invalidArgument = {};
  const int32Type = { kind: "source-primitive", name: "int32" };
  const stringType = { kind: "target-named", id: "System.String" };
  const member = {
    id: "Tsonic.CSharp.Runtime.ArrayHelpers.includes",
    sourceName: "includes",
    targetName: "Includes",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    parameters: [
      {
        name: "array",
        type: { kind: "array", element: { kind: "type-parameter", name: "T" } },
        passingMode: "by-value",
      },
      {
        name: "value",
        type: { kind: "type-parameter", name: "T" },
        passingMode: "by-value",
      },
    ],
    returnType: { kind: "source-primitive", name: "bool" },
  };
  const context = {};
  const resolveTargetTypeRef = (subject) => {
    if (subject === receiver) {
      return { kind: "array", element: int32Type };
    }
    if (subject === validArgument) {
      return int32Type;
    }
    if (subject === invalidArgument) {
      return stringType;
    }
    return undefined;
  };

  assert.deepEqual(
    selectTargetMember([member], { arguments: [validArgument], receiver }, context, resolveTargetTypeRef),
    {
      ...member,
      parameters: [
        {
          ...member.parameters[0],
          type: { kind: "array", element: int32Type },
        },
        {
          ...member.parameters[1],
          type: int32Type,
        },
      ],
    },
  );
  assert.equal(
    selectTargetMember([member], { arguments: [invalidArgument], receiver }, context, resolveTargetTypeRef),
    undefined,
  );
  assert.equal(
    selectTargetMember([member], { arguments: [validArgument] }, context, resolveTargetTypeRef),
    undefined,
  );
});

test("target member selection does not prepend provider static container for explicit extension calls", () => {
  const staticContainer = {};
  const value = {};
  const start = {};
  const stringType = csharpStringType();
  const int32Type = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "System.MemoryExtensions.AsSpan(System.String,System.Int32)",
    sourceName: "asSpan",
    targetName: "AsSpan",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    parameters: [
      {
        name: "text",
        type: stringType,
        passingMode: "by-value",
      },
      {
        name: "start",
        type: int32Type,
        passingMode: "by-value",
      },
    ],
    returnType: csharpReadOnlySpanType({ kind: "source-primitive", name: "char" }),
  };
  const context = {};
  const resolveTargetTypeRef = (subject) => {
    if (subject === staticContainer) {
      return { kind: "target-named", id: "System.MemoryExtensions" };
    }
    if (subject === value) {
      return stringType;
    }
    if (subject === start) {
      return int32Type;
    }
    return undefined;
  };

  assert.equal(
    selectTargetMember([member], { arguments: [value, start], receiver: staticContainer }, context, resolveTargetTypeRef),
    undefined,
  );
  assert.deepEqual(
    selectTargetMember([member], { arguments: [value, start], receiver: staticContainer }, context, resolveTargetTypeRef, { firstArgumentReceiver: false }),
    member,
  );
});

test("C# provider maps extension receiver calls from selected provider signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = {};
  const receiver = { Kind: "KindIdentifier", Text: "text", ...csharpStringType() };
  const start = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "asSpan"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [start],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "System.MemoryExtensions",
      sourceName: "MemoryExtensions",
      targetName: "System.MemoryExtensions",
      target: "csharp",
      kind: "class",
      members: [
        {
          id: "System.MemoryExtensions.AsSpan(System.String,System.Int32)",
          sourceName: "asSpan",
          targetName: "AsSpan",
          kind: "method",
          static: true,
          receiverPassing: "first-argument",
          parameters: [
            targetParameter("text", csharpStringType()),
            targetParameter("start", start),
          ],
          returnType: csharpReadOnlySpanType({ kind: "source-primitive", name: "char" }),
          overloadGroup: "System.MemoryExtensions.AsSpan",
        },
      ],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("System.MemoryExtensions.AsSpan", "asSpan"),
      signatureId: "System.MemoryExtensions.AsSpan(System.String,System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, "System.MemoryExtensions.AsSpan(System.String,System.Int32)");
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
});

test("C# provider maps LINQ ExtensionMethods receiver calls from selected signature identity", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const receiver = { Kind: "KindIdentifier", Text: "values", kind: "array", element: int32 };
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "average"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: {
      id: "System.Linq.Enumerable",
      sourceName: "ExtensionMethods",
      targetName: "System.Linq.Enumerable",
      target: "csharp",
      kind: "class",
      members: [
        {
          id: "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)",
          sourceName: "average",
          targetName: "Average",
          kind: "method",
          static: true,
          receiverPassing: "first-argument",
          parameters: [
            targetParameter("source", csharpIEnumerableType(int32)),
          ],
          returnType: { kind: "source-primitive", name: "float64" },
          overloadGroup: "System.Linq.Enumerable.Average",
        },
      ],
    },
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("System.Linq.Enumerable.Average", "average"),
      signatureId: "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.deepEqual(result.value.selectedSignature.member.returnType, { kind: "source-primitive", name: "float64" });

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.operationId, "System.Linq.Enumerable.Average(System.Collections.Generic.IEnumerable`1<System.Int32>)");
  assert.equal(operation?.memberName, "Average");
  assert.equal(operation?.static, true);
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
});

test("C# provider maps overlap-style extension overloads with receiver and out parameter facts", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const call = {};
  const outCall = {};
  const int32 = { kind: "source-primitive", name: "int32" };
  const receiver = { Kind: "KindIdentifier", Text: "span", ...spanType(int32) };
  const other = readOnlySpanType(int32);
  const offset = int32;
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: propertyAccessCallee(receiver, "overlaps"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [other, outCall],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: overlapExtensionsBinding(),
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.MemoryExtensions.Overlaps", "overlaps"),
      signatureId: "Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)",
    },
    argumentPassingSubject: outCall,
    argumentPassing: {
      mode: "byref-writeonly-must-init",
      targetExpression: offset,
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.parameters[1]?.passingMode, "byref-writeonly-must-init");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
  assert.equal(operation?.selectedMember?.parameters[2]?.passingMode, "byref-writeonly-must-init");
});

test("C# provider rejects receiver calls when static target metadata omits receiver passing", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const receiver = { Kind: "KindIdentifier", Text: "value" };
  const binding = {
    id: "Example.Extensions",
    sourceName: "Extensions",
    targetName: "Extensions",
    target: "csharp",
    kind: "class",
    members: [
      {
        id: "Example.Extensions.current",
        sourceName: "current",
        targetName: "Current",
        kind: "method",
        static: true,
        parameters: [],
        returnType: { kind: "source-primitive", name: "bool" },
        overloadGroup: "Example.Extensions.current",
      },
    ],
  };

  const result = provider.mapCheckedCall({
    target: "csharp",
    call: {},
    callee: propertyAccessCallee(receiver, "current"),
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Extensions.current", "current"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_EXTENSION_RECEIVER_NOT_PROVEN");
});

test("target member selection applies declaring generics before literal collection matching", () => {
  const arrayLiteral = { Kind: 2, Elements: [{ Kind: 1, Text: "1" }, { Kind: 1, Text: "2" }] };
  const int32Type = { kind: "source-primitive", name: "int32" };
  const float64ArrayType = { kind: "array", element: { kind: "source-primitive", name: "float64" } };
  const member = {
    id: "System.Collections.Generic.List`1..ctor(System.Collections.Generic.IEnumerable`1<T>)",
    sourceName: "constructor",
    targetName: "constructor",
    kind: "constructor",
    parameters: [{
      name: "collection",
      type: {
        kind: "target-named",
        id: "System.Collections.Generic.IEnumerable`1",
        typeArguments: [{ kind: "type-parameter", name: "T" }],
        csharpArrayLiteralElementType: { kind: "type-parameter", name: "T" },
      },
      passingMode: "by-value",
    }],
    overloadGroup: "System.Collections.Generic.List`1..ctor",
  };
  const context = {
    compiler: {
      ast: {
        kindName: (node) => node?.Kind === 2 ? "KindArrayLiteralExpression" : node?.Kind === 1 ? "KindNumericLiteral" : "Unknown",
        elements: (node) => node.Elements ?? [],
        text: (node) => node.Text ?? "",
        is: {
          IsStringLiteral: () => false,
        },
      },
    },
  };
  const resolveTargetTypeRef = (subject) => subject === arrayLiteral ? float64ArrayType : undefined;

  assert.deepEqual(
    selectTargetMember(
      [member],
      { arguments: [arrayLiteral] },
      context,
      resolveTargetTypeRef,
      {
        declaringTargetType: {
          kind: "target-named",
          id: "System.Collections.Generic.List`1",
          typeArguments: [int32Type],
        },
        declaringTypeParameters: [{ name: "T" }],
      },
    ),
    {
      ...member,
      parameters: [{
        ...member.parameters[0],
        type: {
          kind: "target-named",
          id: "System.Collections.Generic.IEnumerable`1",
          typeArguments: [int32Type],
          csharpArrayLiteralElementType: int32Type,
        },
      }],
    },
  );
});

test("target member selection rejects collection literal matching without provider metadata", () => {
  const arrayLiteral = { Kind: 2, Elements: [{ Kind: 1, Text: "1" }] };
  const int32Type = { kind: "source-primitive", name: "int32" };
  const member = {
    id: "System.Collections.Generic.List`1..ctor(System.Collections.Generic.IEnumerable`1<T>)",
    sourceName: "constructor",
    targetName: "constructor",
    kind: "constructor",
    parameters: [{
      name: "collection",
      type: {
        kind: "target-named",
        id: "System.Collections.Generic.IEnumerable`1",
        typeArguments: [{ kind: "type-parameter", name: "T" }],
      },
      passingMode: "by-value",
    }],
  };
  const context = {
    compiler: {
      ast: {
        kindName: (node) => node?.Kind === 2 ? "KindArrayLiteralExpression" : node?.Kind === 1 ? "KindNumericLiteral" : "Unknown",
        elements: (node) => node.Elements ?? [],
        text: (node) => node.Text ?? "",
        is: {
          IsStringLiteral: () => false,
        },
      },
    },
  };
  const resolveTargetTypeRef = (subject) => subject === arrayLiteral
    ? { kind: "array", element: int32Type }
    : undefined;

  assert.equal(
    selectTargetMember(
      [member],
      { arguments: [arrayLiteral] },
      context,
      resolveTargetTypeRef,
      {
        declaringTargetType: {
          kind: "target-named",
          id: "System.Collections.Generic.List`1",
          typeArguments: [int32Type],
        },
        declaringTypeParameters: [{ name: "T" }],
      },
    ),
    undefined,
  );
});

test("target member selection does not treat opaque any or unknown as wildcard target types", () => {
  const argument = {};
  const int32Type = { kind: "source-primitive", name: "int32" };
  const context = {};
  const resolveTargetTypeRef = (subject) => subject === argument ? int32Type : undefined;

  for (const typeId of ["any", "unknown"]) {
    const member = method(`Example.Target.${typeId}`, { kind: "opaque", id: typeId });
    assert.equal(
      selectTargetMember([member], { arguments: [argument] }, context, resolveTargetTypeRef),
      undefined,
    );
  }
});

function getNativeSemanticProvider(options = {}) {
  const bindings = new Map((options.bindings ?? []).map((binding) => [binding.id, binding]));
  const metadataBindings = new Map(options.metadataBindings ?? []);
  const baseTypes = new Map(options.baseTypes ?? []);
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: (targetId) => bindings.get(targetId),
    getCsharpTargetBindingByMetadataName: (metadataName) => metadataBindings.get(metadataName),
    getTargetTypeRefForSubject(subject, context) {
      if (subject !== undefined && typeof subject === "object" && typeof subject.kind === "string") {
        return subject;
      }
      const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
      return primitive === undefined ? undefined : {
        kind: "source-primitive",
        name: primitive.kind,
      };
    },
    getBaseTargetTypeRef(type) {
      return type.kind === "target-named" ? baseTypes.get(type.id) : undefined;
    },
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier() {
      return deferObservation;
    },
  });
}

function method(id, parameterType, options = {}) {
  return {
    id,
    sourceName: options.sourceName ?? "m",
    targetName: options.targetName ?? "M",
    kind: "method",
    parameters: [{
      name: "value",
      type: parameterType,
      passingMode: "by-value",
    }],
    returnType: csharpVoidType(),
    overloadGroup: options.overloadGroup ?? "Example.Target.m",
    ...(options.providerSourceSignatureId === undefined ? {} : { providerSourceSignatureId: options.providerSourceSignatureId }),
  };
}

function property(id, sourceName, targetName) {
  return {
    id,
    sourceName,
    targetName,
    kind: "property",
    parameters: [],
    returnType: { kind: "source-primitive", name: "int32" },
  };
}

function field(id, sourceName, targetName) {
  return {
    id,
    sourceName,
    targetName,
    kind: "field",
    parameters: [],
    returnType: { kind: "source-primitive", name: "int32" },
  };
}

function eventMember(id, sourceName, targetName) {
  return {
    id,
    sourceName,
    targetName,
    kind: "event",
    parameters: [],
    returnType: csharpVoidType(),
  };
}

function constructorMember(id, parameterType) {
  return {
    id,
    sourceName: "constructor",
    targetName: ".ctor",
    kind: "constructor",
    parameters: [{
      name: "value",
      type: parameterType,
      passingMode: "by-value",
    }],
    overloadGroup: "Example.Target..ctor",
  };
}

function unsupportedMember(memberKind, targetId, sourceName, targetName, reason, options = {}) {
  return {
    kind: "unsupported-member",
    memberKind,
    sourceName,
    targetName,
    targetId,
    metadataName: options.metadataName ?? targetId,
    reason,
  };
}

function assertUnsupportedDiagnosticEvidence(diagnostic, targetId, memberKind) {
  assert.ok(diagnostic.evidence?.some((entry) =>
    entry.message.includes("unsupported target member") &&
    entry.details?.targetId === targetId &&
    entry.details?.memberKind === memberKind &&
    typeof entry.details.reason === "string"
  ), JSON.stringify(diagnostic.evidence));
}

function indexer(id, parameterType, options = {}) {
  return {
    id,
    sourceName: options.sourceName ?? "Item",
    targetName: options.targetName ?? "Item",
    kind: "indexer",
    parameters: [{
      name: "index",
      type: parameterType,
      passingMode: "by-value",
    }],
    returnType: csharpStringType(),
    overloadGroup: options.overloadGroup ?? "Example.Target.Item",
  };
}

function csharpStringType() {
  return {
    kind: "target-named",
    id: "System.String",
    csharpRender: { kind: "predefined", name: "string" },
    csharpSpecialType: "string",
  };
}

function csharpVoidType() {
  return {
    kind: "target-named",
    id: "System.Void",
    csharpRender: { kind: "predefined", name: "void" },
    csharpSpecialType: "void",
  };
}

function csharpReadOnlySpanType(element) {
  return {
    kind: "target-named",
    id: "System.ReadOnlySpan`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["System"], name: "ReadOnlySpan" },
  };
}

function csharpIEnumerableType(element) {
  return {
    kind: "target-named",
    id: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["System", "Collections", "Generic"], name: "IEnumerable" },
    csharpArrayLiteralElementType: element,
    csharpEnumerableElementType: element,
  };
}

function overlapExtensionsBinding() {
  const int32 = { kind: "source-primitive", name: "int32" };
  const typeParameter = { kind: "type-parameter", name: "T" };
  return {
    id: "Example.MemoryExtensions",
    sourceName: "MemoryExtensions",
    targetName: "Example.MemoryExtensions",
    target: "csharp",
    kind: "class",
    members: [
      overlapMethod("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>)", [
        targetParameter("span", spanType(typeParameter)),
        targetParameter("other", readOnlySpanType(typeParameter)),
      ]),
      overlapMethod("Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)", [
        targetParameter("span", spanType(typeParameter)),
        targetParameter("other", readOnlySpanType(typeParameter)),
        targetParameter("elementOffset", int32, "byref-writeonly-must-init"),
      ]),
    ],
  };
}

function overlapMethod(id, parameters) {
  return {
    id,
    sourceName: "overlaps",
    targetName: "Overlaps",
    kind: "method",
    static: true,
    receiverPassing: "first-argument",
    typeParameters: [{ name: "T" }],
    parameters,
    returnType: { kind: "source-primitive", name: "bool" },
    overloadGroup: "Example.MemoryExtensions.Overlaps",
  };
}

function targetParameter(name, type, passingMode = "by-value") {
  return {
    name,
    type,
    passingMode,
  };
}

function spanType(element) {
  return {
    kind: "target-named",
    id: "Example.Span`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["Example"], name: "Span" },
  };
}

function readOnlySpanType(element) {
  return {
    kind: "target-named",
    id: "Example.ReadOnlySpan`1",
    typeArguments: [element],
    csharpRender: { kind: "named", namespace: ["Example"], name: "ReadOnlySpan" },
  };
}

function coreLangMarker(exportName) {
  return {
    providerId: "test",
    providerVersion: "0",
    providerModuleId: "@tsonic/core/lang.js",
    moduleSpecifier: "@tsonic/core/lang.js",
    virtualFileName: "tsts-provider://@tsonic/core/lang.js",
    exportName,
    memberId: `@tsonic/core/lang.js::${exportName}`,
  };
}

function virtualMember(memberId, memberName = "m", targetId = targetIdFromMemberId(memberId)) {
  return {
    providerId: "test",
    providerVersion: "0",
    providerModuleId: "test",
    moduleSpecifier: "test",
    virtualFileName: "tsts-provider://test",
    memberName,
    memberId,
    targetIdentity: { kind: "target-named", id: targetId },
  };
}

function propertyAccessCallee(receiver, name) {
  return {
    Kind: "KindPropertyAccessExpression",
    Expression: receiver,
    name: { Kind: "KindIdentifier", Text: name },
  };
}

function targetIdFromMemberId(memberId) {
  if (memberId.includes("..ctor")) {
    return memberId.slice(0, memberId.indexOf("..ctor"));
  }
  const lastDot = memberId.lastIndexOf(".");
  return lastDot < 0 ? memberId : memberId.slice(0, lastDot);
}

function fakeObservationContext(options) {
  return {
    facts: {
      get(subject, key) {
        if (subject === options.selectedSignatureSubject && key === selectedTargetSignatureFactKey) {
          return options.selectedSignature;
        }
        if (subject === options.virtualSignatureSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualSignatureDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === targetBindingFactKey && options.targetBinding !== undefined) {
          return options.targetBinding;
        }
        if (subject === options.attributeSubject && key === attributeFactKey) {
          return options.attribute;
        }
        if (subject === options.fieldSubject && key === fieldFactKey) {
          return options.field;
        }
        if (subject === options.argumentPassingSubject && key === argumentPassingFactKey) {
          return options.argumentPassing;
        }
        if (subject === options.defaultValueSubject && key === defaultValueFactKey) {
          return options.defaultValue;
        }
        if (subject === options.flowStateSubject && key === flowStateFactKey) {
          return options.flowState;
        }
        if (subject === options.structFactSubject && key === structFactKey) {
          return options.structFact;
        }
        return undefined;
      },
      set(subject, key, value, evidence) {
        options.recordedFacts?.push({ subject, key, value, evidence });
      },
    },
    factResolver: {
      resolve(subject, key) {
        if (subject === options.selectedSignatureSubject && key === selectedTargetSignatureFactKey) {
          return options.selectedSignature;
        }
        if (subject === options.virtualSignatureSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualSignatureDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === targetBindingFactKey && options.targetBinding !== undefined) {
          return options.targetBinding;
        }
        if (subject === options.attributeSubject && key === attributeFactKey) {
          return options.attribute;
        }
        if (subject === options.fieldSubject && key === fieldFactKey) {
          return options.field;
        }
        if (subject === options.argumentPassingSubject && key === argumentPassingFactKey) {
          return options.argumentPassing;
        }
        if (subject === options.defaultValueSubject && key === defaultValueFactKey) {
          return options.defaultValue;
        }
        if (subject === options.flowStateSubject && key === flowStateFactKey) {
          return options.flowState;
        }
        if (subject === options.structFactSubject && key === structFactKey) {
          return options.structFact;
        }
        if (subject === options.targetBindingSubject && key === targetBindingFactKey) {
          return options.targetBinding;
        }
        if (subject === options.sourcePrimitiveSubject && key === sourcePrimitiveFactKey) {
          return options.sourcePrimitive;
        }
        return undefined;
      },
    },
    diagnostics: [],
    compiler: {
      ast: {
        kindName: (node) => node === undefined ? "Undefined" : node.Kind === 1 ? "KindNumericLiteral" : String(node.Kind),
        getSourceFile: () => undefined,
        parent: (node) => node?.Parent,
        name: (node) => node?.name ?? node?.Name,
        text: (node) => node?.Text ?? "",
        typeArguments: () => [],
        is: {
          IsIdentifier: (node) => node?.Kind === "KindIdentifier",
          IsPrivateIdentifier: () => false,
          IsQualifiedName: () => false,
          IsPropertyAccessExpression: (node) => node?.Kind === "KindPropertyAccessExpression",
          IsVariableDeclaration: () => false,
          IsParameterDeclaration: () => false,
          IsBindingElement: () => false,
          IsFunctionDeclaration: () => false,
          IsClassDeclaration: () => false,
          IsMethodDeclaration: () => false,
          IsPropertyDeclaration: () => false,
          IsKeywordTypeNode: () => false,
          IsTypeReferenceNode: () => false,
          IsUnionTypeNode: () => false,
          IsIntersectionTypeNode: () => false,
          IsConditionalTypeNode: () => false,
          IsInferTypeNode: () => false,
          IsArrayTypeNode: () => false,
          IsIndexedAccessTypeNode: () => false,
          IsLiteralTypeNode: () => false,
          IsThisTypeNode: () => false,
          IsMappedTypeNode: () => false,
          IsTupleTypeNode: () => false,
          IsOptionalTypeNode: () => false,
          IsRestTypeNode: () => false,
          IsParenthesizedTypeNode: () => false,
          IsFunctionTypeNode: () => false,
          IsConstructorTypeNode: () => false,
          IsTemplateLiteralTypeNode: () => false,
          IsImportTypeNode: () => false,
          IsStringLiteral: () => false,
        },
      },
      checker: {
        getSymbolAtLocation: (node) => options.symbolsByNode?.get(node),
        getResolvedSymbol: (node) => options.resolvedSymbolsByNode?.get(node),
        getResolvedSymbolOrNil: (node) => options.resolvedSymbolsByNode?.get(node),
        getAliasedSymbol: () => undefined,
        getTypeAtLocation: (node) => options.typesByNode?.get(node) ?? (node !== undefined && typeof node === "object" && typeof node.kind === "string" ? node : undefined),
        getTypeSymbol: (type) => options.typeSymbolsByType?.get(type),
        getSymbolDeclarations: (symbol) => options.declarationsBySymbol?.get(symbol) ?? [],
      },
    },
  };
}
