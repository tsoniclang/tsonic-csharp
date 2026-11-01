import assert from "node:assert/strict";
import test from "node:test";
import { csharpBinarySelectionsEqual, csharpUnionEqualityArmsEqual } from "../../helpers/binary-selections.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const boolean = csharpSourcePrimitiveTargetType("bool");
const leftNode = {};
const rightNode = {};
const location = {};
const otherLocation = {};
const side = { carrier: integer, path: [] };
const referenceArm = { left: side, right: side, operation: { kind: "reference-identity", negated: false } };
const operatorArm = { left: side, right: side, operation: { kind: "operator", leftInputType: integer, rightInputType: integer } };

function selection(targetOperation) {
  return { kind: "resolved", sourceOperator: "===", targetOperation, left: leftNode, right: rightNode,
    leftType: integer, rightType: integer, leftInputType: integer, rightInputType: integer, resultType: boolean };
}

test("binary selection comparator covers every native operation field with scalar predicates", () => {
  const cases = [
    [{ kind: "sequence", resultUse: "consumed" }, [{ resultUse: "discarded" }]],
    [{ kind: "conditional-value", operator: "&&", branch: "right" }, [{ operator: "||" }, { branch: "left" }]],
    [{ kind: "closed-value-coalesce", assignment: false, location }, [{ assignment: true }, { location: otherLocation }]],
    [{ kind: "bigint-call", method: "Divide", assignment: false, location }, [{ method: "Remainder" }, { assignment: true }, { location: otherLocation }]],
    [{ kind: "array-index-presence" }, []],
    [{ kind: "nullish-equality", value: false }, [{ value: true }]],
    [{ kind: "union-coalesce", valueArmIndex: 0, retainCarrier: false }, [{ valueArmIndex: 1 }, { retainCarrier: true }]],
    [{ kind: "union-equality", negated: false, arms: [referenceArm] }, [{ negated: true }, { arms: [operatorArm] }]],
    [{ kind: "operator", operator: "+" }, [{ operator: "-" }]],
    [{ kind: "generic-numeric", operator: "+", carrier: integer, zeroOperand: "left" }, [{ operator: "-" }, { carrier: boolean }, { zeroOperand: "right" }]],
    [{ kind: "string-ordinal-relational", operator: "<" }, [{ operator: ">" }]],
    [{ kind: "nullish-test", operand: "left", negated: false, unionArmIndexes: [0, 2] },
      [{ operand: "right" }, { negated: true }, { unionArmIndexes: [0, 1] }, { unionArmIndexes: [0] }, { unionArmIndexes: undefined }]],
    [{ kind: "reference-identity", negated: false }, [{ negated: true }, { distinctMethodValues: true }]],
  ];
  assert.equal(cases.length, 13);
  for (const [operation, changes] of cases) {
    assert.equal(csharpBinarySelectionsEqual(selection(operation), selection({ ...operation })), true, operation.kind);
    for (const change of changes) {
      assert.equal(csharpBinarySelectionsEqual(selection(operation), selection({ ...operation, ...change })), false, `${operation.kind}:${Object.keys(change)[0]}`);
      assert.equal(csharpBinarySelectionsEqual(selection({ ...operation, ...change }), selection(operation)), false, `${operation.kind}:reverse`);
    }
  }
  const base = selection({ kind: "operator", operator: "+" });
  for (const [field, value] of [["sourceOperator", "!=="], ["left", {}], ["right", {}], ["leftType", boolean],
    ["rightType", boolean], ["leftInputType", boolean], ["rightInputType", boolean], ["resultType", integer]]) {
    assert.equal(csharpBinarySelectionsEqual(base, { ...base, [field]: value }), false, field);
  }
  assert.equal(csharpBinarySelectionsEqual(base, selection({ kind: "array-index-presence" })), false);
  assert.equal(csharpBinarySelectionsEqual({ kind: "rejected", reason: "one" }, { kind: "rejected", reason: "one" }), true);
  assert.equal(csharpBinarySelectionsEqual({ kind: "rejected", reason: "one" }, { kind: "rejected", reason: "two" }), false);
  assert.equal(csharpBinarySelectionsEqual(base, { kind: "rejected", reason: "one" }), false);
  assert.equal(csharpBinarySelectionsEqual(selection({ kind: "nullish-test", operand: "left", negated: false }),
    selection({ kind: "nullish-test", operand: "left", negated: false })), true);
});

test("binary selection comparator rejects unknown discriminants on either operand", () => {
  const known = selection({ kind: "operator", operator: "+" });
  for (const unknown of [{ kind: "future-selection" }, selection({ kind: "future-operation" })]) {
    assert.throws(() => csharpBinarySelectionsEqual(unknown, known), TypeError);
    assert.throws(() => csharpBinarySelectionsEqual(known, unknown), TypeError);
    assert.throws(() => csharpBinarySelectionsEqual(unknown, { kind: "rejected", reason: "one" }), TypeError);
    assert.throws(() => csharpBinarySelectionsEqual({ kind: "rejected", reason: "one" }, unknown), TypeError);
  }
});

test("test-owned union arm comparison preserves native identity flags and both input carriers", () => {
  assert.equal(csharpUnionEqualityArmsEqual([referenceArm], [{ ...referenceArm, operation: { ...referenceArm.operation } }]), true);
  assert.equal(csharpUnionEqualityArmsEqual([operatorArm], [{ ...operatorArm, operation: { ...operatorArm.operation } }]), true);
  for (const changed of [{ ...referenceArm, operation: { ...referenceArm.operation, negated: true } },
    { ...referenceArm, operation: { ...referenceArm.operation, distinctMethodValues: true } },
    { ...referenceArm, left: { ...side, carrier: boolean } }, { ...referenceArm, right: { ...side, carrier: boolean } }]) {
    assert.equal(csharpUnionEqualityArmsEqual([referenceArm], [changed]), false);
    assert.equal(csharpUnionEqualityArmsEqual([changed], [referenceArm]), false);
  }
  for (const field of ["leftInputType", "rightInputType"]) {
    assert.equal(csharpUnionEqualityArmsEqual([operatorArm], [{ ...operatorArm, operation: { ...operatorArm.operation, [field]: boolean } }]), false, field);
  }
  const unknown = { ...referenceArm, operation: { kind: "future-arm" } };
  assert.throws(() => csharpUnionEqualityArmsEqual([unknown], [referenceArm]), TypeError);
  assert.throws(() => csharpUnionEqualityArmsEqual([referenceArm], [unknown]), TypeError);
});
