import { test } from "node:test";
import assert from "node:assert/strict";
import { deferObservation } from "@tsonic/tsts";
import {
  csharpProjectSourceFactKey,
  csharpRuntimeCarrierFactKey,
} from "../dist/source/csharp-facts.js";
import {
  createCsharpNativeOperationsProvider,
} from "../dist/source/csharp-source-semantics/operations-provider.js";
import {
  isCsharpSourceOwnedSelectedSignature,
} from "../dist/source/csharp-source-semantics/source-owned-selected-signature.js";
import {
  csharpStringTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import { checkedCallRequest } from "./provider-selection.helpers.mjs";

const int32 = { kind: "source-primitive", name: "int32" };
const string = csharpStringTargetType();
const stringSelection = { kind: "target-named", id: "System.String" };
const bool = { kind: "source-primitive", name: "bool" };

test("source-owned calls close their return from the exact TSTS-selected result type", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("result");
  const context = fixture.context();

  const result = fixture.map({
    context,
    sourceResultType,
    targetTypes: new Map([[sourceResultType, int32]]),
  });

  assertSourceOwnedAccept(result, { returnType: int32 });
  assert.deepEqual(context.facts.get(fixture.call, csharpRuntimeCarrierFactKey), {
    carrier: int32,
  });
});

test("source-owned calls prefer an exact authored result type node over a broader semantic result", () => {
  const fixture = sourceOwnedFixture();
  const authoredTypeNode = node("KindTypeReference");
  const sourceResultType = semanticType("broader-result");

  const result = fixture.map({
    sourceResultType,
    sourceResultTypeNode: authoredTypeNode,
    targetTypes: new Map([
      [authoredTypeNode, string],
      [sourceResultType, { kind: "opaque", id: "any" }],
    ]),
  });

  assertSourceOwnedAccept(result, { returnType: stringSelection });
});

test("source-owned calls consume a finalized private C# carrier on the exact result type", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("carrier-backed-result");
  const context = fixture.context({
    facts: [[sourceResultType, csharpRuntimeCarrierFactKey, { carrier: bool }]],
  });

  const result = fixture.map({ context, sourceResultType });

  assertSourceOwnedAccept(result, { returnType: bool });
});

test("source-owned array returns remain exact without publishing a concrete call carrier", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("array-result");
  const array = { kind: "array", element: int32 };
  const context = fixture.context();

  const result = fixture.map({
    context,
    sourceResultType,
    targetTypes: new Map([[sourceResultType, array]]),
  });

  assertSourceOwnedAccept(result, { returnType: array });
  assert.equal(context.facts.get(fixture.call, csharpRuntimeCarrierFactKey), undefined);
});

test("source-owned calls fail closed for an opaque any result", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("any-result");

  const result = fixture.map({
    sourceResultType,
    targetTypes: new Map([[sourceResultType, { kind: "opaque", id: "any" }]]),
  });

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_CALL_RESULT_FACT_NOT_PROVEN");
  assert.equal(result.diagnostic.nodeOrSpan, fixture.call);
});

test("source-owned construction consumes exact construct-kind and result evidence", () => {
  const fixture = sourceOwnedFixture({ callKind: "construct" });
  const sourceResultType = semanticType("constructed-result");
  const point = { kind: "target-named", id: "Example.Point" };

  const result = fixture.map({
    sourceResultType,
    targetTypes: new Map([[sourceResultType, point]]),
  });

  assertSourceOwnedAccept(result, { returnType: point });
});

test("source-owned generic calls consume exact TSTS-selected method type arguments", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("generic-result");
  const selectedType = semanticType("selected-method-type");

  const result = fixture.map({
    sourceResultType,
    methodTypeArguments: [{
      typeParameterName: "T",
      typeParameter: node("KindTypeParameter"),
      selectedType,
    }],
    targetTypes: new Map([
      [sourceResultType, string],
      [selectedType, string],
    ]),
  });

  assertSourceOwnedAccept(result, {
    returnType: stringSelection,
    targetTypeArguments: [stringSelection],
  });
});

