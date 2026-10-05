import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpReferenceEquality } from "../../../dist/policy/operations/operators/reference-equality.js";
import { selectCsharpBinaryOperands } from "../../../dist/policy/operations/operators/operator-selection.js";
import { selectCsharpUnionEquality } from "../../../dist/policy/operations/operators/union-equality.js";
import { selectDelegateConversion } from "../../../dist/policy/conversions/selection/carriers.js";
import { csharpDelegateTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTargetNamedType } from "../../../dist/target-model/types/index.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const floating = csharpSourcePrimitiveTargetType("float64");
const boolean = csharpSourcePrimitiveTargetType("bool");
const callable = (result, parameters = [], options = {}) => csharpDelegateTargetType("System.Func", parameters, result, options);
const policy = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
  projectTypes: { directSupertypes: () => [], catalog: { definitionForTarget() {} } }, target: {} };

test("native callable identity reuses the exact one-direction numeric conversion proof", () => {
  const inferred = callable(integer);
  const annotated = callable(floating);
  assert.equal(selectDelegateConversion(policy, inferred, annotated)?.kind, "delegate-adapter");
  assert.equal(selectDelegateConversion(policy, annotated, inferred)?.kind, "rejected");
  for (const [left, right] of [[inferred, annotated], [annotated, inferred]]) {
    for (const operator of ["===", "!=="]) {
      assert.deepEqual(selectCsharpReferenceEquality(operator, left, right, policy),
        { kind: "reference-identity", negated: operator === "!==" });
    }
    for (const operator of ["==", "!=", "+", "<"]) {
      assert.equal(selectCsharpReferenceEquality(operator, left, right, policy), undefined);
    }
  }
});

test("nullable source callables retain their original delegate identity carriers", () => {
  const inferred = callable(integer);
  const annotated = callable(floating);
  for (const [left, right] of [[csharpNullableTargetType(inferred), annotated],
    [inferred, csharpNullableTargetType(annotated)],
    [csharpNullableTargetType(annotated), csharpNullableTargetType(inferred)]]) {
    assert.deepEqual(selectCsharpReferenceEquality("===", left, right, policy),
      { kind: "reference-identity", negated: false });
  }
});

test("callable identity honors the canonical contravariant and return-passing relation", () => {
  const source = callable(integer, [floating]);
  const target = callable(floating, [integer]);
  assert.equal(selectDelegateConversion(policy, source, target)?.kind, "delegate-adapter");
  assert.equal(selectDelegateConversion(policy, target, source)?.kind, "rejected");
  for (const [left, right] of [[source, target], [target, source]]) {
    assert.equal(selectCsharpReferenceEquality("===", left, right, policy)?.kind, "reference-identity");
  }
  for (const [left, right] of [[callable(integer, [integer]), callable(floating, [floating])],
    [callable(integer), callable(boolean)],
    [callable(csharpSourcePrimitiveTargetType("int64")), callable(csharpSourcePrimitiveTargetType("uint64"))],
    [callable(integer, [{ kind: "array", element: integer }], { restParameterIndex: 0 }),
      callable(floating, [{ kind: "array", element: integer }])]]) {
    assert.equal(selectCsharpReferenceEquality("===", left, right, policy), undefined);
    assert.equal(selectCsharpReferenceEquality("===", right, left, policy), undefined);
  }
  const byReference = { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, returnPassing: "byref-readwrite" } };
  assert.equal(selectCsharpReferenceEquality("===", byReference, target, policy), undefined);
});

test("signature-like metadata does not admit provider, value, opaque or mixed method carriers", () => {
  const inferred = callable(integer);
  const annotated = callable(floating);
  const provider = { ...annotated, id: "Provider.Callback", csharpRender: { kind: "named", name: "Callback" } };
  const unproved = csharpTargetNamedType(annotated.id, annotated.typeArguments, annotated.csharpRender);
  const owner = csharpTargetNamedType("tsonic.shape:fixture", [], { kind: "named", name: "Owner" });
  const method = csharpMethodValueType(owner, "invoke", "fixture-method", inferred, []);
  assert.equal(method !== undefined, true, "exact existing method-value owner");
  for (const other of [provider, unproved, method, integer, { kind: "opaque", id: "Callback" },
    { ...annotated, csharpValueType: true }]) {
    assert.equal(selectCsharpReferenceEquality("===", inferred, other, policy), undefined);
    assert.equal(selectCsharpReferenceEquality("===", other, inferred, policy), undefined);
  }
});

test("binary callable identity never adapts either selected native operand", () => {
  const left = {};
  const right = {};
  const inferred = callable(integer);
  const annotated = callable(floating);
  const input = { ...policy, ast: { is: { IsBinaryExpression: () => false,
    IsObjectLiteralExpression: () => false, IsArrayLiteralExpression: () => false,
    IsStringLiteral: () => false, IsNoSubstitutionTemplateLiteral: () => false },
    kindName: () => "KindIdentifier" }, types: { resolveReadStorage: () => undefined } };
  for (const [leftType, rightType] of [[inferred, annotated], [annotated, inferred]]) {
    for (const operator of ["===", "!=="]) {
      const selected = selectCsharpBinaryOperands(input, left, right, operator, boolean,
        node => node === left ? leftType : rightType);
      assert.equal(selected.kind, "resolved");
      assert.deepEqual(selected.targetOperation, { kind: "reference-identity", negated: operator === "!==" });
      assert.equal(selected.leftType === leftType, true);
      assert.equal(selected.rightType === rightType, true);
      assert.equal(selected.leftInputType === leftType, true, "no delegate adapter or numeric coercion for identity");
      assert.equal(selected.rightInputType === rightType, true, "no delegate adapter or numeric coercion for identity");
    }
  }
});

test("union callable identity consumes the same exact proof and retains rejection controls", () => {
  const inferred = callable(integer);
  const annotated = callable(floating);
  const union = csharpRuntimeUnionTargetType([inferred, csharpStringTargetType()]);
  for (const [left, right] of [[union, annotated], [annotated, union]]) {
    const selected = selectCsharpUnionEquality(left, right, policy);
    assert.equal(selected?.length, 1);
    assert.deepEqual(selected[0].operation, { kind: "reference-identity", negated: false });
    assert.equal(Object.isFrozen(selected[0].operation), true);
  }
  assert.equal(selectCsharpUnionEquality(union, callable(boolean), policy), undefined);
});
