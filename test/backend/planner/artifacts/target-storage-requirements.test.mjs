import assert from "node:assert/strict";
import test from "node:test";

import {
  createCsharpStorageRequirementRegistry,
} from "../../../../dist/backend/planner/artifacts/storage-requirements.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "../../../../dist/policy/types/index.js";

function createRegistry(references = new Map()) {
  const identities = new Map(
    [...new Set(references.values())].map((declaration, index) => [
      declaration,
      `storage:fixture:${index}`,
    ]),
  );
  return createCsharpStorageRequirementRegistry({
    navigation: {
      referenceFor(node) {
        const declaration = references.get(node);
        return declaration === undefined
          ? undefined
          : { symbol: {}, declaration, sourceFile: {} };
      },
    },
    artifactOwner(declaration) {
      return identities.get(declaration);
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

test("emitted storage publishes a baseline contract before later strengthening", () => {
  const expression = {};
  const declaration = {};
  const todo = csharpTargetNamedType("Example.Todo");
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.deepEqual(registry.resolve(declaration, todo), {
    kind: "resolved",
    type: todo,
  });
  assert.equal(registry.revision, 1);
  assert.equal(registry.contractOwner(expression), "storage:fixture:0");
  assert.deepEqual(registry.require(expression, {
    kind: "nullable-reference-write",
    writtenType: todo,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 2);
  assert.deepEqual(registry.resolve(declaration, todo), {
    kind: "resolved",
    type: {
      ...todo,
      csharpNullableReference: true,
    },
  });
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
      "One source storage declaration is related to incompatible nullable target output types 'target:Example.Todo<>' and 'target:Example.User<>'.",
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

test("target storage requirements select one exact representation and require declaration consumption", () => {
  const expression = {};
  const declaration = {};
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const float64 = csharpSourcePrimitiveTargetType("float64");
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.deepEqual(registry.require(expression, {
    kind: "target-representation",
    declaration,
    targetType: int32,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 1);
  assert.equal(registry.requiredType(expression), int32);
  assert.equal(registry.requiredType(declaration), int32);
  assert.equal(registry.contractOwner(declaration), "storage:fixture:0");
  assert.equal(registry.unfulfilled().length, 1);

  assert.deepEqual(registry.require(expression, {
    kind: "target-representation",
    declaration,
    targetType: int32,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 1);

  assert.deepEqual(registry.resolve(declaration, float64), {
    kind: "resolved",
    type: int32,
  });
  assert.deepEqual(registry.unfulfilled(), []);
});

test("target storage requirements reject conflicting exact representations", () => {
  const expression = {};
  const declaration = {};
  const int32 = csharpSourcePrimitiveTargetType("int32");
  const float64 = csharpSourcePrimitiveTargetType("float64");
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.equal(registry.require(expression, {
    kind: "target-representation",
    declaration,
    targetType: int32,
  }).kind, "accepted");
  assert.deepEqual(registry.require(expression, {
    kind: "target-representation",
    declaration,
    targetType: float64,
  }), {
    kind: "rejected",
    reason:
      "One source storage declaration requires incompatible target representations 'source:int32' and 'source:float64'.",
  });
  assert.equal(registry.revision, 1);
  assert.equal(registry.requiredType(expression), int32);
});

test("exact target storage requirements fail closed without stable declaration identity", () => {
  const registry = createRegistry();
  const declaration = {};

  assert.deepEqual(registry.require({}, {
    kind: "target-representation",
    declaration,
    targetType: csharpSourcePrimitiveTargetType("int32"),
  }), {
    kind: "rejected",
    reason:
      "A selected target storage requirement has no exact source declaration identity.",
  });
  assert.equal(registry.revision, 0);
  assert.deepEqual(registry.unfulfilled(), []);
});

test("typed-location identity strengthens and is consumed by one exact storage declaration", () => {
  const expression = {};
  const declaration = {};
  const registry = createRegistry(new Map([[expression, declaration]]));

  assert.deepEqual(registry.require(expression, {
    kind: "typed-location-identity",
    declaration,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 1);
  assert.equal(registry.unfulfilled().length, 1);

  assert.equal(registry.consumeTypedLocationIdentity(declaration), true);
  assert.deepEqual(registry.unfulfilled(), []);
  assert.deepEqual(registry.require(expression, {
    kind: "typed-location-identity",
    declaration,
  }), { kind: "accepted" });
  assert.equal(registry.revision, 1);
});