test("source-owned generic calls fail closed when a selected method type argument has no target fact", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("generic-result");

  const result = fixture.map({
    sourceResultType,
    methodTypeArguments: [{
      typeParameterName: "T",
      selectedType: semanticType("unresolved-method-type"),
    }],
    targetTypes: new Map([[sourceResultType, string]]),
  });

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_METHOD_TYPE_ARGUMENT_NOT_PROVEN");
});

test("source-owned calls map exact selected parameter evidence without checker reconstruction", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("parameterized-result");
  const selectedParameterType = semanticType("parameter-type");
  const argument = node("KindIdentifier");

  const result = fixture.map({
    sourceResultType,
    arguments: [argument],
    sourceArgumentTypes: [selectedParameterType],
    selectedParameters: [selectedParameter({
      index: 0,
      name: "value",
      selectedType: selectedParameterType,
    })],
    targetTypes: new Map([
      [sourceResultType, bool],
      [selectedParameterType, int32],
    ]),
  });

  assertSourceOwnedAccept(result, {
    returnType: bool,
    parameters: [{
      name: "value",
      type: int32,
      passingMode: "by-value",
    }],
    argumentConversions: [{
      sourceArgumentIndex: 0,
      sourceForm: "value",
      targetParameterIndex: 0,
      targetForm: "parameter",
    }],
  });
});

test("source-owned calls fail closed when selected parameter target evidence is missing", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("parameterized-result");
  const unresolvedParameterType = semanticType("unresolved-parameter");

  const result = fixture.map({
    sourceResultType,
    arguments: [node("KindIdentifier")],
    selectedParameters: [selectedParameter({
      index: 0,
      name: "value",
      selectedType: unresolvedParameterType,
    })],
    targetTypes: new Map([[sourceResultType, bool]]),
  });

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_CALL_PARAMETER_FACT_NOT_PROVEN");
  assert.equal(result.diagnostic.nodeOrSpan, fixture.call);
});

test("source-owned omitted parameters fail closed without target omission semantics", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("optional-result");
  const optionalParameterType = semanticType("optional-parameter");

  const result = fixture.map({
    sourceResultType,
    selectedParameters: [selectedParameter({
      index: 0,
      name: "value",
      selectedType: optionalParameterType,
      acceptsOmission: true,
    })],
    targetTypes: new Map([
      [sourceResultType, bool],
      [optionalParameterType, string],
    ]),
  });

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_CALL_ARGUMENT_CONVERSIONS_NOT_PROVEN");
});

test("source-owned exact zero-parameter selections close without invented parameters", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("zero-parameter-result");

  const result = fixture.map({
    sourceResultType,
    selectedParameters: [],
    targetTypes: new Map([[sourceResultType, bool]]),
  });

  assertSourceOwnedAccept(result, {
    returnType: bool,
    parameters: [],
    argumentConversions: [],
  });
});

test("calls without exact project-source ownership do not enter source-owned closure", () => {
  const fixture = sourceOwnedFixture();
  const sourceResultType = semanticType("unowned-result");
  const context = fixture.context({ projectOwned: false });

  const result = fixture.map({
    context,
    sourceResultType,
    targetTypes: new Map([[sourceResultType, bool]]),
  });

  assert.notEqual(result.kind, "accept");
});

test("source-owned missing prerequisite evidence defers during checking", () => {
  const fixture = sourceOwnedFixture();
  const result = fixture.map({
    context: fixture.context({ phase: "checking" }),
    sourceResultType: semanticType("not-finalized"),
  });

  assert.equal(result, deferObservation);
});

