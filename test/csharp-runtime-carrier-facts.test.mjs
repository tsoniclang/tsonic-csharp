import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csharpRuntimeCarrierFactKey,
  csharpSourceDeclarationTargetFactKey,
  getRecordedCsharpRuntimeCarrierFact,
  recordCsharpRuntimeCarrierFact,
} from "../dist/source/csharp-facts.js";
import {
  createCsharpNativeOperationsProvider,
} from "../dist/source/csharp-source-semantics/operations-provider.js";
import {
  getExistingRuntimeCarrier,
} from "../dist/source/csharp-source-semantics/runtime-carrier-mapping/existing.js";
import {
  getExactRuntimeCarrierRequestSubjects,
} from "../dist/source/csharp-source-semantics/runtime-carrier-subjects.js";
import {
  getTargetTypeRefForType,
} from "../dist/backend/planner/runtime-carriers.js";
import {
  recordSourceDeclarationTarget,
} from "../dist/source/csharp-source-semantics/source-declaration-facts/recording.js";
import {
  mapCsharpIterationOperationRows,
} from "../dist/source/csharp-source-semantics/operation-selection/iteration.js";
import {
  getTypeSyntaxCarrierFromFinalizedTypeFacts,
} from "../dist/source/csharp-source-semantics/runtime-carrier-mapping/syntax.js";
import {
  targetBindingFactKey,
} from "../../tsonic/packages/tsts/dist/src/index.js";

const int32 = Object.freeze({ kind: "source-primitive", name: "int32" });
const stringType = Object.freeze({
  kind: "target-named",
  id: "System.String",
  csharpRender: Object.freeze({ kind: "predefined", name: "string" }),
  csharpSpecialType: "string",
  csharpTypeofRuntimeKind: "string",
});

test("C# runtime-carrier fact identity includes every output-critical target metadata family", () => {
  const cases = [
    [
      namedType({ csharpRender: { kind: "named", externAlias: "Primary", namespace: ["Acme"], name: "Value" } }),
      namedType({ csharpRender: { kind: "named", externAlias: "Secondary", namespace: ["Acme"], name: "Value" } }),
    ],
    [
      namedType({ csharpTaskResultType: int32 }),
      namedType({ csharpTaskResultType: stringType }),
    ],
    [
      namedType({ csharpDelegateSignature: { parameters: [int32], returnType: stringType } }),
      namedType({ csharpDelegateSignature: { parameters: [stringType], returnType: stringType } }),
    ],
    [
      namedType({ csharpRuntimeUnionArms: [int32, stringType] }),
      namedType({ csharpRuntimeUnionArms: [stringType, int32] }),
    ],
    [
      namedType({ csharpRuntimeUnionObjectShapes: [objectShape("value")] }),
      namedType({ csharpRuntimeUnionObjectShapes: [objectShape("other")] }),
    ],
    [
      namedType({ csharpJsSurfaceKind: "map" }),
      namedType({ csharpJsSurfaceKind: "set" }),
    ],
    [
      namedType({ csharpCollectionSurface: "record" }),
      namedType({}),
    ],
    [
      namedType({ csharpNullableReference: true }),
      namedType({}),
    ],
  ];

  for (const [left, right] of cases) {
    assert.equal(csharpRuntimeCarrierFactKey.equals({ carrier: left }, { carrier: structuredClone(left) }), true);
    assert.equal(csharpRuntimeCarrierFactKey.equals({ carrier: left }, { carrier: right }), false);
  }
});

test("C# runtime-carrier snapshots are exact immutable owned data", () => {
  const source = namedType({
    typeArguments: [int32],
    csharpRender: {
      kind: "named",
      externAlias: "Primary",
      namespace: ["Acme", "Runtime"],
      name: "Carrier",
      genericArity: 1,
      nested: [{ name: "Nested", genericArity: 0 }],
    },
    csharpDelegateSignature: {
      parameters: [int32],
      returnType: stringType,
    },
  });
  const snapshot = csharpRuntimeCarrierFactKey.snapshot({ carrier: source });

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.carrier), true);
  assert.equal(Object.isFrozen(snapshot.carrier.typeArguments), true);
  assert.equal(Object.isFrozen(snapshot.carrier.csharpRender), true);
  assert.equal(Object.isFrozen(snapshot.carrier.csharpRender.namespace), true);
  assert.equal(Object.isFrozen(snapshot.carrier.csharpRender.nested), true);
  assert.equal(Object.isFrozen(snapshot.carrier.csharpDelegateSignature.parameters), true);
  assert.throws(() => {
    snapshot.carrier.csharpRender.namespace[0] = "Changed";
  }, TypeError);
});

