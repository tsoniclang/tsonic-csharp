import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeFactKey, deferObservation, providerVirtualDeclarationFactKey, sourcePrimitiveFactKey, targetBindingFactKey } from "@tsonic/tsts";
import { csharpTargetOperationFactKey } from "../dist/source/csharp-facts.js";
import { createCsharpNativeOperationsProvider } from "../dist/source/csharp-source-semantics/operations-provider.js";
import { selectTargetMember } from "../dist/source/csharp-source-semantics/target-member-selection.js";

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

test("C# provider rejects overloaded member selections without exact signature identity", () => {
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

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_NOT_FOUND");
});

test("C# provider refines collapsed source overloads only inside the selected provider overload group", () => {
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

  assert.equal(result.kind, "accept");
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

  assert.equal(result.kind, "accept");
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
    sourceSelectedDeclaration: selectedDeclaration,
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
    sourceSelectedDeclaration: selectedDeclaration,
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
    sourceSelectedDeclaration: selectedDeclaration,
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
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    unsupportedMembers: [
      unsupportedMember("property", "Example.Target.PointerProperty", "pointerProperty", "PointerProperty", "Property type cannot be represented as closed .NET target type facts. System.Int32* is unsupported."),
    ],
  };

  const result = provider.mapCheckedPropertyAccess({
    target: "csharp",
    expression: {},
    receiver: {},
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "unrelated",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.PointerProperty", "pointerProperty"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_PROPERTY_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Property type cannot be represented/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
});

test("C# provider rejects events even when target facts exist until event source semantics exist", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
    members: [
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
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    propertyName: "changed",
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: virtualMember("Example.Target.Changed", "changed"),
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_EVENT_UNSUPPORTED");
  assert.match(result.diagnostic.message, /add\/remove subscription semantics/u);
});

test("C# provider reports selected unsupported call identities with provider reason", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const signatureId = "Example.Target.PointerReturn(System.Int32*)";
  const binding = {
    id: "Example.Target",
    sourceName: "Target",
    targetName: "Target",
    target: "csharp",
    kind: "class",
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
    arguments: [],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: binding,
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.Target.PointerReturn", "pointerReturn"),
      signatureId,
    },
  }));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_TARGET_MEMBER_UNSUPPORTED");
  assert.match(result.diagnostic.message, /Method return type cannot be represented/u);
  assert.match(result.diagnostic.message, /System\.Int32\*/u);
});

test("C# provider refines selected indexer overload groups from provider signature identity", () => {
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
    sourceSelectedDeclaration: selectedDeclaration,
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
  assert.equal(result.value.operation.operationId, "Example.Target.Item(System.Int32)");
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
    sourceSelectedDeclaration: selectedDeclaration,
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
  const receiver = csharpStringType();
  const start = { kind: "source-primitive", name: "int32" };
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleeReceiver: receiver,
    calleePropertyName: "asSpan",
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
  const receiver = { kind: "array", element: int32 };
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleeReceiver: receiver,
    calleePropertyName: "average",
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
  const int32 = { kind: "source-primitive", name: "int32" };
  const receiver = spanType(int32);
  const other = readOnlySpanType(int32);
  const offset = int32;
  const recordedFacts = [];

  const result = provider.mapCheckedCall({
    target: "csharp",
    call,
    callee: {},
    calleeReceiver: receiver,
    calleePropertyName: "overlaps",
    sourceSelectedDeclaration: selectedDeclaration,
    sourceSelectedContainerSymbol: containerSymbol,
    arguments: [other, offset],
  }, fakeObservationContext({
    targetBindingSubject: containerSymbol,
    targetBinding: overlapExtensionsBinding(),
    virtualDeclarationSubject: selectedDeclaration,
    virtualDeclaration: {
      ...virtualMember("Example.MemoryExtensions.Overlaps", "overlaps"),
      signatureId: "Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)",
    },
    recordedFacts,
  }));

  assert.equal(result.kind, "accept", result.kind === "reject" ? result.diagnostic.message : undefined);
  assert.equal(result.value.selectedSignature.member.id, "Example.MemoryExtensions.Overlaps(Example.Span`1<T>,Example.ReadOnlySpan`1<T>,System.Int32)");
  assert.equal(result.value.selectedSignature.member.receiverPassing, "first-argument");
  assert.equal(result.value.selectedSignature.member.parameters[2].passingMode, "byref-writeonly-must-init");

  const operation = recordedFacts.find((fact) => fact.subject === call && fact.key === csharpTargetOperationFactKey)?.value;
  assert.equal(operation?.selectedMember?.receiverPassing, "first-argument");
  assert.equal(operation?.selectedMember?.parameters[2]?.passingMode, "byref-writeonly-must-init");
});

test("C# provider rejects receiver calls when static target metadata omits receiver passing", () => {
  const provider = getNativeSemanticProvider();
  const selectedDeclaration = {};
  const containerSymbol = {};
  const receiver = {};
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
    callee: {},
    calleeReceiver: receiver,
    calleePropertyName: "current",
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

function getNativeSemanticProvider() {
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: () => undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
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

function unsupportedMember(memberKind, targetId, sourceName, targetName, reason) {
  return {
    kind: "unsupported-member",
    memberKind,
    sourceName,
    targetName,
    targetId,
    metadataName: targetId,
    reason,
  };
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

function virtualMember(memberId, memberName = "m") {
  return {
    providerId: "test",
    providerVersion: "0",
    providerModuleId: "test",
    moduleSpecifier: "test",
    virtualFileName: "tsts-provider://test",
    memberName,
    memberId,
  };
}

function fakeObservationContext(options) {
  return {
    facts: {
      get(subject, key) {
        if (subject === options.virtualSignatureSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualSignatureDeclaration;
        }
        if (subject === options.virtualDeclarationSubject && key === providerVirtualDeclarationFactKey) {
          return options.virtualDeclaration;
        }
        if (subject === options.attributeSubject && key === attributeFactKey) {
          return options.attribute;
        }
        return undefined;
      },
      set(subject, key, value, evidence) {
        options.recordedFacts?.push({ subject, key, value, evidence });
      },
    },
    factResolver: {
      resolve(subject, key) {
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
        text: (node) => node?.Text ?? "",
        is: {
          IsStringLiteral: () => false,
        },
      },
    },
  };
}