function sourceOwnedFixture(options = {}) {
  const declaration = node("KindFunctionDeclaration");
  const call = node(options.callKind === "construct" ? "KindNewExpression" : "KindCallExpression");
  const callee = node("KindIdentifier");

  return {
    call,
    context: (contextOptions = {}) => observationContext({
      declaration,
      ...contextOptions,
    }),
    map(mapOptions = {}) {
      const context = mapOptions.context ?? observationContext({ declaration });
      const provider = sourceOwnedProvider(mapOptions.targetTypes ?? new Map());
      return provider.mapCheckedCall(checkedCallRequest({
        target: "csharp",
        call,
        callee,
        callKind: options.callKind ?? "call",
        selectedSignature: node("KindSignature"),
        selectedDeclaration: declaration,
        selectedCalleeDeclaration: declaration,
        selectedParameters: mapOptions.selectedParameters ?? [],
        methodTypeArguments: mapOptions.methodTypeArguments ?? [],
        arguments: mapOptions.arguments ?? [],
        sourceArgumentTypes: mapOptions.sourceArgumentTypes,
        sourceResultType: mapOptions.sourceResultType ?? semanticType("default-result"),
        sourceResultTypeNode: mapOptions.sourceResultTypeNode,
      }), context);
    },
  };
}

function sourceOwnedProvider(targetTypes) {
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: () => undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
    getTargetTypeRefForSubject: (subject) => targetTypes.get(subject),
    getBaseTargetTypeRef: () => undefined,
    getAssignableTargetTypeRefs: () => [],
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier: () => deferObservation,
  });
}

function observationContext(options) {
  const facts = new TestFactStore(options.facts ?? []);
  if (options.projectOwned !== false) {
    facts.set(options.declaration, csharpProjectSourceFactKey, { kind: "project-source" });
  }
  return {
    observation: "operation.mapCheckedCall",
    phase: options.phase ?? "finalization",
    extensionId: "tsonic.csharp.operations",
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key),
    },
    diagnostics: [],
  };
}

class TestFactStore {
  #facts = new Map();

  constructor(initialFacts) {
    for (const [subject, key, value] of initialFacts) {
      this.set(subject, key, value);
    }
  }

  get(subject, key) {
    return this.#facts.get(subject)?.get(key);
  }

  set(subject, key, value) {
    let subjectFacts = this.#facts.get(subject);
    if (subjectFacts === undefined) {
      subjectFacts = new Map();
      this.#facts.set(subject, subjectFacts);
    }
    const existing = subjectFacts.get(key);
    if (existing !== undefined) {
      return key.equals(existing, value) ? "idempotent" : "conflict";
    }
    subjectFacts.set(key, key.snapshot === undefined ? value : key.snapshot(value));
    return "inserted";
  }
}

function selectedParameter(options) {
  return {
    parameterIndex: options.index,
    parameterName: options.name,
    parameterSymbol: node("KindParameterSymbol"),
    parameterDeclaration: node("KindParameter"),
    selectedType: options.selectedType,
    ...(options.authoredTypeNode === undefined ? {} : {
      authoredTypeNode: options.authoredTypeNode,
    }),
    acceptsOmission: options.acceptsOmission ?? false,
    rest: options.rest ?? false,
  };
}

function assertSourceOwnedAccept(result, options) {
  assert.equal(
    result.kind,
    "accept",
    result.kind === "reject" ? `${result.diagnostic.extensionCode}: ${result.diagnostic.message}` : undefined,
  );
  assert.equal(result.value.kind, "target");
  assert.equal(isCsharpSourceOwnedSelectedSignature(result.value.selectedSignature), true);
  assert.deepEqual(result.value.selectedSignature.member.returnType, options.returnType);
  assert.deepEqual(
    result.value.selectedSignature.member.parameters,
    options.parameters ?? [],
  );
  assert.deepEqual(
    result.value.selectedSignature.targetTypeArguments,
    options.targetTypeArguments,
  );
  assert.deepEqual(
    result.value.argumentConversions,
    options.argumentConversions ?? [],
  );
}

function semanticType(label) {
  return { flags: 1, label };
}

function node(Kind) {
  return { Kind };
}
