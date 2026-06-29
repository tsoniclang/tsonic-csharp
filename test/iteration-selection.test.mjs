import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csharpTargetIterationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  mapCsharpIterationOperationRows,
} from "../dist/source/csharp-source-semantics/operation-selection/iteration.js";

test("generic iteration selector records exactly one matching finalized row", () => {
  const statement = {};
  const expression = {};
  const facts = new TestFactStore();

  const result = mapCsharpIterationOperationRows({
    target: "csharp",
    statement,
    expression,
    kind: "for-of",
  }, fakeContext(facts), "tsonic.csharp.test", [
    {
      sourceIterationKind: "for-of",
      operationId: "test.iteration.foreach",
      iterationKind: "sync",
      lowering: { kind: "foreach" },
      elementType: { kind: "source-primitive", name: "int32" },
      evidence: [{ message: "test selected provider foreach metadata" }],
    },
  ]);

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationKind, "iteration");
  assert.equal(result.value.operation.targetOperation, "foreach");
  assert.deepEqual(facts.get(statement, csharpTargetIterationFactKey), {
    operationId: "test.iteration.foreach",
    iterationKind: "sync",
    lowering: { kind: "foreach" },
    elementType: { kind: "source-primitive", name: "int32" },
    evidence: [{ message: "test selected provider foreach metadata" }],
  });
});

test("generic iteration selector defers when no row matches the checked source operation", () => {
  const statement = {};
  const expression = {};
  const facts = new TestFactStore();

  const result = mapCsharpIterationOperationRows({
    target: "csharp",
    statement,
    expression,
    kind: "for-in",
  }, fakeContext(facts), "tsonic.csharp.test", [
    {
      sourceIterationKind: "for-of",
      operationId: "test.iteration.foreach",
      iterationKind: "sync",
      lowering: { kind: "foreach" },
      elementType: { kind: "source-primitive", name: "int32" },
      evidence: [{ message: "test selected provider foreach metadata" }],
    },
  ]);

  assert.equal(result.kind, "defer");
  assert.equal(facts.get(statement, csharpTargetIterationFactKey), undefined);
});

test("generic iteration selector rejects ambiguous rows before recording facts", () => {
  const statement = {};
  const expression = {};
  const facts = new TestFactStore();

  const result = mapCsharpIterationOperationRows({
    target: "csharp",
    statement,
    expression,
    kind: "for-in",
  }, fakeContext(facts), "tsonic.csharp.test", [
    {
      sourceIterationKind: "for-in",
      operationId: "test.iteration.indexKeys",
      iterationKind: "property-key",
      lowering: { kind: "index-key", lengthMember: "Length", keyConversion: "invariant-string" },
      elementType: { kind: "target-named", id: "System.String" },
      evidence: [{ message: "test selected index-key metadata" }],
    },
    {
      sourceIterationKind: "for-in",
      operationId: "test.iteration.objectKeys",
      iterationKind: "property-key",
      lowering: { kind: "object-shape-keys" },
      elementType: { kind: "target-named", id: "System.String" },
      evidence: [{ message: "test selected object-shape metadata" }],
    },
  ]);

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_ITERATION_OPERATION_AMBIGUOUS");
  assert.equal(facts.get(statement, csharpTargetIterationFactKey), undefined);
});

function fakeContext(facts) {
  return {
    facts,
    factResolver: {
      resolve: (subject, key) => facts.get(subject, key),
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
    subjectFacts.set(key, value);
  }
}
