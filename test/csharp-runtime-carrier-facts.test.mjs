import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csharpRuntimeCarrierFactKey,
} from "../dist/source/csharp-facts.js";

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
