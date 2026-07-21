import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileAuthoredAndSelectedTargetType } from "../dist/source/csharp-source-semantics/source-evidence-reconciliation.js";

const int32 = { kind: "source-primitive", name: "int32" };
const stringType = { kind: "target-named", id: "System.String" };
const objectType = { kind: "target-named", id: "System.Object" };
const openT = { kind: "type-parameter", name: "T" };

test("reconciliation accepts identical authored and selected target refs", () => {
  // function consume(value: string): void {}  — both sides agree.
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(stringType, stringType),
    { kind: "resolved", targetType: stringType, reason: "agreed" },
  );
});

test("reconciliation selects the closed instantiation over an open authored type parameter", () => {
  // function identity<T>(value: T): T {}  called as identity<string>("x").
  // Authored parameter type is the open T; selected is string.
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(openT, stringType),
    { kind: "resolved", targetType: stringType, reason: "selected-closed-instantiation" },
  );
});

test("reconciliation retains a proven authored source alias over a broad erased semantic type", () => {
  // function consume(value: int32): void {}
  // The authored type node carries finalized int32 source facts while TS-Go
  // represents the semantic type broadly. The proven alias must survive.
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(int32, objectType),
    { kind: "resolved", targetType: int32, reason: "authored-proven-source-alias" },
  );
});

test("reconciliation reports a conflict for incompatible closed target refs", () => {
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(stringType, objectType),
    { kind: "conflict", authored: stringType, selected: objectType },
  );
});

test("reconciliation resolves when only one side is available", () => {
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(stringType, undefined),
    { kind: "resolved", targetType: stringType, reason: "only-authored-resolved" },
  );
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(undefined, stringType),
    { kind: "resolved", targetType: stringType, reason: "only-selected-resolved" },
  );
});

test("reconciliation reports unresolved when neither side is available", () => {
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(undefined, undefined),
    { kind: "unresolved" },
  );
});

test("reconciliation keeps a closed authored type when the selected type is still open", () => {
  assert.deepEqual(
    reconcileAuthoredAndSelectedTargetType(stringType, openT),
    { kind: "resolved", targetType: stringType, reason: "only-authored-resolved" },
  );
});

test("reconciliation is not lookup-order precedence in either direction", () => {
  // The open/closed rule must not degrade into "authored first" or
  // "selected first": each direction resolves to the closed side.
  assert.equal(reconcileAuthoredAndSelectedTargetType(openT, int32).targetType, int32);
  assert.equal(reconcileAuthoredAndSelectedTargetType(int32, openT).targetType, int32);
});