test("C# runtime-carrier snapshots reject unknown or invalid target metadata", () => {
  assert.throws(
    () => csharpRuntimeCarrierFactKey.snapshot({ carrier: namedType({ csharpMystery: true }) }),
    /unsupported field 'csharpMystery'/u,
  );
  assert.throws(
    () => csharpRuntimeCarrierFactKey.snapshot({ carrier: { kind: "array", element: int32, sourceShape: stringType } }),
    /unsupported field 'sourceShape'/u,
  );
  assert.throws(
    () => csharpRuntimeCarrierFactKey.snapshot({ carrier: namedType({ csharpValueType: false }) }),
    /csharpValueType.*must be true/u,
  );
  assert.throws(
    () => csharpRuntimeCarrierFactKey.snapshot({ carrier: namedType({}), ignored: true }),
    /runtimeCarrier.*unsupported field 'ignored'/u,
  );
});

test("C# runtime-carrier snapshots reject cyclic target metadata", () => {
  const carrier = namedType({});
  carrier.csharpBaseType = carrier;
  assert.throws(
    () => csharpRuntimeCarrierFactKey.snapshot({ carrier }),
    /contains a cycle/u,
  );
});

test("C# runtime-carrier request subjects include only exact type-use identities", () => {
  const sourceTypeReference = { Kind: "KindTypeReference" };
  const type = { flags: 1 };
  const sourceSymbol = {};

  assert.deepEqual(
    getExactRuntimeCarrierRequestSubjects({ type, sourceTypeReference, sourceSymbol }),
    [sourceTypeReference, type],
  );
  assert.deepEqual(
    getExactRuntimeCarrierRequestSubjects({ type, sourceTypeReference: type, sourceSymbol }),
    [type],
  );
});

test("C# runtime-carrier fact boundary ignores symbol reads and rejects symbol writes", () => {
  const facts = new TestFactStore();
  const symbol = fakeSymbol("Task");
  const type = { flags: 1 };
  facts.set(symbol, csharpRuntimeCarrierFactKey, { carrier: stringType });

  assert.equal(getRecordedCsharpRuntimeCarrierFact(facts, symbol), undefined);
  assert.throws(
    () => recordCsharpRuntimeCarrierFact(facts, symbol, { carrier: int32 }),
    /exact source node or semantic type subject/u,
  );
  assert.equal(recordCsharpRuntimeCarrierFact(facts, type, { carrier: int32 }), "inserted");
  assert.deepEqual(getRecordedCsharpRuntimeCarrierFact(facts, type)?.carrier, int32);
});

test("C# runtime-carrier resolution never reuses a concrete carrier from a declaration symbol", () => {
  const sourceTypeReference = { Kind: "KindTypeReference" };
  const type = { flags: 1 };
  const sourceSymbol = fakeSymbol("Task");
  const facts = new TestFactStore();
  facts.set(sourceSymbol, csharpRuntimeCarrierFactKey, { carrier: stringType });

  assert.equal(getExistingRuntimeCarrier(
    { type, sourceTypeReference, sourceSymbol },
    observationContext(facts),
  ), undefined);

  facts.set(type, csharpRuntimeCarrierFactKey, { carrier: int32 });
  assert.deepEqual(getExistingRuntimeCarrier(
    { type, sourceTypeReference, sourceSymbol },
    observationContext(facts),
  ), int32);
});

