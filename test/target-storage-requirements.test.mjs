import assert from "node:assert/strict";
import test from "node:test";

import {
  createCsharpStorageRequirementRegistry,
} from "../dist/translate/artifacts/storage-requirements.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "../dist/policy/types/index.js";

function createRegistry(references = new Map()) {
  return createCsharpStorageRequirementRegistry({
    navigation: {
      referenceFor(node) {
        const declaration = references.get(node);
        return declaration === undefined
          ? undefined
          : { symbol: {}, declaration, sourceFile: {} };
      },
    },
  });
}

test("target storage requirements widen one exact reference storage declaration", () => {
  const expression = {};
  const declaration = {};
  const todo = csharpTargetNamedType("Example.Todo");
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.deepEqual(registry.require(expression, {
    kind: "nullable-reference-write",
    writtenType: todo,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 1);
  assert.equal(registry.unfulfilled().length, 1);

  assert.deepEqual(registry.resolve(declaration, todo), {
    kind: "resolved",
    type: {
      ...todo,
      csharpNullableReference: true,
    },
  });
  assert.deepEqual(registry.unfulfilled(), []);
});

test("target storage requirements are idempotent and reject conflicting writes", () => {
  const expression = {};
  const declaration = {};
  const todo = csharpTargetNamedType("Example.Todo");
  const user = csharpTargetNamedType("Example.User");
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.equal(registry.require(expression, {
    kind: "nullable-reference-write",
    writtenType: todo,
  }).kind, "accepted");
  assert.equal(registry.require(expression, {
    kind: "nullable-reference-write",
    writtenType: todo,
  }).kind, "accepted");
  assert.equal(registry.revision, 1);

  assert.deepEqual(registry.require(expression, {
    kind: "nullable-reference-write",
    writtenType: user,
  }), {
    kind: "rejected",
    reason:
      "One source storage declaration is related to incompatible target output types 'target:Example.Todo<>' and 'target:Example.User<>'.",
  });
  assert.deepEqual(registry.resolve(declaration, user), {
    kind: "rejected",
    reason:
      "Selected target output writes 'target:Example.Todo<>', but its source storage declaration resolves to 'target:Example.User<>'.",
  });
});

test("target storage requirements fail closed without exact declaration evidence", () => {
  const registry = createRegistry();

  assert.deepEqual(registry.require({}, {
    kind: "nullable-reference-write",
    writtenType: csharpTargetNamedType("Example.Todo"),
  }), {
    kind: "rejected",
    reason:
      "A selected target output can write null, but its exact source storage declaration is unavailable.",
  });
  assert.equal(registry.revision, 0);
  assert.deepEqual(registry.unfulfilled(), []);
});

test("nullable-output metadata does not alter value-type storage", () => {
  const expression = {};
  const declaration = {};
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.deepEqual(registry.require(expression, {
    kind: "nullable-reference-write",
    writtenType: int32,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 0);
  assert.deepEqual(registry.resolve(declaration, int32), {
    kind: "resolved",
    type: int32,
  });
  assert.deepEqual(registry.unfulfilled(), []);
});