test("C# runtime-carrier syntax resolution instantiates a declaration-invariant symbol binding without checker re-entry", () => {
  const sourceTypeReference = { Kind: "KindTypeReference" };
  const type = { flags: 1 };
  const sourceSymbol = fakeSymbol("Buffer");
  const facts = new TestFactStore();
  facts.set(sourceSymbol, targetBindingFactKey, {
    id: "Tsonic.CSharp.Node.Buffer",
    sourceName: "Buffer",
    targetName: "Tsonic.CSharp.Node.Buffer",
    target: "csharp",
    kind: "class",
    csharpRender: {
      kind: "named",
      namespace: ["Tsonic", "CSharp", "Node"],
      name: "Buffer",
    },
  });
  const ast = {
    kindName: (node) => node === sourceTypeReference ? "KindTypeReference" : undefined,
    typeArguments: () => [],
  };
  const context = {
    ...observationContext(facts),
    compiler: { ast },
  };
  const host = {
    getTargetTypeRefForSyntaxNode: () => {
      throw new Error("Exact provider symbol binding must resolve before syntax or checker fallback.");
    },
  };

  assert.deepEqual(getTypeSyntaxCarrierFromFinalizedTypeFacts(
    { type, sourceTypeReference, sourceSymbol, target: "csharp" },
    context,
    host,
  ), {
    kind: "target-named",
    id: "Tsonic.CSharp.Node.Buffer",
    csharpRender: {
      kind: "named",
      namespace: ["Tsonic", "CSharp", "Node"],
      name: "Buffer",
    },
  });
  assert.equal(facts.get(sourceSymbol, csharpRuntimeCarrierFactKey), undefined);
});

test("C# backend semantic-type resolution never falls back to a declaration-symbol carrier", () => {
  const symbol = fakeSymbol("Task");
  const type = { flags: 1, symbol };
  const symbolCarrier = namedType({});
  const carriers = new Map([[symbol, { carrier: symbolCarrier }]]);
  const input = backendCarrierInput(carriers);

  assert.equal(getTargetTypeRefForType(input, type, {}), undefined);

  carriers.set(type, { carrier: stringType });
  assert.deepEqual(getTargetTypeRefForType(input, type, {}), stringType);
});

test("C# runtime-carrier publication writes exact type subjects without mutating declaration symbols", () => {
  const sourceTypeReference = { Kind: "KindTypeReference" };
  const type = { flags: 1 };
  const sourceSymbol = fakeSymbol("Task");
  const facts = new TestFactStore();
  facts.set(sourceSymbol, csharpRuntimeCarrierFactKey, { carrier: stringType });
  const provider = createRuntimeCarrierProvider(int32);

  const result = provider.resolveRuntimeCarrier(
    { type, sourceTypeReference, sourceSymbol, target: "csharp" },
    observationContext(facts),
  );

  assert.equal(result.kind, "accept");
  assert.deepEqual(facts.get(sourceTypeReference, csharpRuntimeCarrierFactKey)?.carrier, int32);
  assert.deepEqual(facts.get(type, csharpRuntimeCarrierFactKey)?.carrier, int32);
  assert.deepEqual(facts.get(sourceSymbol, csharpRuntimeCarrierFactKey)?.carrier, stringType);
});

test("C# runtime-carrier publication still rejects incompatible writes to an exact type subject", () => {
  const type = { flags: 1 };
  const facts = new TestFactStore();
  facts.set(type, csharpRuntimeCarrierFactKey, { carrier: stringType });
  const provider = createRuntimeCarrierProvider(int32);

  const result = provider.resolveRuntimeCarrier(
    { type, sourceSymbol: fakeSymbol("Task"), target: "csharp" },
    observationContext(facts),
  );

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_RUNTIME_CARRIER_FACT_WRITE_FAILED");
  assert.deepEqual(facts.get(type, csharpRuntimeCarrierFactKey)?.carrier, stringType);
});

test("C# source declaration target templates are separate from concrete runtime carriers", () => {
  const declaration = { Kind: "KindClassDeclaration" };
  const name = { Kind: "KindIdentifier" };
  const facts = new TestFactStore();
  const targetType = namedType({ typeArguments: [{ kind: "type-parameter", name: "T" }] });

  recordSourceDeclarationTarget({
    compiler: { ast: { name: (node) => node === declaration ? name : undefined } },
    host: { facts },
  }, declaration, targetType);

  assert.deepEqual(facts.get(declaration, csharpSourceDeclarationTargetFactKey)?.targetType, targetType);
  assert.deepEqual(facts.get(name, csharpSourceDeclarationTargetFactKey)?.targetType, targetType);
  assert.equal(facts.get(declaration, csharpRuntimeCarrierFactKey), undefined);
  assert.equal(facts.get(name, csharpRuntimeCarrierFactKey), undefined);

  const snapshot = csharpSourceDeclarationTargetFactKey.snapshot({ targetType });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.targetType), true);
  assert.throws(
    () => csharpSourceDeclarationTargetFactKey.snapshot({ targetType, carrier: targetType }),
    /sourceDeclarationTarget.*unsupported field 'carrier'/u,
  );
});

test("C# iteration carriers stay on exact binding and type subjects, never shared selected declarations", () => {
  const statement = { Kind: "KindForOfStatement" };
  const initializer = { Kind: "KindVariableDeclaration" };
  const authoredTypeNode = { Kind: "KindTypeReference" };
  const selectedDeclaration = { Kind: "KindInterfaceDeclaration" };
  const type = { flags: 1 };
  const facts = new TestFactStore();
  const context = observationContext(facts);

  const result = mapCsharpIterationOperationRows({
    sourceOperationKind: "iteration",
    target: "csharp",
    statement,
    initializer,
    expression: { Kind: "KindIdentifier" },
    iterationKind: "sync",
    sourceElement: {
      type,
      authoredTypeNode,
      selectedDeclaration,
    },
  }, context, "tsonic.csharp.operations", [{
    sourceIterationKind: "sync",
    operationId: "test.iteration",
    iterationKind: "sync",
    lowering: { kind: "foreach" },
    elementType: int32,
    evidence: [{ message: "Exact selected iteration element type." }],
  }]);

  assert.equal(result.kind, "accept");
  assert.deepEqual(facts.get(initializer, csharpRuntimeCarrierFactKey)?.carrier, int32);
  assert.deepEqual(facts.get(authoredTypeNode, csharpRuntimeCarrierFactKey)?.carrier, int32);
  assert.deepEqual(facts.get(type, csharpRuntimeCarrierFactKey)?.carrier, int32);
  assert.equal(facts.get(selectedDeclaration, csharpRuntimeCarrierFactKey), undefined);
});

function namedType(metadata) {
  return {
    kind: "target-named",
    id: "Acme.Carrier`1",
    ...metadata,
  };
}

function objectShape(targetName) {
  return {
    targetType: { kind: "target-named", id: "__TsonicShape_Test" },
    members: [{
      sourceName: "value",
      targetName,
      memberKind: "property",
      type: int32,
    }],
  };
}

function createRuntimeCarrierProvider(carrier) {
  return createCsharpNativeOperationsProvider({
    getCsharpTargetBindingByTargetId: () => undefined,
    getCsharpTargetBindingByMetadataName: () => undefined,
    getTargetTypeRefForSubject: () => undefined,
    getCsharpObjectShapeFactForSubject: () => undefined,
    mapRuntimeCarrier: () => ({ kind: "accept", value: { carrier } }),
  });
}

function fakeSymbol(name) {
  return {
    Flags: 1,
    CheckFlags: 0,
    Name: name,
  };
}

function observationContext(facts) {
  return {
    extensionId: "tsonic.csharp.target-semantics",
    phase: "finalization",
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key),
    },
  };
}

function backendCarrierInput(carriers) {
  return {
    facts: {
      getFact: (subject, key) => key === csharpRuntimeCarrierFactKey ? carriers.get(subject) : undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getTargetBindingFact: () => undefined,
    },
    analysis: {
      getTypeSymbol: () => {
        throw new Error("Backend exact semantic-type carrier resolution must not query a declaration symbol.");
      },
    },
  };
}

class TestFactStore {
  #facts = new Map();

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
    if (existing === undefined) {
      subjectFacts.set(key, value);
      return "inserted";
    }
    return key.equals(existing, value) ? "idempotent" : "conflict";
  }
}
